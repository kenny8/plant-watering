from telegram import Update, ReplyKeyboardMarkup, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import ContextTypes, MessageHandler, filters, CallbackQueryHandler
import logging

logger = logging.getLogger(__name__)

# Главная клавиатура (только Reply) - новая раскладка
reply_keyboard_main = ReplyKeyboardMarkup(
    [["📊 Данные", "📝 Задачи"],
     ["⚙️ Настройки"]],
    resize_keyboard=True,
    input_field_placeholder="Выберите действие..."
)

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start с клавиатурой"""
    welcome_text = """
🤖 **Добро пожаловать в систему мониторинга растений!**

Я помогу вам:
• 📊 Отслеживать данные с ваших устройств
• 🔔 Получать уведомления о состоянии растений
• ⚙️ Управлять настройками мониторинга

Выберите раздел в меню ниже 👇
    """
    
    await update.message.reply_text(
        welcome_text,
        reply_markup=reply_keyboard_main,
        parse_mode='Markdown'
    )


async def handle_data_section(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик кнопки '📊 Данные'"""
    text = "Раздел данных: здесь будет агрегироваться история показаний датчиков, статусы устройств и аналитика. Функционал в разработке."
    await update.message.reply_text(
        text,
        reply_markup=reply_keyboard_main,
        parse_mode='Markdown'
    )


