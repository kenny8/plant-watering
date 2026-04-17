# Настройка прокси для Telegram бота

## Описание

Система теперь поддерживает динамическую настройку Cloudflare Workers прокси для Telegram бота через веб-интерфейс.

## Как это работает

1. **Хранение настроек**: Прокси URL хранится в базе данных в таблице `settings` в колонке `bot_proxy_url`
2. **Приоритет использования**:
   - Если в БД есть запись `bot_proxy_url` - используется она
   - Если записи нет - используется дефолтный прокси: `https://mybot-proxy2026.fedoranisimov.workers.dev/bot`

## Формат прокси URL

Правильный формат URL для Cloudflare Workers:
```
https://имя-вашего-прокси.workers.dev/bot
```

Примеры:
- `https://mybot-proxy2026.fedoranisimov.workers.dev/bot`
- `https://telegram-bot-proxy.myapp.workers.dev/bot`

## Настройка через веб-интерфейс

1. Откройте настройки: `/settings`
2. Введите токен Telegram бота (если еще не введен)
3. В поле **"Proxy URL для бота (Cloudflare Workers)"** введите URL вашего прокси
4. Нажмите **"Сохранить"**

## Миграция базы данных

Для существующих баз данных выполните миграцию:

```bash
mysql -u user -p plant_watering < db_migration.sql
```

Или вручную:

```sql
ALTER TABLE `settings` 
ADD COLUMN `bot_proxy_url` varchar(512) DEFAULT NULL 
AFTER `telegram_bot_token`;
```

## Архитектура

### Backend (FastAPI)
- Модель `Settings` обновлена с полем `bot_proxy_url`
- Endpoint `/api/settings/bot-token` принимает оба параметра:
  - `telegram_bot_token`
  - `bot_proxy_url`

### Bot (python-telegram-bot)
- `BotManager._create_bot_application()` проверяет БД при создании приложения
- При изменении токена (`_on_token_change`) прокси также подтягивается из БД

### Frontend (React)
- Компонент `Settings.jsx` имеет новое поле ввода для прокси
- Сохранение происходит одновременно с токеном бота
- Данные сохраняются в localStorage для удобства

## Мониторинг и логи

Бот логирует использование прокси:
- `🔗 Using proxy from database: {url}` - когда прокси взят из БД
- `🔗 No proxy in DB, trying default: {url}` - когда используется дефолтный
