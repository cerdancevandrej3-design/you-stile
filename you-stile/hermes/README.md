# Hermes — авто-публикатор канала

Три раза в день публикует в Telegram короткие посты:
**Уход → Гардероб → Психология** + яркая AI-обложка.

**План дня (Москва):**
- **10:00** — женщины
- **14:00** — женщины
- **19:00** — мужчины

**Формат каждого поста:** крючок-заголовок + 3 коротких раздела + CTA.  
Язык: **только русский** (без украинских/смешанных форм).

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
