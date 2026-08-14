// Генерация эталонных фото дизайнов ногтей через Polza.ai
// Модель: openai/gpt-5.4-image-2 | 2K | 3:4 вертикаль
// НЕ интегрирует ничего в сайт — только сохраняет картинки в public/nails/
//
// node generate-nails.mjs --dry-run              — показать что уйдёт, без траты
// node generate-nails.mjs                        — генерация недостающих (skipIfExists)
// node generate-nails.mjs --force                — перегенерировать ВСЕ (перезапись)
// node generate-nails.mjs STIL-26-001            — только один дизайн
// node generate-nails.mjs STIL-26-001 STIL-26-002 --force  — перегенерировать выбранные

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const POLZA_BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const POLZA_API_KEY = process.env.POLZA_API_KEY;
const MODEL = 'openai/gpt-5.4-image-2';
const IMAGE_RESOLUTION = '2K';
const ASPECT_RATIO = '3:4';
const CSV_PATH = path.join(__dirname, 'nails.csv', 'Новая таблица - Лист1 (1).csv');
const OUT_DIR = path.join(__dirname, 'public', 'nails');
const CONCURRENCY = 1;
const TIMEOUT_MS = 300000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// ФИНАЛЬНЫЙ ПРОМПТ ДЛЯ ВАУ-ПРЕЗЕНТАБЕЛЬНЫХ НОГТЕЙ
// Ключевые принципы: LONG ногти, almond/coffin, финиш ловит свет, макро-ракурс,
// премиум-фон, props, реалистичная кожа с порами/сгибами/волосками
const SUPER_PROMPT = `
Beautiful professional beauty photo of a real woman hand — premium magazine-quality nail campaign.

NAIL LENGTH AND SHAPE — MOST IMPORTANT:
Nails MUST be LONG or MEDIUM-LONG. NEVER short nails. Short nails are boring and reject-worthy — if nails look short, the photo is a failure. Almond or Coffin/Ballerina shape — these elongate fingers and photograph best. Crisp filed edges, perfect cuticle work — signals professional salon execution.

NAIL FINISH — MUST CATCH LIGHT:
Nail surface MUST have a glossy reflective finish that catches the softbox light — a visible highlight/specular reflection on each nail is required. For chrome/metallic designs: mirror-like reflection. For cat-eye/magnetic: dimensional light stripe that shifts. For glossy: wet-look high shine. Flat matte nails without light reflection are a failure.

ANATOMY — REAL HAND, NOT PLASTIC:
Exactly 5 fingers on the hand — NEVER 4, NEVER 6, NEVER 7. Thumb on one side, exactly 4 fingers on the other side. Count the fingers before finishing the image: must be 5 total. Each finger has 3 natural segments connected by knuckles. When fingers bend, you see natural creases and small wrinkles at each knuckle joint. Normal finger proportions — not stretched, not swollen. If ANY finger looks plastic, waxy, mannequin-like, or has unnatural joint bending — that is a failure. If the hand has more or fewer than 5 fingers — that is a critical failure, regenerate. Real hands have asymmetry, slight redness at knuckles, visible veins under skin.

SKIN TEXTURE — REAL PHOTOGRAPH, NOT AI:
The back of the hand faces the camera. Real living skin: pores, tiny vellus hairs, slight redness at knuckles, natural uneven tone, visible cuticle. NOT mannequin. NOT doll. NOT wax. NOT plastic. NOT airbrushed CGI. NOT porcelain smoothness. If the hand looks generated / fake / too perfect — the photo is a failure.

POSE AND CAMERA — NAILS STRAIGHT-ON, NEVER FROM THE SIDE:
Dorsal / top-down catalog shot. The BACK of the hand faces the camera. Camera looks DOWN onto the TOP of the nails, like the hand rests on a table. Full design on 4–5 nail plates fully readable. Fingers together, slightly fanned, pointing up or away. Thumb nail also from the TOP.
FORBIDDEN: palm facing the camera, palm lines, side profile, nail sidewall, 3/4 edge, fingers pointing at the lens from the palm, rings, jewelry.

LIGHTING — PROFESSIONAL SOFTBOX:
Professional beauty photography softbox lighting — large soft light source from the upper left at approximately 45 degrees. Soft wraparound shadow on the hand. Shadow under fingers and knuckles is soft with NO hard edges. Skin looks dimensional, not flat. NOT window light. NOT sunlight. NOT harsh flash. Professional softbox only.

BACKGROUND — PREMIUM NOT PLAIN:
Seamless premium surface — soft white marble with subtle veins, OR matte cream linen texture, OR blurred bokeh with warm string lights for evening designs. Background completely out of focus. NOT a flat plain wall.

PROPS — SUBTLE LUXURY:
Optional: a fresh orchid petal or a single pearl near the hand, never on the fingers. NO rings, NO jewelry on the hand — they look generated.

This photograph must be indistinguishable from a real professional beauty brand campaign (OPI, Chanel Beauty, Dior, Zoya). A viewer must believe this is a real photographed hand with real nails — magazine cover quality, Instagram-viral worthy.`;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function extractImage(data) {
  if (data.output?.url) return { kind: 'url', value: data.output.url };
  if (data.output?.b64_json) return { kind: 'b64', value: data.output.b64_json };
  if (data.output?.data) return { kind: 'b64', value: data.output.data };
  if (data.url) return { kind: 'url', value: data.url };
  if (Array.isArray(data.data) && data.data[0]) {
    const d0 = data.data[0];
    if (d0.b64_json) return { kind: 'b64', value: d0.b64_json };
    if (d0.url) return { kind: 'url', value: d0.url };
  }
  if (data.choices?.[0]?.message?.content) {
    const content = data.choices[0].message.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.inline_data?.data) return { kind:'b64', value: part.inline_data.data.replace(/^data:[^;]+;base64,/, '') };
        if (part.image_url?.url) {
          const u = part.image_url.url;
          if (u.startsWith('data:')) return { kind:'b64', value: u.replace(/^data:[^;]+;base64,/, '') };
          return { kind:'url', value: u };
        }
      }
    }
  }
  if (data.image && typeof data.image === 'string') {
    if (data.image.startsWith('data:')) return { kind:'b64', value: data.image.replace(/^data:[^;]+;base64,/, '') };
    return { kind:'url', value: data.image };
  }
  return null;
}

