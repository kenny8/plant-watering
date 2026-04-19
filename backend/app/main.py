from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, JSON, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import jwt
import datetime
import os
import logging
import asyncio
from typing import Any, Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "mariadb+pymysql://user:m4Q8yrDETH@db:3306/plant_watering")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models (остаются без изменений)
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)

class Build(Base):
    __tablename__ = "builds"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    machine_name = Column(String)
    human_name = Column(String)
    post_fields = Column(JSON)
    get_fields = Column(JSON)
    
    scenarios = relationship("Scenario", back_populates="build")

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    telegram_bot_token = Column(String)
    bot_proxy_url = Column(String)

class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, autoincrement=False)  # Убрать автоинкремент
    build_id = Column(Integer, primary_key=True)  # Сделать составной первичный ключ
    human_name = Column(String)
    created_at = Column(String)
    last_seen = Column(String)
    
# ИЗМЕНЕНО: переименована модель DeviceData в DeviceDataRecord
class DeviceDataRecord(Base):
    __tablename__ = "device_data"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer)
    build_id = Column(Integer)
    field_name = Column(String)
    field_value = Column(Text)
    created_at = Column(String)

class DeviceCommand(Base):
    __tablename__ = "device_commands"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, index=True)
    command = Column(String)
    value = Column(String)
    created_at = Column(String)
    is_executed = Column(Boolean, default=False)


class Scenario(Base):
    __tablename__ = "scenarios"
    id = Column(Integer, primary_key=True, index=True)
    human_name = Column(String(255))
    machine_name = Column(String(100), unique=True)
    build_id = Column(Integer, ForeignKey('builds.id'))
    flow_data = Column(JSON)
    is_active = Column(Boolean, default=True)
    
    build = relationship("Build", back_populates="scenarios")


Base.metadata.create_all(bind=engine)

# Pydantic models (остаются без изменений)
class LoginRequest(BaseModel):
    username: str
    password: str

class BuildCreate(BaseModel):
    machine_name: str
    human_name: str
    post_fields: list
    get_fields: list

class TokenRequest(BaseModel):
    telegram_bot_token: str
    bot_proxy_url: str = None
  
# Pydantic модель для данных устройства
class DeviceData(BaseModel):
    human_name: str = None
    # другие поля которые могут приходить от устройства


# Pydantic схемы для Scenario
class ScenarioCreate(BaseModel):
    human_name: str
    machine_name: str
    build_id: int
    flow_data: dict = None
    is_active: bool = True


class ScenarioUpdate(BaseModel):
    human_name: str = None
    machine_name: str = None
    flow_data: dict = None
    is_active: bool = None


class ScenarioResponse(BaseModel):
    id: int
    human_name: str
    machine_name: str
    build_id: int
    flow_data: dict = None
    is_active: bool
    
    class Config:
        from_attributes = True

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# JWT setup
JWT_SECRET = os.getenv("JWT_SECRET", "your_jwt_secret_key_here")
ALGORITHM = "HS256"

from fastapi import Request

# Вспомогательная функция для получения/создания устройства
async def get_or_create_device(machine_name: str, device_id: int, db: Session, human_name: str = None):
    """Получает или создает устройство если не существует"""
    try:
        # Ищем сборку
        build = db.query(Build).filter(Build.machine_name == machine_name).first()
        if not build:
            raise HTTPException(status_code=404, detail="Build not found")
        
        # Ищем устройство
        device = db.query(Device).filter(
            Device.id == device_id, 
            Device.build_id == build.id
        ).first()
        
        if not device:
            # Проверяем, не занят ли ID другим устройством (для другой сборки)
            existing_device = db.query(Device).filter(Device.id == device_id).first()
            if existing_device:
                # Если устройство с таким ID уже существует, но для другой сборки
                raise HTTPException(status_code=400, detail="Device ID already exists for different build")
            
            # Создаем новое устройство
            device = Device(
                id=device_id,
                build_id=build.id,
                human_name=human_name,
                created_at=datetime.datetime.now().isoformat(),
                last_seen=datetime.datetime.now().isoformat()
            )
            db.add(device)
            db.commit()
            db.refresh(device)
            print(f"Created new device: {device_id} for build: {machine_name}")
        else:
            # Обновляем last_seen и human_name если передан
            if human_name:
                device.human_name = human_name
            device.last_seen = datetime.datetime.now().isoformat()
            db.commit()
        
        return device
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_or_create_device: {e}")
        raise HTTPException(status_code=500, detail="Database error")


