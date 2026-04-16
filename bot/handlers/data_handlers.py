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
import json

from core.database import Database


# Константы пагинации
DEVICES_PER_PAGE = 5
FIELDS_PER_PAGE = 5


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
    Загружает список датчиков/полей для устройства.
    Логика: device_id -> build_id -> post_fields (JSON) -> список полей.
    Fallback: device_data.field_name.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    # Парсим device_id из callback_data (формат: data_device_{id})
    try:
        device_id = int(data.split('_')[-1])
    except (ValueError, IndexError):
        print(f"❌ Ошибка парсинга device_id из callback: {data}")
        await query.answer("⚠️ Ошибка: неверный ID устройства", show_alert=True)
        return
    
    print(f"🔍 [ЭТАП 2] Выбор устройства: device_id={device_id}, callback={data}")
    
    db: Database = context.bot_data['db']
    
    # Получаем human_name и build_id устройства
    device_info = None
    try:
        with db.engine.connect() as conn:
            result = conn.execute(
                text("SELECT id, device_human_name, build_id FROM devices WHERE id = :device_id"),
                {"device_id": device_id}
            )
            row = result.fetchone()
            if row:
                device_info = {"id": row[0], "name": row[1], "build_id": row[2]}
                print(f"✅ Устройство найдено в БД: id={row[0]}, human_name='{row[1]}', build_id={row[2]}")
            else:
                print(f"❌ Устройство с ID {device_id} НЕ НАЙДЕНО в таблице devices")
    except Exception as e:
        print(f"❌ SQL ошибка при получении устройства: {e}")
    
    if not device_info:
        print(f"❌ Устройство с ID {device_id} не найдено в БД")
        await query.edit_message_text(
            text="⚠️ _Устройство не найдено или ошибка загрузки._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    device_name = device_info["name"]
    build_id = device_info["build_id"]
    
    # Получаем список полей (датчиков)
    fields = []
    
    # Сначала пытаемся получить из builds.post_fields
    if build_id:
        print(f"🔍 Поиск post_fields в builds для build_id={build_id}")
        try:
            with db.engine.connect() as conn:
                result = conn.execute(
                    text("SELECT post_fields FROM builds WHERE id = :build_id"),
                    {"build_id": build_id}
                )
                row = result.fetchone()
                if row and row[0]:
                    post_fields_raw = row[0]
                    preview = str(post_fields_raw)[:150] + "..." if len(str(post_fields_raw)) > 150 else str(post_fields_raw)
                    print(f"📦 Получены post_fields из builds (тип={type(post_fields_raw).__name__}): {preview}")
                    
                    # Если это JSON строка - парсим
                    if isinstance(post_fields_raw, str):
                        post_fields_data = json.loads(post_fields_raw)
                        if isinstance(post_fields_data, list):
                            # Поддержка разных форматов: ["temp", {"name": "Humidity"}, {"key": "Press"}]
                            for item in post_fields_data:
                                if isinstance(item, str):
                                    fields.append(item)
                                elif isinstance(item, dict):
                                    # Ищем ключи name, key, field_name
                                    field_val = item.get('name') or item.get('key') or item.get('field_name')
                                    if field_val:
                                        fields.append(str(field_val))
                        elif isinstance(post_fields_data, dict):
                            fields = list(post_fields_data.keys())
                    elif isinstance(post_fields_raw, list):
                        for item in post_fields_raw:
                            if isinstance(item, str):
                                fields.append(item)
                            elif isinstance(item, dict):
                                field_val = item.get('name') or item.get('key') or item.get('field_name')
                                if field_val:
                                    fields.append(str(field_val))
                    
                    print(f"✅ Извлечено {len(fields)} полей из builds.post_fields")
        except Exception as e:
            print(f"⚠️ Ошибка парсинга post_fields: {e}")
    
    # Fallback: если post_fields пустой, берем из device_data
    if not fields:
        print(f"⚠️ post_fields пустой или NULL для build_id={build_id}, используем fallback")
        print(f"🔍 Fallback: поиск полей в device_data для device_id={device_id}")
        try:
            with db.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT DISTINCT field_name 
                        FROM device_data 
                        WHERE device_id = :device_id 
                        ORDER BY field_name
                    """),
                    {"device_id": device_id}
                )
                rows = result.fetchall()
                fields = [row[0] for row in rows if row[0]]
                print(f"✅ Извлечено {len(fields)} полей из device_data.field_name")
        except Exception as e:
            print(f"❌ Ошибка получения полей из device_data: {e}")
    
    # Формируем заголовок
    header_text = f"📊 **Данные: {device_name}**\n\nВыберите датчик/поле:"
    
    if not fields:
        print(f"❌ Нет доступных полей для устройства {device_id}")
        await query.edit_message_text(
            text=header_text + "\n\n⚠️ _Нет доступных данных для этого устройства._\n\n_Проверьте настройки сборки (post_fields) или наличие данных в БД._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    # Строим клавиатуру с полями (первая страница)
    reply_markup, total_pages = build_fields_keyboard(fields, device_id, page=0)
    
    print(f"✅ Отправка списка полей: {len(fields)} шт., страниц={total_pages}")
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


def build_fields_keyboard(
    fields: list[str], device_id: int, page: int = 0
) -> tuple[InlineKeyboardMarkup, int]:
    """
    Строит inline-клавиатуру с полями (датчиками) для указанной страницы.
    
    Args:
        fields: Список названий полей
        device_id: ID устройства
        page: Номер текущей страницы (0-indexed)
    
    Returns:
        Кортеж (клавиатура, общее_количество_страниц)
    """
    total_fields = len(fields)
    total_pages = max(1, (total_fields + FIELDS_PER_PAGE - 1) // FIELDS_PER_PAGE)
    
    # Нормализуем номер страницы
    page = max(0, min(page, total_pages - 1))
    
    start_idx = page * FIELDS_PER_PAGE
    end_idx = min(start_idx + FIELDS_PER_PAGE, total_fields)
    page_fields = fields[start_idx:end_idx]
    
    keyboard: list[list[InlineKeyboardButton]] = []
    
    # Кнопки полей
    for field_name in page_fields:
        # Экранируем специальные символы в callback_data
        safe_field = field_name.replace(" ", "_").replace("-", "_")[:32]
        callback_data = f"data_field_{device_id}_{safe_field}"
        keyboard.append([InlineKeyboardButton(
            text=f"📈 {field_name}",
            callback_data=callback_data
        )])
    
    # Кнопки навигации (если страниц больше 1)
    if total_pages > 1:
        nav_row: list[InlineKeyboardButton] = []
        
        # Кнопка "Назад"
        if page > 0:
            nav_row.append(InlineKeyboardButton(
                text="◀️",
                callback_data=f"data_fields_prev_{device_id}_p{page - 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"data_fields_prev_{device_id}_p0"
            ))
        
        # Индикатор страницы
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1}/{total_pages}",
            callback_data="data_fields_page_info"
        ))
        
        # Кнопка "Вперёд"
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text="▶️",
                callback_data=f"data_fields_next_{device_id}_p{page + 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"data_fields_next_{device_id}_p{page}"
            ))
        
        keyboard.append(nav_row)
    
    # Кнопка "Назад к устройствам"
    keyboard.append([InlineKeyboardButton(
        text="🔙 Назад к устройствам",
        callback_data="data_list_p0"
    )])
    
    return InlineKeyboardMarkup(keyboard), total_pages


async def handle_fields_pagination(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик пагинации списка полей (стрелки < >).
    Редактирует существующее сообщение, меняя клавиатуру.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_id = query.from_user.id

    print(f"🔍 [ПАГИНАЦИЯ ПОЛЕЙ] Получен callback: {data}")
    
    # Парсим callback_data
    # Форматы: data_fields_{device_id}_p{page}, data_fields_prev_{device_id}_p{page}, data_fields_next_{device_id}_p{page}
    try:
        if data.startswith("data_fields_prev_") or data.startswith("data_fields_next_"):
            # data_fields_prev_{device_id}_p{page}
            parts = data.split("_")
            device_id = int(parts[3])
            page = int(parts[-1])
        elif data.startswith("data_fields_"):
            # data_fields_{device_id}_p{page}
            parts = data.split("_")
            device_id = int(parts[2])
            page = int(parts[-1])
        else:
            raise ValueError("Неверный формат callback_data")
    except (ValueError, IndexError) as e:
        print(f"⚠️ Ошибка парсинга callback_data для полей: {e}")
        return
    
    db: Database = context.bot_data['db']
    
    # Получаем информацию об устройстве
    device_info = None
    try:
        with db.engine.connect() as conn:
            result = conn.execute(
                text("SELECT id, device_human_name, build_id FROM devices WHERE id = :device_id"),
                {"device_id": device_id}
            )
            row = result.fetchone()
            if row:
                device_info = {"id": row[0], "name": row[1], "build_id": row[2]}
    except Exception as e:
        print(f"❌ Ошибка получения информации об устройстве: {e}")
    
    if not device_info:
        await query.edit_message_text(
            text="⚠️ _Устройство не найдено._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    device_name = device_info["name"]
    build_id = device_info["build_id"]
    
    # Получаем список полей (та же логика что и в handle_device_select)
    fields = []
    
    if build_id:
        try:
            with db.engine.connect() as conn:
                result = conn.execute(
                    text("SELECT post_fields FROM builds WHERE id = :build_id"),
                    {"build_id": build_id}
                )
                row = result.fetchone()
                if row and row[0]:
                    post_fields_raw = row[0]
                    if isinstance(post_fields_raw, str):
                        post_fields_data = json.loads(post_fields_raw)
                        if isinstance(post_fields_data, list):
                            fields = [str(f) for f in post_fields_data if f]
                        elif isinstance(post_fields_data, dict):
                            fields = list(post_fields_data.keys())
                    elif isinstance(post_fields_raw, list):
                        fields = [str(f) for f in post_fields_raw if f]
        except Exception as e:
            print(f"⚠️ Ошибка парсинга post_fields: {e}")
    
    if not fields:
        try:
            with db.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT DISTINCT field_name 
                        FROM device_data 
                        WHERE device_id = :device_id 
                        ORDER BY field_name
                    """),
                    {"device_id": device_id}
                )
                rows = result.fetchall()
                fields = [row[0] for row in rows if row[0]]
        except Exception as e:
            print(f"❌ Ошибка получения полей из device_data: {e}")
    
    header_text = f"📊 **Данные: {device_name}**\n\nВыберите датчик/поле:"
    
    if not fields:
        await query.edit_message_text(
            text=header_text + "\n\n⚠️ _Нет доступных данных для этого устройства._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    reply_markup, total_pages = build_fields_keyboard(fields, device_id, page=page)
    
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_field_select(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик выбора конкретного поля (датчика).
    Пока выводит заглушку (Этап 3).
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    # Парсим device_id и field_name из callback_data (формат: data_field_{device_id}_{field_name})
    try:
        parts = data.split("_", 2)
        device_id = int(parts[1])
        field_name = parts[2].replace("_", " ")  # Восстанавливаем пробелы
    except (ValueError, IndexError) as e:
        print(f"⚠️ Ошибка парсинга callback_data для поля: {e}")
        await query.answer("⚠️ Ошибка: неверный формат данных", show_alert=True)
        return
    
    await query.edit_message_text(
        text=(
            f"📈 **Поле: {field_name}**\n"
            f"📱 Устройство ID: {device_id}\n\n"
            "Здесь будет отображаться:\n"
            "• График значений\n"
            "• Статистика (мин/макс/среднее)\n"
            "• Последние показания\n\n"
            "_Функционал в разработке (Этап 3)._ "
        ),
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton(text="🔙 Назад к списку полей", callback_data=f"data_fields_{device_id}_p0")],
            [InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")]
        ]),
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
    
    # Обработчик пагинации устройств (стрелки)
    application.add_handler(
        CallbackQueryHandler(handle_data_pagination, pattern=r"^data_list_p\d+$")
    )
    
    # Обработчик выбора устройства
    application.add_handler(
        CallbackQueryHandler(handle_device_select, pattern=r"^data_device_\d+$")
    )
    
    # Обработчик пагинации полей (стрелки)
    application.add_handler(
        CallbackQueryHandler(handle_fields_pagination, pattern=r"^data_fields_(prev|next)?_?\d*_p\d+$")
    )
    
    # Обработчик выбора поля (датчика)
    application.add_handler(
        CallbackQueryHandler(handle_field_select, pattern=r"^data_field_\d+_.+$")
    )
