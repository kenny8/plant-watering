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


def get_build_get_fields(database: Database, build_id: int) -> Optional[list[tuple[str, str]]]:
    """
    Получает GET-команды из БД для указанного build_id.
    
    Возвращает список кортежей: [(cmd_machine_name, human_name), ...]
    или None если данные отсутствуют/невалидны.
    """
    try:
        with database.engine.connect() as conn:
            result = conn.execute(
                text("SELECT get_fields FROM builds WHERE id = :build_id"),
                {"build_id": build_id}
            )
            row = result.fetchone()
            if not row or not row[0]:
                logger.warning(f"get_fields для build_id={build_id} пуст или NULL (row={row})")
                return None
            
            get_fields_data = row[0]
            logger.info(f"get_fields для build_id={build_id}: тип={type(get_fields_data)}, значение={repr(get_fields_data)[:500]}")
            
            # Парсим JSON
            if isinstance(get_fields_data, str):
                data = json.loads(get_fields_data)
            else:
                data = get_fields_data
            
            logger.info(f"Распарсенные данные: тип={type(data)}, значение={repr(data)[:500]}")
            
            commands = []
            # Формат: простой список строк ["cmd1", "cmd2"] - используем cmd как human
            if isinstance(data, list) and all(isinstance(x, str) for x in data):
                for cmd in data:
                    commands.append((cmd, cmd))
            # Формат: массив объектов [{...}, ...]
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        # Пробуем разные варианты ключей
                        # Вариант 1: "cmd" и "human" (старый формат)
                        cmd = item.get("cmd") or item.get("machine_name") or item.get("name") or item.get("field") or item.get("key")
                        human = item.get("human") or item.get("human_name") or item.get("title") or item.get("label") or item.get("name")
                        
                        if cmd and human:
                            commands.append((cmd, human))
                        elif cmd:
                            commands.append((cmd, cmd))
            # Формат: dict {"cmd1": "human1", "cmd2": "human2"}
            elif isinstance(data, dict):
                for cmd, human in data.items():
                    commands.append((cmd, human if human else cmd))
            
            logger.info(f"Итого получено {len(commands)} GET-команд для build_id={build_id}: {commands}")
            return commands if commands else None
    except json.JSONDecodeError as e:
        logger.error(f"Ошибка парсинга JSON get_fields для build_id={build_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Ошибка получения get_fields для build_id={build_id}: {e}", exc_info=True)
        return None


