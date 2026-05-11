# 🤖 Обновления Telegram-бота (changelog)

## Текущая версия (feat/telegram-bot-integration)

### ✨ Раздел "Задачи" - выбор типа работы

После выбора устройства в разделе "📝 Задачи" появляется меню выбора типа работы:

```
📝 Устройство: [название]

Выберите тип работы:
  🔄 Сценарии
  👆 Ручное управление
  🔙 Назад к устройствам
```

### 🔄 Сценарии - управление автоматикой

**Функционал**:
- Показ всех активных сценариев сборки (фильтр `is_active = TRUE`)
- Пагинация: 5 сценариев на страницу
- Кнопки с состояниями:
  - `✅ {human_name}` - сценарий включен (зеленый)
  - `❌ {human_name}` - сценарий выключен (красный)
- Переключение состояния по клику:
  - Проверяет запись в `device_scenario_settings`
  - Если нет - создает с `is_enabled = FALSE`
  - Если есть - переключает `is_enabled = NOT is_enabled`
- Автоматическое обновление списка после переключения

**SQL запрос**:
```sql
SELECT s.id, s.human_name, s.machine_name, COALESCE(dss.is_enabled, FALSE)
FROM scenarios s
LEFT JOIN device_scenario_settings dss ON s.id = dss.scenario_id AND dss.device_id = ?
WHERE s.build_id = ? AND s.is_active = TRUE
ORDER BY s.human_name
```

### 👆 Ручное управление - команды вручную

**Изменения**:
- Теперь при выполнении commands записывается `result` из `bot_parameters` вместо `machine_name`
- Формат записи в БД как в backend при работе со сценариями

### 🔔 Уведомления из БД

**Новый функционал**:
- Периодическая проверка таблицы `notifications` каждые 60 секунд
- Фильтры:
  - `status = 'pending'`
  - Устройство принадлежит пользователю (JOIN с `user_devices`)
  - У пользователя включены уведомления
- После отправки:
  - Обновляет `status = 'sent'`
  - Заполняет `sent_at`

**SQL запрос**:
```sql
SELECT n.id, n.text, n.device_id, n.created_at
FROM notifications n
INNER JOIN user_devices ud ON n.device_id = ud.device_id AND n.build_id = ud.build_id
WHERE n.status = 'pending' AND ud.user_id = ? AND ud.chat_id = ?
ORDER BY n.created_at ASC
```

### 📊 Данные - человеческие имена датчиков

**Исправление**:
- Теперь в разделе "Данные" при выборе устройства показываются `human_name` датчиков из `post_fields`
- Раньше показывались `machine_name`

**Изменения в коде** (`data_handlers.py`):
```python
# Было:
field_val = item.get('name') or item.get('key') or item.get('field_name')

# Стало:
field_human = item.get('human_name') or item.get('human') or item.get('name') or item.get('key') or item.get('field_name')
```

---

## Callback patterns

### Сценарии
- `task_scenarios_{device_id}_{build_id}[_p{page}]` - список сценариев
- `task_scenario_toggle_{device_id}_{build_id}_{scenario_id}` - переключение состояния

### Ручное управление  
- `task_manual_{device_id}_{build_id}` - показать команды
- [существующие patterns для команд]

### Уведомления
- Периодический job: каждые 60 секунд
- Проверяет всех подписанных пользователей

---

## Файлы

- `bot/handlers/task_handlers.py` - сценарии, ручное управление
- `bot/services/notification_service.py` - проверка уведомлений из БД
- `bot/handlers/data_handlers.py` - human_name датчиков
