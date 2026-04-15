from telegram import Update
from telegram.ext import ContextTypes
import logging

logger = logging.getLogger(__name__)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /help"""
    help_text = """
🤖 Доступные команды:

/start - Запустить бота
/help - Показать эту справку
/status - Статус системы

📊 В будущем:
- Просмотр данных с устройств
- Графики и статистика
- Настройки уведомлений
"""
    await update.message.reply_text(help_text)

async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /status"""
    await update.message.reply_text("✅ Бот работает в штатном режиме")