from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, field_validator
import json
from sqlalchemy import create_engine, Column, Integer, String, JSON, Text, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import pymysql
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

# Models
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
    id = Column(Integer, primary_key=True)
    build_id = Column(Integer, primary_key=True)
    human_name = Column(String)
    created_at = Column(String)
    last_seen = Column(String)
    
    scenario_settings = relationship(
        "DeviceScenarioSetting", 
        back_populates="device", 
        cascade="all, delete-orphan",
        foreign_keys="DeviceScenarioSetting.device_id",
        primaryjoin="Device.id == foreign(DeviceScenarioSetting.device_id)"
    )

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

class ScenarioNotification(Base):
    __tablename__ = "scenario_notifications"
    id = Column(Integer, primary_key=True, index=True)
    text = Column(Text, nullable=False)
    status = Column(String(50), default="pending")
    device_id = Column(Integer, nullable=False)
    build_id = Column(Integer, nullable=False)
    scenario_id = Column(Integer, ForeignKey('scenarios.id'), index=True)
    created_at = Column(String(50), default=datetime.datetime.now().isoformat)
    sent_at = Column(String(50), nullable=True)

class Scenario(Base):
    __tablename__ = "scenarios"
    id = Column(Integer, primary_key=True, index=True)
    human_name = Column(String(255))
    machine_name = Column(String(100), unique=True)
    build_id = Column(Integer, ForeignKey('builds.id'))
    flow_data = Column(JSON)
    is_active = Column(Boolean, default=True)
    
    build = relationship("Build", back_populates="scenarios")

class DeviceScenarioSetting(Base):
    __tablename__ = "device_scenario_settings"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, index=True, nullable=False)
    scenario_id = Column(Integer, ForeignKey('scenarios.id'), index=True, nullable=False)
    is_enabled = Column(Boolean, default=True)
    
    __table_args__ = (
        UniqueConstraint('device_id', 'scenario_id', name='uq_device_scenario'),
        {'mysql_engine': 'InnoDB'}
    )
    
    scenario = relationship("Scenario", backref="device_settings")
    device = relationship(
        "Device", 
        back_populates="scenario_settings",
        foreign_keys=[device_id],
        primaryjoin="Device.id == foreign(DeviceScenarioSetting.device_id)"
    )

Base.metadata.create_all(bind=engine)

# Pydantic models
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

class DeviceData(BaseModel):
    human_name: str = None

