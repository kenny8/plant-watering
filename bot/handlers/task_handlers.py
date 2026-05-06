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
SCENARIOS_PER_PAGE = 5


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


def get_build_scenarios(database: Database, device_id: int, build_id: int) -> Optional[list[tuple[int, str, str, bool]]]:
    """
    Получает сценарии для сборки с состоянием привязки к устройству.

    Args:
        database: Экземпляр Database
        device_id: ID устройства
        build_id: ID сборки

    Returns:
        Список кортежей: [(scenario_id, human_name, machine_name, is_enabled), ...]
        или None если сценариев нет
    """
    try:
        with database.engine.connect() as conn:
            result = conn.execute(
                text("""
                SELECT
                    s.id,
                    s.human_name,
                    s.machine_name,
                    COALESCE(dss.is_enabled, FALSE) as is_enabled
                FROM scenarios s
                LEFT JOIN device_scenario_settings dss
                    ON s.id = dss.scenario_id AND dss.device_id = :device_id
                WHERE s.build_id = :build_id
                ORDER BY s.human_name
                """),
                {"device_id": device_id, "build_id": build_id}
            )
            rows = result.fetchall()
            if not rows:
                logger.debug(f"Сценариев для build_id={build_id} нет")
                return None

            scenarios = [(row[0], row[1], row[2], bool(row[3])) for row in rows]
            logger.info(f"Получено {len(scenarios)} сценариев для build_id={build_id}")
            return scenarios
    except Exception as e:
        logger.error(f"Ошибка получения сценариев для build_id={build_id}: {e}", exc_info=True)
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


