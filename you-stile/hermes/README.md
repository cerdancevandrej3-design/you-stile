# Hermes — авто-публикатор канала

Публикует в Telegram и **MAX**.

**План (Москва):**
- **Пн/Вт/Чт/Пт/Вс 10:00 и 18:00** — короткий пост + одно фото
- **Ср и Сб 12:00** — один пост ДО/ПОСЛЕ (makeover)

Makeover: BEFORE — новый человек каждый выпуск (разные лица и сцены, без шаблона «славянка / худи / кухня»). AFTER — тот же человек, что на BEFORE (identity lock по Image 1).

Если текст про маникюр — на фото должны быть ногти, не портрет лица. Имя в шапке = герой статьи.

**Формат:** короткий русский текст. Язык: **только русский**.

## Стек
- Node.js 22 + TypeScript (tsx)
- Polza AI: текст + картинка
- Telegram Bot API
- node-cron (Europe/Moscow)

## Запуск
```bash
cd hermes
npm i
cp .env.example .env   # заполни ключи
DRY_RUN=true npm run test-once -- --audience=women
npm start
```

## Деплой
`hermes/` в `deploy.py` и в `ecosystem.config.cjs` как процесс `hermes`.  
После деплоя: `pm2 restart hermes --update-env`.

## Telegram
- Бот: **Hermes Stilist Bot** — токен в `hermes/.env`
- Канал: `@stilist_ai_ru`
- НЕ путать с `@Alex_tel_12bot`
