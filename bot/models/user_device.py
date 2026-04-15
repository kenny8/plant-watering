from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class UserDevice(Base):
    __tablename__ = "user_devices"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    device_id = Column(Integer, nullable=False)
    build_id = Column(Integer, nullable=False)
    device_human_name = Column(String(255))
    created_at = Column(TIMESTAMP, server_default='CURRENT_TIMESTAMP')