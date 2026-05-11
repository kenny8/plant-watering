from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, TIMESTAMP
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


class UserSettings(Base):
    __tablename__ = "user_settings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False)  # ← BIGINT для Telegram ID
    chat_id = Column(BigInteger, nullable=False)  # ← BIGINT для Telegram chat ID
    notifications_enabled = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP, server_default='CURRENT_TIMESTAMP')
    updated_at = Column(TIMESTAMP, onupdate='CURRENT_TIMESTAMP')