import asyncio
import logging
from typing import Dict, Any, List
from telegram import Update
from telegram.ext import ContextTypes
from sqlalchemy import text

logger = logging.getLogger(__name__)


class NotificationService:
    """Сервис для управления уведомлениями"""

    def __init__(self, user_settings_service):
        self.subscribed_users: Dict[int, Dict[str, Any]] = {}  # chat_id -> user_data
        self.monitoring_jobs: Dict[int, Any] = {}  # chat_id -> job
        self.user_settings_service = user_settings_service

    async def get_user_notification_status(self, user_id: int, chat_id: int) -> bool:
        """Получает статус уведомлений пользователя из БД"""
        try:
            logger.debug(f"Getting notification status for user_id: {user_id}, chat_id: {chat_id}")
            settings = await self.user_settings_service.get_user_settings(user_id, chat_id)
            status = settings.get("notifications_enabled", True)
            logger.debug(f"Notification status: {status}")
            return status
        except Exception as e:
            logger.error(f"Error getting notification status: {e}")
            return True

    async def set_user_notification_status(self, user_id: int, chat_id: int, enabled: bool) -> bool:
        """Устанавливает статус уведомлений пользователя"""
        try:
            logger.debug(f"Setting notification status for user_id: {user_id}, chat_id: {chat_id} to: {enabled}")
            success = await self.user_settings_service.update_notifications_settings(user_id, chat_id, enabled)
            if success:
                if enabled:
                    await self.subscribe_user(chat_id, {"user_id": user_id})
                    logger.debug("Subscribed user to notifications")
                else:
                    await self.unsubscribe_user(chat_id)
                    logger.debug("Unsubscribed user from notifications")
            else:
                logger.error("Failed to update notification settings in DB")
                return success
        except Exception as e:
            logger.error(f"Error setting notification status: {e}")
            return False

    async def subscribe_user(self, chat_id: int, user_data: Dict[str, Any]):
        """Подписывает пользователя на уведомления"""
        self.subscribed_users[chat_id] = user_data
        logger.info(f"User {chat_id} subscribed to notifications")

    async def unsubscribe_user(self, chat_id: int):
        """Отписывает пользователя от уведомлений"""
        if chat_id in self.subscribed_users:
            del self.subscribed_users[chat_id]
        logger.info(f"User {chat_id} unsubscribed from notifications")

    async def send_notification(self, context: ContextTypes.DEFAULT_TYPE, message: str, chat_id: int = None):
        """Отправляет уведомление пользователю только если уведомления включены"""
        try:
            if chat_id:
                user_data = self.subscribed_users.get(chat_id, {})
                user_id = user_data.get('user_id', chat_id)

                if await self.get_user_notification_status(user_id, chat_id):
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=message,
                        parse_mode='Markdown'
                    )
                else:
                    for subscriber_id, user_data in self.subscribed_users.items():
                        user_id = user_data.get('user_id', subscriber_id)
                        if await self.get_user_notification_status(user_id, subscriber_id):
                            try:
                                await context.bot.send_message(
                                    chat_id=subscriber_id,
                                    text=message,
                                    parse_mode='Markdown'
                                )
                            except Exception as e:
                                logger.error(f"Error sending notification to {subscriber_id}: {e}")

        except Exception as e:
            logger.error(f"Error sending notification: {e}")

    async def check_pending_notifications(self, context: ContextTypes.DEFAULT_TYPE, user_id: int, chat_id: int):
        """
        Проверяет таблицу notifications на новые уведомления для пользователя.
        Отправляет только если:
        - У пользователя включены уведомления
        - Устройство принадлежит пользователю

        После отправки обновляет статус на 'sent' и заполняет sent_at.
        """
        try:
            database = context.bot_data.get('db')
            if not database:
                logger.error("Database not available in bot_data")
                return

            # Проверяем статус уведомлений пользователя
            if not await self.get_user_notification_status(user_id, chat_id):
                logger.debug(f"User {user_id} has notifications disabled, skipping")
                return

            # Получаем непрочитанные уведомления для устройств пользователя
            with database.engine.connect() as conn:
                result = conn.execute(
                    text("""
                    SELECT n.id, n.text, n.device_id, n.created_at
                    FROM notifications n
                    INNER JOIN user_devices ud
                        ON n.device_id = ud.device_id AND n.build_id = ud.build_id
                    WHERE n.status = 'pending'
                      AND ud.user_id = :user_id
                      AND ud.chat_id = :chat_id
                    ORDER BY n.created_at ASC
                    """),
                    {"user_id": user_id, "chat_id": chat_id}
                )
                rows = result.fetchall()

                if not rows:
                    logger.debug(f"No pending notifications for user {user_id}")
                    return

                logger.info(f"Found {len(rows)} pending notifications for user {user_id}")

                # Отправляем каждое уведомление
                for row in rows:
                    notif_id, text, device_id, created_at = row

                    try:
                        await context.bot.send_message(
                            chat_id=chat_id,
                            text=text,
                            parse_mode='Markdown'
                        )
                        logger.info(f"Sent notification {notif_id} to user {user_id}")

                        # Обновляем статус на 'sent'
                        conn.execute(
                            text("""
                            UPDATENotifications
                            SET status = 'sent', sent_at = :sent_at
                            WHERE id = :notif_id
                            """),
                            {"sent_at": created_at, "notif_id": notif_id}
                        )
                        conn.commit()

                    except Exception as e:
                        logger.error(f"Error sending notification {notif_id}: {e}")

        except Exception as e:
            logger.error(f"Error checking pending notifications: {e}", exc_info=True)

    async def check_device_status(self, context: ContextTypes.DEFAULT_TYPE, device_service):
        """Проверяет статус устройств и отправляет уведомления (только если включены)"""
        try:
            notifications = []

            for chat_id, user_data in self.subscribed_users.items():
                user_id = user_data.get('user_id', chat_id)
                if not await self.get_user_notification_status(user_id, chat_id):
                    continue

                removed_devices = await device_service.check_device_removals(user_id)
                for device in removed_devices:
                    notifications.append(
                        f"Device '{device['device_human_name'] or device['device_id']}' "
                        f"was removed from system"
                    )

                user_devices = await device_service.get_user_devices(user_id)
                for device in user_devices:
                    device_name = device['device_human_name']
                    if device['is_online']:
                        notifications.append(
                            f"Device '{device_name}' is now online"
                        )
                    else:
                        notifications.append(
                            f"Device '{device_name}' is offline (last seen: {device['last_seen']})"
                        )

                for notification in set(notifications):
                    await self.send_notification(context, notification)

        except Exception as e:
            logger.error(f"Error checking device status: {e}")

    def start_monitoring(self, context: ContextTypes.DEFAULT_TYPE, device_service, interval: int = 300):
        """Запускает мониторинг устройств и проверку уведомлений"""
        if hasattr(context, 'job_queue'):
            device_job = context.job_queue.run_repeating(
                lambda ctx: self.check_device_status(ctx, device_service),
                interval=interval,
                first=10
            )
            self.monitoring_jobs[context._chat_id] = device_job

            notif_job = context.job_queue.run_repeating(
                lambda ctx: self._check_notifications_for_all_users(ctx),
                interval=60,
                first=15
            )
            logger.info("Device monitoring and notification checking started")

    async def _check_notifications_for_all_users(self, context: ContextTypes.DEFAULT_TYPE):
        """Проверяет уведомления для всех подписанных пользователей"""
        try:
            for chat_id, user_data in self.subscribed_users.items():
                user_id = user_data.get('user_id', chat_id)
                await self.check_pending_notifications(context, user_id, chat_id)
        except Exception as e:
            logger.error(f"Error in periodic notification check: {e}")
