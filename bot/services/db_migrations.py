from sqlalchemy import create_engine, text, inspect
import logging
import os

logger = logging.getLogger(__name__)

def run_migrations():
    """
    Проверяет структуру таблицы device_commands и добавляет недостающие колонки.
    Запускается один раз при старте приложения.
    """
    db_url = os.getenv("DATABASE_URL", "mysql+pymysql://root:password@db:3306/plant_watering")
    
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            inspector = inspect(engine)
            
            # Проверяем существование таблицы
            if not inspector.has_table("device_commands"):
                logger.info("Таблица device_commands не найдена. Создаем...")
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS device_commands (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        device_id INT NOT NULL,
                        command VARCHAR(255) NOT NULL,
                        value VARCHAR(255) NOT NULL,
                        is_executed BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        user_id INT DEFAULT NULL,
                        chat_id BIGINT DEFAULT NULL,
                        notification_message_id INT DEFAULT NULL
                    )
                """))
                conn.commit()
                logger.info("Таблица device_commands создана успешно.")
                return

            # Получаем список существующих колонок
            columns = [col['name'] for col in inspector.get_columns('device_commands')]
            
            # Список необходимых колонок
            required_columns = {
                'user_id': "ALTER TABLE device_commands ADD COLUMN user_id INT DEFAULT NULL",
                'chat_id': "ALTER TABLE device_commands ADD COLUMN chat_id BIGINT DEFAULT NULL",
                'notification_message_id': "ALTER TABLE device_commands ADD COLUMN notification_message_id INT DEFAULT NULL"
            }
            
            modifications_made = False
            
            for col_name, alter_query in required_columns.items():
                if col_name not in columns:
                    logger.warning(f"Колонка '{col_name}' отсутствует. Добавляем...")
                    conn.execute(text(alter_query))
                    conn.commit()
                    modifications_made = True
                    logger.info(f"Колонка '{col_name}' успешно добавлена.")
                else:
                    logger.debug(f"Колонка '{col_name}' уже существует.")
            
            if modifications_made:
                logger.info("Миграция таблицы device_commands завершена успешно.")
            else:
                logger.info("Структура таблицы device_commands актуальна. Изменений не требуется.")
                
    except Exception as e:
        logger.error(f"Ошибка при выполнении миграции базы данных: {e}")
        raise
