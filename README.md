# Твой личный стилист — you-stile

AI-стилист, который подбирает образы по фото: учитывает фигуру, повод (свадьба, офис, отпуск, вечеринка), цветотип и сезон. Плюс — **причёски и уход** и **база маникюра** с квизом.

🌐 Прод: https://stilist-ai.ru  
📦 VPS: 186.246.31.126 · `/var/www/you-stile/you-stile/`

---

## 🔐 Безопасность и секреты

**Важно.** В коде проекта **никогда не должно быть паролей и токенов в открытом виде**. Все реквизиты — только в `.env` (который в `.gitignore`).

Что и где:

| Что | Где живёт | Где используется |
|---|---|---|
| `POLZA_API_KEY` | `.env` | server.ts |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | `.env` | server.ts |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | `.env` | server.ts |
| SSH-ключ и данные сервера | `.env` | deploy.py (локально) |
| Пароль админки (pin) | `data/admin-pin` или хардкод в server.ts | server.ts |

### Что делать при утечке
1. **Немедленно отзывай** ключ / токен (YooKassa, Polza, Telegram).
2. Перегенерируй SSH-ключ: `ssh-keygen -t ed25519 -f ~/.ssh/id_rsa_deploy`.
3. Обнови `.env` на сервере: `ssh root@186.246.31.126 "nano /var/www/you-stile/you-stile/.env"`.
4. `pm2 restart stilist --update-env`.
5. Если менялся SSH-ключ — обнови на сервере: `~/.ssh/authorized_keys`.
6. Закоммить `.env.example` без реальных значений.

---

## 🚀 Деплой

```bash
# 1. Установить ключи в .env (см. .env.example)
# 2. Убедиться, что работает npm install + lint + build
npm install
npm run lint
npm run build

# 3. Деплой (только свои исходники; не картинки — они на VPS)
python deploy.py
```

После деплоя всё на сервере:
- `pm2 restart stilist --update-env` уже делает `deploy.py`.
- Логи: `pm2 logs stilist`.

---

## 🧩 Структура проекта

```
server.ts         # Express-бэкенд + все API + AI
src/
  App.tsx         # Главный компонент (модалки, лендинг)
  GroomingModal.tsx
  system-prompt.txt          # Промпт ИИ-стилиста
  fashion-knowledge-base.txt # База трендов 2026
  grooming/                  # KB по причёскам/уходу
nails-subscription.ts        # Логика подписки на ногти
public/
  nails/         # Каталог дизайнов ногтей (84 шт.)
  gallery/       # Превью образов
  og-image.jpg   # Open Graph 1200×630
scripts/         # Утилиты аудита/регенерации ногтей
data/            # Локальная JSON-«БД» (orders, users, stats, pageviews)
```

---

## 📊 Мониторинг

- **Админ-панель:** https://stilist-ai.ru/admin?pin=913260 — статистика, промокоды, заказы.
- **Логи:** `pm2 logs stilist`.
- **Бэкап `data/`** — обязательно настрой `cron` + `rclone` (см. todo в чеклисте).

---

## 🛠 Команды

```bash
npm run dev      # Разработка → http://localhost:3001
npm run build    # Сборка → dist/
npm run lint     # tsc --noEmit
python deploy.py # Деплой на stilist-ai.ru
```

---

## 📈 Маркетинг и SEO

Полный план — [`MARKETING.md`](MARKETING.md). Там же — UTM-разметка, реферальная программа, идеи платных каналов.

---

## ⚠️ TODO (что стоит доделать в первую очередь)

1. **Welcome-экран: добавить «Пропустить»** — сейчас блокирует вход.
2. **Бэкап `data/`** — `cron` + `rclone` на S3.
3. **PWA / manifest.json** — мобильный трафик растёт.
4. **SEO-страницы для ногтей** — `/nails/stil-26-001` (длинный хвост из 84 ключей).
5. **Реальные ссылки на товары** в образы (парсер WB/Ozon/Яндекс) — главная монетизация.
6. **Рефакторинг server.ts / App.tsx** — монолиты по 4k строк.
7. **Реальные тесты** — пока 0, страшно править.
8. **Telegram Mini App** для выдачи результатов.