class ScenarioCreate(BaseModel):
    human_name: str
    machine_name: str
    build_id: int
    flow_data: Optional[dict] = None
    is_active: bool = True
    
    @field_validator('flow_data', mode='before')
    @classmethod
    def parse_flow_data(cls, value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                raise ValueError("Invalid JSON string for flow_data")
        return value

class ScenarioUpdate(BaseModel):
    human_name: str = None
    machine_name: str = None
    build_id: int = None
    flow_data: Optional[dict] = None
    is_active: bool = None
    
    @field_validator('flow_data', mode='before')
    @classmethod
    def parse_flow_data(cls, value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                raise ValueError("Invalid JSON string for flow_data")
        return value

class ScenarioResponse(BaseModel):
    id: int
    human_name: str
    machine_name: str
    build_id: int
    flow_data: Optional[dict] = None
    is_active: bool
    
    class Config:
        from_attributes = True

class DeviceScenarioSettingCreate(BaseModel):
    device_id: int
    scenario_id: int
    is_enabled: bool = True

class DeviceScenarioSettingResponse(BaseModel):
    id: int
    device_id: int
    scenario_id: int
    is_enabled: bool
    scenario: ScenarioResponse = None
    
    class Config:
        from_attributes = True

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

JWT_SECRET = os.getenv("JWT_SECRET", "your_jwt_secret_key_here")
ALGORITHM = "HS256"

# ============================================================
# NEW: Scenario interpreter (fixed and extended)
# ============================================================

def parse_drawflow_nodes(flow_data: dict) -> dict:
    """Extract node map {node_id: node_info} from flow_data."""
    drawflow_data = flow_data.get('drawflow', flow_data)
    home = drawflow_data.get('Home', {})
    return home.get('data', {})

def build_graph(nodes: dict) -> dict:
    """
    Build adjacency and reverse adjacency from node outputs.
    Returns {
        'outgoing': { node_id: [target_node_id, ...] },
        'incoming': { node_id: [source_node_id, ...] }
    }
    """
    outgoing = {}
    incoming = {}
    for nid, node in nodes.items():
        outgoing[nid] = []
        outputs = node.get('outputs', {})
        for out_name, out_data in outputs.items():
            for conn in out_data.get('connections', []):
                target = conn.get('node')
                if target:
                    outgoing[nid].append(target)
                    incoming.setdefault(target, []).append(nid)
        incoming.setdefault(nid, [])  # ensure all keys exist
    return {'outgoing': outgoing, 'incoming': incoming}

def topological_sort(nodes: dict, graph: dict) -> list:
    """Return node IDs in topological order (root first)."""
    indeg = {nid: 0 for nid in nodes}
    for nid, targets in graph['outgoing'].items():
        for t in targets:
            indeg[t] = indeg.get(t, 0) + 1
    queue = [nid for nid, deg in indeg.items() if deg == 0]
    order = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for t in graph['outgoing'].get(nid, []):
            indeg[t] -= 1
            if indeg[t] == 0:
                queue.append(t)
    if len(order) != len(nodes):
        logger.error("Graph contains a cycle!")
        return []
    return order

def check_day_filter(days: list) -> bool:
    """Check if current weekday is in the allowed days list (0=Monday)."""
    if not days:
        return True  # no filter = always allow
    current_weekday = datetime.datetime.now().weekday()
    return current_weekday in days

def evaluate_condition(node: dict, input_value) -> bool:
    """Evaluate a single condition node. input_value is the numeric/string value from data node."""
    data = node.get('data', {})
    cond_type = data.get('type', 'comparison')
    if cond_type == 'comparison':
        operator = data.get('operator', '==')
        value = data.get('value', 0)
        try:
            input_num = float(input_value)
            value_num = float(value)
            is_num = True
        except (ValueError, TypeError):
            is_num = False
        if operator == '>':
            return is_num and input_num > value_num
        elif operator == '<':
            return is_num and input_num < value_num
        elif operator == '==':
            return (is_num and input_num == value_num) or (str(input_value) == str(value))
        elif operator == '!=':
            return (is_num and input_num != value_num) or (str(input_value) != str(value))
        elif operator == '>=':
            return is_num and input_num >= value_num
        elif operator == '<=':
            return is_num and input_num <= value_num
        else:
            return False
    elif cond_type == 'time':
        time_str = data.get('time', '')
        if not time_str:
            return False
        now = datetime.datetime.now()
        try:
            t = datetime.datetime.strptime(time_str, '%H:%M').time()
        except ValueError:
            return False
        # Simple equality (can be extended)
        return now.time() >= t
    elif cond_type == 'dayofweek':
        days = data.get('days', [])
        return check_day_filter(days)
    return False

def evaluate_visual_scenario(scenario, incoming_data: dict, device_id: int, build: Build, db: Session) -> list:
    """
    Interpret visual scenario graph correctly.
    - Each 'data' node provides a value from incoming_data.
    - Conditions propagate boolean results.
    - Logic nodes combine multiple inputs via AND/OR.
    - Action/Notification nodes fire only if input is True.
    - Supports parallel independent branches automatically.
    Returns list of queued commands (for logging).
    """
    flow_data = scenario.flow_data
    if not flow_data:
        return []
    
    nodes = parse_drawflow_nodes(flow_data)
    if not nodes:
        return []
    
    # Build graph structure
    graph = build_graph(nodes)
    order = topological_sort(nodes, graph)
    if not order:
        logger.warning("Invalid graph (cycle or empty)")
        return []
    
    # Cache for computed values
    values = {}
    queued_commands = []
    
    # Initialize data nodes with incoming values
    for nid, node in nodes.items():
        if node.get('name') == 'data':
            field = node['data'].get('selected_field')
            values[nid] = incoming_data.get(field) if field else None
    
    # Evaluate in topological order
    for nid in order:
        node = nodes[nid]
        node_type = node.get('name')
        if node_type == 'data':
            continue  # already set
        
        # Gather input values from predecessors
        input_vals = []
        for pred in graph['incoming'].get(nid, []):
            if pred in values:
                input_vals.append(values[pred])
            else:
                logger.warning(f"Missing value for predecessor {pred} of {nid}")
        
        if node_type == 'condition':
            if input_vals:
                result = evaluate_condition(node, input_vals[0])
                values[nid] = result
            else:
                values[nid] = False
        elif node_type == 'logic':
            logic_type = node['data'].get('logic_type', 'and')
            if logic_type == 'and':
                values[nid] = all(input_vals) if input_vals else False
            else:  # 'or'
                values[nid] = any(input_vals) if input_vals else False
        elif node_type == 'action':
            if input_vals and input_vals[0] is True:
                # Execute action
                selected_field = node['data'].get('selected_field', '')
                get_fields = build.get_fields or []
                command_info = None
                for field in get_fields:
                    if field.get('machine_name') == selected_field:
                        command_info = field
                        break
                if command_info:
                    bot_params = command_info.get('bot_parameters', [])
                    result_value = ''
                    for param in bot_params:
                        if param.get('result'):
                            result_value = param.get('result')
                            break
                    cmd = DeviceCommand(
                        device_id=device_id,
                        command=selected_field,
                        value=result_value,
                        created_at=datetime.datetime.now().isoformat(),
                        is_executed=False
                    )
                    db.add(cmd)
                    queued_commands.append({
                        'command': selected_field,
                        'value': result_value,
                        'target_device_id': device_id
                    })
                    notif = ScenarioNotification(
                        text=f"Scenario '{scenario.human_name}' triggered: {selected_field}={result_value}",
                        status='pending',
                        device_id=device_id,
                        build_id=build.id,
                        scenario_id=scenario.id
                    )
                    db.add(notif)
        elif node_type == 'notification':
            if input_vals and input_vals[0] is True:
                message = node['data'].get('message', '')
                notif = ScenarioNotification(
                    text=message,
                    status='pending',
                    device_id=device_id,
                    build_id=build.id,
                    scenario_id=scenario.id
                )
                db.add(notif)
                logger.info(f"Notification for scenario {scenario.id}: {message}")
    
    if queued_commands:
        db.commit()
    return queued_commands

def evaluate_device_scenarios(db: Session, device_id: int, incoming_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Evaluate all active scenarios for a device."""
    queued_commands = []
    try:
        device = db.query(Device).filter(Device.id == device_id).first()
        if not device:
            logger.warning(f'Device {device_id} not found')
            return []
        
        build = db.query(Build).filter(Build.id == device.build_id).first()
        if not build:
            logger.warning(f'Build {device.build_id} not found')
            return []
        
        active_scenarios = db.query(Scenario).filter(
            Scenario.build_id == device.build_id,
            Scenario.is_active == True
        ).all()
        
        for scenario in active_scenarios:
            device_setting = db.query(DeviceScenarioSetting).filter(
                DeviceScenarioSetting.device_id == device_id,
                DeviceScenarioSetting.scenario_id == scenario.id
            ).first()
            if device_setting and not device_setting.is_enabled:
                continue
            commands = evaluate_visual_scenario(scenario, incoming_data, device_id, build, db)
            queued_commands.extend(commands)
        
        if queued_commands:
            logger.info(f'Total {len(queued_commands)} commands queued for device {device_id}')
    except Exception as e:
        logger.error(f'Error evaluating scenarios: {e}')
        db.rollback()
    return queued_commands

async def _evaluate_scenarios_async(db: Session, device_id: int, incoming_data: Dict[str, Any]):
    """Async wrapper that creates its own DB session."""
    try:
        async_db = SessionLocal()
        try:
            result = evaluate_device_scenarios(async_db, device_id, incoming_data)
            logger.info(f"Async scenario evaluation completed for device {device_id}: {len(result)} commands queued")
        finally:
            async_db.close()
    except Exception as e:
        logger.error(f"Error in async scenario evaluation for device {device_id}: {e}")

# ============================================================
# Original endpoints (unchanged except for the scenario eval call)
# ============================================================

async def get_or_create_device(machine_name: str, device_id: int, db: Session, human_name: str = None):
    """Get or create device."""
    try:
        build = db.query(Build).filter(Build.machine_name == machine_name).first()
        if not build:
            raise HTTPException(status_code=404, detail="Build not found")
        device = db.query(Device).filter(Device.id == device_id, Device.build_id == build.id).first()
        if not device:
            existing_device = db.query(Device).filter(Device.id == device_id).first()
            if existing_device:
                raise HTTPException(status_code=400, detail="Device ID already exists for different build")
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
            scenarios = db.query(Scenario).filter(Scenario.build_id == build.id).all()
            for scenario in scenarios:
                setting = DeviceScenarioSetting(
                    device_id=device.id,
                    scenario_id=scenario.id,
                    is_enabled=True
                )
                db.add(setting)
            db.commit()
            logger.info(f"Created new device: {device_id} for build: {machine_name}")
        else:
            if human_name:
                device.human_name = human_name
            device.last_seen = datetime.datetime.now().isoformat()
            db.commit()
        return device
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_or_create_device: {e}")
        raise HTTPException(status_code=500, detail="Database error")

@app.post("/{machine_name}/{device_id}/post_endpoint")
async def device_post_endpoint(machine_name: str, device_id: int, request: Request, db: Session = Depends(get_db)):
    logger.info(f"Device POST: machine_name={machine_name}, device_id={device_id}")
    try:
        data = await request.json()
    except Exception:
        return {"error": "Invalid JSON"}
    
    try:
        human_name = data.get('human_name')
        device = await get_or_create_device(machine_name, device_id, db, human_name)
        build = db.query(Build).filter(Build.machine_name == machine_name).first()
        if not build:
            return {"error": "Build not found"}
        for field in build.post_fields:
            field_name = field.get('machine_name')
            if field_name and field_name not in data and field_name != 'human_name':
                return {"error": f"Missing field: {field_name}"}
        for field_name, field_value in data.items():
            if field_name != 'human_name':
                record = DeviceDataRecord(
                    device_id=device_id,
                    build_id=build.id,
                    field_name=field_name,
                    field_value=str(field_value),
                    created_at=datetime.datetime.now().isoformat()
                )
                db.add(record)
        db.commit()
        # Launch async evaluation
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
        logger.error(f"Error in device_post_endpoint: {e}")
        return {"error": "Internal server error"}

@app.get("/{machine_name}/{device_id}/get_endpoint")
async def device_get_endpoint(machine_name: str, device_id: int, db: Session = Depends(get_db)):
    logger.info(f"Device GET: machine_name={machine_name}, device_id={device_id}")
    try:
        device = await get_or_create_device(machine_name, device_id, db)
        build = db.query(Build).filter(Build.machine_name == machine_name).first()
        if not build:
            return {"error": "Build not found"}
        commands = db.query(DeviceCommand).filter(
            DeviceCommand.device_id == device_id,
            DeviceCommand.is_executed == False
        ).all()
        result = {}
        for cmd in commands:
            result[cmd.command] = cmd.value
            cmd.is_executed = True
        if commands:
            db.commit()
        return result
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

@app.get("/api/devices/{device_id}")
async def get_device(device_id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Получить устройство по ID"""
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

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
    
    # Автоматически создаем записи в device_scenario_settings для всех устройств этой сборки
    devices = db.query(Device).filter(Device.build_id == scenario.build_id).all()
    for device in devices:
        setting = DeviceScenarioSetting(
            device_id=device.id,
            scenario_id=db_scenario.id,
            is_enabled=True
        )
        db.add(setting)
    db.commit()
    
    return db_scenario


@app.put("/api/scenarios/{id}", response_model=ScenarioResponse)
async def update_scenario(id: int, scenario: ScenarioUpdate, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Обновить существующий сценарий"""
    db_scenario = db.query(Scenario).filter(Scenario.id == id).first()
    if not db_scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # Проверяем уникальность machine_name если он меняется
    if scenario.machine_name and scenario.machine_name != db_scenario.machine_name:
        existing = db.query(Scenario).filter(
            Scenario.machine_name == scenario.machine_name,
            Scenario.id != id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Scenario with this machine_name already exists")
    
    # Обновляем поля
    if scenario.human_name is not None:
        db_scenario.human_name = scenario.human_name
    if scenario.machine_name is not None:
        db_scenario.machine_name = scenario.machine_name
    if scenario.flow_data is not None:
        db_scenario.flow_data = scenario.flow_data
    if scenario.is_active is not None:
        db_scenario.is_active = scenario.is_active
    
    db.commit()
    db.refresh(db_scenario)
    
    # Если изменилась сборка, обновляем device_scenario_settings
    if scenario.build_id is not None and scenario.build_id != db_scenario.build_id:
        # Удаляем старые записи для этого сценария
        db.query(DeviceScenarioSetting).filter(
            DeviceScenarioSetting.scenario_id == db_scenario.id
        ).delete(synchronize_session=False)
        
        # Создаем новые записи для устройств новой сборки
        devices = db.query(Device).filter(Device.build_id == scenario.build_id).all()
        for device in devices:
            setting = DeviceScenarioSetting(
                device_id=device.id,
                scenario_id=db_scenario.id,
                is_enabled=True
            )
            db.add(setting)
        db.commit()
    
    return db_scenario


@app.get("/api/scenarios/{id}", response_model=ScenarioResponse)
async def get_scenario(id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Получить сценарий по ID"""
    scenario = db.query(Scenario).filter(Scenario.id == id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@app.delete("/api/scenarios/{id}", response_model=dict)
async def delete_scenario(id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Удалить сценарий"""
    scenario = db.query(Scenario).filter(Scenario.id == id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    

    # Сначала удаляем все записи в device_scenario_settings для этого сценария
    db.query(DeviceScenarioSetting).filter(
        DeviceScenarioSetting.scenario_id == id
    ).delete(synchronize_session=False)
    db.delete(scenario)
    db.commit()
    return {"message": "Scenario deleted"}


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


# API роуты для управления настройками сценариев на устройствах
@app.get("/api/devices/{device_id}/scenarios", response_model=list[DeviceScenarioSettingResponse])
async def get_device_scenarios(device_id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Получить все настройки сценариев для конкретного устройства"""
    # Получаем устройство чтобы узнать его build_id
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Получаем все сценарии для этой сборки
    scenarios = db.query(Scenario).filter(Scenario.build_id == device.build_id).all()
    
    # Для каждого сценария получаем или создаем настройку для устройства
    result = []
    for scenario in scenarios:
        setting = db.query(DeviceScenarioSetting).filter(
            DeviceScenarioSetting.device_id == device_id,
            DeviceScenarioSetting.scenario_id == scenario.id
        ).first()
        
        # Если настройки нет, создаем её (по умолчанию включено)
        if not setting:
            setting = DeviceScenarioSetting(
                device_id=device_id,
                scenario_id=scenario.id,
                is_enabled=True
            )
            db.add(setting)
            db.commit()
            db.refresh(setting)
        
        result.append(setting)
    
    return result


@app.patch("/api/devices/{device_id}/scenarios/{scenario_id}/toggle", response_model=DeviceScenarioSettingResponse)
async def toggle_device_scenario(device_id: int, scenario_id: int, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    """Инвертировать статус is_enabled для сценария на конкретном устройстве"""
    # Проверяем существование устройства
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Проверяем существование сценария
    scenario = db.query(Scenario).filter(Scenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    # Проверяем что сценарий принадлежит той же сборке что и устройство
    if scenario.build_id != device.build_id:
        raise HTTPException(status_code=400, detail="Scenario does not belong to device's build")
    
    # Получаем или создаем настройку
    setting = db.query(DeviceScenarioSetting).filter(
        DeviceScenarioSetting.device_id == device_id,
        DeviceScenarioSetting.scenario_id == scenario_id
    ).first()
    
    if not setting:
        setting = DeviceScenarioSetting(
            device_id=device_id,
            scenario_id=scenario_id,
            is_enabled=True
        )
        db.add(setting)
    
    # Инвертируем статус
    setting.is_enabled = not setting.is_enabled
    db.commit()
    db.refresh(setting)
    
    return setting

