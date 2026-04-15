from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class Database:
    """Класс для работы с базой данных"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.engine = create_engine(db_url)
    
    async def get_bot_token(self) -> Optional[str]:
        """Получает текущий токен из базы данных"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(
                    text("SELECT telegram_bot_token FROM settings LIMIT 1")
                )
                row = result.fetchone()
                return row[0] if row else None
        except SQLAlchemyError as e:
            logger.error(f"Database error fetching bot token: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching bot token: {e}")
            return None
    
    # Можно добавить другие методы для работы с БД позже
    async def get_user_settings(self, user_id: int):
        """Получить настройки пользователя (для будущего использования)"""
        pass