def build_scenarios_keyboard(
    device_id: int,
    build_id: int,
    scenarios: list[tuple[int, str, str, bool]],
    page: int = 0
) -> tuple[InlineKeyboardMarkup, int]:
    """
    Строит inline-клавиатуру с сценариями для указанной страницы.

    Args:
        device_id: ID устройства
        build_id: ID сборки
        scenarios: Список кортежей (scenario_id, human_name, machine_name, is_enabled)
        page: Номер текущей страницы (0-indexed)

    Returns:
        Кортеж (клавиатура, общее_количество_страниц)
    """
    total_scenarios = len(scenarios)
    total_pages = max(1, (total_scenarios + SCENARIOS_PER_PAGE - 1) // SCENARIOS_PER_PAGE)

    # Нормализуем номер страницы
    page = max(0, min(page, total_pages - 1))

    start_idx = page * SCENARIOS_PER_PAGE
    end_idx = min(start_idx + SCENARIOS_PER_PAGE, total_scenarios)
    page_scenarios = scenarios[start_idx:end_idx]

    keyboard: list[list[InlineKeyboardButton]] = []

    # Кнопки сценариев - зеленый если включен, красный если выключен
    for scenario_id, human_name, machine_name, is_enabled in page_scenarios:
        emoji = "✅" if is_enabled else "❌"
        callback_data = f"task_scenario_toggle_{device_id}_{build_id}_{scenario_id}"
        keyboard.append([InlineKeyboardButton(
            text=f"{emoji} {human_name}",
            callback_data=callback_data
        )])

    # Кнопки навигации (если страниц больше 1)
    if total_pages > 1:
        nav_row: list[InlineKeyboardButton] = []

        # Кнопка "Назад"
        if page > 0:
            nav_row.append(InlineKeyboardButton(
                text="◀️",
                callback_data=f"task_scenarios_{device_id}_{build_id}_p{page - 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"task_scenarios_{device_id}_{build_id}_p0"
            ))

        # Индикатор страницы
        nav_row.append(InlineKeyboardButton(
            text=f"{page + 1}/{total_pages}",
            callback_data="task_scenarios_page_info"
        ))

        # Кнопка "Вперёд"
        if page < total_pages - 1:
            nav_row.append(InlineKeyboardButton(
                text="▶️",
                callback_data=f"task_scenarios_{device_id}_{build_id}_p{page + 1}"
            ))
        else:
            nav_row.append(InlineKeyboardButton(
                text="·",
                callback_data=f"task_scenarios_{device_id}_{build_id}_p{page}"
            ))

        keyboard.append(nav_row)

    # Кнопка "Назад" к выбору типа работы
    keyboard.append([InlineKeyboardButton(
        text="🔙 Назад",
        callback_data=f"task_dev_{device_id}_{build_id}"
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

    Показывает выбор типа работы: сценарии, ручное управление, назад.
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

    # Сохраняем device_id и build_id в контекст для последующего использования
    context.user_data.setdefault('task_device', {})
    context.user_data['task_device'][str(user_id)] = {'device_id': device_id, 'build_id': build_id}

    # Формируем заголовок и клавиатуру с выбором типа работы
    header_text = f"📝 Устройство: {device_human_name}\n\nВыберите тип работы:"
    reply_markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("🔄 Сценарии", callback_data=f"task_scenarios_{device_id}_{build_id}")],
        [InlineKeyboardButton("👆 Ручное управление", callback_data=f"task_manual_{device_id}_{build_id}")],
        [InlineKeyboardButton("🔙 Назад к устройствам", callback_data="task_list_p1")]
    ])

    logger.info(f"Показан выбор типа работы для устройства {device_human_name}")
    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_scenarios_list(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик кнопки 'Сценарии'.
    Показывает список сценариев сборки с пагинацией.
    Кнопки: ✅ (включен) или ❌ (выключен) в зависимости от is_enabled в device_scenario_settings.
    """
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    logger.info(f"[TASK_SCENARIOS_LIST] Получен callback: {data} от user_id={user_id}")

    # Парсим device_id, build_id и опционально страницу
    # Формат: task_scenarios_{device_id}_{build_id} или task_scenarios_{device_id}_{build_id}_p{page}
    try:
        parts = data.split('_')
        device_id = int(parts[2])
        build_id = int(parts[3])

        # Проверяем есть ли страница в callback
        if len(parts) > 4 and parts[4].startswith('p'):
            page = int(parts[4].replace('p', ''))
        else:
            page = 0

        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, page={page}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        await query.answer("⚠️ Ошибка", show_alert=True)
        return

    # Получаем имя устройства
    db: Database = context.bot_data['db']
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
        logger.error(f"SQL ошибка: {e}")

    if not device_human_name:
        device_human_name = "Устройство"

    # Получаем сценарии для сборки
    scenarios = get_build_scenarios(db, device_id, build_id)

    if not scenarios:
        header_text = f"🔄 Сценарии для: {device_human_name}\n\n"
        header_text += "⚠️ _Нет сценариев для этой сборки._\n\n"
        header_text += "Создайте сценарии в веб-интерфейсе чтобы управлять ими здесь."

        reply_markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data=f"task_dev_{device_id}_{build_id}")]
        ])

        await query.edit_message_text(
            text=header_text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        return

    # Строим клавиатуру сценариев
    header_text = f"🔄 Сценарии: {device_human_name}\n\n"
    header_text += f"Нажмите на сценарий чтобы включить/выключить его.\n\n"
    header_text += "✅ = Включено | ❌ = Выключено"

    reply_markup, total_pages = build_scenarios_keyboard(device_id, build_id, scenarios, page=page)

    logger.info(f"Показано {len(scenarios)} сценариев (страница {page + 1}/{total_pages})")

    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_task_manual_select(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик кнопки 'Ручное управление'.
    Загружает GET-команды из БД и показывает их списком (перенесено из handle_task_device_select).
    """
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    logger.info(f"[TASK_MANUAL_SELECT] Получен callback: {data} от user_id={user_id}")

    # Парсим device_id и build_id (формат: task_manual_{device_id}_{build_id})
    try:
        parts = data.split('_')
        device_id = int(parts[2])
        build_id = int(parts[3])
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        await query.answer("⚠️ Ошибка", show_alert=True)
        return

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
        logger.error(f"SQL ошибка: {e}")

    if not device_human_name:
        await query.edit_message_text(
            text="⚠️ _Ошибка загрузки устройства._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 Назад", callback_data=f"task_dev_{device_id}_{build_id}")
            ]])
        )
        return

    # Загружаем GET-команды из БД
    commands = get_build_get_fields(db, build_id)

    if not commands:
        # FALLBACK: если get_fields пуст/NULL
        logger.warning(f"Для build_id={build_id} нет GET-команд")
        header_text = f"👆 Ручное управление: {device_human_name}\n\n⚠️ Для этого устройства GET-команды не настроены."
        reply_markup = InlineKeyboardMarkup([[
            InlineKeyboardButton(text="🔙 Назад", callback_data=f"task_dev_{device_id}_{build_id}")
        ]])
        await query.edit_message_text(
            text=header_text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        return

    # Формируем заголовок и клавиатуру с командами (первая страница)
    header_text = f"👆 Ручное управление: {device_human_name}\nВыберите команду:"
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
        header_text = f"👆 Ручное управление: {device_human_name}\n\n⚠️ Для этого устройства GET-команды не настроены."
        reply_markup = InlineKeyboardMarkup([[
            InlineKeyboardButton(text="🔙 Назад", callback_data=f"task_dev_{device_id}_{build_id}")
        ]])
        await query.edit_message_text(
            text=header_text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        return

    # Строим клавиатуру для запрошенной страницы
    header_text = f"👆 Ручное управление: {device_human_name}\nВыберите команду:"
    reply_markup, total_pages = build_commands_keyboard(device_id, build_id, commands, page=page)

    logger.debug(f"Пагинация команд: страница {page + 1}/{total_pages}")

    await query.edit_message_text(
        text=header_text,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )


async def handle_scenario_toggle(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик переключения состояния сценария.
    callback_data: task_scenario_toggle_{device_id}_{build_id}_{scenario_id}

    Переключает is_enabled в device_scenario_settings и возвращает к списку сценариев.
    """
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    logger.info(f"[TASK_SCENARIO_TOGGLE] Получен callback: {data} от user_id={user_id}")

    # Парсим device_id, build_id, scenario_id
    # Формат: task_scenario_toggle_{device_id}_{build_id}_{scenario_id}
    try:
        parts = data.split('_')
        device_id = int(parts[3])
        build_id = int(parts[4])
        scenario_id = int(parts[5])
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, scenario_id={scenario_id}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        await query.answer("⚠️ Ошибка: неверный формат", show_alert=True)
        return

    db: Database = context.bot_data['db']

    # Получаем имя устройства и название сценария
    device_human_name = None
    scenario_human_name = None
    try:
        with db.engine.connect() as conn:
            # Имя устройства
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

            # Название сценария
            result = conn.execute(
                text("""
                SELECT human_name
                FROM scenarios
                WHERE id = :scenario_id AND build_id = :build_id
                """),
                {"scenario_id": scenario_id, "build_id": build_id}
            )
            row = result.fetchone()
            if row:
                scenario_human_name = row[0]
    except Exception as e:
        logger.error(f"SQL ошибка при получении данных: {e}")
        await query.answer("⚠️ Ошибка базы данных", show_alert=True)
        return

    if not device_human_name:
        device_human_name = "Устройство"
    if not scenario_human_name:
        scenario_human_name = "Сценарий"

    # Переключаем состояние сценария
    try:
        with db.engine.connect() as conn:
            # Проверяем существует ли запись
            result = conn.execute(
                text("""
                SELECT id, is_enabled
                FROM device_scenario_settings
                WHERE device_id = :device_id AND scenario_id = :scenario_id
                """),
                {"device_id": device_id, "scenario_id": scenario_id}
            )
            row = result.fetchone()

            if row:
                # Запись существует - переключаем состояние
                new_state = not row[1]
                conn.execute(
                    text("""
                    UPDATE device_scenario_settings
                    SET is_enabled = :is_enabled
                    WHERE device_id = :device_id AND scenario_id = :scenario_id
                    """),
                    {"is_enabled": new_state, "device_id": device_id, "scenario_id": scenario_id}
                )
                logger.info(f"Сценарий {scenario_id} переключен: {row[1]} -> {new_state}")
            else:
                # Записи нет - создаем с is_enabled = FALSE (выключено)
                conn.execute(
                    text("""
                    INSERT INTO device_scenario_settings (device_id, scenario_id, is_enabled)
                    VALUES (:device_id, :scenario_id, FALSE)
                    """),
                    {"device_id": device_id, "scenario_id": scenario_id}
                )
                new_state = False
                logger.info(f"Создана запись для сценария {scenario_id} с is_enabled=FALSE")

            conn.commit()

            # Формируем сообщение о результате
            if new_state:
                status_text = "✅ включен!"
            else:
                status_text = "❌ выключен!"

            success_text = f"{scenario_human_name}\n\n{status_text}"

            await query.edit_message_text(
                text=success_text,
                parse_mode='Markdown'
            )

            # Сразу обновляем список сценариев
            scenarios = get_build_scenarios(db, device_id, build_id)
            if scenarios:
                reply_markup, _ = build_scenarios_keyboard(device_id, build_id, scenarios, page=0)
                header_text = f"🔄 Сценарии: {device_human_name}\n\n"
                header_text += f"Нажмите на сценарий чтобы включить/выключить его.\n\n"
                header_text += "✅ = Включено | ❌ = Выключено"

                await query.edit_message_text(
                    text=header_text,
                    reply_markup=reply_markup,
                    parse_mode='Markdown'
                )
            else:
                # Если сценариев нет, показываем сообщение
                keyboard = InlineKeyboardMarkup([
                    [InlineKeyboardButton("🔙 Назад к выбору", callback_data=f"task_dev_{device_id}_{build_id}")]
                ])
                await query.edit_message_text(
                    text="⚠️ Нет сценариев для этой сборки",
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )

    except Exception as e:
        logger.error(f"Ошибка при переключении сценария: {e}", exc_info=True)
        await query.answer("⚠️ Ошибка при изменении состояния", show_alert=True)
        await query.edit_message_text(
            text="⚠️ _Произошла ошибка при изменении состояния сценария._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("🔙 Назад", callback_data=f"task_scenarios_{device_id}_{build_id}")
            ]])
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
                                            result = param.get("result")
                                            if param_human and result:
                                                command_params.append((result, param_human))
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


async def handle_task_command_execution(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Обработчик выполнения команды.
    callback_data: task_cmd_exec_{device_id}_{build_id}_{cmd_machine}_{value_machine}

    Записывает команду в таблицу device_commands в БД.
    """
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id

    logger.info(f"[TASK_COMMAND_EXEC] Получен callback: {data} от user_id={user_id}")

    # Парсим device_id, build_id, cmd_machine, value_machine
    # Формат: task_cmd_exec_{device_id}_{build_id}_{cmd_machine}_{value_machine}
    try:
        parts = data.split('_')
        if len(parts) < 7:
            raise ValueError("Недостаточно частей в callback_data")
        device_id = int(parts[3])
        build_id = int(parts[4])
        cmd_machine = parts[5]
        value_machine = parts[6]
        logger.debug(f"Распарсены параметры: device_id={device_id}, build_id={build_id}, cmd={cmd_machine}, value={value_machine}")
    except (ValueError, IndexError) as e:
        logger.error(f"Ошибка парсинга callback_data {data}: {e}")
        await query.answer("⚠️ Ошибка: неверный формат команды", show_alert=True)
        return

    db: Database = context.bot_data['db']

    # Получаем имя устройства для отображения
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

    # Записываем команду в таблицу device_commands
    try:
        with db.engine.connect() as conn:
            # Проверяем существование таблицы device_commands, создаём если нет
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS `device_commands` (
                `id` int(11) NOT NULL AUTO_INCREMENT,
                `device_id` int(11) NOT NULL,
                `command` varchar(255) NOT NULL,
                `value` varchar(255) NOT NULL,
                `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
                `is_executed` tinyint(1) DEFAULT 0,
                PRIMARY KEY (`id`),
                KEY `device_id` (`device_id`),
                CONSTRAINT `device_commands_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            """))
            conn.commit()

            # Вставляем новую команду
            conn.execute(
                text("""
                INSERT INTO device_commands (device_id, command, value, is_executed)
                VALUES (:device_id, :command, :value, 0)
                """),
                {"device_id": device_id, "command": cmd_machine, "value": value_machine}
            )
            conn.commit()

            logger.info(f"Команда записана в БД: device_id={device_id}, command={cmd_machine}, value={value_machine}")

            # Формируем сообщение об успехе
            success_text = f"✅ Команда отправлена!\n\nУстройство: {device_human_name or 'Неизвестно'}\nКоманда: {cmd_machine}\nЗначение: {value_machine}\n\nОжидается выполнение устройством..."

            keyboard: list[list[InlineKeyboardButton]] = []
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
                text=success_text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )

    except Exception as e:
        logger.error(f"Ошибка записи команды в БД: {e}", exc_info=True)
        await query.answer("⚠️ Ошибка при отправке команды", show_alert=True)
        await query.edit_message_text(
            text="⚠️ _Произошла ошибка при отправке команды. Попробуйте позже._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(text="🔙 Назад", callback_data=f"task_cmd_{device_id}_{build_id}_p0")
            ]])
        )


def register_task_handlers(application) -> None:
    """
    Регистрирует все обработчики раздела "📝 Задачи" в приложении.
    """
    # Обработчик пагинации устройств (стрелки)
    # task_list_p{page}, task_prev_p{page}, task_next_p{page}
    application.add_handler(
        CallbackQueryHandler(handle_tasks_pagination, pattern=r"^task_(list|prev|next)_p\d+$")
    )

    # Обработчик выбора устройства - callback_data: task_dev_{device_id}_{build_id}
    application.add_handler(
        CallbackQueryHandler(handle_task_device_select, pattern=r"^task_dev_\d+_\d+$")
    )

    # Обработчик сценариев - callback_data: task_scenarios_{device_id}_{build_id}[_p{page}]
    application.add_handler(
        CallbackQueryHandler(handle_scenarios_list, pattern=r"^task_scenarios_\d+_\d+(_p\d+)?$")
    )

    # Обработчик переключения сценария - callback_data: task_scenario_toggle_{device_id}_{build_id}_{scenario_id}
    application.add_handler(
        CallbackQueryHandler(handle_scenario_toggle, pattern=r"^task_scenario_toggle_\d+_\d+_\d+$")
    )

    # Обработчик ручного управления - callback_data: task_manual_{device_id}_{build_id}
    application.add_handler(
        CallbackQueryHandler(handle_task_manual_select, pattern=r"^task_manual_\d+_\d+$")
    )

    # Обработчик пагинации GET-команд - callback_data: task_cmd_{device_id}_{build_id}_p{page}
    application.add_handler(
        CallbackQueryHandler(handle_commands_pagination, pattern=r"^task_cmd_\d+_\d+_p\d+$")
    )

    # Обработчик выбора GET-команды - callback_data: task_cmd_val_{device_id}_{build_id}_{cmd_machine}
    application.add_handler(
        CallbackQueryHandler(handle_task_command_select, pattern=r"^task_cmd_val_\d+_\d+_.+$")
    )

    # Обработчик выполнения команды - callback_data: task_cmd_exec_{device_id}_{build_id}_{cmd}_{value}
    application.add_handler(
        CallbackQueryHandler(handle_task_command_execution, pattern=r"^task_cmd_exec_\d+_\d+_.+_.+$")
    )

