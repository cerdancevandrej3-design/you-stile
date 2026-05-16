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

### Vite proxy

In dev mode, Vite proxies `/api` → `http://localhost:3000` (note: hardcoded in `vite.config.ts` — if server port changes, update this too). Currently the server runs on 3001 but this proxy is bypassed because Vite runs as middleware inside the same Express process.

### Production deployment

**CRITICAL:** After `npm run build`, server.ts looks for files in `dist/dist/`, but Vite outputs to `dist/`.

On VPS after build:
```bash
mkdir -p dist/dist && cp -r dist/* dist/dist/
pm2 restart stilist
```

Alternatively, fix server.ts to use `dist/` instead of `dist/dist/`:
```typescript
const distIndexPath = path.join(__dirname, "dist", "index.html");
```
