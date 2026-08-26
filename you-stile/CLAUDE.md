# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `you-stile/`:

```bash
npm run dev      # Start dev server (Express + Vite middleware) on port 3001
npm run build    # Production build (Vite → dist/)
npm run lint     # TypeScript type check (tsc --noEmit)
```

> Port 3000 is occupied on this machine by another process. Server runs on **port 3001**.

## Architecture

This is a single-repo full-stack app — one Express server serves both the API and the React SPA.

### Request flow

1. **Browser** → `localhost:3001`
2. **`server.ts`** (Express) handles `/api/*` routes; all other requests go to Vite middleware (dev) or `dist/` (prod)
3. `/api/stylize` — main endpoint: receives up to 3 photos (multipart), streams NDJSON responses back via SSE-style `res.write()` + heartbeat
4. Server calls **Polza.ai API** (`https://polza.ai/api/v1`) — OpenAI-compatible endpoint — using two models:
   - `ANALYSIS_MODEL` (`google/gemini-3.1-flash-lite-preview`) — analyzes photo, generates JSON look recommendations
   - `IMAGE_MODEL` (`seedream/5-pro-text-to-image`) — generates outfit images with user's face. Called via `POST /media` (не `/chat/completions`). Валидные значения `quality`: `basic`, `medium`, `high` (сейчас используется `medium`). НЕ передавать `output_format` — вызывает `BAD_REQUEST` "Недопустимое значение quality".
5. **`src/App.tsx`** — single React component (~1000 lines), reads the NDJSON stream and renders results progressively

### Key files

| File | Purpose |
|------|---------|
| `server.ts` | Express server, all API logic, Polza.ai calls, image generation |
| `src/App.tsx` | Entire React frontend — upload UI, streaming reader, look cards, canvas image export |
| `src/system-prompt.txt` | AI system prompt template, injected with `{{FASHION_KNOWLEDGE_BASE}}` at startup |
| `src/fashion-knowledge-base.txt` | 2026 fashion trends, loaded into system prompt at server start |
| `.env` | `POLZA_API_KEY` (required), `POLZA_BASE_URL` (optional) |

### Streaming protocol

`/api/stylize` streams NDJSON lines, each a JSON object with `type`:
- `heartbeat` — keep-alive every 15s
- `progress` — `{ step, text }` — progress updates
- `partial_result` — `{ greetingAndAnalysis, bodyTypeSummary, looks }` — looks with images
- `result` — same as partial_result but with shopping URLs added
- `error` — `{ error }` — terminates stream

### Content filtering

`sanitizeWishes()` in `server.ts` replaces sensitive words in user input before sending to AI. The system prompt also instructs the model to silently reinterpret such words as fashion-appropriate equivalents.

### Vite proxy

In dev mode, Vite proxies `/api` → `http://localhost:3000` (note: hardcoded in `vite.config.ts` — if server port changes, update this too). Currently the server runs on 3001 but this proxy is bypassed because Vite runs as middleware inside the same Express process.

### Production deployment

**VPS:** `186.246.31.126`, path `/var/www/you-stile/you-stile/`, PM2 process `stilist`.

**Firewall (Polite Plover group):** SSH (port 22) allowed from `178.186.45.109` (developer PC) and from all addresses. All other traffic is blocked.

**Nails images on server:** `/var/www/you-stile/you-stile/public/nails/all/` — 622 images (mix of `STIL-26-NNN.jpg` and `t_хэш.png` formats).
**Nails descriptions:** `/var/www/you-stile/you-stile/public/nails/nails-data.json` — JSON с описаниями 622 дизайнов ногтей.

Server reads static files from `dist/` (Vite output). `public/` is copied into `dist/` automatically by Vite on build — gallery images, before/after photos, etc. all live in `public/` locally and end up in `dist/` after build.

**SSH key:** `C:/Users/and/.ssh/id_rsa_deploy` (используется в deploy.py для подключения к VPS)

**To deploy** (run from `you-stile/`):
```bash
npm run build
python deploy.py
```

`deploy.py` uploads `server.ts`, syncs entire `dist/` to VPS, restarts PM2 with `--update-env`.

**Do NOT** manually upload only `index.html` + `assets/` — that breaks gallery images and other static files.

## Admin Panel

- **Админка:** https://stilist-ai.ru/api/admin — PIN `913260` вводится в форму (параметр `?pin=` в URL больше не работает). На сервере обязателен `ADMIN_PIN` в `.env`.
- **Soulmate админка:** `https://stilist-ai.ru/soulmate-admin?pin=913260`

## Правила коммуникации

**НЕ выкладывать код, команды, длинные промпты или конфиги в чат.** Пользователь не разбирается в технике — это его дезориентирует.

Вместо этого — сообщать о выполнении задач простым языком:
- "Готово: обновил админку — теперь показывает сколько промо осталось"
- "Сделано: подправил промпт для стилиста — добавил правило для декольте"
- "Исправлено: баг с пагинацией промокодов"
- "Деплой на прод: Seedream 5 Pro работает, лица сохраняются"

---

## Главное правило работы с проектом

**Перед каждым действием проверять, нарушит ли оно уже работающий функционал.**

