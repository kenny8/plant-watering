"""
Обработчики раздела "📊 Данные" для бота.
Реализация пагинации списка устройств пользователя.
"""
from typing import Optional

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from sqlalchemy import select, text

from core.database import Database


# Константы пагинации
DEVICES_PER_PAGE = 5


def get_user_devices(database: Database, user_id: int) -> list[tuple[int, str]]:
    """
    Получает список устройств пользователя из БД.
    
    Возвращает список кортежей: [(device_id, device_human_name), ...]
    """
    try:
        with database.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT device_id, device_human_name 
                    FROM user_devices 
                    WHERE user_id = :user_id
                """),
                {"user_id": user_id}
            )
            rows = result.fetchall()
            return [(row[0], row[1]) for row in rows]
    except Exception as e:
        print(f"❌ Ошибка получения устройств: {e}")
        return []


def build_devices_keyboard(
    devices: list[tuple[int, str]], page: int = 0
) -> tuple[InlineKeyboardMarkup, int]:
    """
    Строит inline-клавиатуру с устройствами для указанной страницы.
    
    Args:
        devices: Список кортежей (device_id, device_human_name)
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
    
    # Кнопки устройств
    for device_id, device_name in page_devices:
        callback_data = f"data_device_{device_id}"
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
                callback_data=f"data_list_p{page - 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data="data_list_p0"
            ))
        
        # Индикатор страницы
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1}/{total_pages}",
            callback_data="data_page_info"
        ))
        
        # Кнопка "Вперёд"
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text="▶️",
                callback_data=f"data_list_p{page + 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"data_list_p{page}"
            ))
        
        keyboard.append(nav_row)
    
    return InlineKeyboardMarkup(keyboard), total_pages


async def handle_data_section(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик нажатия кнопки "📊 Данные" в главном меню.
    Отправляет описание раздела и список устройств пользователя.
    """
    user_id = update.effective_user.id
    
    description_text = (
        "📊 **Раздел данных**\n\n"
        "Здесь агрегируется история показаний датчиков, статусы устройств и аналитика.\n\n"
        "Выберите устройство для просмотра деталей:"
    )
    
    # Получаем устройства из БД
    db: Database = context.bot_data['db']
    devices = get_user_devices(db, user_id)
    
    if not devices:
        # У пользователя нет устройств
        await update.message.reply_text(
            description_text + "\n\n⚠️ _У вас пока нет подключённых устройств._",
            parse_mode='Markdown'
        )
        return
    
    # Строим клавиатуру с первой страницей
    reply_markup, _ = build_devices_keyboard(devices, page=0)
    
    await update.message.reply_text(
        description_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_data_pagination(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик пагинации списка устройств (стрелки < >).
    Редактирует существующее сообщение, меняя клавиатуру.
    """
    query = update.callback_query
    await query.answer()  # Обязательно для callback queries
    
    user_id = query.from_user.id
    data = query.data
    
    # Парсим номер страницы из callback_data (формат: data_list_p{page})
    try:
        page = int(data.split('_p')[-1])
    except (ValueError, IndexError):
        page = 0
    
    # Получаем устройства из БД
    db: Database = context.bot_data['db']
    devices = get_user_devices(db, user_id)
    
    if not devices:
        await query.edit_message_text(
            text="⚠️ _У вас пока нет подключённых устройств._",
            parse_mode='Markdown'
        )
        return
    
    # Строим новую клавиатуру для запрошенной страницы
    reply_markup, total_pages = build_devices_keyboard(devices, page=page)
    
    description_text = (
        "📊 **Раздел данных**\n\n"
        "Здесь агрегируется история показаний датчиков, статусы устройств и аналитика.\n\n"
        "Выберите устройство для просмотра деталей:"
    )
    
    # Редактируем сообщение с новой клавиатурой
    await query.edit_message_text(
        text=description_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_device_select(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик выбора конкретного устройства.
    Пока выводит заглушку.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    # Парсим device_id из callback_data (формат: data_device_{id})
    try:
        device_id = int(data.split('_')[-1])
    except (ValueError, IndexError):
        await query.answer("⚠️ Ошибка: неверный ID устройства", show_alert=True)
        return
    
    await query.edit_message_text(
        text=(
            f"📱 **Устройство #{device_id}**\n\n"
            "Здесь будет отображаться:\n"
            "• История показаний датчиков\n"
            "• Статус подключения\n"
            "• Графики и аналитика\n\n"
            "_Функционал в разработке._"
        ),
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
        ]]),
        parse_mode='Markdown'
    )


async def handle_data_back_menu(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Возврат в главное меню из раздела данных.
    Удалено: функционал возврата в главное меню не предусмотрен.
    """
    pass


def register_data_handlers(application) -> None:
    """
    Регистрирует все обработчики раздела "📊 Данные" в приложении.
    """
    # Обработчик кнопки "📊 Данные" в главном меню
    application.add_handler(
        MessageHandler(filters.Text(["📊 Данные"]), handle_data_section)
    )
    
    # Обработчик пагинации (стрелки)
    application.add_handler(
        CallbackQueryHandler(handle_data_pagination, pattern=r"^data_list_p\d+$")
    )
    
    # Обработчик выбора устройства
    application.add_handler(
        CallbackQueryHandler(handle_device_select, pattern=r"^data_device_\d+$")
    )
