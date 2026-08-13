# ASCN Broadcast CRM

Пустая рабочая основа сервиса для Telegram- и WhatsApp-рассылок. В репозитории нет демонстрационных лидов, переписок, подключённых каналов или выдуманной статистики.

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

Требуется Node.js 20.9 или новее. Без переменных окружения сервис запускается пустым и показывает инструкции по подключению каналов.

## Запуск на VPS

```bash
cp .env.example .env
docker compose up -d --build
```

Откройте `http://IP_СЕРВЕРА:3000`. Docker volume `ascn_data` сохраняет лидов и сообщения между перезапусками и обновлениями контейнера.

## Подключение реальных каналов

Для реальных каналов заполните в `.env`:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
APP_URL
```

Серверная часть использует единый адаптер каналов. Входящие события принимаются через `/api/webhooks/[channel]`, сохраняются в `DATA_DIR` и появляются в воронке и диалогах. Исходящие сообщения доступны через защищённый `/api/messages/send`.

После запуска укажите webhook:

- Telegram: `https://ваш-домен/api/webhooks/telegram`
- WhatsApp: `https://ваш-домен/api/webhooks/whatsapp`

Секреты никогда не добавляйте в GitHub — только в `.env` на сервере.