def evaluate_condition(condition_node: Dict[str, Any], incoming_data: Dict[str, Any]) -> bool:
    """
    Evaluate a condition node against incoming data.
    Supports operators: eq, ne, gt, lt, ge, le, contains
    """
    field = condition_node.get('field')
    operator = condition_node.get('operator', 'eq')
    value = condition_node.get('value')
    
    if field not in incoming_data:
        return False
    
    incoming_value = incoming_data[field]
    
    # Try to convert to numeric for comparison
    try:
        incoming_numeric = float(incoming_value)
        value_numeric = float(value)
        is_numeric = True
    except (ValueError, TypeError):
        is_numeric = False
    
    if operator == 'eq':
        if is_numeric:
            return incoming_numeric == value_numeric
        return str(incoming_value) == str(value)
    elif operator == 'ne':
        if is_numeric:
            return incoming_numeric != value_numeric
        return str(incoming_value) != str(value)
    elif operator == 'gt':
        if is_numeric:
            return incoming_numeric > value_numeric
        return str(incoming_value) > str(value)
    elif operator == 'lt':
        if is_numeric:
            return incoming_numeric < value_numeric
        return str(incoming_value) < str(value)
    elif operator == 'ge':
        if is_numeric:
            return incoming_numeric >= value_numeric
        return str(incoming_value) >= str(value)
    elif operator == 'le':
        if is_numeric:
            return incoming_numeric <= value_numeric
        return str(incoming_value) <= str(value)
    elif operator == 'contains':
        return str(value) in str(incoming_value)
    
    return False


def check_day_filter(day_filter_node: Optional[Dict[str, Any]]) -> bool:
    """
    Check if current weekday matches the day filter.
    day_filter format: {'days': [0, 1, 2, 3, 4]} where 0=Monday, 6=Sunday
    """
    if day_filter_node is None:
        return True  # No filter means all days allowed
    
    allowed_days = day_filter_node.get('days', list(range(7)))
    current_weekday = datetime.datetime.now().weekday()
    
    return current_weekday in allowed_days


