from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, CallbackQueryHandler, MessageHandler, filters
import logging
import asyncio
from services.device_service import DeviceService

logger = logging.getLogger(__name__)

# Временное хранилище для состояний
user_states = {}

async def devices_list_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Показывает список устройств пользователя с кнопками"""
    try:
        user_id = update.effective_chat.id
        
        database = context.bot_data.get('database')
        if not database:
            if hasattr(update, 'callback_query') and update.callback_query:
                await update.callback_query.edit_message_text("❌ Ошибка: база данных не доступна")
            else:
                await update.message.reply_text("❌ Ошибка: база данных не доступна")
            return
            
        device_service = DeviceService(database)
        user_devices = await device_service.get_user_devices(user_id)
        
        if not user_devices:
            keyboard = [
                [InlineKeyboardButton("➕ Добавить устройство", callback_data="add_device")],
                [InlineKeyboardButton("🔙 Назад", callback_data="back_to_devices_menu")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            message_text = "📱 **Ваши устройства**\n\nУ вас пока нет добавленных устройств.\n\nНажмите «➕ Добавить устройство» чтобы подключить первое устройство."
            
            if hasattr(update, 'callback_query') and update.callback_query:
                await update.callback_query.edit_message_text(message_text, reply_markup=reply_markup, parse_mode='Markdown')
            else:
                await update.message.reply_text(message_text, reply_markup=reply_markup, parse_mode='Markdown')
            return
        
        # Создаем кнопки для каждого устройства
        keyboard = []
        for device in user_devices:
            device_name = device['device_human_name'] or f"Устройство {device['device_id']}"
            keyboard.append([
                InlineKeyboardButton(
                    f"📱 {device_name}",
                    callback_data=f"device_info_{device['device_id']}"
                )
            ])
        
        # Добавляем дополнительные кнопки
        keyboard.append([InlineKeyboardButton("➕ Добавить устройство", callback_data="add_device")])
        keyboard.append([InlineKeyboardButton("🗑️ Удалить устройство", callback_data="remove_device")])
        keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="menu_devices")])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        message = "📱 **Ваши устройства**\n\n"
        message += "Выберите устройство для просмотра информации:\n\n"
        
        for i, device in enumerate(user_devices, 1):
            device_name = device['device_human_name'] or f"Устройство {device['device_id']}"
            message += f"{i}. **{device_name}**\n"
            message += f"   ID: {device['device_id']}\n"
            message += f"   Сборка: {device['build_name']}\n\n"
        
        if hasattr(update, 'callback_query') and update.callback_query:
            await update.callback_query.edit_message_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        else:
            await update.message.reply_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in devices_list_command: {e}")
        if hasattr(update, 'callback_query') and update.callback_query:
            await update.callback_query.edit_message_text("❌ Ошибка при получении списка устройств")
        else:
            await update.message.reply_text("❌ Ошибка при получении списка устройств")

async def add_device_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Начинает процесс добавления устройства"""
    try:
        user_id = update.effective_chat.id
        
        # Сохраняем состояние пользователя
        user_states[user_id] = {'state': 'waiting_for_device_id'}
        
        keyboard = [
            [InlineKeyboardButton("❌ Отмена", callback_data="cancel_add_device")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        # ЕСЛИ это callback (из меню), редактируем сообщение
        if hasattr(update, 'callback_query') and update.callback_query:
            await update.callback_query.edit_message_text(
                "➕ **Добавление устройства**\n\n"
                "Пожалуйста, введите ID устройства, которое хотите добавить:\n\n"
                "💡 **ID устройства** - это числовой идентификатор, который вы получаете при регистрации устройства в системе.",
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        else:
            # ЕСЛИ это команда (/add_device), отправляем новое сообщение
            await update.message.reply_text(
                "➕ **Добавление устройства**\n\n"
                "Пожалуйста, введите ID устройства, которое хотите добавить:\n\n"
                "💡 **ID устройства** - это числовой идентификатор, который вы получаете при регистрации устройства в системе.",
                reply_markup=reply_markup,
                parse_mode='Markdown'
            )
        
    except Exception as e:
        logger.error(f"Error in add_device_command: {e}")
        if hasattr(update, 'callback_query') and update.callback_query:
            await update.callback_query.edit_message_text("❌ Ошибка при начале добавления устройства")
        else:
            await update.message.reply_text("❌ Ошибка при начале добавления устройства")

async def handle_device_id_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обрабатывает ввод ID устройства"""
    try:
        user_id = update.effective_chat.id
        
        # 🔴 ПРОСТО ИГНОРИРУЕМ сообщение если пользователь не в состоянии ожидания ID
        if user_id not in user_states or user_states[user_id].get('state') != 'waiting_for_device_id':
            return  # Просто выходим, не делаем ничего
        
        # Если добрались сюда - значит пользователь действительно ожидает ID
        device_id_text = update.message.text.strip()
        
        # Проверяем, что введено число
        if not device_id_text.isdigit():
            await update.message.reply_text("❌ Пожалуйста, введите корректный числовой ID устройства.")
            return
        
        device_id = int(device_id_text)
        
        database = context.bot_data.get('database')
        if not database:
            await update.message.reply_text("❌ Ошибка: база данных не доступна")
            return
        
        device_service = DeviceService(database)
        
        # Проверяем существует ли устройство
        device_exists = await device_service.check_device_exists(device_id)
        
        if not device_exists:
            await update.message.reply_text(
                f"❌ Устройство с ID {device_id} не найдено в системе.\n\n"
                "Проверьте правильность ID и повторите попытку."
            )
            # Очищаем состояние
            if user_id in user_states:
                del user_states[user_id]
            return
        
        # Проверяем, не добавлено ли уже устройство
        user_devices = await device_service.get_user_devices(user_id)
        if any(device['device_id'] == device_id for device in user_devices):
            await update.message.reply_text(
                f"❌ Устройство с ID {device_id} уже добавлено в ваш список."
            )
            # Очищаем состояние
            if user_id in user_states:
                del user_states[user_id]
            return
        
        # Добавляем устройство
        success = await device_service.add_user_device_by_id(user_id, device_id)
        
        if success:
            await update.message.reply_text(
                f"✅ Устройство с ID {device_id} успешно добавлено!\n\n"
                "Теперь вы можете просматривать его данные в списке ваших устройств."
            )
        else:
            await update.message.reply_text(
                f"❌ Ошибка при добавлении устройства с ID {device_id}.\n"
                "Попробуйте позже или обратитесь в поддержку."
            )
        
        # Очищаем состояние
        if user_id in user_states:
            del user_states[user_id]
            
    except Exception as e:
        logger.error(f"Error in handle_device_id_input: {e}")
        await update.message.reply_text("❌ Ошибка при обработке ID устройства")
        # Очищаем состояние при ошибке
        if user_id in user_states:
            del user_states[user_id]
            
async def remove_device_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Показывает список устройств для удаления"""
    try:
        user_id = update.effective_chat.id
        
        database = context.bot_data.get('database')
        if not database:
            if hasattr(update, 'callback_query') and update.callback_query:
                await update.callback_query.edit_message_text("❌ Ошибка: база данных не доступна")
            else:
                await update.message.reply_text("❌ Ошибка: база данных не доступна")
            return
            
        device_service = DeviceService(database)
        user_devices = await device_service.get_user_devices(user_id)
        
        if not user_devices:
            keyboard = [
                [InlineKeyboardButton("➕ Добавить устройство", callback_data="add_device")],
                [InlineKeyboardButton("🔙 Назад", callback_data="back_to_devices_menu")]  # Возврат в меню
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            message_text = "🗑️ **Удаление устройств**\n\nУ вас нет устройств для удаления."
            
            if hasattr(update, 'callback_query') and update.callback_query:
                await update.callback_query.edit_message_text(message_text, reply_markup=reply_markup, parse_mode='Markdown')
            else:
                await update.message.reply_text(message_text, reply_markup=reply_markup, parse_mode='Markdown')
            return
        
        # Создаем кнопки для каждого устройства
        keyboard = []
        for device in user_devices:
            device_name = device['device_human_name'] or f"Устройство {device['device_id']}"
            keyboard.append([
                InlineKeyboardButton(
                    f"🗑️ {device_name}",
                    callback_data=f"device_confirm_remove_{device['device_id']}"
                )
            ])
        
        keyboard.append([InlineKeyboardButton("❌ Отмена", callback_data="cancel_remove")])
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        message = "🗑️ **Удаление устройств**\n\n"
        message += "Выберите устройство, которое хотите удалить:\n\n"
        
        for i, device in enumerate(user_devices, 1):
            device_name = device['device_human_name'] or f"Устройство {device['device_id']}"
            message += f"{i}. **{device_name}** (ID: {device['device_id']})\n"
        
        if hasattr(update, 'callback_query') and update.callback_query:
            await update.callback_query.edit_message_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        else:
            await update.message.reply_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in remove_device_command: {e}")
        if hasattr(update, 'callback_query') and update.callback_query:
            await update.callback_query.edit_message_text("❌ Ошибка при получении списка устройств для удаления")
        else:
            await update.message.reply_text("❌ Ошибка при получении списка устройств для удаления")

async def handle_device_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик callback'ов от кнопок устройств"""
    query = update.callback_query
    await query.answer()
    
    user_id = query.message.chat_id
    callback_data = query.data
    
    logger.info(f"🔔 DEVICE CALLBACK RECEIVED: {callback_data} from user {user_id}")
    
    try:
        database = context.bot_data.get('database')
        if not database:
            await query.edit_message_text("❌ Ошибка: база данных не доступна")
            return
            
        device_service = DeviceService(database)
        
        if callback_data == "add_device":
            logger.info("🔄 Processing add_device callback")
            await add_device_command(update, context)
        
        elif callback_data == "remove_device":
            logger.info("🔄 Processing remove_device callback")
            await remove_device_command(update, context)
        
        elif callback_data == "menu_devices":
            logger.info("🔄 Processing menu_devices callback")
            from handlers.menu_handlers import handle_menu_callback
            await handle_menu_callback(update, context)
        
        elif callback_data.startswith('device_info_'):
            device_id = int(callback_data.split('_')[2])
            logger.info(f"🔄 Processing device_info callback for device {device_id}")
            await show_device_info(query, device_service, device_id, user_id)
        
        elif callback_data.startswith('device_confirm_remove_'):
            device_id = int(callback_data.split('_')[3])
            logger.info(f"🔄 Processing confirm_remove callback for device {device_id}")
            await confirm_device_removal(query, device_service, device_id, user_id)
        
        # Обработчики для кнопок подтверждения удаления
        elif callback_data.startswith('device_remove_confirm_'):
            device_id = int(callback_data.split('_')[3])
            logger.info(f"🔄 Processing remove_confirm callback for device {device_id}")
            await perform_device_removal(query, device_service, device_id, user_id)
        
        elif callback_data.startswith('device_remove_cancel_'):
            logger.info("🔄 Processing remove_cancel callback - returning to remove list")
            # Просто возвращаемся к списку устройств для удаления
            await remove_device_command(update, context)
        
        elif callback_data == "cancel_add_device":
            logger.info("🔄 Processing cancel_add_device callback - showing devices menu")
            
            # 🔴 ОЧИСТКА СОСТОЯНИЯ пользователя
            if user_id in user_states:
                logger.info(f"✅ Clearing waiting state for user {user_id}")
                del user_states[user_id]
            
            # Показываем меню устройств напрямую
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
        
        elif callback_data == "cancel_remove":
            logger.info("🔄 Processing cancel_remove callback - showing devices menu")
            
            # 🔴 ОЧИСТКА СОСТОЯНИЯ пользователя
            if user_id in user_states:
                logger.info(f"✅ Clearing waiting state for user {user_id}")
                del user_states[user_id]
            
            # Показываем меню устройств напрямую
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
        
        elif callback_data == "devices_list":
            logger.info("🔄 Processing devices_list callback")
            await devices_list_command(update, context)
            
        else:
            logger.warning(f"⚠️ Unknown callback_data: {callback_data}")
            await query.edit_message_text("❌ Неизвестная команда")
            
    except Exception as e:
        logger.error(f"❌ Error in handle_device_callback: {e}")
        await query.edit_message_text("❌ Произошла ошибка при обработке запроса")

async def show_device_info(query, device_service, device_id, user_id):
    """Показывает информацию об устройстве"""
    try:
        user_devices = await device_service.get_user_devices(user_id)
        device = next((d for d in user_devices if d['device_id'] == device_id), None)
        
        if not device:
            await query.edit_message_text("❌ Устройство не найдено")
            return
        
        device_name = device['device_human_name'] or f"Устройство {device_id}"
        
        keyboard = [
            [InlineKeyboardButton("🗑️ Удалить устройство", callback_data=f"device_confirm_remove_{device_id}")],
            [InlineKeyboardButton("🔙 Назад к списку", callback_data="back_to_devices_menu")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        message = f"📱 **Информация об устройстве**\n\n"
        message += f"**Название:** {device_name}\n"
        message += f"**ID устройства:** {device_id}\n"
        message += f"**Сборка:** {device['build_name']}\n"
        message += f"**Последний раз онлайн:** {device['last_seen'] or 'Неизвестно'}\n\n"
        message += "Для просмотра данных устройства используйте веб-интерфейс."
        
        await query.edit_message_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in show_device_info: {e}")
        await query.edit_message_text("❌ Ошибка при получении информации об устройстве")

async def confirm_device_removal(query, device_service, device_id, user_id):
    """Подтверждение удаления устройства"""
    try:
        user_devices = await device_service.get_user_devices(user_id)
        device = next((d for d in user_devices if d['device_id'] == device_id), None)
        
        if not device:
            await query.edit_message_text("❌ Устройство не найдено")
            return
        
        device_name = device['device_human_name'] or f"Устройство {device_id}"
        
        keyboard = [
            [InlineKeyboardButton("✅ Да, удалить", callback_data=f"device_remove_confirm_{device_id}")],
            [InlineKeyboardButton("❌ Нет, отменить", callback_data=f"device_remove_cancel_{device_id}")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        message = f"🗑️ **Подтверждение удаления**\n\n"
        message += f"Вы уверены, что хотите удалить устройство?\n\n"
        message += f"**Устройство:** {device_name}\n"
        message += f"**ID:** {device_id}\n\n"
        message += "⚠️ **Внимание:** Это действие нельзя отменить!"
        
        await query.edit_message_text(message, reply_markup=reply_markup, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in confirm_device_removal: {e}")
        await query.edit_message_text("❌ Ошибка при подтверждении удаления")

async def perform_device_removal(query, device_service, device_id, user_id):
    """Выполняет удаление устройства"""
    try:
        logger.info(f"🔄 Attempting to remove device {device_id} for user {user_id}")
        success = await device_service.remove_user_device_by_id(user_id, device_id)
        
        if success:
            logger.info(f"✅ Successfully removed device {device_id} for user {user_id}")
            keyboard = [
                [InlineKeyboardButton("📋 Список устройств", callback_data="devices_list")],
                [InlineKeyboardButton("🔙 В меню", callback_data="menu_devices")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await query.edit_message_text(
                f"✅ Устройство {device_id} успешно удалено!",
                reply_markup=reply_markup
            )
        else:
            logger.error(f"❌ Failed to remove device {device_id} for user {user_id}")
            await query.edit_message_text("❌ Ошибка при удалении устройства")
            
    except Exception as e:
        logger.error(f"❌ Error in perform_device_removal: {e}")
        await query.edit_message_text("❌ Ошибка при удалении устройства")

async def cancel_device_removal(query, device_service, user_id):
    """Отмена удаления устройства"""
    try:
        logger.info(f"🔄 Cancelling device removal for user {user_id}")
        
        # Просто показываем сообщение об отмене
        await query.edit_message_text("❌ Удаление отменено")
        
        # Ждем немного и возвращаем к списку устройств
        await asyncio.sleep(1)
        
        # Создаем fake update для вызова remove_device_command
        from telegram import Message
        fake_message = Message(
            message_id=query.message.message_id,
            date=query.message.date,
            chat=query.message.chat,
            text="/remove_device"
        )
        fake_update = Update(update_id=query.message.message_id, message=fake_message)
        
        await remove_device_command(fake_update, query._context)
        
    except Exception as e:
        logger.error(f"❌ Error in cancel_device_removal: {e}")
        await query.edit_message_text("❌ Ошибка при отмене удаления")

# Регистрируем обработчик текстовых сообщений для ввода ID устройства
def register_handlers(application):
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_device_id_input))

async def handle_device_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик для device команд из menu"""
    query = update.callback_query
    await query.answer()
    
    user_id = query.message.chat_id
    callback_data = query.data
    
    # 🔴 ОЧИСТКА СОСТОЯНИЯ при отмене
    if callback_data in ["cancel_add_device", "cancel_remove"]:
        if user_id in user_states:
            logger.info(f"✅ Clearing waiting state for user {user_id} in menu callback")
            del user_states[user_id]
    
    if callback_data == "devices_list":
        await devices_list_command(update, context)
    elif callback_data == "add_device":
        await add_device_command(update, context)
    elif callback_data == "remove_device":
        await remove_device_command(update, context)
    elif callback_data in ["cancel_add_device", "cancel_remove"]:
        # Показываем меню устройств напрямую при отмене
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