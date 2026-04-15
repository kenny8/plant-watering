import os
from typing import Optional

class Config:
    """Загрузка конфигурации из environment variables"""
    
    @staticmethod
    def get_database_url() -> str:
        """Получить URL базы данных"""
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise ValueError("DATABASE_URL environment variable is not set")
        return db_url
    
    @staticmethod
    def get_token_check_interval() -> int:
        """Интервал проверки токена в секундах"""
        return int(os.getenv("TOKEN_CHECK_INTERVAL", "30"))
    
    @staticmethod
    def get_log_level() -> str:
        """Уровень логирования"""
        return os.getenv("LOG_LEVEL", "INFO")
    
    @staticmethod
    def get_log_details() -> bool:
        """Детальное логирование (True/False)"""
        return os.getenv("DETAILED_LOGS", "true").lower() == "true"