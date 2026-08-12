# ASCN Broadcast CRM

Простой Next.js-проект для Telegram- и WhatsApp-рассылок.

## Запуск

```bash
npm install
npm run build
npm start
```

Локальная разработка:

```bash
npm run dev
```

Требуется Node.js 20.9 или новее. Для текущего интерфейсного MVP переменные окружения не нужны.

## Подключение реальных каналов

На следующем этапе потребуются:

```text
DATABASE_URL
TELEGRAM_BOT_TOKEN
WHATSAPP_ACCESS_TOKEN
APP_URL
```

Серверная часть использует единый адаптер каналов. Входящие события принимаются через `/api/webhooks/[channel]`, а исходящие сообщения — через защищённый `/api/messages/send`. Секреты перечислены в `.env.example`; без них интерфейс продолжает запускаться как демо.
