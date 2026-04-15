from telegram import Update
from telegram.ext import ContextTypes, CommandHandler
import logging

logger = logging.getLogger(__name__)

async def start_notifications_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start_notifications - подписка на уведомления"""
    try:
        user_id = update.effective_chat.id
        chat_id = update.effective_chat.id
        
        # Получаем notification_service из context
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            await update.message.reply_text("❌ Сервис уведомлений не доступен")
            return
        
        # Включаем уведомления в БД
        success = await notification_service.set_user_notification_status(user_id, chat_id, True)
        
        if success:
            await update.message.reply_text(
                "🔔 **Уведомления включены!**\n\n"
                "Теперь вы будете получать:\n"
                "• Уведомления о добавлении/удалении устройств\n"
                "• Статус онлайн/оффлайн ваших устройств\n"
                "• Предупреждения о проблемах"
            )
        else:
            await update.message.reply_text("❌ Ошибка при включении уведомлений")
        
    except Exception as e:
        logger.error(f"Error in start_notifications_command: {e}")
        await update.message.reply_text("❌ Ошибка при включении уведомлений")

async def stop_notifications_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /stop_notifications - отписка от уведомлений"""
    try:
        user_id = update.effective_chat.id
        chat_id = update.effective_chat.id
        
        # Получаем notification_service из context
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            await update.message.reply_text("❌ Сервис уведомлений не доступен")
            return
        
        # Выключаем уведомления в БД
        success = await notification_service.set_user_notification_status(user_id, chat_id, False)
        
        if success:
            await update.message.reply_text(
                "🔕 **Уведомления выключены.**\n\n"
                "Вы больше не будете получать уведомления от системы."
            )
        else:
            await update.message.reply_text("❌ Ошибка при выключении уведомлений")
        
    except Exception as e:
        logger.error(f"Error in stop_notifications_command: {e}")
        await update.message.reply_text("❌ Ошибка при выключении уведомлений")

async def test_notification_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /test_notification - тестовое уведомление"""
    try:
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            await update.message.reply_text("❌ Сервис уведомлений не доступен")
            return
            
        await notification_service.send_notification(
            context,
            "🔔 **Тестовое уведомление**\n\n"
            "Это тестовое сообщение для проверки системы уведомлений.",
            update.effective_chat.id
        )
        
        await update.message.reply_text("✅ Тестовое уведомление отправлено!")
        
    except Exception as e:
        logger.error(f"Error in test_notification_command: {e}")
        await update.message.reply_text("❌ Ошибка при отправке тестового уведомления")