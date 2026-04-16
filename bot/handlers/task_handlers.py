"""
Обработчики раздела "📝 Задачи" для бота.
Реализация пагинации списка устройств пользователя и выбора задач.
"""
from typing import Optional
import json

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from sqlalchemy import text

from core.database import Database
from utils.logger import setup_logger

logger = setup_logger(__name__)

# Константы пагинации
DEVICES_PER_PAGE = 5
COMMANDS_PER_PAGE = 5


def get_user_devices(database: Database, user_id: int) -> list[tuple[int, int, str]]:
    """
    Получает список устройств пользователя из БД.
    
    Возвращает список кортежей: [(device_id, build_id, device_human_name), ...]
    """
    try:
        with database.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT device_id, build_id, device_human_name 
                    FROM user_devices 
                    WHERE user_id = :user_id
                """),
                {"user_id": user_id}
            )
            rows = result.fetchall()
            logger.debug(f"Получено {len(rows)} устройств для user_id={user_id}")
            return [(row[0], row[1], row[2]) for row in rows]
    except Exception as e:
        logger.error(f"Ошибка получения устройств: {e}")
        return []


def build_devices_keyboard(
    devices: list[tuple[int, int, str]], page: int = 0
) -> tuple[InlineKeyboardMarkup, int]:
    """
    Строит inline-клавиатуру с устройствами для указанной страницы.
    
    Args:
        devices: Список кортежей (device_id, build_id, device_human_name)
        page: Номер текущей страницы (0-indexed)
    
    Returns:
        Кортеж (клавиатура, общее_количество_страниц)
    """
    total_devices = len(devices)
    total_pages = max(1, (total_devices + DEVICES_PER_PAGE - 1) // DEVICES_PER_PAGE)
    
    # Нормализуем номер страницы
    page = max(0, min(page, total_pages - 1))
    
    start_idx = page * DEVICES_PER_PAGE
    end_idx = min(start_idx + DEVICES_PER_PAGE, total_devices)
    page_devices = devices[start_idx:end_idx]
    
    keyboard: list[list[InlineKeyboardButton]] = []
    
    # Кнопки устройств - callback_data: task_dev_{device_id}_{build_id}
    for device_id, build_id, device_name in page_devices:
        callback_data = f"task_dev_{device_id}_{build_id}"
        keyboard.append([InlineKeyboardButton(
            text=f"📱 {device_name}",
            callback_data=callback_data
        )])
    
    # Кнопки навигации (если страниц больше 1)
    if total_pages > 1:
        nav_row: list[InlineKeyboardButton] = []
        
        # Кнопка "Назад"
        if page > 0:
            nav_row.append(InlineKeyboardButton(
                text="◀️",
                callback_data=f"task_prev_p{page - 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data="task_prev_p0"
            ))
        
        # Индикатор страницы
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1}/{total_pages}",
            callback_data="task_page_info"
        ))
        
        # Кнопка "Вперёд"
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text="▶️",
                callback_data=f"task_next_p{page + 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"task_next_p{page}"
            ))
        
        keyboard.append(nav_row)
    
    return InlineKeyboardMarkup(keyboard), total_pages


async def handle_tasks_section(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик нажатия кнопки "📝 Задачи" в главном меню.
    Отправляет описание раздела и список устройств пользователя.
    """
    user_id = update.effective_user.id
    logger.info(f"[TASKS_SECTION] Пользователь {user_id} открыл раздел 'Задачи'")
    
    description_text = (
        "📝 **Раздел задач**\\n\\n"
        "Здесь вы можете управлять расписанием полива, настройкой автоматических сценариев "
        "и просматривать журнал выполненных задач.\\n\\n"
        "Выберите устройство для управления задачами:"
    )
    
    # Получаем устройства из БД
    db: Database = context.bot_data['db']
    devices = get_user_devices(db, user_id)
    
    if not devices:
        logger.warning(f"У пользователя {user_id} нет подключённых устройств")
        await update.message.reply_text(
            description_text + "\\n\\n⚠️ _У вас пока нет подключённых устройств._",
            parse_mode='Markdown'
        )
        return
    
    logger.info(f"Пользователь {user_id} имеет {len(devices)} устройств")
    
    # Строим клавиатуру с первой страницей
    reply_markup, _ = build_devices_keyboard(devices, page=0)
    
    await update.message.reply_text(
        description_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_tasks_pagination(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик пагинации списка устройств (стрелки < >).
    Редактирует существующее сообщение, меняя клавиатуру.
    
    Поддерживаемые callback_data:
    - task_list_p{page} - переход на страницу
    - task_prev_p{page} - предыдущая страница
    - task_next_p{page} - следующая страница
    """
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    data = query.data
    
    logger.debug(f"[TASKS_PAGINATION] Получен callback: {data} от user_id={user_id}")
    
    # Парсим номер страницы из callback_data
    # Форматы: task_list_p{page}, task_prev_p{page}, task_next_p{page}
    try:
        page = int(data.split('_p')[-1])
    except (ValueError, IndexError):
        logger.warning(f"Неверный формат callback_data: {data}")
        page = 0
    
    # Получаем устройства из БД
    db: Database = context.bot_data['db']
    devices = get_user_devices(db, user_id)
    
    if not devices:
        logger.warning(f"У пользователя {user_id} нет устройств при пагинации")
        await query.edit_message_text(
            text="⚠️ _У вас пока нет подключённых устройств._",
            parse_mode='Markdown'
        )
        return
    
    # Строим новую клавиатуру для запрошенной страницы
    reply_markup, total_pages = build_devices_keyboard(devices, page=page)
    
    description_text = (
        "📝 **Раздел задач**\\n\\n"
        "Здесь вы можете управлять расписанием полива, настройкой автоматических сценариев "
        "и просматривать журнал выполненных задач.\\n\\n"
        "Выберите устройство для управления задачами:"
    )
    
    logger.debug(f"Пагинация устройств: страница {page + 1}/{total_pages}")
    
    # Редактируем сообщение с новой клавиатурой
    await query.edit_message_text(
        text=description_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_task_device_select(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик выбора конкретного устройства для управления задачами.
    callback_data: task_dev_{device_id}_{build_id}
    
    Показывает меню задач для выбранного устройства.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_id = query.from_user.id
    
    logger.info(f"[TASK_DEVICE_SELECT] Получен callback: {data} от user_id={user_id}")
    
    # Парсим device_id и build_id из callback_data (формат: task_dev_{device_id}_{build_id})
    try:
        parts = data.split('_')
        device_id = int(parts[2])
        build_id = int(parts[3])
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        await query.answer("⚠️ Ошибка: неверный ID устройства", show_alert=True)
        return
    
    db: Database = context.bot_data['db']
    
    # Проверяем, что устройство принадлежит пользователю и получаем human_name
    device_human_name = None
    try:
        with db.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT device_human_name 
                    FROM user_devices 
                    WHERE user_id = :user_id AND device_id = :device_id AND build_id = :build_id
                """),
                {"user_id": user_id, "device_id": device_id, "build_id": build_id}
            )
            row = result.fetchone()
            if row:
                device_human_name = row[0]
                logger.debug(f"Устройство найдено в user_devices: human_name='{device_human_name}'")
            else:
                logger.warning(f"Устройство device_id={device_id}, build_id={build_id} не найдено у пользователя {user_id}")
    except Exception as e:
        logger.error(f"SQL ошибка при проверке устройства: {e}")
    
    if not device_human_name:
        logger.error(f"Устройство не найдено или не принадлежит пользователю")
        await query.edit_message_text(
            text="⚠️ _Устройство не найдено или ошибка загрузки._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="task_list_p0")
            ]])
        )
        return
    
    # Формируем меню задач для устройства
    header_text = f"📝 Задачи: {device_human_name}\\n\\nВыберите действие:"
    
    keyboard = [
        [InlineKeyboardButton(text="⏰ Расписание полива", callback_data=f"task_schedule_{device_id}_{build_id}")],
        [InlineKeyboardButton(text="🔄 Автоматические сценарии", callback_data=f"task_auto_{device_id}_{build_id}")],
        [InlineKeyboardButton(text="📋 Журнал задач", callback_data=f"task_log_{device_id}_{build_id}")],
        [InlineKeyboardButton(text="🔙 К списку устройств", callback_data="task_list_p0")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    logger.info(f"Отправка меню задач для устройства {device_human_name}")
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


def register_task_handlers(application) -> None:
    """
    Регистрирует все обработчики раздела "📝 Задачи" в приложении.
    """
    # Обработчик кнопки "📝 Задачи" в главном меню (Reply)
    # Примечание: этот хендлер регистрируется в bot_manager.py через MessageHandler(filters.Text(["📝 Задачи"]))
    # Здесь регистрируем только callback обработчики
    
    # Обработчик пагинации устройств (стрелки)
    # task_list_p{page}, task_prev_p{page}, task_next_p{page}
    application.add_handler(
        CallbackQueryHandler(handle_tasks_pagination, pattern=r"^task_(list|prev|next)_p\d+$")
    )
    
    # Обработчик выбора устройства - callback_data: task_dev_{device_id}_{build_id}
    application.add_handler(
        CallbackQueryHandler(handle_task_device_select, pattern=r"^task_dev_\d+_\d+$")
    )