async def handle_tasks_section(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик кнопки '📝 Задачи'"""
    text = "Раздел задач: здесь появится управление расписанием, автоматические сценарии и журнал действий. Функционал в разработке."
    await update.message.reply_text(
        text,
        reply_markup=reply_keyboard_main,
        parse_mode='Markdown'
    )

async def handle_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик главного меню"""
    text = update.message.text
    
    if text == "⚙️ Настройки":
        # Inline клавиатура для настроек
        keyboard = [
            [InlineKeyboardButton("🔔 Уведомления", callback_data="menu_notifications")],
            [InlineKeyboardButton("📱 Мои устройства", callback_data="menu_devices")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        settings_text = """
⚙️ **Настройки системы**

Здесь вы можете настроить работу системы мониторинга:

• 🔔 **Уведомления** - управление оповещениями о состоянии устройств
• 📱 **Мои устройства** - добавление и настройка ваших устройств

Выберите раздел настроек 👇
        """
        await update.message.reply_text(
            settings_text,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )

async def handle_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик callback'ов меню"""
    query = update.callback_query
    await query.answer()
    
    callback_data = query.data
    chat_id = query.message.chat_id
    
    try:
        # Получаем notification_service из context
        notification_service = context.bot_data.get('notification_service')
        if not notification_service:
            await query.edit_message_text("❌ Сервис уведомлений не доступен")
            return
        
        if callback_data == "menu_notifications":
            # Получаем текущий статус уведомлений из БД
            user_id = chat_id  # Используем chat_id как user_id
            status = await notification_service.get_user_notification_status(user_id, chat_id)
            status_text = "✅ Включены" if status else "❌ Выключены"
            
            # Inline клавиатура для уведомлений
            keyboard = [
                [InlineKeyboardButton("✅ Включить уведомления", callback_data="enable_notifications")],
                [InlineKeyboardButton("❌ Выключить уведомления", callback_data="disable_notifications")],
                [InlineKeyboardButton("🔙 Назад", callback_data="menu_back_settings")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            notifications_text = f"""
🔔 **Настройка уведомлений**

**Текущий статус:** {status_text}

Управляйте получением уведомлений от системы:

• ✅ **Включить уведомления** - получать оповещения о состоянии устройств
• ❌ **Выключить уведомления** - отключить все уведомления

📋 **Что отслеживается:**
  - Статус онлайн/оффлайн устройств
  - Критические показатели датчиков
  - Добавление/удаление устройств

Выберите действие 👇
            """
            await query.edit_message_text(
                notifications_text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        
        elif callback_data == "menu_devices":
            # Inline клавиатура для устройств
            keyboard = [
                [InlineKeyboardButton("📋 Список устройств", callback_data="devices_list")],
                [InlineKeyboardButton("➕ Добавить устройство", callback_data="add_device")],
                [InlineKeyboardButton("🗑️ Удалить устройство", callback_data="remove_device")],
                [InlineKeyboardButton("🔙 Назад", callback_data="menu_back_settings")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            devices_text = """
📱 **Управление устройствами**

Добавляйте и настраивайте ваши устройства для мониторинга:

• 📋 **Список устройств** - просмотр всех ваших устройств
• ➕ **Добавить устройство** - подключить новое устройство
• 🗑️ **Удалить устройство** - убрать устройство из списка

Выберите действие 👇
            """
            await query.edit_message_text(
                devices_text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        
        elif callback_data == "menu_back_settings":
            # Возврат к главному меню настроек
            keyboard = [
                [InlineKeyboardButton("🔔 Уведомления", callback_data="menu_notifications")],
                [InlineKeyboardButton("📱 Мои устройства", callback_data="menu_devices")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            settings_text = """
⚙️ **Настройки системы**

Здесь вы можете настроить работу системы мониторинга:

• 🔔 **Уведомления** - управление оповещениями о состоянии устройств
• 📱 **Мои устройства** - добавление и настройка ваших устройств

Выберите раздел настроек 👇
            """
            await query.edit_message_text(
                settings_text,
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        
        elif callback_data == "enable_notifications":
            # Включение уведомлений
            user_id = chat_id
            success = await notification_service.set_user_notification_status(user_id, chat_id, True)
            
            if success:
                # Обновляем сообщение с новым статусом
                status_text = "✅ Включены"
                keyboard = [
                    [InlineKeyboardButton("✅ Включить уведомления", callback_data="enable_notifications")],
                    [InlineKeyboardButton("❌ Выключить уведомления", callback_data="disable_notifications")],
                    [InlineKeyboardButton("🔙 Назад", callback_data="menu_back_settings")]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                notifications_text = f"""
🔔 **Настройка уведомлений**

**Текущий статус:** {status_text}

✅ **Уведомления успешно включены!**

Теперь вы будете получать:
• Статус онлайн/оффлайн ваших устройств
• Уведомления о критических показателях
• Оповещения о добавлении/удалении устройств

Выберите действие 👇
                """
                await query.edit_message_text(
                    notifications_text,
                    reply_markup=reply_markup,
                    parse_mode='Markdown'
                )
            else:
                await query.edit_message_text("❌ Ошибка при включении уведомлений")
        
        elif callback_data == "disable_notifications":
            # Выключение уведомлений
            user_id = chat_id
            success = await notification_service.set_user_notification_status(user_id, chat_id, False)
            
            if success:
                # Обновляем сообщение с новым статусом
                status_text = "❌ Выключены"
                keyboard = [
                    [InlineKeyboardButton("✅ Включить уведомления", callback_data="enable_notifications")],
                    [InlineKeyboardButton("❌ Выключить уведомления", callback_data="disable_notifications")],
                    [InlineKeyboardButton("🔙 Назад", callback_data="menu_back_settings")]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                
                notifications_text = f"""
🔔 **Настройка уведомлений**

**Текущий статус:** {status_text}

🔕 **Уведомления выключены**

Вы больше не будете получать уведомления от системы мониторинга.

Выберите действие 👇
                """
                await query.edit_message_text(
                    notifications_text,
                    reply_markup=reply_markup,
                    parse_mode='Markdown'
                )
            else:
                await query.edit_message_text("❌ Ошибка при выключении уведомлений")
        
        elif callback_data in ["devices_list", "add_device", "remove_device"]:
            # Обработка device команд через специальный обработчик
            try:
                from handlers.device_handlers import handle_device_menu_callback
                await handle_device_menu_callback(update, context)
            except Exception as e:
                logger.error(f"Error in device menu callback: {e}")
                await query.edit_message_text("❌ Ошибка при обработке запроса")
        
        elif callback_data == "data_back_menu":
            # Возврат в главное меню из раздела данных
            await query.edit_message_text(
                text="🏠 **Главное меню**\n\nВыберите раздел:",
                reply_markup=InlineKeyboardMarkup([[
                    InlineKeyboardButton(text="📊 Данные", callback_data="dummy_data"),
                    InlineKeyboardButton(text="📝 Задачи", callback_data="dummy_tasks")
                ], [
                    InlineKeyboardButton(text="⚙️ Настройки", callback_data="menu_back_settings")
                ]]),
                parse_mode='Markdown'
            )
            
    except Exception as e:
        logger.error(f"Error in handle_menu_callback: {e}")
        await query.edit_message_text("❌ Произошла ошибка при обработке запроса")


async def show_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, from_callback: bool = False) -> None:
    """
    Возврат в главное меню с Reply-клавиатурой.
    
    Args:
        update: Объект обновления
        context: Контекст бота
        from_callback: Если True, это вызов из callback (редактируем сообщение), 
                       иначе это обычное сообщение
    """
    if from_callback:
        query = update.callback_query
        # Отправляем новое сообщение с Reply-клавиатурой и удаляем inline-сообщение
        await query.edit_message_text(
            text="🏠 **Главное меню**\n\nВыберите раздел:",
            reply_markup=reply_keyboard_main,
            parse_mode='Markdown'
        )
    else:
        await update.message.reply_text(
            text="🏠 **Главное меню**\n\nВыберите раздел:",
            reply_markup=reply_keyboard_main,
            parse_mode='Markdown'
        )