async function generateOne(id, prompt, dryRun = false) {
  const fullPrompt = prompt + SUPER_PROMPT;
  if (dryRun) {
    console.log(`  [DRY-RUN] ${id}: ${fullPrompt.slice(0, 300)}...`);
    return { ok: true, skipped: true };
  }
  const body = {
    model: MODEL,
    input: { prompt: fullPrompt, aspect_ratio: ASPECT_RATIO, image_resolution: IMAGE_RESOLUTION },
  };
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(`${POLZA_BASE_URL}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLZA_API_KEY}` },
        body: JSON.stringify(body),
      }, TIMEOUT_MS);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }
      const data = await res.json();
      const img = extractImage(data);
      if (!img) throw new Error(`Unknown response: ${JSON.stringify(data).slice(0, 300)}`);
      if (img.kind === 'url') {
        const imgRes = await fetchWithTimeout(img.value, {}, 60000);
        if (!imgRes.ok) throw new Error(`Fetch image failed: ${imgRes.status}`);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      return Buffer.from(img.value, 'base64');
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        console.log(`  [RETRY ${attempt + 1}/${MAX_RETRIES}] ${id}: ${e.message.slice(0, 80)}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastErr;
}

async function runBatch(ids, dryRun, force) {
  if (!POLZA_API_KEY && !dryRun) { console.error('POLZA_API_KEY не найден в .env'); process.exit(1); }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const allRows = parseCSV(csvText);
  const dataRows = allRows.slice(1).filter(r => r[0] && r[0] !== 'ID' && r[8] && r[8].trim());
  console.log(`Найдено ${dataRows.length} записей с промптами`);
  const toGenerate = ids.length ? dataRows.filter(r => ids.includes(r[0])) : dataRows;
  console.log(`К генерации: ${toGenerate.length} | Разрешение: ${IMAGE_RESOLUTION} | Формат: ${ASPECT_RATIO}${force ? ' | FORCE (перезапись)' : ''}`);
  if (!dryRun) console.log(`Ожидаемая стоимость: ~${toGenerate.length * 7} ₽`);
  if (dryRun) { toGenerate.forEach(r => console.log(`  [DRY] ${r[0]} - ${r[1]}`)); return; }
  const failed = [];
  let done = 0;
  for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
    const batch = toGenerate.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const [id, name, , , , , season, , prompt] = row;
        const outPath = path.join(OUT_DIR, `${id}.jpg`);
        if (fs.existsSync(outPath) && !force) { console.log(`  [SKIP] ${id} уже существует`); return; }
        console.log(`  [GEN]  ${id} - ${name?.split('/')[0]?.trim()} (${season})`);
        const buf = await generateOne(id, prompt, false);
        fs.writeFileSync(outPath, buf);
        console.log(`  [OK]   ${id} сохранено`);
      })
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'rejected') {
        const id = batch[j][0];
        console.error(`  [FAIL] ${id}: ${results[j].reason.message}`);
        failed.push(id);
      }
    }
    done += batch.length;
    console.log(`\nПрогресс: ${done}/${toGenerate.length}`);
  }
  if (failed.length) {
    console.error(`\nНе удалось (${failed.length}): ${failed.join(', ')}`);
    fs.writeFileSync(path.join(__dirname, 'failed-nails.json'), JSON.stringify(failed, null, 2));
  } else {
    console.log('\nВсе картинки успешно сгенерированы!');
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('--dry');
const force = args.includes('--force') || args.includes('-f');
const ids = args.filter(a => !a.startsWith('--'));
runBatch(ids, dryRun, force);
