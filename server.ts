import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

const ANALYSIS_MODEL = "google/gemini-3.1-flash-lite";
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
  const PAYMENTS_FILE = path.join(PROJECT_ROOT, "payments.json");
  const STATS_FILE = path.join(PROJECT_ROOT, "stats.json");
  const PRICES_FILE = path.join(PROJECT_ROOT, "prices.json");

  type PromoEntry = { used: boolean; tier: "standard" | "premium"; createdAt: string };
  type PromoStore = Record<string, PromoEntry>;
  type PaymentEntry = { id: string; tier: string; amount: number; status: string; createdAt: string; ip?: string };
  type StatsData = { totalRequests: number; requestsByDay: Record<string, number>; paymentsByTier: Record<string, number>; userRequests?: Record<string, number> };
  type PricesData = { standard: number; premium: number };

  const loadPromos = (): PromoStore => {
    try { if (fs.existsSync(PROMO_FILE)) return JSON.parse(fs.readFileSync(PROMO_FILE, "utf-8")); } catch {}
    return {};
  };
  const savePromos = (store: PromoStore) => {
    try { fs.writeFileSync(PROMO_FILE, JSON.stringify(store, null, 2)); } catch {}
  };

  const loadPayments = (): PaymentEntry[] => {
    try { if (fs.existsSync(PAYMENTS_FILE)) return JSON.parse(fs.readFileSync(PAYMENTS_FILE, "utf-8")); } catch {}
    return [];
  };
  const savePayments = (list: PaymentEntry[]) => {
    try { fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(list, null, 2)); } catch {}
  };

  const loadStats = (): StatsData => {
    try { if (fs.existsSync(STATS_FILE)) return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8")); } catch {}
    return { totalRequests: 0, requestsByDay: {}, paymentsByTier: { standard: 0, premium: 0 } };
  };
  const saveStats = (s: StatsData) => {
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); } catch {}
  };

  const loadPrices = (): PricesData => {
    try { if (fs.existsSync(PRICES_FILE)) return JSON.parse(fs.readFileSync(PRICES_FILE, "utf-8")); } catch {}
    return { standard: 100, premium: 200 };
  };
  const savePrices = (p: PricesData) => {
    try { fs.writeFileSync(PRICES_FILE, JSON.stringify(p, null, 2)); } catch {}
  };

  const promos = loadPromos();
  const payments = loadPayments();
  const stats = loadStats();
  let prices = loadPrices();

  // Инициализация промокодов из .env (если ещё не созданы)
  const envPromoCodes = (process.env.PROMO_CODES || "").split(",").filter(Boolean);
  for (const code of envPromoCodes) {
    const upperCode = code.trim().toUpperCase();
    if (!promos[upperCode]) {
      promos[upperCode] = { used: false, tier: "standard", createdAt: new Date().toISOString() };
    }
  }
  if (envPromoCodes.length > 0) savePromos(promos);

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

  app.use(helmet({ contentSecurityPolicy: false }));

  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  app.use(cors(allowedOrigin === "*" ? undefined : { origin: allowedOrigin }));
  app.use(express.json());

  const stylizeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: { error: "Слишком много запросов. Попробуйте через час." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/stylize", stylizeLimiter);

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

  app.get("/api/payments-log", (req: Request, res: Response) => {
    const secret = (req.headers["x-admin-secret"] || req.query.secret || "").toString();
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "forbidden" });
    const list = loadPayments();
    const total = list.reduce((sum, p) => sum + (p.status === "succeeded" ? p.amount : 0), 0);
    res.json({ total: list.length, totalRevenue: total, payments: list.slice().reverse() });
  });

  app.get("/api/stats-data", (req: Request, res: Response) => {
    const secret = (req.headers["x-admin-secret"] || req.query.secret || "").toString();
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "forbidden" });
    res.json(loadStats());
  });

  app.get("/api/get-prices", (_req: Request, res: Response) => {
    res.json(loadPrices());
  });

  app.post("/api/set-prices", (req: Request, res: Response) => {
    const secret = (req.headers["x-admin-secret"] || req.body.secret || "").toString();
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "forbidden" });
    const standard = parseInt(req.body.standard, 10);
    const premium = parseInt(req.body.premium, 10);
    if (!standard || !premium || standard < 1 || premium < 1) return res.status(400).json({ error: "Неверные цены" });
    prices = { standard, premium };
    savePrices(prices);
    res.json({ ok: true, prices });
  });

  // Реквизиты
  app.get("/rekvizity", (_req: Request, res: Response) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Реквизиты — Stilist AI</title>
  <style>
    body { font-family: Georgia, serif; background: #1a1a1a; color: #e8dcc8; max-width: 680px; margin: 60px auto; padding: 0 24px; }
    h1 { font-size: 1.6rem; color: #c9a84c; margin-bottom: 8px; }
    h2 { font-size: 1rem; color: #c9a84c; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 36px; }
    p { margin: 6px 0; line-height: 1.7; }
    a { color: #c9a84c; text-decoration: none; }
    .back { display: inline-block; margin-top: 40px; font-size: 0.9rem; opacity: 0.7; }
    .back:hover { opacity: 1; }
  </style>
</head>
<body>
  <h1>Реквизиты</h1>
  <p>Сервис «Stilist AI» — <strong>stilist-ai.ru</strong></p>

  <h2>Исполнитель</h2>
  <p>Самозанятый: <strong>Черданцев Андрей Владимирович</strong></p>
  <p>ИНН: <strong>222304889746</strong></p>
  <p>Место осуществления деятельности: <strong>г. Барнаул</strong></p>

  <h2>Контакты</h2>
  <p>Email: <a href="mailto:gesper2004@mail.ru">gesper2004@mail.ru</a></p>
  <p>Телефон: <a href="tel:+79588481313">+7 958 848-13-13</a></p>

  <a class="back" href="/">← На главную</a>
</body>
</html>`);
  });

  // Публичная оферта
  app.get("/oferta", (_req: Request, res: Response) => {
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Публичная оферта — Stilist AI</title>
  <style>
    body { font-family: Georgia, serif; background: #1a1a1a; color: #e8dcc8; max-width: 680px; margin: 60px auto; padding: 0 24px; }
    h1 { font-size: 1.6rem; color: #c9a84c; margin-bottom: 8px; }
    h2 { font-size: 1rem; color: #c9a84c; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 36px; }
    p, li { margin: 6px 0; line-height: 1.7; }
    ul { padding-left: 20px; }
    a { color: #c9a84c; text-decoration: none; }
    .back { display: inline-block; margin-top: 40px; font-size: 0.9rem; opacity: 0.7; }
    .back:hover { opacity: 1; }
    .date { font-size: 0.85rem; opacity: 0.6; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Публичная оферта</h1>
  <p class="date">Дата вступления в силу: 08 мая 2025 г.</p>

  <p>Настоящий документ является публичной офертой самозанятого <strong>Черданцева Андрея Владимировича</strong> (ИНН 222304889746, г. Барнаул) об оказании услуг сервиса «Stilist AI» (stilist-ai.ru) и адресован любому физическому лицу.</p>

  <h2>1. Предмет договора</h2>
  <p>Исполнитель оказывает Пользователю услуги AI-стилиста: анализ фотографий и генерацию персональных рекомендаций по образам на основе загруженных изображений.</p>

  <h2>2. Акцепт оферты</h2>
  <p>Оплата любого тарифа («Стандарт» или «Премиум») означает полное и безоговорочное принятие условий настоящей оферты.</p>

  <h2>3. Стоимость услуг</h2>
  <ul>
    <li>Тариф «Стандарт» — 100 рублей (3 образа)</li>
    <li>Тариф «Премиум» — 200 рублей (до 5 образов, расширенные рекомендации)</li>
  </ul>

  <h2>4. Порядок оплаты</h2>
  <p>Оплата производится онлайн через платёжный сервис ЮKassa. Доступ к результатам предоставляется сразу после подтверждения оплаты.</p>

  <h2>5. Возврат денежных средств</h2>
  <p>В случае если услуга не была оказана по техническим причинам на стороне Исполнителя, Пользователь вправе обратиться за возвратом на email <a href="mailto:gesper2004@mail.ru">gesper2004@mail.ru</a> в течение 14 дней. Возврат осуществляется в течение 7 рабочих дней.</p>

  <h2>6. Ограничение ответственности</h2>
  <p>Рекомендации сервиса носят информационный характер и не являются профессиональной консультацией. Исполнитель не несёт ответственности за решения, принятые Пользователем на их основе.</p>

  <h2>7. Персональные данные</h2>
  <p>Загружаемые фотографии используются исключительно для генерации образов в рамках одной сессии и не хранятся на серверах Исполнителя после завершения обработки.</p>

  <h2>8. Контакты для связи</h2>
  <p>Email: <a href="mailto:gesper2004@mail.ru">gesper2004@mail.ru</a></p>
  <p>Телефон: <a href="tel:+79588481313">+7 958 848-13-13</a></p>

  <a class="back" href="/">← На главную</a>
</body>
</html>`);
  });

  // Admin page
  app.get("/api/admin", (req: Request, res: Response) => {
    const secret = (req.query.secret || "").toString();
    if (secret !== ADMIN_SECRET) {
      return res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px">
        <h2>Введите пароль администратора</h2>
        <form method="GET" action="/api/admin">
          <input name="secret" type="password" placeholder="Пароль" style="padding:8px;font-size:16px;width:200px">
          <button type="submit" style="padding:8px 16px;margin-left:8px">Войти</button>
        </form></body></html>`);
    }
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Админ — Stilist AI</title>
<style>
  *{box-sizing:border-box}
  body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;background:#f9f7f3}
  h1{font-size:24px;margin-bottom:8px}
  .tabs{display:flex;gap:8px;margin-bottom:24px;border-bottom:2px solid #e0dbd0;padding-bottom:0}
  .tab{padding:10px 18px;cursor:pointer;border-radius:8px 8px 0 0;font-size:14px;font-weight:600;color:#888;border:2px solid transparent;border-bottom:none;margin-bottom:-2px;background:#f9f7f3}
  .tab.active{color:#1a1a1a;border-color:#e0dbd0;background:#fff}
  .panel{display:none}.panel.active{display:block}
  .card{background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  label{display:block;margin-bottom:6px;font-size:14px;color:#555}
  select,input[type=number],input[type=text]{padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-right:8px}
  button{padding:10px 20px;background:#c9a84c;color:#1a1a1a;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#b8973b}
  .btn-sm{padding:6px 14px;font-size:13px}
  .btn-secondary{background:#1a1a1a;color:#fff}.btn-secondary:hover{background:#333}
  pre{background:#f0ece4;padding:16px;border-radius:8px;font-size:13px;line-height:1.8;white-space:pre-wrap;word-break:break-all}
  .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:600}
  .tag-ok{background:#d4edda;color:#1a6b2a}.tag-used{background:#f8d7da;color:#721c24}
  .tag-blue{background:#cce5ff;color:#004085}.tag-gray{background:#e2e3e5;color:#383d41}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px;border-bottom:2px solid #eee;color:#888;font-weight:600}
  td{padding:8px;border-bottom:1px solid #f0ece4}
  .mono{font-family:monospace;letter-spacing:.05em;font-weight:700}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:16px}
  .stat-box{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08);text-align:center}
  .stat-box .num{font-size:2rem;font-weight:700;color:#c9a84c}
  .stat-box .lbl{font-size:12px;color:#888;margin-top:4px}
</style>
</head>
<body>
<h1>⚙️ Панель администратора</h1>

<div class="tabs">
  <div class="tab active" onclick="showTab('promo')">🎟 Промокоды</div>
  <div class="tab" onclick="showTab('payments')">💳 Платежи</div>
  <div class="tab" onclick="showTab('stats')">📊 Статистика</div>
  <div class="tab" onclick="showTab('prices')">💰 Цены</div>
</div>

<!-- ПРОМОКОДЫ -->
<div id="tab-promo" class="panel active">
  <div class="card">
    <label>Сгенерировать одноразовые коды:</label>
    <select id="tier"><option value="standard">Стандарт</option><option value="premium">Премиум</option></select>
    <input type="number" id="count" value="10" min="1" max="100" style="width:70px">
    <button onclick="generate()">Создать коды</button>
    <pre id="result" style="display:none;margin-top:16px"></pre>
    <button id="copyBtn" onclick="copyAll()" style="display:none;margin-top:8px" class="btn-secondary">Скопировать все</button>
  </div>
  <div class="card">
    <label>Все коды: <span id="stats" style="color:#888"></span></label>
    <button onclick="loadList()" class="btn-secondary btn-sm" style="margin-bottom:16px">Обновить</button>
    <div id="list"></div>
  </div>
</div>

<!-- ПЛАТЕЖИ -->
<div id="tab-payments" class="panel">
  <div class="card">
    <label>История платежей: <span id="pay-stats" style="color:#888"></span></label>
    <button onclick="loadPayments()" class="btn-secondary btn-sm" style="margin-bottom:16px">Обновить</button>
    <div id="pay-list"></div>
  </div>
</div>

<!-- СТАТИСТИКА -->
<div id="tab-stats" class="panel">
  <div class="stat-grid" id="stat-grid"></div>
  <div class="card">
    <label>Запросов по дням:</label>
    <div id="days-table"></div>
  </div>
</div>

<!-- ЦЕНЫ -->
<div id="tab-prices" class="panel">
  <div class="card">
    <label>Тариф Стандарт (₽):</label>
    <input type="number" id="price-std" min="1" style="width:120px">
    <br><br>
    <label>Тариф Премиум (₽):</label>
    <input type="number" id="price-prem" min="1" style="width:120px">
    <br><br>
    <button onclick="savePrices()">Сохранить цены</button>
    <span id="price-msg" style="margin-left:12px;color:#1a6b2a;font-weight:600"></span>
  </div>
</div>

<script>
const secret = ${JSON.stringify(secret)};

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'payments') loadPayments();
  if (name === 'stats') loadStats();
  if (name === 'prices') loadPrices();
}

// ПРОМОКОДЫ
async function generate() {
  const tier = document.getElementById('tier').value;
  const count = document.getElementById('count').value;
  const r = await fetch('/api/generate-promo', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({secret, tier, count})
  });
  const d = await r.json();
  const pre = document.getElementById('result');
  pre.textContent = d.codes.join('\\n');
  pre.style.display = 'block';
  document.getElementById('copyBtn').style.display = 'inline-block';
  loadList();
}
function copyAll() {
  navigator.clipboard.writeText(document.getElementById('result').textContent).then(() => alert('Скопировано!'));
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

// ПЛАТЕЖИ
async function loadPayments() {
  const r = await fetch('/api/payments-log?secret=' + encodeURIComponent(secret));
  const d = await r.json();
  document.getElementById('pay-stats').textContent = d.total + ' платежей, выручка: ' + d.totalRevenue + ' ₽';
  if (!d.payments.length) { document.getElementById('pay-list').innerHTML = '<p style="color:#aaa">Платежей пока нет</p>'; return; }
  const rows = d.payments.map(p =>
    '<tr><td class="mono" style="font-size:11px">' + p.id + '</td><td>' +
    (p.tier === 'premium' ? 'Премиум' : 'Стандарт') + '</td><td>' + p.amount + ' ₽</td><td>' +
    (p.status === 'succeeded' ? '<span class="tag tag-ok">Оплачен</span>' : '<span class="tag tag-gray">' + p.status + '</span>') +
    '</td><td style="color:#aaa">' + (p.createdAt ? p.createdAt.slice(0,16).replace('T',' ') : '') + '</td></tr>'
  ).join('');
  document.getElementById('pay-list').innerHTML = '<table><tr><th>ID</th><th>Тариф</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr>' + rows + '</table>';
}

// СТАТИСТИКА
async function loadStats() {
  const r = await fetch('/api/stats-data?secret=' + encodeURIComponent(secret));
  const d = await r.json();
  document.getElementById('stat-grid').innerHTML =
    '<div class="stat-box"><div class="num">' + (d.totalRequests||0) + '</div><div class="lbl">Всего запросов</div></div>' +
    '<div class="stat-box"><div class="num">' + (d.paymentsByTier?.standard||0) + '</div><div class="lbl">Оплат Стандарт</div></div>' +
    '<div class="stat-box"><div class="num">' + (d.paymentsByTier?.premium||0) + '</div><div class="lbl">Оплат Премиум</div></div>';
  const days = Object.entries(d.requestsByDay||{}).sort((a,b) => b[0].localeCompare(a[0])).slice(0,14);
  if (days.length) {
    const rows = days.map(([day,cnt]) => '<tr><td>' + day + '</td><td>' + cnt + ' запросов</td></tr>').join('');
    document.getElementById('days-table').innerHTML = '<table><tr><th>Дата</th><th>Запросов</th></tr>' + rows + '</table>';
  } else {
    document.getElementById('days-table').innerHTML = '<p style="color:#aaa">Данных пока нет</p>';
  }
}

// ЦЕНЫ
async function loadPrices() {
  const r = await fetch('/api/get-prices');
  const d = await r.json();
  document.getElementById('price-std').value = d.standard;
  document.getElementById('price-prem').value = d.premium;
}
async function savePrices() {
  const standard = document.getElementById('price-std').value;
  const premium = document.getElementById('price-prem').value;
  const r = await fetch('/api/set-prices', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({secret, standard, premium})
  });
  const d = await r.json();
  document.getElementById('price-msg').textContent = d.ok ? '✓ Сохранено' : (d.error || 'Ошибка');
  setTimeout(() => document.getElementById('price-msg').textContent = '', 3000);
}

loadList();
</script>
</body></html>`);
  });

  // Payment endpoints
  const PAYMENT_MODE = process.env.PAYMENT_MODE || "test";

  app.post("/api/create-payment", async (req: Request, res: Response) => {
    try {
      const { tier } = req.body;
      const currentPrices = loadPrices();
      const amount = tier === "premium" ? currentPrices.premium : currentPrices.standard;
      const paymentId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let qrData = "";
      if (PAYMENT_MODE === "test") {
        qrData = await QRCode.toDataURL(`https://qr.nspk.ru/test-payment-${paymentId}?sum=${amount}`);
      } else {
        qrData = await QRCode.toDataURL(`https://yookassa.ru/payment/${paymentId}`);
      }
      // Log payment
      const paymentsList = loadPayments();
      paymentsList.push({ id: paymentId, tier: tier || "standard", amount, status: "created", createdAt: new Date().toISOString(), ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim() });
      savePayments(paymentsList);
      res.json({ paymentId, qrCode: qrData, amount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/check-payment", (req: Request, res: Response) => {
    const { paymentId } = req.body;
    if (!paymentId) return res.json({ status: "pending" });
    if (PAYMENT_MODE === "test") {
      // Update payment status to succeeded
      const paymentsList = loadPayments();
      const p = paymentsList.find(x => x.id === paymentId);
      if (p && p.status !== "succeeded") {
        p.status = "succeeded";
        savePayments(paymentsList);
        const s = loadStats();
        s.paymentsByTier[p.tier] = (s.paymentsByTier[p.tier] || 0) + 1;
        saveStats(s);
      }
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

      // Track request stats and user diversity
      const s = loadStats();
      s.totalRequests = (s.totalRequests || 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      s.requestsByDay[today] = (s.requestsByDay[today] || 0) + 1;

      // Для разнообразия образов при повторных обращениях
      const userId = (req.body.userId || "").toString().trim();
      const userRequestCount = userId ? ((s.userRequests || {})[userId] || 0) + 1 : 1;
      if (userId) {
        s.userRequests = s.userRequests || {};
        s.userRequests[userId] = userRequestCount;
      }
      saveStats(s);

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
      const birthRegion = (req.body.birthRegion || "").toString().trim();
      const birthCity = (req.body.birthCity || "").toString().trim();
      const birthTime = (req.body.birthTime || "").toString().trim();
      let zodiacBlock = "";
      if (birthDateRaw) {
        const [d, m] = birthDateRaw.split(".").map(Number);
        if (d && m) {
          const sign = getZodiacSign(d, m);
          const now = new Date();
          const monthName = now.toLocaleString("ru-RU", { month: "long" });
          const year = now.getFullYear();
          zodiacBlock = zodiacBlock.replace("Текущий месяц: ${monthName} ${year}", `Текущий месяц: ${monthName} ${year}
${birthRegion || birthCity || birthTime ? `Место рождения: ${birthRegion || ""}${birthCity ? (birthRegion ? ", " : "") + birthCity : ""}${birthTime ? ", время: " + birthTime : ""}` : ""}
${birthRegion && birthCity && birthTime ? "✅ Все данные для точного гороскопа получены!" : "⚠️ Для полного гороскопа нужны: область, город и время рождения."}`);
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
            { type: "text", text: `${nameInstruction}CRITICAL OVERRIDE: You MUST generate EXACTLY ${looksCount} look${looksCount > 1 ? "s" : ""} in the "looks" array — no more, no less. Ignore any default number mentioned in your instructions.${userRequestCount > 1 ? `\n\n⚠️ IMPORTANT: This is user request #${userRequestCount}. To ensure variety, GENERATE COMPLETELY DIFFERENT STYLES from previous requests. Vary: silhouettes, color palettes, moods, occasions, formality levels. NO repeating similar looks from previous sessions.` : ""}\n\nUser's Height: ${height} cm. User's Weight: ${weight} kg. Please analyze the attached photo and provide ${looksCount} distinct fashion look${looksCount > 1 ? "s" : ""} based on this person. Use the 2026 fashion trends from the knowledge base.${wishesBlock}${zodiacBlock}` },
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
      try {
        const analysisText = await callPolzaChat({
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

      const { greetingAndAnalysis, bodyTypeSummary, astroReading, looks } = analysisData;

      if (!looks || !Array.isArray(looks) || looks.length === 0) {
        clearInterval(heartbeat);
        res.write(JSON.stringify({ type: "error", error: "AI не смог сгенерировать образы. Попробуйте еще раз." }) + "\n");
        return res.end();
      }

      res.write(JSON.stringify({ type: "progress", step: 1.5, text: "Анализ и подбор гардероба завершен. Переходим к визуализации..." }) + "\n");

      // Step 2: Generate images with Nano Banana 2 — IN PARALLEL
      res.write(JSON.stringify({ type: "progress", step: 2.0, text: `Визуализация ${looks.length} образов параллельно...` }) + "\n");

      const looksWithImages = await Promise.all(looks.map(async (look: any) => {
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

  // --- TRIAL: бесплатный анализ без картинок ---
  app.post("/api/stylize-trial", upload.array("images", 1), async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let heartbeat: ReturnType<typeof setInterval> | undefined;

    try {
      res.write(JSON.stringify({ type: "progress", step: 0.5, text: "Фотография получена..." }) + "\n");

      const s = loadStats();
      s.totalRequests = (s.totalRequests || 0) + 1;
      const today = new Date().toISOString().slice(0, 10);
      s.requestsByDay[today] = (s.requestsByDay[today] || 0) + 1;
      saveStats(s);

      const files = req.files as MulterFile[];
      if (!files || files.length === 0) {
        res.write(JSON.stringify({ type: "error", error: "Загрузите фото" }) + "\n");
        return res.end();
      }

      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";
      const userName = (req.body.userName || "").toString().trim().slice(0, 50);
      const nameInstruction = userName
        ? `Обращайся к пользователю по имени "${userName}" в приветствии. `
        : "";

      if (!POLZA_API_KEY) {
        res.write(JSON.stringify({ type: "error", error: "API ключ не настроен" }) + "\n");
        return res.end();
      }

      heartbeat = setInterval(() => {
        res.write(JSON.stringify({ type: "heartbeat" }) + "\n");
      }, 15000);

      res.write(JSON.stringify({ type: "progress", step: 0.8, text: "Анализ фото и подбор образа..." }) + "\n");

      const referenceImage = files[0];
      const referenceImageBase64 = referenceImage.buffer.toString("base64");
      const mimeType = referenceImage.mimetype;

      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${nameInstruction}User's Height: ${height} cm. User's Weight: ${weight} kg. Please analyze the attached photo and provide EXACTLY 1 fashion look in the "looks" array — no more, no less. Use the 2026 fashion trends from the knowledge base. Generate a single best look for this person.`,
            },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` } },
          ],
        },
      ];

      let analysisData: any;
      try {
        const analysisText = await callPolzaChat({
          model: ANALYSIS_MODEL,
          systemPrompt,
          messages,
          temperature: 0.85,
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
        if (msg.includes("Quota") || msg.includes("429")) {
          msg = "Превышен лимит. Попробуйте через минуту.";
        }
        res.write(JSON.stringify({ type: "error", error: "Ошибка AI: " + msg }) + "\n");
        return res.end();
      }

      const { greetingAndAnalysis, looks } = analysisData;

      if (!looks || !Array.isArray(looks) || looks.length === 0) {
        clearInterval(heartbeat);
        res.write(JSON.stringify({ type: "error", error: "AI не смог сгенерировать образ. Попробуйте ещё раз." }) + "\n");
        return res.end();
      }

      res.write(JSON.stringify({ type: "progress", step: 1.0, text: "Анализ готов!" }) + "\n");

      // Убираем картинки из образов (trial — без генерации)
      const trialLooks = looks.slice(0, 1).map((look: any) => {
        const { image: _img, imageUrl: _imgUrl, editPrompt: _ep, ...lookWithoutImage } = look;
        const items = (look.items || []).map((item: any) => {
          const { imageUrl: _iu, productUrl: _pu, ...itemWithoutImage } = item;
          return {
            ...itemWithoutImage,
            wbUrl: item.wbUrl || `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(item.searchQuery || item.name || "")}`,
            ozonUrl: item.ozonUrl || `https://www.ozon.ru/search/?text=${encodeURIComponent(item.searchQuery || item.name || "")}`,
            ymUrl: item.ymUrl || `https://market.yandex.ru/search?text=${encodeURIComponent(item.searchQuery || item.name || "")}`,
          };
        });
        return { ...lookWithoutImage, image: null, items };
      });

      res.write(JSON.stringify({ type: "result", greetingAndAnalysis, looks: trialLooks }) + "\n");
      clearInterval(heartbeat);
      res.end();

    } catch (error) {
      clearInterval(heartbeat);
      console.error("Error in /api/stylize-trial:", error);
      res.write(JSON.stringify({ type: "error", error: (error as Error).message }) + "\n");
      res.end();
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
      if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/admin-panel") || req.path === "/rekvizity" || req.path === "/oferta") return next();
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