Сайт https://stilist-ai.ru работает в проде. Прежде чем что-то менять/удалять:
1. Grep'ом проверить, не используется ли файл/переменная/функция в `server.ts`, `src/App.tsx`, `index.html`, других рабочих файлах.
2. Если файл в `public/` — проверить, не ссылается ли на него код (например `/gallery/gen1.jpg`, `/before.jpg`, `/after.jpg`, `/gucci.jpg`, `/share/`, `/s/`).
3. Не трогать рабочие файлы без необходимости: `server.ts`, `src/App.tsx`, `src/system-prompt.txt`, `src/fashion-knowledge-base.txt`, `deploy.py`, `.env`, `public/` (только если явно не нужно).
4. Не удалять папку `nails.csv/` и скрипт `generate-nails.mjs` — это будущая интеграция каталога ногтей (см. PROJECT_MAP.md).
5. После изменений ОБЯЗАТЕЛЬНО: `npm run lint` + `npm run build`, потом проверить в браузере.

## Бизнес-логика тарифов

### Стандарт (100 ₽)
- 1 фото, **3 свободных образа от стилиста** (без выбора поводов)
- Образы генерируются случайно — AI сам решает
- Нет слайдера количества, нет поводов, нет бюджета, нет астро

### Премиум (200 ₽)
- До 3 фото, **до 5 образов на выбор**
- **22 мероприятия** на выбор (свадьба, романтик, вечеринка, ресторан и т.д.)
- Максимум 5 поводов суммарно, счётчик образов на каждый повод (1-5)
- Сумма образов по всем поводам = looksCount (1-5)
- Бюджет на образ + астро-разбор

### Описание платежа (server.ts /api/create-payment)
- Standard: "Стандарт тариф — 3 образа от стилиста"
- Premium: "Премиум тариф — до 5 образов + 22 повода + астро-разбор"

---

## 📋 Задачи на завтра (записано 17.07.2026 ночью)

### 1. Сохранение результатов при нестабильной связи / случайном выходе
**Проблема:** если пользователь оплатил, но случайно закрыл сайт / потерял связь до окончания генерации — образы, описания и ссылки на товары должны сохраниться и быть доступны позже.
**Текущее состояние:** кнопка "Мои образы" уже существует в интерфейсе (`MyLooksModal` в `src/App.tsx`), сохранение в `data/results/{paymentId}/result.json` на сервере тоже реализовано (`RESULTS_TTL_MS` = 5 часов), но **кнопка не работает** — нужно разобраться почему (проверить `openMyOrder()` в `App.tsx`, эндпоинт `/api/result/:paymentId` в `server.ts`, возможно проблема в `localStorage` синхронизации `pending_payment_id` / `you-stile-my-orders`).
**Что нужно проверить:**
- Работает ли restore после закрытия вкладки и повторного открытия сайта (localStorage `pending_payment_id`)
- Работает ли кнопка "Мои образы" в шапке сайта — открывает ли она сохранённые образы
- Работает ли emergency save при сетевых ошибках в середине генерации (уже есть код в `/api/stylize` catch-блоке — `looksWithImages` частично сохраняются)

### 2. База ногтей (NailsQuizModal) — сейчас не работает
**Ошибка:** "нет квизов" (данные не загружаются).
**Файлы:** `src/App.tsx` → `NailsQuizModal`, читает `/nails/all/index.json` или fallback `/nails/nails-data.json`.
**На сервере:** `/var/www/you-stile/you-stile/public/nails/all/` — 622 изображений, `public/nails/nails-data.json` с описаниями.
**Нужно проверить:**
- Существует ли `dist/nails/all/index.json` после сборки (deploy.py **не** трогает `public/nails/` — см. `SKIP_IN_PUBLIC` в `deploy.py`, возможно файлы не долетают до продакшена)
- Путь `/nails/all/index.json` — реально ли отдаётся сервером (nginx/статика)
- Синхронизация локальных файлов ногтей с сервером (deploy.py явно исключает `nails/` из синхронизации `public/`, значит ногти нужно заливать отдельно или менять deploy.py)

### Общий план работы на следующий день
1. Починить кнопку "Мои образы" / восстановление сессии после сбоя связи
2. Убедиться, что оплаченные, но недосмотренные пользователем результаты не теряются
3. Разобраться, почему база ногтей не грузит квиз, восстановить функциональность
4. Как обычно: после изменений — `npm run build`, деплой только с разрешения (VPN) пользователя

---

## История важных исправлений (для контекста)

- **17.07.2026:** Найдена и исправлена причина ошибки генерации образов — модель `seedream/5-pro-text-to-image` не принимала `quality: "high"` + `output_format: "png"` вместе (API возвращал `BAD_REQUEST`). Исправлено на `quality: "medium"` без `output_format`. Задеплоено, полный премиум-флоу (5 образов, бюджет, повод, астро) протестирован и работает.
- **17.07.2026:** Добавлено видимое предупреждение об ожидаемом времени генерации (Стандарт: 2–4 мин, Премиум: 4–7 мин) — видно сразу на форме, до нажатия "Сгенерировать", и во время загрузки.
- **17.07.2026:** Исправлено окно статус-бара генерации — было `absolute inset-0` внутри модалки (обрезалось на маленьких экранах), стало `fixed inset-0` с `overflow-y-auto` — теперь весь прогресс виден и скроллится при необходимости.
