import logging
import sys
from typing import Optional

def setup_logger(name: str = __name__, level: Optional[str] = None) -> logging.Logger:
    """Настройка логгера"""
    logger = logging.getLogger(name)
    
    # Принудительно сбрасываем handlers чтобы логи были в консоли
    if logger.handlers:
        logger.handlers = []
    
    # Уровень логирования
    log_level = getattr(logging, level) if level else logging.DEBUG
    logger.setLevel(log_level)
    
    # Форматтер
    formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Обработчик для консоли
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Отключаем propagation
    logger.propagate = False
    
    return logger