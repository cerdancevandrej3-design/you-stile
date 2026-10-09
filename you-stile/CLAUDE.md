# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Сервер, Hermes и базы

Живой код и базы — на сервере, не в этой локальной копии. Пароли и API-ключи сюда не писать.

- SSH: `root@186.246.31.126`
- Корень: `/var/www/you-stile/you-stile`
- Сайт: https://stilist-ai.ru
- Пароль SSH — локальный, уже используемый для этого сервера. В репозиторий не копировать.

Hermes (посты MAX и Telegram):

- код: `hermes/hermes.ts`
- секреты: `hermes/.env` (`HERMES_MAX_TOKEN`, `HERMES_MAX_CHAT_ID`)
- журнал: `hermes/data/hermes-log.json`
- картинки: `public/hermes/`
- процесс pm2: `hermes` (`pm2 restart hermes --update-env`)
- Telegram: `@stilist_ai_ru`

База «Причёска и уход» — справочник модели, не витрина. Процесс pm2 `stilist` при старте склеивает шесть файлов в `src/grooming-system-prompt.txt`. После правки: `pm2 restart stilist --update-env`.

Цель: кадр «после» свежее и моложе, лицо того же человека. До 18 лет — только свежее, тот же возраст. База для того, чтобы знать все варианты. Предлагать всё подряд нельзя: в ответ один кадр или три, только то, что подходит этому человеку и даёт омоложение и освежение. Помеченное «старит» или «не предлагать» не ставить по умолчанию. Бороду не рисовать на гладком лице.

Каталог `part0_trends_2026.md`, 193 пункта: женские стрижки 1–65, чёлки 66–73, женские укладки 74–93, мужские стрижки 94–144, мужские укладки 145–153, бороды и усы 154–193. Дальше `part1_haircuts.md` (форма лица), `part2_color.md` (цвет), `part3_skincare.md` (уход), `part4_makeup.md` (макияж), `part5_lipstick.md` (18 тонов помады). `MasterHowTo.tsx` — только вёрстка.

Пути: сервер `src/grooming/` и локально `you-stile/src/grooming/`. Промпт: `src/grooming-system-prompt.txt`. Окно: `src/GroomingModal.tsx`. Старые файлы: `src/grooming-bak/`. API: `POST /api/grooming`. Каталога, который листают, нет. Фото заказов: `data/grooming/`. Ответы: `data/grooming-results/`. Черновики в корневом `src/grooming/` стилист не читает.

База ногтей (460 дизайнов, `GET /api/nails/lite-catalog`):

- `public/nails-database.json`
- `public/nails/catalog.json`
- `public/nails/nails-data.json`
- те же файлы в `dist/`
- снимок: `data/prod-catalog.json`
- картинки: `public/nails/`
- прочие `data/nails-*.json` — аудиты, не клиентский каталог

Полная карта: `agent.md` и `server-bases.md` в корне репозитория. Локальный `src/App.tsx` старее прода: причёска, ногти и чат собраны из файлов на сервере.

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
   - `ANALYSIS_MODEL` (`anthropic/claude-haiku-5.5`) — analyzes photo, generates JSON look recommendations
   - `IMAGE_MODEL` (`google/gemini-nano-banana-2.1`) — generates outfit images with user's face
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
