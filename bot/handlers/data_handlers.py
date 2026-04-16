"""
Обработчики раздела "📊 Данные" для бота.
Реализация пагинации списка устройств пользователя и выбора датчиков/полей.
"""
from typing import Optional

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from sqlalchemy import text
import json

from core.database import Database
from utils.logger import setup_logger

logger = setup_logger(__name__)

# Константы пагинации
DEVICES_PER_PAGE = 5
FIELDS_PER_PAGE = 5


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
    
    # Кнопки устройств - callback_data: data_dev_{device_id}_{build_id}
    for device_id, build_id, device_name in page_devices:
        callback_data = f"data_dev_{device_id}_{build_id}"
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
    logger.info(f"[DATA_SECTION] Пользователь {user_id} открыл раздел 'Данные'")
    
    description_text = (
        "📊 **Раздел данных**\\n\\n"
        "Здесь агрегируется история показаний датчиков, статусы устройств и аналитика.\\n\\n"
        "Выберите устройство для просмотра деталей:"
    )
    
    # Получаем устройства из БД
    db: Database = context.bot_data['db']
    devices = get_user_devices(db, user_id)
    
    if not devices:
        logger.warning(f"У пользователя {user_id} нет подключённых устройств")
        await update.message.reply_text(
            description_text + "\n\n⚠️ _У вас пока нет подключённых устройств._",
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


async def handle_data_pagination(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик пагинации списка устройств (стрелки < >).
    Редактирует существующее сообщение, меняя клавиатуру.
    """
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    data = query.data
    
    logger.debug(f"[DATA_PAGINATION] Получен callback: {data} от user_id={user_id}")
    
    # Парсим номер страницы из callback_data (формат: data_list_p{page})
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
        "📊 **Раздел данных**\\n\\n"
        "Здесь агрегируется история показаний датчиков, статусы устройств и аналитика.\\n\\n"
        "Выберите устройство для просмотра деталей:"
    )
    
    logger.debug(f"Пагинация устройств: страница {page + 1}/{total_pages}")
    
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
    callback_data: data_dev_{device_id}_{build_id}
    Загружает список датчиков/полей для устройства.
    Логика: builds.post_fields (JSON) -> список полей.
    Fallback: device_data.field_name.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_id = query.from_user.id
    
    logger.info(f"[DEVICE_SELECT] Получен callback: {data} от user_id={user_id}")
    
    # Парсим device_id и build_id из callback_data (формат: data_dev_{device_id}_{build_id})
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
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    # Получаем список полей (датчиков)
    fields = []
    
    # Сначала пытаемся получить из builds.post_fields
    logger.debug(f"Поиск post_fields в builds для build_id={build_id}")
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
                logger.debug(f"Получены post_fields из builds (тип={type(post_fields_raw).__name__}): {preview}")
                
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
                
                logger.info(f"Извлечено {len(fields)} полей из builds.post_fields")
            else:
                logger.debug(f"post_fields пуст или NULL для build_id={build_id}")
    except json.JSONDecodeError as e:
        logger.error(f"Ошибка парсинга JSON post_fields: {e}")
    except Exception as e:
        logger.error(f"Ошибка получения post_fields из builds: {e}")
    
    # Fallback: если post_fields пустой, берем из device_data
    if not fields:
        logger.info(f"post_fields пустой или NULL для build_id={build_id}, используем fallback")
        logger.debug(f"Fallback: поиск полей в device_data для device_id={device_id}, build_id={build_id}")
        try:
            with db.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT DISTINCT field_name 
                        FROM device_data 
                        WHERE device_id = :device_id AND build_id = :build_id
                        ORDER BY field_name
                    """),
                    {"device_id": device_id, "build_id": build_id}
                )
                rows = result.fetchall()
                fields = [row[0] for row in rows if row[0]]
                logger.info(f"Извлечено {len(fields)} полей из device_data.field_name")
        except Exception as e:
            logger.error(f"Ошибка получения полей из device_data: {e}")
    
    # Формируем заголовок
    header_text = f"📊 Данные: {device_human_name}\n\nВыберите датчик:"
    
    if not fields:
        logger.warning(f"Нет доступных полей для устройства device_id={device_id}, build_id={build_id}")
        await query.edit_message_text(
            text=header_text + "\n\n⚠️ _Нет доступных данных для этого устройства._\n\n_Проверьте настройки сборки (post_fields) или наличие данных в БД._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    # Строим клавиатуру с полями (первая страница)
    reply_markup, total_pages = build_fields_keyboard(fields, device_id, build_id, page=0)
    
    logger.info(f"Отправка списка полей: {len(fields)} шт., страниц={total_pages}")
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


def build_fields_keyboard(
    fields: list[str], device_id: int, build_id: int, page: int = 0
) -> tuple[InlineKeyboardMarkup, int]:
    """
    Строит inline-клавиатуру с полями (датчиками) для указанной страницы.
    
    Args:
        fields: Список названий полей
        device_id: ID устройства
        build_id: ID сборки
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
    
    # Кнопки полей - callback_data: data_field_{device_id}_{build_id}_{field_name}
    for field_name in page_fields:
        # Экранируем специальные символы в callback_data
        safe_field = field_name.replace(" ", "_").replace("-", "_").replace(".", "_")[:32]
        callback_data = f"data_field_{device_id}_{build_id}_{safe_field}"
        keyboard.append([InlineKeyboardButton(
            text=f"📈 {field_name}",
            callback_data=callback_data
        )])
    
    # Кнопки навигации (если страниц больше 1)
    if total_pages > 1:
        nav_row: list[InlineKeyboardButton] = []
        
        # Кнопка "<" Назад
        if page > 0:
            nav_row.append(InlineKeyboardButton(
                text="<",
                callback_data=f"data_fields_{device_id}_{build_id}_p{page - 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="<",
                callback_data=f"data_fields_{device_id}_{build_id}_p0"
            ))
        
        # Индикатор страницы
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1}/{total_pages}",
            callback_data="data_fields_page_info"
        ))
        
        # Кнопка ">" Вперёд
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text=">",
                callback_data=f"data_fields_{device_id}_{build_id}_p{page + 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text=">",
                callback_data=f"data_fields_{device_id}_{build_id}_p{page}"
            ))
        
        keyboard.append(nav_row)
    
    # Кнопка "🔙 Назад к устройствам"
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
    callback_data: data_fields_{device_id}_{build_id}_p{page}
    Редактирует существующее сообщение, меняя клавиатуру.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_id = query.from_user.id
    
    logger.debug(f"[FIELDS_PAGINATION] Получен callback: {data} от user_id={user_id}")
    
    # Парсим callback_data: data_fields_{device_id}_{build_id}_p{page}
    try:
        parts = data.split('_')
        # data_fields_{device_id}_{build_id}_p{page}
        # parts: ['data', 'fields', '{device_id}', '{build_id}', 'p{page}']
        device_id = int(parts[2])
        build_id = int(parts[3])
        page = int(parts[-1][1:])  # Убираем префикс 'p'
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, page={page}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data для полей: {e}")
        return
    
    db: Database = context.bot_data['db']
    
    # Проверяем принадлежность устройства пользователю и получаем human_name
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
                logger.debug(f"Устройство найдено: human_name='{device_human_name}'")
    except Exception as e:
        logger.error(f"Ошибка получения информации об устройстве: {e}")
    
    if not device_human_name:
        logger.warning(f"Устройство не найдено у пользователя {user_id}")
        await query.edit_message_text(
            text="⚠️ _Устройство не найдено._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    # Получаем список полей (та же логика что и в handle_device_select)
    fields = []
    
    # Пытаемся получить из builds.post_fields
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
                            for item in post_fields_data:
                                if isinstance(item, str):
                                    fields.append(item)
                                elif isinstance(item, dict):
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
        except json.JSONDecodeError as e:
            logger.error(f"Ошибка парсинга JSON post_fields: {e}")
        except Exception as e:
            logger.error(f"Ошибка получения post_fields: {e}")
    
    # Fallback: device_data
    if not fields:
        try:
            with db.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT DISTINCT field_name
                        FROM device_data
                        WHERE device_id = :device_id AND build_id = :build_id
                        ORDER BY field_name
                    """),
                    {"device_id": device_id, "build_id": build_id}
                )
                rows = result.fetchall()
                fields = [row[0] for row in rows if row[0]]
        except Exception as e:
            logger.error(f"Ошибка получения полей из device_data: {e}")
    
    header_text = f"📊 Данные: {device_human_name}\n\nВыберите датчик:"
    
    if not fields:
        await query.edit_message_text(
            text=header_text + "\n\n⚠️ _Нет доступных данных для этого устройства._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="data_list_p0")
            ]])
        )
        return
    
    reply_markup, total_pages = build_fields_keyboard(fields, device_id, build_id, page=page)
    
    logger.debug(f"Пагинация полей: страница {page + 1}/{total_pages}")
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
    callback_data: data_field_{device_id}_{build_id}_{field_name}
    
    Этап 3: Вывод последних 20 показаний датчика.
    - Заголовок: 📊 Показание: {field_name} (_ → пробелы, первая буква заглавная)
    - Запрос в БД: SELECT field_value, created_at FROM device_data WHERE device_id=? AND build_id=? AND field_name=? ORDER BY created_at DESC LIMIT 20
    - Формат: 🕒 {DD.MM.YYYY, HH:MM:SS} | 📏 {field_value}
    - Лимит Telegram: 4096 символов, обрезка с предупреждением если превышено
    - Кнопки: 🔙 Назад к датчикам, 🔙 Назад к устройствам
    """
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    logger.info(f"[FIELD_SELECT] Получен callback: {data} от user_id={user_id}")

    # Парсим device_id, build_id и field_name из callback_data
    # Формат: data_field_{device_id}_{build_id}_{field_name}
    try:
        parts = data.split('_', 3)  # Максимум 4 части: ['data', 'field', '{device_id}', '{build_id}_{field_name}']
        device_id = int(parts[2])
        # Оставшаяся часть: {build_id}_{field_name}
        remaining = parts[3]
        remaining_parts = remaining.split('_', 1)
        build_id = int(remaining_parts[0])
        field_name_encoded = remaining_parts[1] if len(remaining_parts) > 1 else ""
        # Восстанавливаем исходное имя поля (заменяем _ обратно на пробелы)
        field_name = field_name_encoded.replace("_", " ")
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, field_name='{field_name}'")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data для поля: {e}")
        await query.answer("⚠️ Ошибка: неверный формат данных", show_alert=True)
        return

    db: Database = context.bot_data['db']

    # Получаем human_name устройства для отображения
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
                logger.debug(f"Устройство найдено: human_name='{device_human_name}'")
    except Exception as e:
        logger.error(f"Ошибка получения имени устройства: {e}")

    display_name = device_human_name if device_human_name else f"Устройство #{device_id}"

    # Форматируем имя поля для заголовка: заменяем _ на пробелы, первую букву заглавной
    # Для каждого слова делаем первую букву заглавной
    field_display = " ".join(word.capitalize() for word in field_name.split())
    logger.debug(f"Отображаемое имя поля: '{field_display}'")

    # Запрос в БД: последние 20 записей для device_id, build_id, field_name
    logger.info(f"Выполнение SQL-запроса для device_id={device_id}, build_id={build_id}, field_name='{field_name}'")
    readings = []
    total_count = 0
    try:
        with db.engine.connect() as conn:
            # Сначала получаем общее количество записей
            count_result = conn.execute(
                text("""
                    SELECT COUNT(*) 
                    FROM device_data 
                    WHERE device_id = :device_id AND build_id = :build_id AND field_name = :field_name
                """),
                {"device_id": device_id, "build_id": build_id, "field_name": field_name}
            )
            total_count = count_result.scalar() or 0
            logger.debug(f"Общее количество записей в БД: {total_count}")

            # Получаем последние 20 записей
            result = conn.execute(
                text("""
                    SELECT field_value, created_at 
                    FROM device_data 
                    WHERE device_id = :device_id AND build_id = :build_id AND field_name = :field_name
                    ORDER BY created_at DESC
                    LIMIT 20
                """),
                {"device_id": device_id, "build_id": build_id, "field_name": field_name}
            )
            rows = result.fetchall()
            readings = [(row[0], row[1]) for row in rows]
            logger.info(f"Получено {len(readings)} записей из БД")
    except Exception as e:
        logger.error(f"Ошибка выполнения SQL-запроса: {e}")
        await query.edit_message_text(
            text=f"⚠️ _Ошибка загрузки данных: {e}_",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 Назад к датчикам", callback_data=f"data_fields_{device_id}_{build_id}_p0"),
                InlineKeyboardButton(text="🔙 Назад к устройствам", callback_data="data_list_p0")
            ]])
        )
        return

    # Формируем текст сообщения
    header_text = f"📊 Показание: {field_display}\n\n"
    
    if not readings:
        logger.warning(f"Нет записей для field_name='{field_name}', device_id={device_id}, build_id={build_id}")
        message_text = header_text + "📭 Записей пока нет"
    else:
        lines = []
        for field_value, created_at in readings:
            # Форматируем дату: DD.MM.YYYY, HH:MM:SS
            try:
                date_str = created_at.strftime("%d.%m.%Y, %H:%M:%S") if created_at else "N/A"
            except AttributeError:
                # Если created_at уже строка
                date_str = str(created_at)[:19] if created_at else "N/A"
            
            # Форматируем значение
            value_str = str(field_value) if field_value is not None else "N/A"
            lines.append(f"🕒 {date_str} | 📏 {value_str}")
        
        # Проверяем лимит Telegram (4096 символов)
        base_text = header_text + "\n".join(lines)
        logger.debug(f"Длина текста до проверки лимита: {len(base_text)} символов")
        
        if len(base_text) > 4096:
            # Обрезаем список до безопасного количества строк
            max_lines = 0
            for i in range(len(lines), 0, -1):
                test_text = header_text + "\n".join(lines[:i])
                if len(test_text) <= 4096:
                    max_lines = i
                    break
            
            # Добавляем предупреждение
            lines = lines[:max_lines]
            warning_text = f"\n\n⚠️ Показано {len(lines)} из {len(readings)} записей"
            final_text = header_text + "\n".join(lines) + warning_text
            logger.info(f"Текст обрезан: показано {len(lines)} из {len(readings)} записей (лимит 4096)")
            message_text = final_text
        else:
            message_text = base_text
            logger.debug(f"Текст помещается в лимит: {len(message_text)} символов")

    # Формируем клавиатуру
    keyboard = [
        [
            InlineKeyboardButton(text="🔙 Назад к датчикам", callback_data=f"data_fields_{device_id}_{build_id}_p0"),
            InlineKeyboardButton(text="🔙 Назад к устройствам", callback_data="data_list_p0")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    logger.info(f"Отправка edit_message_text с показаниями датчика ({len(message_text)} символов)")
    
    # Редактируем сообщение
    await query.edit_message_text(
        text=message_text,
        reply_markup=reply_markup,
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
    
    # Обработчик выбора устройства - callback_data: data_dev_{device_id}_{build_id}
    application.add_handler(
        CallbackQueryHandler(handle_device_select, pattern=r"^data_dev_\d+_\d+$")
    )
    
    # Обработчик пагинации полей - callback_data: data_fields_{device_id}_{build_id}_p{page}
    application.add_handler(
        CallbackQueryHandler(handle_fields_pagination, pattern=r"^data_fields_\d+_\d+_p\d+$")
    )
    
    # Обработчик выбора поля - callback_data: data_field_{device_id}_{build_id}_{field_name}
    application.add_handler(
        CallbackQueryHandler(handle_field_select, pattern=r"^data_field_\d+_\d+_.+$")
    )
