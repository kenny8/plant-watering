from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import logging

logger = logging.getLogger(__name__)

def ensure_bot_proxy_column(db_url: str) -> bool:
    """
    Проверяет наличие колонки bot_proxy_url в таблице settings
    и создает её если она отсутствует.
    
    Args:
        db_url: URL подключения к базе данных
        
    Returns:
        True если колонка существует или успешно создана, False в случае ошибки
    """
    try:
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            # Проверяем существование колонки
            result = conn.execute(text("""
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'settings' 
                AND COLUMN_NAME = 'bot_proxy_url'
            """))
            
            column_exists = result.fetchone() is not None
            
            if column_exists:
                logger.info("✅ Column 'bot_proxy_url' already exists in settings table")
                return True
            
            # Колонки нет - создаём её
            logger.info("🔧 Creating 'bot_proxy_url' column in settings table...")
            
            conn.execute(text("""
                ALTER TABLE `settings` 
                ADD COLUMN `bot_proxy_url` varchar(512) DEFAULT NULL
                AFTER `telegram_bot_token`
            """))
            
            conn.commit()
            logger.info("✅ Column 'bot_proxy_url' created successfully")
            return True
            
    except SQLAlchemyError as e:
        logger.error(f"❌ Database error while ensuring bot_proxy_url column: {e}")
        return False
    except Exception as e:
        logger.error(f"❌ Unexpected error while ensuring bot_proxy_url column: {e}")
        return False
