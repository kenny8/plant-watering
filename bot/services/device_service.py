import logging
from typing import List, Optional, Dict, Any
from sqlalchemy import text
from bot.core.database import Database

logger = logging.getLogger(__name__)

class DeviceService:
    """Сервис для управления устройствами пользователя"""
    
    def __init__(self, database: Database):
        self.database = database
    
    async def check_device_exists(self, device_id: int) -> bool:
        """Проверяет существует ли устройство в системе"""
        try:
            with self.database.engine.connect() as conn:
                result = conn.execute(
                    text("SELECT 1 FROM devices WHERE id = :device_id"),
                    {"device_id": device_id}
                )
                return result.fetchone() is not None
        except Exception as e:
            logger.error(f"Error checking device existence: {e}")
            return False
    
    async def add_user_device_by_id(self, user_id: int, device_id: int) -> bool:
        """Добавляет устройство пользователю по ID"""
        try:
            with self.database.engine.connect() as conn:
                # Получаем информацию об устройстве
                device_info = conn.execute(
                    text("""
                        SELECT id, build_id, human_name 
                        FROM devices 
                        WHERE id = :device_id
                    """),
                    {"device_id": device_id}
                ).fetchone()
                
                if not device_info:
                    logger.error(f"Device {device_id} not found in database")
                    return False
                
                # Проверяем, не добавлено ли уже устройство
                existing = conn.execute(
                    text("""
                        SELECT 1 FROM user_devices 
                        WHERE user_id = :user_id AND device_id = :device_id
                    """),
                    {"user_id": user_id, "device_id": device_id}
                ).fetchone()
                
                if existing:
                    logger.info(f"Device {device_id} already added for user {user_id}")
                    return False
                
                # Добавляем устройство (user_id теперь просто число, не foreign key)
                conn.execute(
                    text("""
                        INSERT INTO user_devices (user_id, device_id, build_id, device_human_name)
                        VALUES (:user_id, :device_id, :build_id, :device_human_name)
                    """),
                    {
                        "user_id": user_id,
                        "device_id": device_info.id,
                        "build_id": device_info.build_id,
                        "device_human_name": device_info.human_name
                    }
                )
                conn.commit()
                
                logger.info(f"Device {device_id} added to user {user_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error adding user device by ID: {e}")
            return False
    
    async def remove_user_device_by_id(self, user_id: int, device_id: int) -> bool:
        """Удаляет устройство у пользователя по ID"""
        try:
            with self.database.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        DELETE FROM user_devices 
                        WHERE user_id = :user_id AND device_id = :device_id
                    """),
                    {"user_id": user_id, "device_id": device_id}
                )
                conn.commit()
                
                if result.rowcount > 0:
                    logger.info(f"Device {device_id} removed from user {user_id}")
                    return True
                return False
                
        except Exception as e:
            logger.error(f"Error removing user device by ID: {e}")
            return False
    
    async def get_user_devices(self, user_id: int) -> List[Dict[str, Any]]:
        """Получает список устройств пользователя"""
        try:
            with self.database.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT 
                            ud.device_id,
                            ud.build_id,
                            ud.device_human_name,
                            d.human_name as device_original_name,
                            b.human_name as build_name,
                            b.machine_name as build_machine_name,
                            d.last_seen
                        FROM user_devices ud
                        JOIN devices d ON ud.device_id = d.id AND ud.build_id = d.build_id
                        JOIN builds b ON ud.build_id = b.id
                        WHERE ud.user_id = :user_id
                        ORDER BY ud.created_at DESC
                    """),
                    {"user_id": user_id}
                )
                
                devices = []
                for row in result:
                    devices.append({
                        "device_id": row.device_id,
                        "build_id": row.build_id,
                        "device_human_name": row.device_human_name or row.device_original_name,
                        "build_name": row.build_name,
                        "build_machine_name": row.build_machine_name,
                        "last_seen": row.last_seen
                    })
                
                return devices
                
        except Exception as e:
            logger.error(f"Error getting user devices: {e}")
            return []
    
    async def get_available_devices(self, user_id: int) -> List[Dict[str, Any]]:
        """Получает устройства, которые можно добавить пользователю"""
        try:
            with self.database.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT 
                            d.id as device_id,
                            d.build_id,
                            d.human_name as device_name,
                            b.human_name as build_name,
                            b.machine_name as build_machine_name,
                            d.last_seen
                        FROM devices d
                        JOIN builds b ON d.build_id = b.id
                        WHERE NOT EXISTS (
                            SELECT 1 FROM user_devices ud 
                            WHERE ud.user_id = :user_id 
                            AND ud.device_id = d.id 
                            AND ud.build_id = d.build_id
                        )
                        ORDER BY d.last_seen DESC
                    """),
                    {"user_id": user_id}
                )
                
                devices = []
                for row in result:
                    devices.append({
                        "device_id": row.device_id,
                        "build_id": row.build_id,
                        "device_name": row.device_name,
                        "build_name": row.build_name,
                        "build_machine_name": row.build_machine_name,
                        "last_seen": row.last_seen
                    })
                
                return devices
                
        except Exception as e:
            logger.error(f"Error getting available devices: {e}")
            return []
    
    async def check_device_removals(self, user_id: int) -> List[Dict[str, Any]]:
        """Проверяет, какие устройства были удалены из системы"""
        try:
            with self.database.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT ud.device_id, ud.build_id, ud.device_human_name
                        FROM user_devices ud
                        LEFT JOIN devices d ON ud.device_id = d.id AND ud.build_id = d.build_id
                        WHERE ud.user_id = :user_id AND d.id IS NULL
                    """),
                    {"user_id": user_id}
                )
                
                removed_devices = []
                for row in result:
                    removed_devices.append({
                        "device_id": row.device_id,
                        "build_id": row.build_id,
                        "device_human_name": row.device_human_name
                    })
                
                # Удаляем несуществующие устройства
                for device in removed_devices:
                    await self.remove_user_device_by_id(user_id, device["device_id"])
                
                return removed_devices
                
        except Exception as e:
            logger.error(f"Error checking device removals: {e}")
            return []