from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, JSON, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import jwt
import datetime
import os

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

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    telegram_bot_token = Column(String)

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
  
# Pydantic модель для данных устройства
class DeviceData(BaseModel):
    human_name: str = None
    # другие поля которые могут приходить от устройства

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
    else:
        settings = Settings(user_id=1, telegram_bot_token=request.telegram_bot_token)
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