def build_commands_keyboard(
    device_id: int,
    build_id: int,
    commands: list[tuple[str, str]],
    page: int = 0
) -> tuple[InlineKeyboardMarkup, int]:
    """
    Строит inline-клавиатуру с GET-командами для указанной страницы.
    
    Args:
        device_id: ID устройства
        build_id: ID сборки
        commands: Список кортежей (cmd_machine_name, human_name)
        page: Номер текущей страницы (0-indexed)
    
    Returns:
        Кортеж (клавиатура, общее_количество_страниц)
    """
    total_commands = len(commands)
    total_pages = max(1, (total_commands + COMMANDS_PER_PAGE - 1) // COMMANDS_PER_PAGE)
    
    # Нормализуем номер страницы
    page = max(0, min(page, total_pages - 1))
    
    start_idx = page * COMMANDS_PER_PAGE
    end_idx = min(start_idx + COMMANDS_PER_PAGE, total_commands)
    page_commands = commands[start_idx:end_idx]
    
    keyboard: list[list[InlineKeyboardButton]] = []
    
    # Кнопки команд - callback_data: task_cmd_val_{device_id}_{build_id}_{cmd_machine}
    for cmd_machine, human_name in page_commands:
        callback_data = f"task_cmd_val_{device_id}_{build_id}_{cmd_machine}"
        keyboard.append([InlineKeyboardButton(
            text=f"🔹 {human_name}",
            callback_data=callback_data
        )])
    
    # Кнопки навигации (если страниц больше 1)
    if total_pages > 1:
        nav_row: list[InlineKeyboardButton] = []
        
        # Кнопка "Назад"
        if page > 0:
            nav_row.append(InlineKeyboardButton(
                text="◀️",
                callback_data=f"task_cmd_{device_id}_{build_id}_p{page - 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"task_cmd_{device_id}_{build_id}_p0"
            ))
        
        # Индикатор страницы
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1}/{total_pages}",
            callback_data="task_cmd_page_info"
        ))
        
        # Кнопка "Вперёд"
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text="▶️",
                callback_data=f"task_cmd_{device_id}_{build_id}_p{page + 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"task_cmd_{device_id}_{build_id}_p{page}"
            ))
        
        keyboard.append(nav_row)
    
    # Кнопка "Назад к устройствам"
    keyboard.append([InlineKeyboardButton(
        text="🔙 Назад к устройствам",
        callback_data="task_list_p1"
    )])
    
    return InlineKeyboardMarkup(keyboard), total_pages


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
        "📝 **Раздел задач**\n\n"
        "Здесь вы можете управлять расписанием полива, настройкой автоматических сценариев "
        "и просматривать журнал выполненных задач.\n\n"
        "Выберите устройство для управления задачами:"
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
        "📝 **Раздел задач**\n\n"
        "Здесь вы можете управлять расписанием полива, настройкой автоматических сценариев "
        "и просматривать журнал выполненных задач.\n\n"
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
    
    Загружает GET-команды из БД и показывает их списком.
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
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="task_list_p1")
            ]])
        )
        return
    
    # Загружаем GET-команды из БД
    commands = get_build_get_fields(db, build_id)
    
    if not commands:
        # FALLBACK: если get_fields пуст/NULL
        logger.warning(f"Для build_id={build_id} нет GET-команд")
        header_text = f"📝 Задачи: {device_human_name}\n\n⚠️ Для этого устройства GET-команды не настроены."
        reply_markup = InlineKeyboardMarkup([[
            InlineKeyboardButton(text="🔙 Назад к устройствам", callback_data="task_list_p1")
        ]])
        await query.edit_message_text(
            text=header_text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        return
    
    # Формируем заголовок и клавиатуру с командами (первая страница)
    header_text = f"📝 Задачи: {device_human_name}\nВыберите команду:"
    reply_markup, _ = build_commands_keyboard(device_id, build_id, commands, page=0)
    
    logger.info(f"Отправка списка команд ({len(commands)} шт.) для устройства {device_human_name}")
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_commands_pagination(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик пагинации списка GET-команд (стрелки < >).
    callback_data: task_cmd_{device_id}_{build_id}_p{page}
    """
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    data = query.data
    
    logger.debug(f"[COMMANDS_PAGINATION] Получен callback: {data} от user_id={user_id}")
    
    # Парсим device_id, build_id и номер страницы
    # Формат: task_cmd_{device_id}_{build_id}_p{page}
    try:
        parts = data.split('_')
        device_id = int(parts[2])
        build_id = int(parts[3])
        page = int(parts[4].replace('p', ''))
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, page={page}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        page = 0
        device_id = 0
        build_id = 0
    
    db: Database = context.bot_data['db']
    
    # Получаем имя устройства
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
    except Exception as e:
        logger.error(f"SQL ошибка при получении имени устройства: {e}")
    
    if not device_human_name:
        await query.edit_message_text(
            text="⚠️ _Ошибка загрузки устройства._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="task_list_p1")
            ]])
        )
        return
    
    # Загружаем команды
    commands = get_build_get_fields(db, build_id)
    
    if not commands:
        header_text = f"📝 Задачи: {device_human_name}\n\n⚠️ Для этого устройства GET-команды не настроены."
        reply_markup = InlineKeyboardMarkup([[
            InlineKeyboardButton(text="🔙 Назад к устройствам", callback_data="task_list_p1")
        ]])
        await query.edit_message_text(
            text=header_text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        return
    
    # Строим клавиатуру для запрошенной страницы
    header_text = f"📝 Задачи: {device_human_name}\nВыберите команду:"
    reply_markup, total_pages = build_commands_keyboard(device_id, build_id, commands, page=page)
    
    logger.debug(f"Пагинация команд: страница {page + 1}/{total_pages}")
    
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_task_command_select(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик выбора конкретной GET-команды.
    callback_data: task_cmd_val_{device_id}_{build_id}_{cmd_machine}
    
    Показывает кнопки параметров команды из bot_parameters.
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_id = query.from_user.id
    
    logger.info(f"[TASK_COMMAND_SELECT] Получен callback: {data} от user_id={user_id}")
    
    # Парсим device_id, build_id и cmd_machine
    # Формат: task_cmd_val_{device_id}_{build_id}_{cmd_machine}
    # parts: ["task", "cmd", "val", "{device_id}", "{build_id}", "{cmd_machine}"]
    try:
        parts = data.split('_')
        if len(parts) < 6:
            raise ValueError("Недостаточно частей в callback_data")
        device_id = int(parts[3])
        build_id = int(parts[4])
        cmd_machine = parts[5]
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, cmd={cmd_machine}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        await query.answer("⚠️ Ошибка: неверный формат команды", show_alert=True)
        return
    
    db: Database = context.bot_data['db']
    
    # Получаем имя устройства и get_fields для загрузки bot_parameters
    device_human_name = None
    command_params = []
    command_human_name = cmd_machine
    
    try:
        with db.engine.connect() as conn:
            # Получаем имя устройства
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
            
            # Получаем get_fields для извлечения bot_parameters
            result = conn.execute(
                text("SELECT get_fields FROM builds WHERE id = :build_id"),
                {"build_id": build_id}
            )
            row = result.fetchone()
            if row and row[0]:
                get_fields_data = row[0]
                if isinstance(get_fields_data, str):
                    data_json = json.loads(get_fields_data)
                else:
                    data_json = get_fields_data
                
                # Ищем нужную команду в списке и извлекаем bot_parameters
                if isinstance(data_json, list):
                    for item in data_json:
                        if isinstance(item, dict):
                            cmd = item.get("cmd") or item.get("machine_name") or item.get("name")
                            if cmd == cmd_machine:
                                command_human_name = item.get("human") or item.get("human_name") or cmd_machine
                                params = item.get("bot_parameters", [])
                                if isinstance(params, list):
                                    for param in params:
                                        if isinstance(param, dict):
                                            param_human = param.get("human_name") or param.get("human") or param.get("name")
                                            param_machine = param.get("machine_name") or param.get("machine") or param.get("value")
                                            if param_human and param_machine:
                                                command_params.append((param_machine, param_human))
                                break
    except Exception as e:
        logger.error(f"SQL ошибка при получении данных команды: {e}", exc_info=True)
    
    if not device_human_name:
        await query.edit_message_text(
            text="⚠️ _Ошибка загрузки устройства._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 К списку устройств", callback_data="task_list_p1")
            ]])
        )
        return
    
    # Формируем заголовок
    header_text = f"📝 Команда: {command_human_name}\nУстройство: {device_human_name}\n\nВыберите действие:"
    
    # Строим клавиатуру с параметрами команды
    keyboard: list[list[InlineKeyboardButton]] = []
    
    if command_params:
        for param_machine, param_human in command_params:
            callback_data = f"task_cmd_exec_{device_id}_{build_id}_{cmd_machine}_{param_machine}"
            keyboard.append([InlineKeyboardButton(
                text=f"🔹 {param_human}",
                callback_data=callback_data
            )])
    else:
        # Если нет параметров, показываем сообщение
        keyboard.append([InlineKeyboardButton(
            text="⚠️ Нет доступных параметров",
            callback_data="task_cmd_no_params"
        )])
    
    # Кнопки навигации
    keyboard.append([InlineKeyboardButton(
        text="🔙 Назад к командам",
        callback_data=f"task_cmd_{device_id}_{build_id}_p0"
    )])
    keyboard.append([InlineKeyboardButton(
        text="🔙 К списку устройств",
        callback_data="task_list_p1"
    )])
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
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
    
    # Обработчик пагинации GET-команд - callback_data: task_cmd_{device_id}_{build_id}_p{page}
    application.add_handler(
        CallbackQueryHandler(handle_commands_pagination, pattern=r"^task_cmd_\d+_\d+_p\d+$")
    )
    
    # Обработчик выбора GET-команды - callback_data: task_cmd_val_{device_id}_{build_id}_{cmd_machine}
    application.add_handler(
        CallbackQueryHandler(handle_task_command_select, pattern=r"^task_cmd_val_\d+_\d+_.+$")
    )
