from typing import Optional
import asyncio
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, CallbackQueryHandler, MessageHandler, filters
from .database import Database
from .token_monitor import TokenMonitor
from handlers.commands import help_command, status_command
from handlers.menu_handlers import (
    start_command,
    handle_main_menu,
    handle_menu_callback,
)
from handlers.data_handlers import (
    register_data_handlers,
    handle_data_section
)
from handlers.task_handlers import (
    register_task_handlers,
    handle_tasks_section as handle_tasks_section_impl
)
from handlers.device_handlers import (
    devices_list_command,  # ИЗМЕНЕНО: devices_command -> devices_list_command
    add_device_command, 
    remove_device_command, 
    handle_device_callback, 
    handle_device_id_input,  # ДОБАВЛЕНО: новый обработчик
    #device_data_command
)
from handlers.notification_handlers import (
    start_notifications_command, stop_notifications_command, test_notification_command
)
from services.device_service import DeviceService
from services.user_settings_service import UserSettingsService
from services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class BotManager:
    """Главный менеджер бота"""
    
    def __init__(self, db_url: str, token_check_interval: int = 30):
        self.db_url = db_url
        self.database = Database(db_url)
        self.token_monitor = TokenMonitor(self.database, token_check_interval)
        self.current_token: Optional[str] = None
        self.application: Optional[Application] = None
        self.is_running: bool = False
        
    async def initialize(self) -> bool:
        """Инициализация бота"""
        logger.info("🚀 Initializing bot...")
        
        # Получаем начальный токен
        self.current_token = await self.database.get_bot_token()
        
        if not self.current_token:
            logger.error("❌ No initial bot token found in database")
            return False
            
        logger.info(f"📊 Initial token: {self._mask_token(self.current_token)}")
            
        # Создаем приложение бота
        success = await self._create_bot_application()
        if success:
            logger.info("✅ Bot initialized successfully")
            return True
        
        logger.error("❌ Bot initialization failed")
        return False
    
    def _mask_token(self, token: str) -> str:
        """Маскирует токен для логов"""
        if not token or len(token) < 10:
            return "***"
        return f"{token[:10]}...{token[-4:]}"
    
    async def _create_bot_application(self) -> bool:
        """Создание и настройка приложения бота"""
        try:
            logger.info("🛠️ Creating bot application...")
            
            # Получаем прокси URL из базы данных
            proxy_url = await self.database.get_bot_proxy_url()
            
            # Строим приложение с базовыми параметрами
            app_builder = (
                Application.builder()
                .token(self.current_token)
                .arbitrary_callback_data(False)
            )
            
            # Если есть прокси в БД - используем его, иначе пробуем дефолтный
            if proxy_url:
                logger.info(f"🔗 Using proxy from database: {proxy_url}")
                app_builder = app_builder.base_url(proxy_url.strip())
            else:
                # Пробуем дефолтный прокси
                default_proxy = "https://mybot-proxy2026.fedoranisimov.workers.dev/bot"
                logger.info(f"🔗 No proxy in DB, trying default: {default_proxy}")
                app_builder = app_builder.base_url(default_proxy)
            
            self.application = app_builder.build()
            
            # Регистрируем обработчики команд
            self._register_handlers()
            
            # Инициализируем приложение
            await self.application.initialize()
            
            logger.info("✅ Bot application created successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to create bot application: {e}")
            logger.error(f"📊 Token used: {self._mask_token(self.current_token)}")
            return False
    
    def _register_handlers(self):
        """Регистрация обработчиков команд"""
        # Главное меню
        self.application.add_handler(CommandHandler("start", start_command))
    
        # Обработчики кнопок главного меню
        self.application.add_handler(MessageHandler(filters.Text(["📊 Данные"]), handle_data_section))
        self.application.add_handler(MessageHandler(filters.Text(["📝 Задачи"]), handle_tasks_section_impl))
        self.application.add_handler(MessageHandler(filters.Text(["⚙️ Настройки"]), handle_main_menu))
    
        # Регистрируем обработчики раздела "📊 Данные" (пагинация, выбор устройства)
        register_data_handlers(self.application)
        
        # Регистрируем обработчики раздела "📝 Задачи" (пагинация, выбор устройства)
        register_task_handlers(self.application)
    
        # Callback обработчики для inline меню
        self.application.add_handler(CallbackQueryHandler(handle_menu_callback, pattern="^menu_"))
        self.application.add_handler(CallbackQueryHandler(handle_menu_callback, pattern="^enable_"))
        self.application.add_handler(CallbackQueryHandler(handle_menu_callback, pattern="^disable_"))
        self.application.add_handler(CallbackQueryHandler(handle_menu_callback, pattern="^devices_"))
        self.application.add_handler(CallbackQueryHandler(handle_menu_callback, pattern="^add_"))
        self.application.add_handler(CallbackQueryHandler(handle_menu_callback, pattern="^remove_"))
    
        # Обработчик для device callback'ов
        self.application.add_handler(CallbackQueryHandler(handle_device_callback))
    
        # Остальные обработчики без изменений...
        self.application.add_handler(CommandHandler("help", help_command))
        self.application.add_handler(CommandHandler("status", status_command))
        self.application.add_handler(CommandHandler("devices", devices_list_command))
        self.application.add_handler(CommandHandler("add_device", add_device_command))
        self.application.add_handler(CommandHandler("remove_device", remove_device_command))
        self.application.add_handler(CommandHandler("start_notifications", start_notifications_command))
        self.application.add_handler(CommandHandler("stop_notifications", stop_notifications_command))
        self.application.add_handler(CommandHandler("test_notification", test_notification_command))
        self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_device_id_input))
        self.application.add_error_handler(self._error_handler)

    logger.debug("✅ All handlers registered")
    
    async def _error_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Обработчик ошибок"""
        logger.error(f"💥 Bot error: {context.error}")
        if update:
            logger.error(f"📱 Update that caused error: {update}")
    
    async def _on_token_change(self, new_token: str):
        """Обработчик изменения токена"""
        logger.info("🔄 Restarting bot with new token...")
        
        # Останавливаем текущего бота
        await self._stop_bot_application()
        
        # Обновляем токен
        self.current_token = new_token
        logger.info(f"📊 New token set: {self._mask_token(self.current_token)}")
        
        # Перезапускаем бота с новым токеном
        success = await self._create_bot_application()
        if success:
            try:
                await self.application.start()
                await self.application.updater.start_polling()
                logger.info("✅ Bot successfully restarted with new token")
            except Exception as e:
                logger.error(f"❌ Failed to start bot with new token: {e}")
                await self._stop_bot_application()
        else:
            logger.error("❌ Failed to create bot application with new token")
            # Пробуем снова через некоторое время
            logger.info("🕒 Will retry on next monitoring cycle")
    
    async def _stop_bot_application(self):
        """Остановка приложения бота"""
        if self.application:
            try:
                logger.info("🛑 Stopping bot application...")
                
                # Останавливаем updater
                if self.application.updater and self.application.updater.running:
                    await self.application.updater.stop()
                    logger.debug("✅ Updater stopped")
                
                # Останавливаем application
                await self.application.stop()
                await self.application.shutdown()
                
                self.application = None
                logger.info("✅ Bot application stopped completely")
            except Exception as e:
                logger.error(f"❌ Error stopping bot application: {e}")
                self.application = None
    
    async def run(self):
        """Запуск бота"""
        if not self.application:
            logger.error("❌ Bot application not initialized")
            return
        
        try:
            logger.info("🎯 Starting bot main loop...")
            
            # Инициализируем сервисы
            device_service = DeviceService(self.database)
            user_settings_service = UserSettingsService(self.database)
            
            # Создаем экземпляр NotificationService
            notification_service = NotificationService(user_settings_service)
            
            # Сохраняем сервисы и БД в bot_data для доступа из обработчиков
            self.application.bot_data['db'] = self.database
            self.application.bot_data['database'] = self.database
            self.application.bot_data['device_service'] = device_service
            self.application.bot_data['user_settings_service'] = user_settings_service
            self.application.bot_data['notification_service'] = notification_service
            
            # Запускаем бота
            await self.application.start()
            await self.application.updater.start_polling()
            
            logger.info("✅ Bot is now running and polling for messages")
            
            # Запускаем мониторинг токена
            await self.token_monitor.start_monitoring(
                self.current_token, 
                self._on_token_change
            )
            
            self.is_running = True
            logger.info("🔍 Token monitoring started")
            
            # Держим бота активным
            while self.is_running:
                await asyncio.sleep(1)
                
            logger.info("🔚 Main loop ended")
            
        except Exception as e:
            logger.error(f"💥 Error while running bot: {e}")
        finally:
            await self.stop()
    
    async def stop(self):
        """Остановка бота"""
        logger.info("🛑 Stopping bot...")
        self.is_running = False
        
        # Останавливаем мониторинг
        await self.token_monitor.stop_monitoring()
        
        # Останавливаем приложение бота
        await self._stop_bot_application()
        
        logger.info("✅ Bot stopped completely")