import logging
from typing import Optional, Dict, Any
from sqlalchemy import text
from core.database import Database

logger = logging.getLogger(__name__)

class UserSettingsService:
    """Сервис для управления настройками пользователей"""
    
    def __init__(self, database: Database):
        self.database = database
    
    async def get_user_settings(self, user_id: int, chat_id: int) -> Dict[str, Any]:
        """Получает настройки пользователя"""
        try:
            logger.debug(f"🔍 Getting settings for user_id: {user_id}, chat_id: {chat_id}")
            
            with self.database.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT notifications_enabled 
                        FROM user_settings 
                        WHERE user_id = :user_id AND chat_id = :chat_id
                    """),
                    {"user_id": user_id, "chat_id": chat_id}
                )
                row = result.fetchone()
                
                if row:
                    logger.debug(f"✅ Found settings: notifications_enabled = {row.notifications_enabled}")
                    return {
                        "notifications_enabled": bool(row.notifications_enabled)
                    }
                else:
                    logger.debug("❌ No settings found, creating default")
                    return await self.create_default_settings(user_id, chat_id)
                    
        except Exception as e:
            logger.error(f"Error getting user settings: {e}")
            return await self.create_default_settings(user_id, chat_id)
    
    async def create_default_settings(self, user_id: int, chat_id: int) -> Dict[str, Any]:
        """Создает настройки по умолчанию"""
        try:
            logger.debug(f"🆕 Creating default settings for user_id: {user_id}, chat_id: {chat_id}")
            
            with self.database.engine.connect() as conn:
                conn.execute(
                    text("""
                        INSERT INTO user_settings (user_id, chat_id, notifications_enabled)
                        VALUES (:user_id, :chat_id, :notifications_enabled)
                    """),
                    {
                        "user_id": user_id, 
                        "chat_id": chat_id,
                        "notifications_enabled": True  # По умолчанию включены
                    }
                )
                conn.commit()
                
                logger.debug("✅ Default settings created")
                return {
                    "notifications_enabled": True
                }
                
        except Exception as e:
            logger.error(f"Error creating default settings: {e}")
            return {"notifications_enabled": True}
    
    async def update_notifications_settings(self, user_id: int, chat_id: int, enabled: bool) -> bool:
        """Обновляет настройки уведомлений"""
        try:
            logger.debug(f"🔄 Updating notifications for user_id: {user_id}, chat_id: {chat_id} to: {enabled}")
            
            with self.database.engine.connect() as conn:
                # Сначала проверим существует ли запись
                check_result = conn.execute(
                    text("SELECT id FROM user_settings WHERE user_id = :user_id AND chat_id = :chat_id"),
                    {"user_id": user_id, "chat_id": chat_id}
                )
                existing_record = check_result.fetchone()
                
                if existing_record:
                    # Обновляем существующую запись
                    result = conn.execute(
                        text("""
                            UPDATE user_settings 
                            SET notifications_enabled = :notifications_enabled,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE user_id = :user_id AND chat_id = :chat_id
                        """),
                        {
                            "user_id": user_id,
                            "chat_id": chat_id,
                            "notifications_enabled": enabled
                        }
                    )
                else:
                    # Создаем новую запись
                    result = conn.execute(
                        text("""
                            INSERT INTO user_settings (user_id, chat_id, notifications_enabled)
                            VALUES (:user_id, :chat_id, :notifications_enabled)
                        """),
                        {
                            "user_id": user_id,
                            "chat_id": chat_id,
                            "notifications_enabled": enabled
                        }
                    )
                
                conn.commit()
                
                # Проверим что действительно обновилось
                verify_result = conn.execute(
                    text("SELECT notifications_enabled FROM user_settings WHERE user_id = :user_id AND chat_id = :chat_id"),
                    {"user_id": user_id, "chat_id": chat_id}
                )
                verified_row = verify_result.fetchone()
                
                if verified_row and bool(verified_row.notifications_enabled) == enabled:
                    logger.info(f"✅ Successfully updated notifications settings for user {user_id}: {enabled}")
                    print(f"✅ Successfully updated notifications settings for user {user_id}: {enabled}")
                    return True
                else:
                    logger.error(f"❌ Verification failed: expected {enabled}, got {verified_row.notifications_enabled if verified_row else 'None'}")
                    print(f"❌ Verification failed: expected {enabled}, got {verified_row.notifications_enabled if verified_row else 'None'}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Error updating notifications settings: {e}")
            return False