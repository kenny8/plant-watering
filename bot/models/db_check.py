import logging
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from bot.config import settings
from bot.models.db_models import Base, DeviceCommand

logger = logging.getLogger(__name__)

def check_and_create_tables():
    """Проверяет наличие таблицы device_commands и необходимых колонок, создает их если нет."""
    try:
        engine = create_engine(settings.DATABASE_URL)
        inspector = inspect(engine)
        
        # Проверяем существование таблицы
        if 'device_commands' not in inspector.get_table_names():
            logger.info("Таблица device_commands не найдена, создаю...")
            Base.metadata.create_all(bind=engine)
            logger.info("Таблица device_commands создана успешно.")
            return

        logger.info("Таблица device_commands существует, проверяю колонки...")
        
        # Проверяем наличие необходимых колонок
        columns = [col['name'] for col in inspector.get_columns('device_commands')]
        required_columns = ['user_id', 'chat_id', 'notification_message_id']
        
        missing_columns = [col for col in required_columns if col not in columns]
        
        if missing_columns:
            logger.info(f"Отсутствуют колонки: {missing_columns}. Добавляю...")
            with engine.connect() as conn:
                for col in missing_columns:
                    if col == 'user_id':
                        conn.execute(text("ALTER TABLE device_commands ADD COLUMN user_id INT DEFAULT NULL"))
                    elif col == 'chat_id':
                        conn.execute(text("ALTER TABLE device_commands ADD COLUMN chat_id BIGINT DEFAULT NULL"))
                    elif col == 'notification_message_id':
                        conn.execute(text("ALTER TABLE device_commands ADD COLUMN notification_message_id INT DEFAULT NULL"))
                conn.commit()
            logger.info(f"Колонки {missing_columns} добавлены успешно.")
        else:
            logger.info("Все необходимые колонки присутствуют.")
            
    except Exception as e:
        logger.error(f"Ошибка при проверке/создании таблицы device_commands: {e}")
        raise

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    check_and_create_tables()
    logger.info("Проверка БД завершена.")
