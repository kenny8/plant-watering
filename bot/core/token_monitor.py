import asyncio
import logging
from typing import Optional, Callable
from .database import Database

logger = logging.getLogger(__name__)

class TokenMonitor:
    """Мониторинг изменений токена в базе данных"""
    
    def __init__(self, database: Database, check_interval: int = 30):
        self.database = database
        self.check_interval = check_interval
        self.is_monitoring = False
        self.monitor_task: Optional[asyncio.Task] = None
        self.on_token_change: Optional[Callable] = None
        self.check_count = 0
    
    async def start_monitoring(self, current_token: str, on_token_change_callback: Callable):
        """Запуск мониторинга изменений токена"""
        self.is_monitoring = True
        self.on_token_change = on_token_change_callback
        self.check_count = 0
        
        logger.info(f"🔍 Starting token monitoring (interval: {self.check_interval}s)")
        logger.info(f"📊 Initial token: {self._mask_token(current_token)}")
        
        self.monitor_task = asyncio.create_task(
            self._monitor_loop(current_token)
        )
    
    async def stop_monitoring(self):
        """Остановка мониторинга"""
        self.is_monitoring = False
        
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                logger.debug("📊 Token monitoring task cancelled")
        
        logger.info("✅ Token monitoring stopped")
    
    def _mask_token(self, token: str) -> str:
        """Маскирует токен для логов"""
        if not token or len(token) < 10:
            return "***"
        return f"{token[:10]}...{token[-4:]}"
    
    async def _monitor_loop(self, current_token: str):
        """Основной цикл мониторинга"""
        while self.is_monitoring:
            try:
                self.check_count += 1
                new_token = await self.database.get_bot_token()
                
                if not new_token:
                    logger.warning("⚠️ No bot token found in database")
                elif new_token != current_token:
                    logger.info("🔄 Bot token change detected!")
                    logger.info(f"📊 Old: {self._mask_token(current_token)}")
                    logger.info(f"📊 New: {self._mask_token(new_token)}")
                    
                    if self.on_token_change:
                        await self.on_token_change(new_token)
                    
                    # Обновляем текущий токен для следующих проверок
                    current_token = new_token
                    logger.info("✅ Token updated in monitor")
                else:
                    logger.debug(f"📊 Token check #{self.check_count}: unchanged")
                
                await asyncio.sleep(self.check_interval)
                
            except asyncio.CancelledError:
                logger.debug("🔚 Monitoring loop cancelled")
                break
            except Exception as e:
                logger.error(f"❌ Error in token monitoring: {e}")
                await asyncio.sleep(60)  # Ждем минуту при ошибках