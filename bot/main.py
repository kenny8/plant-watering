import asyncio
import signal
from utils.config import Config
from utils.logger import setup_logger
from utils.db_init import ensure_bot_proxy_column
from core.bot_manager import BotManager

# Настраиваем логгер с DEBUG уровнем
logger = setup_logger(__name__, "DEBUG")

# Установим глобальный уровень логирования для всех модулей
import logging
logging.getLogger().setLevel(logging.DEBUG)

async def shutdown(signal, loop, bot_manager):
    """Корректное завершение работы"""
    logger.info(f"📡 Received exit signal {signal.name}...")
    if bot_manager:
        await bot_manager.stop()
    
    # Отменяем все задачи
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    if tasks:
        logger.info(f"🔄 Cancelling {len(tasks)} outstanding tasks")
        [task.cancel() for task in tasks]
        await asyncio.gather(*tasks, return_exceptions=True)
    
    loop.stop()
    logger.info("👋 Shutdown complete")

async def main():
    """Основная функция запуска"""
    bot_manager = None
    
    try:
        logger.info("🤖 Starting Plant Watering Bot...")
        
        # Загружаем конфигурацию
        db_url = Config.get_database_url()
        check_interval = Config.get_token_check_interval()
        
        logger.info(f"📊 Config loaded - DB: {db_url.split('@')[1] if '@' in db_url else '***'}")
        logger.info(f"📊 Token check interval: {check_interval}s")
        
        # Инициализируем базу данных (создаем колонку bot_proxy_url если нет)
        logger.info("🔧 Ensuring database schema is up to date...")
        if not ensure_bot_proxy_column(db_url):
            logger.error("💥 Failed to ensure database schema. Exiting.")
            return
        
        # Создаем менеджер бота
        bot_manager = BotManager(db_url, check_interval)
        
        # Настройка обработчиков сигналов для graceful shutdown
        loop = asyncio.get_running_loop()
        for sig in [signal.SIGTERM, signal.SIGINT]:
            loop.add_signal_handler(
                sig, 
                lambda s=sig: asyncio.create_task(shutdown(s, loop, bot_manager))
            )
        
        logger.info("🎯 Initializing bot manager...")
        
        # Инициализируем и запускаем
        if await bot_manager.initialize():
            logger.info("🎮 Starting bot main loop...")
            await bot_manager.run()
        else:
            logger.error("💥 Bot initialization failed")
            
    except KeyboardInterrupt:
        logger.info("👋 Bot stopped by user (KeyboardInterrupt)")
    except Exception as e:
        logger.error(f"💥 Failed to start bot: {e}")
        if bot_manager:
            await bot_manager.stop()
        raise
    finally:
        logger.info("🔚 Application finished")

if __name__ == "__main__":
    asyncio.run(main())