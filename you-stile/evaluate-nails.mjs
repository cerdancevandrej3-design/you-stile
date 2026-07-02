// AI-оценка дизайнов ногтей через vision-модель Polza.ai
// Прогоняет все картинки из public/nails/_review/thumb_*.jpg
// Для каждой: длина, форма, качество съёмки, вау-фактор 1-10, реалистичность, артефакты
// Сохраняет в data/nails-eval.json
//
// node evaluate-nails.mjs              — оценить все
// node evaluate-nails.mjs --limit 20   — только первые 20 (тест)
// node evaluate-nails.mjs --dry-run    — показать что уйдёт без запросов

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const POLZA_BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const POLZA_API_KEY = process.env.POLZA_API_KEY;
const MODEL = 'google/gemini-3.1-flash-lite-preview';
const THUMBS_DIR = path.join(__dirname, 'public', 'nails', '_review');
const INDEX_PATH = path.join(THUMBS_DIR, '_index.txt');
const OUT_PATH = path.join(__dirname, 'data', 'nails-eval.json');
const CONCURRENCY = 5;
const TIMEOUT_MS = 60000;

const EVAL_PROMPT = `You are a professional nail art curator evaluating photos for a premium beauty app.

Look at this nail design photo and rate it STRICTLY. We only want WOW designs — long dramatic nails, macro photography, professional lighting. Reject short/boring nails, bad angles, AI artifacts.

Return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "nail_length": "short" | "medium" | "long" | "extra_long",
  "nail_shape": "almond" | "stiletto" | "coffin" | "square" | "round" | "oval" | "unknown",
  "shot_type": "macro_closeup" | "standard" | "wide" | "bad_angle",
  "lighting": "professional_softbox" | "natural" | "harsh" | "flat" | "poor",
  "wow_factor": <integer 1-10>,
  "realism": <integer 1-10>,
  "has_artifacts": true | false,
  "artifact_notes": "<string, empty if none>",
  "design_category": "<one of: chrome | cat_eye | 3d_aquarium | animal_print | marble | french | minimalism | neon | gemstone | floral | geometric | other>",
  "dominant_colors": ["<color1>", "<color2>"],
  "verdict": "wow" | "good" | "reject",
  "one_line_description": "<short description in Russian, max 80 chars>"
}

Rules:
- wow_factor 9-10 = breathtaking, magazine-quality, long nails, macro detail
- wow_factor 7-8 = good but not stunning
- wow_factor 1-6 = boring, short nails, bad shot, artifacts
- verdict "wow" ONLY if wow_factor >= 9 AND nail_length is long/extra_long AND shot_type is macro_closeup/standard AND has_artifacts is false
- verdict "good" if wow_factor 7-8
- verdict "reject" if wow_factor < 7 OR has_artifacts OR nail_length is short
- Be harsh. 80% of photos should be "reject" or "good", only 20% "wow".`;

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error(`Index not found: ${INDEX_PATH}`);
    console.error('Run _make_thumbs.py first to generate thumbnails + index.');
    process.exit(1);
  }
  const lines = fs.readFileSync(INDEX_PATH, 'utf-8').split('\n').filter(Boolean);
  return lines.map(line => {
    const [thumb, original] = line.split('\t');
    return { thumb, original };
  });
}

async function evaluateOne(item) {
  const thumbPath = path.join(THUMBS_DIR, item.thumb);
  const buf = fs.readFileSync(thumbPath);
  const b64 = buf.toString('base64');
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  const body = {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EVAL_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 500,
  };

  const res = await fetchWithTimeout(`${POLZA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLZA_API_KEY}` },
    body: JSON.stringify(body),
  }, TIMEOUT_MS);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No content in response: ${JSON.stringify(data).slice(0, 300)}`);

  // parse JSON from content (model may wrap in markdown despite instructions)
  let jsonStr = content;
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }
  const parsed = JSON.parse(jsonStr);
  return { ...parsed, _thumb: item.thumb, _original: item.original };
}

async function main() {
  if (!POLZA_API_KEY) { console.error('POLZA_API_KEY не найден в .env'); process.exit(1); }
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('--dry');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

  const items = loadIndex();
  console.log(`Найдено ${items.length} thumbnail'ов для оценки`);
  console.log(`Модель: ${MODEL}`);

  // resume from existing results
  let existing = [];
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8')); } catch {}
  }
  const doneThumbs = new Set(existing.map(r => r._thumb));
  const todo = items.filter(it => !doneThumbs.has(it.thumb));
  console.log(`Уже оценено: ${doneThumbs.size}, осталось: ${todo.length}`);

  const final = limit > 0 ? todo.slice(0, limit) : todo;
  if (dryRun) {
    console.log(`[DRY-RUN] Будет оценено: ${final.length}`);
    final.slice(0, 5).forEach(it => console.log(`  ${it.thumb} -> ${it.original}`));
    return;
  }

  console.log(`Ожидаемая стоимость: ~${Math.ceil(final.length * 0.3)} ₽ (gemini-flash-lite)`);
  console.log(`Параллелизм: ${CONCURRENCY}\n`);

  const results = [...existing];
  const failed = [];
  let done = 0;

  for (let i = 0; i < final.length; i += CONCURRENCY) {
    const batch = final.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(it => evaluateOne(it)));
    for (let j = 0; j < settled.length; j++) {
      const it = batch[j];
      if (settled[j].status === 'fulfilled') {
        results.push(settled[j].value);
      } else {
        console.error(`  [FAIL] ${it.thumb}: ${settled[j].reason.message}`);
        failed.push({ thumb: it.thumb, error: settled[j].reason.message });
      }
    }
    done += batch.length;
    const wowCount = results.filter(r => r.verdict === 'wow').length;
    process.stdout.write(`\rПрогресс: ${done}/${final.length} | вау: ${wowCount} | good: ${results.filter(r => r.verdict === 'good').length} | reject: ${results.filter(r => r.verdict === 'reject').length}`);
    // save after each batch so progress is not lost
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  }

  console.log('\n\nГотово!');
  const verdicts = { wow: 0, good: 0, reject: 0 };
  results.forEach(r => { verdicts[r.verdict] = (verdicts[r.verdict] || 0) + 1; });
  console.log(`Итог: wow=${verdicts.wow}, good=${verdicts.good}, reject=${verdicts.reject}, total=${results.length}`);
  console.log(`Сохранено: ${OUT_PATH}`);
  if (failed.length) {
    fs.writeFileSync(path.join(__dirname, 'data', 'nails-eval-failed.json'), JSON.stringify(failed, null, 2));
    console.log(`Ошибок: ${failed.length} (см. data/nails-eval-failed.json)`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
