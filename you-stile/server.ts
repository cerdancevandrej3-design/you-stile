import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import QRCode from "qrcode";

type MulterFile = Express.Multer.File;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const PROJECT_ROOT = __dirname;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Load fashion knowledge base (2026 trends)
const knowledgeBasePath = path.join(PROJECT_ROOT, "src", "fashion-knowledge-base.txt");
let fashionKnowledgeBase = "";
if (fs.existsSync(knowledgeBasePath)) {
  fashionKnowledgeBase = fs.readFileSync(knowledgeBasePath, "utf-8");
}

// Load system prompt template
const systemPromptPath = path.join(__dirname, "src", "system-prompt.txt");
let systemPromptTemplate = "";
if (fs.existsSync(systemPromptPath)) {
  systemPromptTemplate = fs.readFileSync(systemPromptPath, "utf-8");
}
const systemPrompt = systemPromptTemplate.replace("{{FASHION_KNOWLEDGE_BASE}}", fashionKnowledgeBase);

const POLZA_API_KEY = process.env.POLZA_API_KEY;
if (!POLZA_API_KEY) {
  console.error("POLZA_API_KEY is not set in environment variables");
  process.exit(1);
}
const POLZA_BASE_URL = process.env.POLZA_BASE_URL || "https://polza.ai/api/v1";

const ANALYSIS_MODEL = "google/gemini-3.1-flash-lite-preview";
// Nano Banana 2 — генерация изображений с лицом пользователя
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

function sanitizeWishes(text: string): string {
  if (!text) return text;
  return text
    .replace(/сексуальн(ый|ая|ое|ые|ых|ом|ому|ой|ого)/gi, "подчёркивающий фигуру")
    .replace(/сексуальн\w*/gi, "подчёркивающий фигуру")
    .replace(/голы(й|х|м|е)\b/gi, "открытый")
    .replace(/голая\b/gi, "открытая")
    .replace(/эротичн\w*/gi, "соблазнительный, но сдержанный")
    .replace(/откровенн\w*/gi, "элегантный")
    .replace(/порн\w*/gi, "изысканный")
    .replace(/нагой\b/gi, "открытый")
    .replace(/раздет\w*/gi, "с открытыми плечами")
    // English terms
    .replace(/\bsexy\b/gi, "figure-flattering")
    .replace(/\bsexual\b/gi, "body-conscious")
    .replace(/\bnude\b/gi, "open")
    .replace(/\bnaked\b/gi, "open")
    .replace(/\berotic\b/gi, "alluring yet refined")
    .replace(/\brevealing\b/gi, "elegant")
    .replace(/\bprovocative\b/gi, "bold");
}

function getZodiacSign(day: number, month: number): string {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Овен ♈";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Телец ♉";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Близнецы ♊";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Рак ♋";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Лев ♌";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Дева ♍";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Весы ♎";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Скорпион ♏";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Стрелец ♐";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Козерог ♑";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Водолей ♒";
  return "Рыбы ♓";
}

function sanitizeEditPrompt(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bsexy\b/gi, "elegant")
    .replace(/\bsensual\b/gi, "refined")
    .replace(/\brevealing\b/gi, "chic")
    .replace(/\bprovocative\b/gi, "bold")
    .replace(/\bseductive\b/gi, "sophisticated")
    .replace(/\berotic\b/gi, "artistic")
    .replace(/\bnude\b/gi, "open-shoulder")
    .replace(/\bnaked\b/gi, "open-shoulder")
    .replace(/\btopless\b/gi, "off-shoulder")
    .replace(/\blingerie\b/gi, "bodysuit")
    .replace(/\bsuggestive\b/gi, "alluring");
}

function safeJsonParse(text: string): any {
  if (!text) throw new Error("Empty response from AI");
  let cleaned = text.trim();
  // Remove markdown code blocks like ```json ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  // Extract first valid JSON object from potential trailing text
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  // First attempt — strict
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Best-effort repair — common Gemini issues at high temperature
    let repaired = cleaned
      // Trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, "$1")
      // Smart quotes → straight
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

    // Escape lone control chars inside strings (newlines/tabs)
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*")/g, (m: string) => {
      return m
        .replace(/\r\n/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\n")
        .replace(/\t/g, "\\t");
    });

    try {
      return JSON.parse(repaired);
    } catch {
      // Last resort: return original error with diagnostic preview
      const previewIdx = (e instanceof Error ? e : null)?.message?.match(/position (\d+)/)?.[1];
      const idx = previewIdx ? parseInt(previewIdx) : 0;
      const preview = cleaned.slice(Math.max(0, idx - 80), idx + 80);
      throw new Error(`JSON parse failed: ${(e as Error).message}\nNear: ...${preview}...`);
    }
  }
}

