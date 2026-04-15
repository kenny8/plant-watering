import asyncio
import logging
from typing import Dict, Any, List
from telegram import Update
from telegram.ext import ContextTypes

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
            logger.debug(f"🔍 Getting notification status for user_id: {user_id}, chat_id: {chat_id}")
            settings = await self.user_settings_service.get_user_settings(user_id, chat_id)
            status = settings.get("notifications_enabled", True)
            logger.debug(f"📊 Notification status: {status}")
            return status
        except Exception as e:
            logger.error(f"Error getting notification status: {e}")
            return True
    
    async def set_user_notification_status(self, user_id: int, chat_id: int, enabled: bool) -> bool:
        """Устанавливает статус уведомлений пользователя"""
        try:
            logger.debug(f"⚙️ Setting notification status for user_id: {user_id}, chat_id: {chat_id} to: {enabled}")
            success = await self.user_settings_service.update_notifications_settings(user_id, chat_id, enabled)
            if success:
                if enabled:
                    # Если включаем уведомления, подписываем пользователя
                    await self.subscribe_user(chat_id, {"user_id": user_id})
                    logger.debug("✅ Subscribed user to notifications")
                else:
                    await self.unsubscribe_user(chat_id)
                    logger.debug("✅ Unsubscribed user from notifications")
            else:
                logger.error("❌ Failed to update notification settings in DB")
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
                # Получаем user_id из подписанных пользователей
                user_data = self.subscribed_users.get(chat_id, {})
                user_id = user_data.get('user_id', chat_id)  # fallback to chat_id если user_id нет
                
                # Проверяем статус уведомлений из БД
                if await self.get_user_notification_status(user_id, chat_id):
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=message,
                        parse_mode='Markdown'
                    )
            else:
                # Отправляем всем подписанным пользователям с включенными уведомлениями
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
    
    async def check_device_status(self, context: ContextTypes.DEFAULT_TYPE, device_service):
        """Проверяет статус устройств и отправляет уведомления (только если включены)"""
        try:
            notifications = []
            
            # Проверяем для каждого подписанного пользователя с включенными уведомлениями
            for chat_id, user_data in self.subscribed_users.items():
                user_id = user_data.get('user_id', chat_id)
                if not await self.get_user_notification_status(user_id, chat_id):
                    continue  # Пропускаем пользователей с выключенными уведомлениями
                
                # Проверяем удаленные устройства
                removed_devices = await device_service.check_device_removals(user_id)
                for device in removed_devices:
                    notifications.append(
                        f"❌ Устройство '{device['device_human_name'] or device['device_id']}' "
                        f"было удалено из системы и убрано из вашего списка"
                    )
                
                # Проверяем статус онлайн/оффлайн устройств
                user_devices = await device_service.get_user_devices(user_id)
                for device in user_devices:
                    device_name = device['device_human_name']
                    if device['is_online']:
                        notifications.append(
                            f"✅ Устройство '{device_name}' сейчас онлайн"
                        )
                    else:
                        notifications.append(
                            f"⚠️ Устройство '{device_name}' не в сети (последний раз: {device['last_seen']})"
                        )
            
            # Отправляем уведомления
            for notification in set(notifications):  # Убираем дубликаты
                await self.send_notification(context, notification)
                
        except Exception as e:
            logger.error(f"Error checking device status: {e}")
    
    def start_monitoring(self, context: ContextTypes.DEFAULT_TYPE, device_service, interval: int = 300):
        """Запускает мониторинг устройств"""
        if hasattr(context, 'job_queue'):
            job = context.job_queue.run_repeating(
                lambda ctx: self.check_device_status(ctx, device_service),
                interval=interval,
                first=10
            )
            self.monitoring_jobs[context._chat_id] = job
            logger.info("Device monitoring started")