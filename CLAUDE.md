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
   - `IMAGE_MODEL` (`google/gemini-3.1-flash-image-preview`) — generates outfit images with user's face
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

### Production deployment

**VPS:** `186.246.31.126`, path `/var/www/you-stile/you-stile/`, PM2 process `stilist`.

Server reads static files from `dist/` (Vite output). `public/` is copied into `dist/` automatically by Vite on build — gallery images, before/after photos, etc. all live in `public/` locally and end up in `dist/` after build.

**To deploy** (run from `you-stile/`):
```bash
npm run build
python deploy.py
```

`deploy.py` uploads `server.ts`, syncs entire `dist/` to VPS, restarts PM2 with `--update-env`.

**Do NOT** manually upload only `index.html` + `assets/` — that breaks gallery images and other static files.

**После изменений ОБЯЗАТЕЛЬНО проверить в браузере:**
- https://stilist-ai.ru/admin?pin=913260 — админка you-stile
- https://stilist-ai.ru/soulmate-admin?pin=913260 — админка Soulmate
- https://stilist-ai.ru/api/soulmate/users?pin=913260 — API возвращает JSON

## Бизнес-логика тарифов

### Стандарт
- 1 фото, 3 образа
- Поводы НЕ выбираются — образы генерируются случайно (AI сам решает)
- Нет слайдера количества образов

### Премиум
- До 3 фото, до 5 образов
- Поводы выбираются (максимум 5 поводов)
- Рядом с каждым выбранным поводом — счётчик +/- сколько образов под этот повод
- Сумма образов по всем поводам = looksCount
- Слайдер количества образов (1-5)
- Бюджет, астро-разбор

## Задачи на завтра (промпт для генерации образов)

### 1. Убрать улыбку если её нет на исходном фото
- Проблема: Flux генерирует улыбку даже если на загруженном фото человек серьёзный — лицо становится непохожим
- Решение: добавить в fluxPrompt инструкцию `EXPRESSION: Match the facial expression from the reference photo exactly. If person is not smiling in reference, do NOT add smile. Preserve natural expression.`
- Файл: server.ts, строка ~1592 (fluxPrompt)

### 2. Учитывать тип фигуры в образах
- Худой комплекции → больше образов с короткой юбкой, мини
- Есть грудь → можно декольте (формулировка для прохождения цензуры Flux)
- Решение: в системном промпте анализа (ANALYSIS_MODEL) добавить инструкцию учитывать bodyType при выборе длины юбок и выреза
- Формулировка для цензуры: `elegant neckline`, `tasteful décolletage`, `sophisticated low-cut neckline` — НЕ использовать прямые слова
- Файл: src/system-prompt.txt + server.ts fluxPrompt

### Текущее состояние сайта (коммит 7e6ccb2)
- Работает стабильно на stilist-ai.ru
- Кнопка "Повторить генерацию" при сбое Polza.ai
- Лимит файла 50MB, retry 3 попытки
- Поводы: максимум 5 суммарно, счётчик на каждый повод
- Слайдер количества образов убран
- **ВСЕГДА проверять сделанное в браузере перед тем как сообщать о завершении**
- Всегда уточнять у пользователя детали перед реализацией
- Стандарт: образы случайные, без поводов
- Премиум: поводы со счётчиком образов на каждый повод

## Hermes — посты в Telegram-канал

Канал `@stilist_ai_ru`, процесс PM2 `hermes`, код `you-stile/hermes/hermes.ts`.

**Как выкладывать новости:**
- Без сырых тегов на экране (`<b>`, `&amp;`). Жирный и курсив через Telegram HTML (`parse_mode=HTML`). Если HTML не принялся — слать обычный текст, никогда не показывать теги.
- Не слать текст **ответом** на альбом: серая цитата рвёт пост.
- Под фото короткий заголовок. Полный текст — следующим сообщением.
- **Цвет новостей:** в Telegram нет цветного шрифта. Каждая из трёх новостей своим цветом-квадратом: 🟥 первая, 🟨 вторая, 🟩 третья. Заголовок жирный, под ним курсивом крючок, между новостями пустая строка.
- **Мнение стилиста:** отдельный блок `💬 Мнение стилиста` + `blockquote` (полоска слева), не ответ на фото.
- Кавычки «ёлочки» в тексте новостей не ставить.

Выкладка только hermes: залить `hermes/hermes.ts` на VPS, `pm2 restart hermes --update-env`. Не гонять полный `deploy.py` ради канала.
