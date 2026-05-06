from telegram import Update
from telegram.ext import ContextTypes, CommandHandler
import logging

logger = logging.getLogger(__name__)


async def start_notifications_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start_notifications - подписка на уведомления"""
    user_id = update.effective_chat.id
    chat_id = update.effective_chat.id

    logger.info(f"🔔 Включение уведомлений для user_id={user_id}, chat_id={chat_id}")

    try:
        # Получаем notification_service из context
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            logger.error("❌ notification_service not found in bot_data")
            await update.message.reply_text("❌ Сервис уведомлений не доступен")
            return

        # Включаем уведомления в БД
        success = await notification_service.set_user_notification_status(user_id, chat_id, True)
        logger.info(f"📊 set_user_notification_status result: {success}")

        if success:
            await update.message.reply_text(
                "🔔 **Уведомления включены!**\n\n"
                "Теперь вы будете получать:\n"
                "• Уведомления о добавлении/удалении устройств\n"
                "• Статус онлайн/оффлайн ваших устройств\n"
                "• Предупреждения о проблемах"
            )
        else:
            logger.error("❌ set_user_notification_status returned False")
            await update.message.reply_text("❌ Ошибка при включении уведомлений")

    except Exception as e:
        logger.error(f"💥 Error in start_notifications_command: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Ошибка: {str(e)[:100]}")


async def stop_notifications_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /stop_notifications - отписка от уведомлений"""
    user_id = update.effective_chat.id
    chat_id = update.effective_chat.id

    logger.info(f"🔕 Выключение уведомлений для user_id={user_id}, chat_id={chat_id}")

    try:
        # Получаем notification_service из context
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            logger.error("❌ notification_service not found in bot_data")
            await update.message.reply_text("❌ Сервис уведомлений не доступен")
            return

        # Выключаем уведомления в БД
        success = await notification_service.set_user_notification_status(user_id, chat_id, False)
        logger.info(f"📊 set_user_notification_status result: {success}")

        if success:
            await update.message.reply_text(
                "🔕 **Уведомления выключены.**\n\n"
                "Вы больше не будете получать уведомления от системы."
            )
        else:
            logger.error("❌ set_user_notification_status returned False")
            await update.message.reply_text("❌ Ошибка при выключении уведомлений")

    except Exception as e:
        logger.error(f"💥 Error in stop_notifications_command: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Ошибка: {str(e)[:100]}")


async def test_notification_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /test_notification - тестовое уведомление"""
    user_id = update.effective_chat.id
    chat_id = update.effective_chat.id

    logger.info(f"🧪 Тестовое уведомление для user_id={user_id}, chat_id={chat_id}")

    try:
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            logger.error("❌ notification_service not found in bot_data")
            await update.message.reply_text("❌ Сервис уведомлений не доступен")
            return

        await notification_service.send_notification(
            context,
            "🔔 **Тестовое уведомление**\n\n"
            "Это тестовое сообщение для проверки системы уведомлений.",
            chat_id
        )
        await update.message.reply_text("✅ Тестовое уведомление отправлено!")

    except Exception as e:
        logger.error(f"💥 Error in test_notification_command: {e}", exc_info=True)
        await update.message.reply_text(f"❌ Ошибка: {str(e)[:100]}")