async function callPolzaChat(options: {
  model: string;
  systemPrompt: string;
  messages: Array<any>;
  temperature?: number;
  maxTokens?: number;
  useJsonFormat?: boolean;
}) {
  const requestBody: any = {
    model: options.model,
    messages: [
      { role: "system", content: options.systemPrompt },
      ...options.messages,
    ],
    temperature: options.temperature ?? 0.8,
    max_tokens: options.maxTokens ?? 8192,
  };

  // Only use response_format for Gemini models. YandexGPT и Perplexity Sonar
  // часто возвращают пустой {} либо ломают разметку при response_format=json_object.
  if (
    options.useJsonFormat !== false &&
    options.model.includes("gemini")
  ) {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await fetch(`${POLZA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${POLZA_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Polza API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateImageWithFlux(prompt: string, referenceImageBase64?: string, referenceMimeType: string = "image/jpeg"): Promise<string | null> {
  const body: any = {
    model: IMAGE_MODEL,
    input: {
      prompt: prompt,
      aspect_ratio: "3:4",
    },
  };

  if (referenceImageBase64) {
    body.input.images = [
      { type: "base64", data: referenceImageBase64, mime_type: referenceMimeType }
    ];
  }

  console.log("[Flux API] Request body:", JSON.stringify({ ...body, input: { ...body.input, prompt: body.input.prompt.substring(0, 200) + "..." } }));

  const response = await fetch(`${POLZA_BASE_URL}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${POLZA_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Flux API] Error response:", response.status, errorText);
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[Flux API] Response keys:", Object.keys(data));

  // Polza.ai /media returns result in various formats
  // Check common response patterns
  if (data.output && data.output.url) {
    return data.output.url;
  }
  if (data.output && data.output.data) {
    return data.output.data;
  }
  if (data.url) {
    return data.url;
  }
  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    const imageData = data.data[0];
    if (imageData.b64_json) {
      return `data:image/png;base64,${imageData.b64_json}`;
    }
    if (imageData.url) {
      return imageData.url;
    }
  }
  if (data.image) {
    return data.image;
  }
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    return data.images[0];
  }

  console.log("[Flux API] Full response:", JSON.stringify(data).substring(0, 500));
  return null;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001', 10);

  const PROMO_FILE = path.join(PROJECT_ROOT, "promo-codes.json");

  type PromoEntry = { used: boolean; tier: "standard" | "premium"; createdAt: string };
  type PromoStore = Record<string, PromoEntry>;

  const loadPromos = (): PromoStore => {
    try {
      if (fs.existsSync(PROMO_FILE)) return JSON.parse(fs.readFileSync(PROMO_FILE, "utf-8"));
    } catch {}
    return {};
  };
  const savePromos = (store: PromoStore) => {
    try { fs.writeFileSync(PROMO_FILE, JSON.stringify(store, null, 2)); } catch {}
  };

  const promos = loadPromos();

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += "-";
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin";

  app.use(cors());
  app.use(express.json());

  app.post("/api/check-promo", (req: Request, res: Response) => {
    const code = (req.body.code || "").toString().trim().toUpperCase();
    if (!code) return res.json({ valid: false });
    const entry = promos[code];
    if (!entry) return res.json({ valid: false });
    if (entry.used) return res.json({ valid: false, reason: "used" });
    entry.used = true;
    savePromos(promos);
    return res.json({ valid: true, tier: entry.tier });
  });

  app.post("/api/generate-promo", (req: Request, res: Response) => {
    const secret = (req.headers["x-admin-secret"] || req.body.secret || "").toString();
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "forbidden" });
    const count = Math.min(parseInt(req.body.count || "10", 10), 100);
    const tier: "standard" | "premium" = req.body.tier === "premium" ? "premium" : "standard";
    const newCodes: string[] = [];
    for (let i = 0; i < count; i++) {
      let code = generateCode();
      while (promos[code]) code = generateCode();
      promos[code] = { used: false, tier, createdAt: new Date().toISOString() };
      newCodes.push(code);
    }
    savePromos(promos);
    res.json({ codes: newCodes, tier, count: newCodes.length });
  });

  app.get("/api/promo-list", (req: Request, res: Response) => {
    const secret = (req.headers["x-admin-secret"] || req.query.secret || "").toString();
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "forbidden" });
    const list = Object.entries(promos).map(([code, e]) => ({ code, ...e }));
    res.json({ total: list.length, unused: list.filter(e => !e.used).length, codes: list });
  });

  // Admin page
  app.get("/api/admin", (req: Request, res: Response) => {
    const secret = (req.query.secret || "").toString();
    if (secret !== ADMIN_SECRET) {
      return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px">
        <h2>Введите пароль администратора</h2>
        <form onsubmit="location.href='/api/admin?secret='+encodeURIComponent(document.getElementById('s').value);return false">
          <input id="s" type="password" placeholder="Пароль" style="padding:8px;font-size:16px;width:200px">
          <button type="submit" style="padding:8px 16px;margin-left:8px">Войти</button>
        </form></body></html>`);
    }
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Промокоды — Админ</title>
<style>
  body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;background:#f9f7f3}
  h1{font-size:24px;margin-bottom:24px}
  .card{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  label{display:block;margin-bottom:6px;font-size:14px;color:#555}
  select,input[type=number]{padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-right:8px}
  button{padding:10px 20px;background:#c9a84c;color:#1a1a1a;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#b8973b}
  .btn-secondary{background:#1a1a1a;color:#fff}
  .btn-secondary:hover{background:#333}
  pre{background:#f0ece4;padding:16px;border-radius:8px;font-size:13px;line-height:1.8;white-space:pre-wrap;word-break:break-all}
  .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:600}
  .tag-ok{background:#d4edda;color:#1a6b2a}
  .tag-used{background:#f8d7da;color:#721c24}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px;border-bottom:2px solid #eee;color:#888;font-weight:600}
  td{padding:8px;border-bottom:1px solid #f0ece4}
  .mono{font-family:monospace;letter-spacing:.05em;font-weight:700}
</style>
</head>
<body>
<h1>🎟 Промокоды</h1>

<div class="card">
  <label>Сгенерировать одноразовые коды:</label>
  <select id="tier"><option value="standard">Стандарт (100 ₽)</option><option value="premium">Премиум (200 ₽)</option></select>
  <input type="number" id="count" value="10" min="1" max="100" style="width:70px">
  <button onclick="generate()">Создать коды</button>
  <pre id="result" style="display:none;margin-top:16px"></pre>
  <button id="copyBtn" onclick="copyAll()" style="display:none;margin-top:8px" class="btn-secondary">Скопировать все</button>
</div>

<div class="card">
  <label>Все коды: <span id="stats" style="color:#888"></span></label>
  <button onclick="loadList()" class="btn-secondary" style="margin-bottom:16px">Обновить список</button>
  <div id="list"></div>
</div>

<script>
const secret = ${JSON.stringify(secret)};

async function generate() {
  const tier = document.getElementById('tier').value;
  const count = document.getElementById('count').value;
  const r = await fetch('/api/generate-promo', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({secret, tier, count})
  });
  const d = await r.json();
  const pre = document.getElementById('result');
  pre.textContent = d.codes.join('\\n');
  pre.style.display = 'block';
  document.getElementById('copyBtn').style.display = 'inline-block';
  loadList();
}

let lastCodes = [];
function copyAll() {
  const text = document.getElementById('result').textContent;
  navigator.clipboard.writeText(text).then(() => alert('Скопировано!'));
}

async function loadList() {
  const r = await fetch('/api/promo-list?secret=' + encodeURIComponent(secret));
  const d = await r.json();
  document.getElementById('stats').textContent = d.unused + ' свободных / ' + d.total + ' всего';
  const rows = d.codes.sort((a,b) => a.used - b.used).map(e =>
    '<tr><td class="mono">' + e.code + '</td><td>' +
    (e.tier === 'premium' ? 'Премиум' : 'Стандарт') + '</td><td>' +
    (e.used ? '<span class="tag tag-used">Использован</span>' : '<span class="tag tag-ok">Свободен</span>') +
    '</td><td style="color:#aaa">' + (e.createdAt ? e.createdAt.slice(0,10) : '') + '</td></tr>'
  ).join('');
  document.getElementById('list').innerHTML = '<table><tr><th>Код</th><th>Тариф</th><th>Статус</th><th>Создан</th></tr>' + rows + '</table>';
}

loadList();
</script>
</body></html>`);
  });

  app.get("/api/test-key", (req: Request, res: Response) => {
    res.json({
      POLZA_API_KEY: POLZA_API_KEY ? "configured" : "missing",
      ANALYSIS_MODEL,
      IMAGE_MODEL,
    });
  });

  // Payment endpoints
  const PAYMENT_MODE = process.env.PAYMENT_MODE || "test";

  app.post("/api/create-payment", async (req: Request, res: Response) => {
    try {
      const { tier } = req.body;
      const amount = tier === "premium" ? 200 : 100;
      const paymentId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let qrData = "";
      if (PAYMENT_MODE === "test") {
        qrData = await QRCode.toDataURL(`https://qr.nspk.ru/test-payment-${paymentId}?sum=${amount}`);
      } else {
        qrData = await QRCode.toDataURL(`https://yookassa.ru/payment/${paymentId}`);
      }
      res.json({ paymentId, qrCode: qrData, amount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/check-payment", (req: Request, res: Response) => {
    const { paymentId } = req.body;
    if (!paymentId) return res.json({ status: "pending" });
    if (PAYMENT_MODE === "test") {
      return res.json({ status: "succeeded" });
    }
    return res.json({ status: "pending" });
  });

  app.post("/api/stylize", upload.array("images", 3), async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      res.write(JSON.stringify({ type: "progress", step: 0.8, text: "Фотографии получены сервером..." }) + "\n");

      const files = req.files as MulterFile[];
      if (!files || files.length === 0) {
        res.write(JSON.stringify({ type: "error", error: "No images uploaded" }) + "\n");
        return res.end();
      }

      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";
      const rawWishes = (req.body.wishes || "").toString().slice(0, 500).trim();
      const wishes = sanitizeWishes(rawWishes);
      const looksCount = Math.min(5, Math.max(1, parseInt(req.body.looksCount) || 3));
      const userName = (req.body.userName || "").toString().trim().slice(0, 50);
      const nameInstruction = userName ? `Обращайся к пользователю по имени "${userName}" в приветствии и 1-2 раза по ходу анализа. ` : "";

      // Astro block — parse birth date and compute zodiac sign
      const birthDateRaw = (req.body.birthDate || "").toString().trim();
      console.log("[Astro] birthDateRaw received:", JSON.stringify(birthDateRaw));
      console.log("[Astro] req.body keys:", Object.keys(req.body));
      let zodiacBlock = "";
      if (birthDateRaw) {
        const [d, m] = birthDateRaw.split(".").map(Number);
        if (d && m) {
          const sign = getZodiacSign(d, m);
          const now = new Date();
          const monthName = now.toLocaleString("ru-RU", { month: "long" });
          const year = now.getFullYear();
          zodiacBlock = `\n\n♦ АСТРО-ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:\nДата рождения: ${birthDateRaw}\nЗнак зодиака: ${sign}\nТекущий месяц: ${monthName} ${year}\n\n⭐ ЗАДАЧА ПЕРСОНАЛЬНОГО ПРЕДСКАЗАНИЯ:\nПосле основного анализа добавь поле astroReading — живое персональное предсказание на ${monthName}. ВАЖНО: описывай внешность и характер ТОЛЬКО по оригинальной загруженной фотографии, не по сгенерированным образам. Формат — поток предсказания, не сухие категории:\n\n1. ПОРТРЕТ: Назови 2-3 черты личности ${sign} и найди их отражение в реальной внешности человека на фото (взгляд, черты лица, энергетика). Конкретно.\n\n2. ГЛАВНАЯ ТЕМА ${monthName.toUpperCase()}: Что несёт этот период — ключевой посыл судьбы для ${sign} прямо сейчас. 2-3 предложения.\n\n3. ВОЗМОЖНОСТИ: Что важно не упустить, какие двери открываются, счастливые моменты месяца. Интригующе и конкретно.\n\n4. ПРЕДУПРЕЖДЕНИЯ: Чего избегать, скрытые риски, что может пойти не так — честно и без прикрас.\n\n5. К ЧЕМУ ГОТОВИТЬСЯ: Что придёт в жизнь в ближайшее время — событие, встреча, перемена. Добавь интригу.\n\n6. ИНТУИЦИЯ ЗВЁЗД: Личный совет именно этому человеку — исходя из его внешности и энергетики ${sign}. Мистично и точно.\n\n7. ОБЯЗАТЕЛЬНО завершить фразой-крючком — загадочной и интригующей, намекающей что в следующем месяце звёзды раскроют нечто важное. Заканчивай словами: "Возвращайтесь — прогноз обновляется каждый месяц 🌙"\n\nВАЖНО: только ${monthName}, не год. Пиши как настоящий астролог — живо, лично, с интригой. Никаких скучных перечислений.`;
        }
      }

      if (!POLZA_API_KEY) {
        res.write(JSON.stringify({ type: "error", error: "API ключ не настроен. Добавьте POLZA_API_KEY в .env" }) + "\n");
        return res.end();
      }

      heartbeat = setInterval(() => {
        res.write(JSON.stringify({ type: "heartbeat" }) + "\n");
      }, 15000);

      // Use the first image as reference
      const referenceImage = files[0];
      const referenceImageBase64 = referenceImage.buffer.toString("base64");
      const mimeType = referenceImage.mimetype;

      // Prepare messages with image for Gemini analysis
      const wishesBlock = wishes
        ? `\n\n🌟 ОСОБЫЕ ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (PREMIUM — ВЫСШИЙ ПРИОРИТЕТ): "${wishes}"\n\n⚠️ КРИТИЧЕСКОЕ ПРАВИЛО ПРИ НАЛИЧИИ ПОЖЕЛАНИЙ:\nЕсли пользователь сформулировал конкретный запрос — ПОЛНОСТЬЮ ИГНОРИРУЙ структуру "офис/вечер/color-block" и стандартный список из 6 направлений. Создавай РОВНО то, что человек попросил.\n\nКонкретные сценарии:\n- "хочу образ рокера и 2 для свидания" → ровно 1 рокер + 2 свидания (НЕ офис/вечер/color-block!)\n- "три ярких на курорт" → все 3 курортных, можно оставить летние правила\n- "посоветуй макияж/причёску для X" → расширь раздел груминга в каждом образе с конкретикой под X (продукты, бренды, шаги)\n- "дай совет на первое свидание" → добавь блок "💬 Совет для свидания" в каждом образе: парфюм-нота, как зайти, что говорить, чего избегать\n- Любой другой запрос — БУКВАЛЬНО следуй пожеланию\n\nОБЯЗАТЕЛЬНЫЙ ПУНКТ ПАРФЮМ:\nЕсли пожелание касается свидания/вечера/мероприятия/стиля жизни — в каждом образе ОБЯЗАТЕЛЬНО рекомендуй парфюм (одну конкретную нишевую/премиум модель). ВАЖНО: каждый раз выбирай РАЗНЫЕ ароматы, не повторяй одни и те же. Для вдохновения — большой пул на выбор:\n\nМУЖСКИЕ/УНИСЕКС нишевые: Le Labo Santal 33, Le Labo Bergamote 22, Le Labo Rose 31, Maison Margiela Replica Jazz Club, Maison Margiela Replica By the Fireplace, Maison Margiela Replica Sailing Day, Tom Ford Tobacco Vanille, Tom Ford Oud Wood, Tom Ford Grey Vetiver, Tom Ford Neroli Portofino, Byredo Mojave Ghost, Byredo Bal d\'Afrique, Byredo Gypsy Water, Creed Aventus, Creed Silver Mountain Water, Acqua di Parma Colonia, Acqua di Parma Blu Mediterraneo, Diptyque Tam Dao, Diptyque Eau des Sens, Memo Paris Irish Leather, Parfums de Marly Layton, Parfums de Marly Percival, Initio Oud for Greatness, Initio Rehab, Nasomatto Black Afgano, Juliette Has a Gun Not a Perfume, Comme des Garçons Series 3 Incense Kyoto, Serge Lutens Ambre Sultan, Serge Lutens Chergui, Xerjoff Naxos, Xerjoff Alexandria II, Roja Dove Oligarch\n\nЖЕНСКИЕ/УНИСЕКС нишевые: Maison Francis Kurkdjian Baccarat Rouge 540, Maison Francis Kurkdjian Aqua Celestia, Maison Francis Kurkdjian À la Rose, Diptyque Philosykos, Diptyque Do Son, Diptyque Eau Rose, Chloé Atelier des Fleurs Rose Naturelle, Byredo Blanche, Byredo La Tulipe, Frederic Malle Portrait of a Lady, Frederic Malle Musc Ravageur, Frederic Malle Une Fleur de Cassie, Guerlain Spiritueuse Double Vanille, Guerlain Mon Guerlain Bloom of Rose, Penhaligon\'s Empressa, Penhaligon\'s Juniper Sling, Jo Malone Peony & Blush Suede, Jo Malone Wood Sage & Sea Salt, Jo Malone Lime Basil & Mandarin, Annick Goutal Petite Chérie, Memo Paris Inlé, Amouage Reflection Woman, Amouage Honour Woman, Serge Lutens Sa Majesté la Rose, Etat Libre d\'Orange Putain des Palaces, Comme des Garçons Wonderwood, Viktor&Rolf Flowerbomb Nectar, Narciso Rodriguez for Her Musc Noir\n\nВсегда объясняй ПОЧЕМУ этот конкретный аромат подходит к образу/ситуации/характеру человека.\n\nЕсли пожелания нет или они общие (типа "красиво") — следуй стандартной структуре офис/вечер/color-block.`
        : "";
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: `${nameInstruction}CRITICAL OVERRIDE: You MUST generate EXACTLY ${looksCount} look${looksCount > 1 ? "s" : ""} in the "looks" array — no more, no less. Ignore any default number mentioned in your instructions.\n\nUser's Height: ${height} cm. User's Weight: ${weight} kg. Please analyze the attached photo and provide ${looksCount} distinct fashion look${looksCount > 1 ? "s" : ""} based on this person. Use the 2026 fashion trends from the knowledge base.${wishesBlock}${zodiacBlock}` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` } },
          ],
        },
      ];

      // Step 0 (premium): если есть wishes — сначала ищем свежие тренды через Perplexity Sonar
      let trendsContext = "";
      if (wishes) {
        res.write(JSON.stringify({ type: "progress", step: 0.9, text: "Ищем свежие модные тренды по твоему запросу..." }) + "\n");
        try {
          const trendsResp = await fetch(`${POLZA_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${POLZA_API_KEY}` },
            body: JSON.stringify({
              model: "perplexity/sonar",
              messages: [
                { role: "system", content: "Ты — ассистент-исследователь модных трендов. Дай 3–5 коротких пунктов конкретики (что носят, какие вещи, цвета, бренды) по запросу. Только русский, никаких ссылок и markdown. Максимум 600 символов." },
                { role: "user", content: `Найди свежие модные тренды лета 2026 по теме: "${wishes}". Что реально носят сейчас? Какие конкретные вещи, цвета, бренды? Дай 3–5 пунктов конкретики.` },
              ],
              temperature: 0.5,
              max_tokens: 600,
            }),
          });
          if (trendsResp.ok) {
            const td = await trendsResp.json();
            const content = td?.choices?.[0]?.message?.content;
            if (typeof content === "string" && content.trim()) {
              trendsContext = content.trim().slice(0, 1500);
              console.log("[Trends] Got context:", trendsContext.length, "chars");
            }
          }
        } catch (e: any) {
          console.error("[Trends] Failed (non-blocking):", e.message);
        }
      }

      // Step 1: Analyze with Gemini 3.1 Flash Lite
      res.write(JSON.stringify({ type: "progress", step: 1.0, text: "Анализ фото и подбор образов с помощью AI..." }) + "\n");

      // Если есть wishes — temperature чуть выше для креативности, но не настолько чтобы JSON ломался
      const analysisTemp = wishes ? 0.95 : 0.8;

      // Подмешиваем тренды в последнее user-сообщение
      if (trendsContext) {
        const last = messages[messages.length - 1];
        if (last && Array.isArray(last.content)) {
          const textPart = last.content.find((c: any) => c.type === "text");
          if (textPart) {
            textPart.text += `\n\n📡 СВЕЖИЕ ТРЕНДЫ ИЗ ИНТЕРНЕТА (используй эти конкретные идеи):\n${trendsContext}`;
          }
        }
      }

      let analysisData: any;
      let analysisText = "";
      try {
        analysisText = await callPolzaChat({
          model: ANALYSIS_MODEL,
          systemPrompt,
          messages,
          temperature: analysisTemp,
          maxTokens: 8192,
        });

        if (typeof analysisText === "string") {
          analysisData = safeJsonParse(analysisText);
        } else {
          analysisData = analysisText;
        }
      } catch (e: any) {
        clearInterval(heartbeat);
        let msg = e.message;
        if (msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
          msg = "Превышен лимит запросов API. Подождите 1 минуту и попробуйте снова.";
        } else if (msg.includes("API key not valid") || msg.includes("API_KEY_INVALID") || msg.includes("401")) {
          msg = "Введен неверный API ключ. Пожалуйста, проверьте POLZA_API_KEY в настройках.";
        }
        res.write(JSON.stringify({ type: "error", error: "Ошибка AI: " + msg }) + "\n");
        return res.end();
      }

      let { greetingAndAnalysis, bodyTypeSummary, looks } = analysisData;
      let astroReading = analysisData?.astroReading;

      // Fallback: искать astroReading в raw-тексте между маркерами
      if (!astroReading && analysisText) {
        const match = analysisText.match(/⭐ ЗАДАЧА ПЕРСОНАЛЬНОГО ПРЕДСКАЗАНИЯ:([\s\S]*?)(?=\n\n[🎯🌈🌞]|$)/i);
        if (match && match[1]) {
          astroReading = match[1].trim();
          console.log("[Astro] Found astroReading via fallback parsing");
        }
      }

      console.log("[Astro] Final astroReading:", astroReading ? "present (" + astroReading.length + " chars)" : "MISSING");
      console.log("[Astro] analysisData keys:", Object.keys(analysisData));

      if (!looks || !Array.isArray(looks) || looks.length === 0) {
        clearInterval(heartbeat);
        res.write(JSON.stringify({ type: "error", error: "AI не смог сгенерировать образы. Попробуйте еще раз." }) + "\n");
        return res.end();
      }

      res.write(JSON.stringify({ type: "progress", step: 1.5, text: "Анализ и подбор гардероба завершен. Переходим к визуализации..." }) + "\n");

      // Step 2: Generate images with Nano Banana 2 — IN PARALLEL
      res.write(JSON.stringify({ type: "progress", step: 2.0, text: `Визуализация ${looks.length} образов параллельно...` }) + "\n");

      // Track completed images for progress updates
      let completedImages = 0;
      const totalImages = looks.length;

      const looksWithImages = await Promise.all(looks.map(async (look: any, idx: number) => {
        let generatedImageBase64 = null;
        let imageGenerationError = null;

        if (look.editPrompt) {
          let imageDataUrl: string | null = null;
          let lastError = "";
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const fluxPrompt = `High-end fashion editorial photography. Single person only, one subject in frame. ${sanitizeEditPrompt(look.editPrompt)}`;
              imageDataUrl = await generateImageWithFlux(fluxPrompt, referenceImageBase64, mimeType);
              if (imageDataUrl) break;
              lastError = "No image data returned from Flux model.";
            } catch (e: any) {
              lastError = e.message;
              if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
            }
          }
          if (imageDataUrl) {
            generatedImageBase64 = imageDataUrl;
          } else {
            console.error("Failed to generate image for look", look.lookName, lastError);
            let errMsg = lastError;
            if (errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429")) {
              errMsg = "Превышен лимит API для картинок (подождите 1 минуту).";
            }
            imageGenerationError = errMsg;
          }
        } else {
          imageGenerationError = "No editPrompt provided for this look.";
        }

        // Progress update after each image completes
        completedImages++;
        const progressStep = 2.0 + (completedImages / totalImages) * 1.5;
        res.write(JSON.stringify({
          type: "progress",
          step: progressStep,
          text: `Сгенерировано ${completedImages}/${totalImages} образов...`
        }) + "\n");

        return { ...look, image: generatedImageBase64, imageError: imageGenerationError };
      }));

      // Step 3: Send intermediate result with images so user sees greeting + looks immediately
      res.write(JSON.stringify({
        type: "partial_result",
        greetingAndAnalysis,
        bodyTypeSummary,
        astroReading: astroReading || null,
        looks: looksWithImages,
      }) + "\n");

      // Step 4: Build Google Shopping search URLs — универсальный поиск,
      // не привязан к одному магазину, выдаёт товары из десятков площадок РФ
      res.write(JSON.stringify({ type: "progress", step: 4.0, text: "Формируем поисковые ссылки..." }) + "\n");

      const looksWithImagesAndUrls = looksWithImages.map((look: any) => {
        const enrichedItems = (look.items || []).map((item: any) => {
          const query = encodeURIComponent((item.searchQuery || item.name || "").toString());
          return {
            ...item,
            wbUrl: `https://www.wildberries.ru/catalog/0/search.aspx?search=${query}`,
            ozonUrl: `https://www.ozon.ru/search/?text=${query}`,
            ymUrl: `https://market.yandex.ru/search?text=${query}`,
          };
        });
        return { ...look, items: enrichedItems };
      });

      res.write(JSON.stringify({
        type: "result",
        greetingAndAnalysis,
        bodyTypeSummary,
        astroReading: astroReading || null,
        looks: looksWithImagesAndUrls,
      }) + "\n");
      
      clearInterval(heartbeat);
      res.end();

    } catch (error) {
      clearInterval(heartbeat);
      console.error("Error processing image in /api/stylize:", error);
      res.write(JSON.stringify({ type: "error", error: (error as Error).message }) + "\n");
      res.end();
    }
  });

  // Trial endpoint — бесплатный текстовый анализ без генерации картинок
  app.post("/api/trial", upload.array("photos", 3), async (req: Request, res: Response) => {
    try {
      const files = req.files as MulterFile[];
      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "Нужно загрузить фото" });
      }

      const referenceImage = files[0];
      const referenceImageBase64 = referenceImage.buffer.toString("base64");
      const mimeType = referenceImage.mimetype;

      const trialPrompt = `Ты — опытный стилист-эксперт. По фотографии человека дай краткий персональный анализ его внешности и стиля.

ПРОФИЛЬ ВНЕШНОСТИ:
- Определи примерный возраст, тип лица, черты
- Оцени цветотип (времена года)
- Отметь сильные стороны внешности

СТИЛИСТИЧЕСКИЕ РЕКОМЕНДАЦИИ:
- Какие цвета и оттенки тебе подходят больше всего
- Какие фасоны и силуэты подчеркнут достоинства
- Какие ткани и материалы предпочтительны
- 2-3 ключевых совета по гардеробу

РОСТ: ${height} см
ВЕС: ${weight} кг

Ответь ТОЛЬКО текстом на русском языке, без JSON, без списков в квадратных скобках, 3-5 абзацев. Будь конкретным и полезным.`;

      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: trialPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` } },
          ],
        },
      ];

      const analysisText = await callPolzaChat({
        model: ANALYSIS_MODEL,
        systemPrompt: "Ты дружелюбный стилист-консультант. Отвечай ТОЛЬКО текстом, без JSON, без кодовых блоков, без markdown разметки.",
        messages,
        temperature: 0.7,
        maxTokens: 2048,
      });

      // Очищаем ответ от markdown
      let cleanText = typeof analysisText === 'string' ? analysisText : String(analysisText);
      // Убираем все markdown блоки ```...```
      cleanText = cleanText.replace(/```[\w]*\s*/gi, '');
      cleanText = cleanText.replace(/```/gi, '');
      // Убираем **жирный**, *курсив*, # заголовки
      cleanText = cleanText.replace(/\*\*([^*]+)\*\*/g, '$1');
      cleanText = cleanText.replace(/\*([^*]+)\*/g, '$1');
      cleanText = cleanText.replace(/^#{1,6}\s+/gm, '');
      // Убираем списки - и *
      cleanText = cleanText.replace(/^[\s]*[-*]\s+/gm, '• ');
      // Убираем нумерованные списки
      cleanText = cleanText.replace(/^[\s]*\d+\.\s+/gm, '');
      cleanText = cleanText.trim();

      res.json({ greetingAndAnalysis: cleanText || "Спасибо за фото! Ваш стиль уникален — обратитесь к нашим образам для персонализированных рекомендаций." });
    } catch (error) {
      console.error("Error in /api/trial:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Serve production build if available, otherwise use Vite dev middleware
  const distIndexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distIndexPath)) {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    // SPA fallback: any non-API request gets index.html.
    // Using middleware (not "*" route) to be compatible with Express 5 / path-to-regexp v8.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/admin-panel")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Development mode — use Vite middleware
    const vite = await createViteServer({
      root: PROJECT_ROOT,
      server: { middlewareMode: true as any },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
