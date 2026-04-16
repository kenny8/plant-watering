from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class DeviceCommand(Base):
    __tablename__ = "device_commands"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, index=True, nullable=False)
    command = Column(String(255), nullable=False)
    value = Column(String(255), nullable=False)
    is_executed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