def evaluate_device_scenarios(db: Session, device_id: int, incoming_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Evaluate all active scenarios for a device's build and queue commands if conditions are met.
    
    Args:
        db: Database session
        device_id: ID of the device
        incoming_data: Data received from the device
        
    Returns:
        List of queued commands
    """
    queued_commands = []
    
    try:
        # Get the device to find its build_id
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            logger.warning(f"Device {device_id} not found for scenario evaluation")
            return queued_commands
        
        build_id = device.build_id
        
        # Find all active scenarios for this build
        active_scenarios = db.query(Scenario).filter(
            Scenario.build_id == build_id,
            Scenario.is_active == True
        ).all()
        
        logger.info(f"Found {len(active_scenarios)} active scenarios for build {build_id}")
        
        for scenario in active_scenarios:
            flow_data = scenario.flow_data
            if not flow_data:
                continue
            
            logger.debug(f"Evaluating scenario {scenario.id} ({scenario.machine_name})")
            
            # Parse flow_data to find nodes
            nodes = flow_data.get('nodes', [])
            
            trigger_node = None
            condition_node = None
            day_filter_node = None
            action_node = None
            
            for node in nodes:
                node_type = node.get('type')
                if node_type == 'trigger':
                    trigger_node = node
                elif node_type == 'condition':
                    condition_node = node
                elif node_type == 'day_filter':
                    day_filter_node = node
                elif node_type == 'action':
                    action_node = node
            
            # Check trigger - verify trigger field exists in incoming_data
            if trigger_node:
                trigger_field = trigger_node.get('field')
                if trigger_field and trigger_field not in incoming_data:
                    logger.debug(f"Scenario {scenario.id}: trigger field '{trigger_field}' not in incoming data")
                    continue
            
            # Check day filter
            if not check_day_filter(day_filter_node):
                logger.debug(f"Scenario {scenario.id}: day filter not matched")
                continue
            
            # Check condition
            if condition_node:
                if not evaluate_condition(condition_node, incoming_data):
                    logger.debug(f"Scenario {scenario.id}: condition not met")
                    continue
            
            # If all conditions pass, execute action
            if action_node:
                command = action_node.get('command')
                value = action_node.get('value')
                target_device_id = action_node.get('target_device_id', device_id)
                
                if command:
                    # Create command record
                    device_command = DeviceCommand(
                        device_id=target_device_id,
                        command=command,
                        value=str(value) if value else '',
                        created_at=datetime.datetime.now().isoformat(),
                        is_executed=False
                    )
                    db.add(device_command)
                    queued_commands.append({
                        'scenario_id': scenario.id,
                        'scenario_name': scenario.machine_name,
                        'command': command,
                        'value': value,
                        'target_device_id': target_device_id
                    })
                    logger.info(f"Scenario {scenario.id} ({scenario.machine_name}) triggered: command '{command}'={value} queued for device {target_device_id}")
        
        if queued_commands:
            db.commit()
            logger.info(f"Total {len(queued_commands)} commands queued for device {device_id}")
        else:
            logger.debug(f"No scenarios triggered for device {device_id}")
            
    except Exception as e:
        logger.error(f"Error evaluating scenarios for device {device_id}: {e}")
        db.rollback()
    
    return queued_commands


async def _evaluate_scenarios_async(db: Session, device_id: int, incoming_data: Dict[str, Any]):
    """
    Async wrapper for evaluate_device_scenarios to run without blocking the main request.
    Creates a new DB session for thread safety.
    """
    try:
        # Создаем новую сессию БД для асинхронного выполнения
        async_db = SessionLocal()
        try:
            result = evaluate_device_scenarios(async_db, device_id, incoming_data)
            logger.info(f"Async scenario evaluation completed for device {device_id}: {len(result)} commands queued")
        finally:
            async_db.close()
    except Exception as e:
        logger.error(f"Error in async scenario evaluation for device {device_id}: {e}")


@app.post("/{machine_name}/{device_id}/post_endpoint")
async def device_post_endpoint(machine_name: str, device_id: int, request: Request, db: Session = Depends(get_db)):
    print(f"Device POST: machine_name={machine_name}, device_id={device_id}")
    
    try:
        data = await request.json()
        print(f"Received data: {data}")
    except Exception as e:
        return {"error": "Invalid JSON"}
    
    try:
        # Получаем human_name из данных если есть
        human_name = data.get('human_name')
        
        # Получаем или создаем устройство
        device = await get_or_create_device(machine_name, device_id, db, human_name)
        
        # Ищем сборку
        build = db.query(Build).filter(Build.machine_name == machine_name).first()
        if not build:
            return {"error": "Build not found"}
        
        # Проверяем обязательные поля (кроме human_name)
        for field in build.post_fields:
            field_name = field.get('machine_name')
            if field_name and field_name not in data and field_name != 'human_name':
                return {"error": f"Missing field: {field_name}"}
        
        # ДОБАВЛЕНО: Сохраняем все данные в таблицу device_data
        for field_name, field_value in data.items():
            if field_name != 'human_name':  # human_name уже сохранен в устройстве
                device_data_record = DeviceDataRecord(
                    device_id=device_id,
                    build_id=build.id,
                    field_name=field_name,
                    field_value=str(field_value),
                    created_at=datetime.datetime.now().isoformat()
                )
                db.add(device_data_record)
        
        db.commit()  # Сохраняем изменения в базе
        
        # ИНТЕГРАЦИЯ: Вызываем evaluate_device_scenarios после сохранения данных
        # Используем asyncio.create_task для асинхронного выполнения без блокировки
        asyncio.create_task(_evaluate_scenarios_async(db, device_id, data))
        
        return {
            "status": "success", 
            "message": f"Data received for device {device_id}",
            "device_human_name": device.human_name,
            "build": build.human_name,
            "received_data": data
        }
        
    except HTTPException as he:
        return {"error": he.detail}
    except Exception as e:
        print(f"Error in device_post_endpoint: {e}")
        return {"error": "Internal server error"}

@app.get("/{machine_name}/{device_id}/get_endpoint")
async def device_get_endpoint(machine_name: str, device_id: int, db: Session = Depends(get_db)):
    print(f"Device GET: machine_name={machine_name}, device_id={device_id}")
    
    try:
        # Получаем или создаем устройство
        device = await get_or_create_device(machine_name, device_id, db)
        
        build = db.query(Build).filter(Build.machine_name == machine_name).first()
        if not build:
            return {"error": "Build not found"}
        
        # Получаем все невыполненные команды для этого устройства
        commands = db.query(DeviceCommand).filter(
            DeviceCommand.device_id == device_id,
            DeviceCommand.is_executed == False
        ).all()
        
        # Формируем плоский JSON формат {command: value, ...}
        result = {}
        for cmd in commands:
            result[cmd.command] = cmd.value
            # Помечаем команду как выполненную (в упрощенной версии - сразу после выдачи)
            cmd.is_executed = True
        
        if commands:
            db.commit()
            print(f"Отправлено команд устройству {device_id}: {result}")
        
        return result  # Плоский формат для Arduino: {"light": "on", ...}
        
    except HTTPException as he:
        return {"error": he.detail}
    except Exception as e:
        return {"error": "Internal server error"}



@app.post("/api/auth/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if not user or user.password_hash != request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = jwt.encode(
        {"sub": user.username, "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)},
        JWT_SECRET,
        algorithm=ALGORITHM
    )
    return {"token": token}

@app.post("/api/builds")
async def create_build(build: BuildCreate, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    db_build = Build(**build.dict(), user_id=1)
    db.add(db_build)
    db.commit()
    db.refresh(db_build)
    return db_build

@app.get("/api/builds")
async def get_builds(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    return db.query(Build).filter(Build.user_id == 1).all()

@app.get("/api/debug/builds")
async def debug_builds(db: Session = Depends(get_db)):
    builds = db.query(Build).all()
    return {
        "total_builds": len(builds),
        "builds": [
            {
                "id": build.id,
                "user_id": build.user_id,
                "human_name": build.human_name,
                "machine_name": build.machine_name,
                "post_fields": [
                    {
                        "human_name": field.get('human_name'),
                        "machine_name": field.get('machine_name'), 
                        "type": field.get('type')
                    } for field in (build.post_fields or [])
                ],
                "get_fields": [
                    {
                        "human_name": field.get('human_name'),
                        "machine_name": field.get('machine_name'),
                        "bot_parameters": [
                            {
                                "human_name": param.get('human_name'),
                                "machine_name": param.get('machine_name')
                            } for param in (field.get('bot_parameters') or [])
                        ]
                    } for field in (build.get_fields or [])
                ]
            }
            for build in builds
        ]
    }
    


@app.delete("/api/builds/{id}")
async def delete_build(id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    build = db.query(Build).filter(Build.id == id).first()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    db.delete(build)
    db.commit()
    return {"status": "deleted"}
    
@app.get("/api/builds/{id}")
async def get_build(id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    build = db.query(Build).filter(Build.id == id).first()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build

@app.put("/api/builds/{id}")
async def update_build(id: int, build_data: BuildCreate, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    build = db.query(Build).filter(Build.id == id).first()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    
    build.human_name = build_data.human_name
    build.machine_name = build_data.machine_name
    build.post_fields = build_data.post_fields
    build.get_fields = build_data.get_fields
    
    db.commit()
    db.refresh(build)
    return build

@app.get("/api/devices")
async def get_devices(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    return db.query(Device).all()

@app.post("/api/settings/bot-token")
async def save_token(request: TokenRequest, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    settings = db.query(Settings).filter(Settings.user_id == 1).first()
    if settings:
        settings.telegram_bot_token = request.telegram_bot_token
        settings.bot_proxy_url = request.bot_proxy_url
    else:
        settings = Settings(user_id=1, telegram_bot_token=request.telegram_bot_token, bot_proxy_url=request.bot_proxy_url)
        db.add(settings)
    db.commit()
    return {"status": "saved"}

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.delete("/api/devices/{device_id}")
async def delete_device(device_id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    try:
        print(f"Deleting device {device_id}")
        
        # Находим все устройства с этим ID
        devices = db.query(Device).filter(Device.id == device_id).all()
        if not devices:
            print(f"Device {device_id} not found")
            raise HTTPException(status_code=404, detail="Device not found")
        
        total_deleted_data = 0
        
        # Удаляем все устройства с этим ID и их данные
        for device in devices:
            print(f"Found device: {device.id}, build_id: {device.build_id}")
            
            # ИСПРАВЛЕНО: используем переименованную модель DeviceDataRecord
            data_to_delete = db.query(DeviceDataRecord).filter(
                DeviceDataRecord.device_id == device_id,
                DeviceDataRecord.build_id == device.build_id
            )
            deleted_data_count = data_to_delete.count()
            data_to_delete.delete(synchronize_session=False)
            
            total_deleted_data += deleted_data_count
            print(f"Deleted {deleted_data_count} data records for build {device.build_id}")
            
            # Удаляем само устройство
            db.delete(device)
        
        db.commit()
        print(f"Device {device_id} deleted successfully. Total data records deleted: {total_deleted_data}")
        return {"status": "deleted", "message": f"Device {device_id} and {total_deleted_data} data records deleted"}
        
    except Exception as e:
        print(f"Error deleting device {device_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting device: {str(e)}")
        
@app.get("/api/devices/{device_id}/data")
async def get_device_data(
    device_id: int, 
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme),
    limit: int = None  # Добавляем опциональный параметр лимита
):
    """Получает все данные для конкретного устройства"""
    try:
        # Создаем базовый запрос
        query = db.query(DeviceDataRecord).filter(
            DeviceDataRecord.device_id == device_id
        )
        
        # Если limit не указан, получаем все записи
        if limit:
            query = query.limit(limit)
        
        device_data = query.all()
        
        print(f"Found {len(device_data)} records for device {device_id}")  # Для отладки
        
        # Группируем данные по времени создания
        data_by_time = {}
        for record in device_data:
            if record.created_at not in data_by_time:
                data_by_time[record.created_at] = {}
            data_by_time[record.created_at][record.field_name] = record.field_value
        
        return {
            "device_id": device_id,
            "total_records": len(device_data),
            "data": data_by_time
        }
        
    except Exception as e:
        print(f"Error getting device data: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting device data: {str(e)}")


# API роуты для сценариев
@app.get("/api/scenarios", response_model=list[ScenarioResponse])
async def get_scenarios(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Получить все сценарии"""
    return db.query(Scenario).all()


@app.post("/api/scenarios", response_model=ScenarioResponse)
async def create_scenario(scenario: ScenarioCreate, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Создать новый сценарий"""
    # Проверяем существование сборки
    build = db.query(Build).filter(Build.id == scenario.build_id).first()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    
    # Проверяем уникальность machine_name
    existing = db.query(Scenario).filter(Scenario.machine_name == scenario.machine_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Scenario with this machine_name already exists")
    
    db_scenario = Scenario(
        human_name=scenario.human_name,
        machine_name=scenario.machine_name,
        build_id=scenario.build_id,
        flow_data=scenario.flow_data,
        is_active=scenario.is_active
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    return db_scenario


@app.patch("/api/scenarios/{id}/toggle", response_model=ScenarioResponse)
async def toggle_scenario(id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Инвертировать статус is_active у сценария"""
    scenario = db.query(Scenario).filter(Scenario.id == id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    scenario.is_active = not scenario.is_active
    db.commit()
    db.refresh(scenario)
    return scenario