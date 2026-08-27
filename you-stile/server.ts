import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const YooCheckout = require("yookassa");

type MulterFile = Express.Multer.File;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const PROJECT_ROOT = __dirname;

// YooKassa client
const yooKassa = new YooCheckout({
  shopId: process.env.YOOKASSA_SHOP_ID || "",
  secretKey: process.env.YOOKASSA_SECRET_KEY || "",
});

// Stats helpers — event-based with timestamps
interface StatsEvent { type: "visit" | "paid_standard" | "paid_premium" | "paid_promo_standard" | "paid_promo_premium"; ts: string }
interface StatsData { events: StatsEvent[]; standardPrice: number; premiumPrice: number }

const statsPath = path.join(PROJECT_ROOT, "data", "stats.json");
const RESULTS_DIR = path.join(PROJECT_ROOT, "data", "results");
const ORDERS_DIR = path.join(PROJECT_ROOT, "data", "orders");
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_DIR)) fs.mkdirSync(ORDERS_DIR, { recursive: true });
const RESULTS_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours
const UNFINISHED_ORDER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type OrderStatus = "awaiting_payment" | "awaiting_input" | "processing" | "partial" | "ready" | "failed" | "expired";
interface OrderRecord {
  paymentId: string;
  tier: "standard" | "premium";
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  startedAt?: string;
  completedAt?: string;
  unfinishedExpiresAt?: string;
  resultExpiresAt?: string;
  expectedLooks?: number;
  completedLooks?: number;
  error?: string | null;
}

const activeOrderIds = new Set<string>();
const activeRetryKeys = new Set<string>();
const activePromoCodes = new Set<string>();
const sanitizeOrderId = (value: unknown) => String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
const orderFile = (paymentId: string) => path.join(ORDERS_DIR, `${sanitizeOrderId(paymentId)}.json`);
function readOrder(paymentId: string): OrderRecord | null {
  const id = sanitizeOrderId(paymentId);
  if (!id) return null;
  try {
    const file = orderFile(id);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
  } catch {
    return null;
  }
}
function writeJsonAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function saveOrder(order: OrderRecord): OrderRecord {
  const normalized = { ...order, paymentId: sanitizeOrderId(order.paymentId), updatedAt: new Date().toISOString() };
  writeJsonAtomic(orderFile(normalized.paymentId), normalized);
  return normalized;
}
function updateOrder(paymentId: string, patch: Partial<OrderRecord>): OrderRecord | null {
  const current = readOrder(paymentId);
  if (!current) return null;
  return saveOrder({ ...current, ...patch, paymentId: current.paymentId });
}

function cleanupOldResults(): number {
  let removed = 0;
  const now = Date.now();
  if (fs.existsSync(ORDERS_DIR)) {
    for (const entry of fs.readdirSync(ORDERS_DIR)) {
      if (!entry.endsWith(".json")) continue;
      const id = entry.slice(0, -5);
      const order = readOrder(id);
      if (!order || order.status === "expired") continue;
      const expiresAt = order.resultExpiresAt || order.unfinishedExpiresAt;
      if (!expiresAt || new Date(expiresAt).getTime() > now) continue;
      const dir = path.join(RESULTS_DIR, id);
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        saveOrder({ ...order, status: "expired", error: null });
        removed++;
      } catch {}
    }
  }
  if (!fs.existsSync(RESULTS_DIR)) return removed;
  for (const entry of fs.readdirSync(RESULTS_DIR)) {
    const dir = path.join(RESULTS_DIR, entry);
    try {
      if (readOrder(entry)) continue;
      const st = fs.statSync(dir);
      if (!st.isDirectory()) continue;
      if (now - st.mtimeMs > RESULTS_TTL_MS) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed++;
      }
    } catch {}
  }
  if (removed > 0) console.log(`[cleanup] Expired ${removed} old order result folders`);
  return removed;
}
cleanupOldResults();
// A process restart interrupts in-memory API calls. Preserve checkpoints and expose
// the order as retryable instead of leaving it permanently stuck in "processing".
for (const entry of fs.readdirSync(ORDERS_DIR)) {
  if (!entry.endsWith(".json")) continue;
  const order = readOrder(entry.slice(0, -5));
  if (order?.status === "processing") {
    const complete = !!order.expectedLooks && (order.completedLooks || 0) >= order.expectedLooks;
    saveOrder({
      ...order,
      status: complete ? "ready" : order.completedLooks ? "partial" : "failed",
      completedAt: complete ? new Date().toISOString() : order.completedAt,
      resultExpiresAt: complete ? new Date(Date.now() + RESULTS_TTL_MS).toISOString() : order.resultExpiresAt,
      error: complete ? null : "Генерация была прервана перезапуском сервера. Отсутствующие фото можно повторить.",
    });
  }
}
setInterval(cleanupOldResults, 60 * 60 * 1000); // every hour
let _statsCache: StatsData | null = null;
function loadStats(): StatsData {
  if (_statsCache) return _statsCache;
  try {
    if (fs.existsSync(statsPath)) {
      const raw = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
      if (raw.events) { _statsCache = raw; return raw; }
      const events: StatsEvent[] = [];
      for (let i = 0; i < (raw.visits || 0); i++) events.push({ type: "visit", ts: new Date().toISOString() });
      for (let i = 0; i < (raw.paidStandardSales || raw.standardSales || 0); i++) events.push({ type: "paid_standard", ts: new Date().toISOString() });
      for (let i = 0; i < (raw.paidPremiumSales || raw.premiumSales || 0); i++) events.push({ type: "paid_premium", ts: new Date().toISOString() });
      _statsCache = { events, standardPrice: raw.standardPrice || 100, premiumPrice: raw.premiumPrice || 200 };
      return _statsCache;
    }
  } catch {}
  _statsCache = { events: [], standardPrice: 100, premiumPrice: 200 };
  return _statsCache;
}
function saveStats(stats: StatsData) {
  _statsCache = stats;
  const dir = path.dirname(statsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Prune events older than 1 year
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  stats.events = stats.events.filter(e => new Date(e.ts) >= cutoff);
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
}
function incVisit() {
  const stats = loadStats();
  stats.events.push({ type: "visit", ts: new Date().toISOString() });
  saveStats(stats);
}
function incPaidSale(tier: string) {
  const stats = loadStats();
  stats.events.push({ type: tier === "premium" ? "paid_premium" : "paid_standard", ts: new Date().toISOString() });
  saveStats(stats);
}
function incPromoSale(tier: string) {
  const stats = loadStats();
  stats.events.push({ type: tier === "premium" ? "paid_promo_premium" : "paid_promo_standard", ts: new Date().toISOString() });
  saveStats(stats);
}
function computeStats(stats: StatsData, period?: string) {
  let cutoff: Date | null = null;
  const now = new Date();
  if (period === "today") cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (period === "week") cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (period === "month") cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  const filtered = cutoff ? stats.events.filter(e => new Date(e.ts) >= cutoff) : stats.events;
  const visits = filtered.filter(e => e.type === "visit").length;
  const paidStandardSales = filtered.filter(e => e.type === "paid_standard").length;
  const paidPremiumSales = filtered.filter(e => e.type === "paid_premium").length;
  const promoStandardSales = filtered.filter(e => e.type === "paid_promo_standard").length;
  const promoPremiumSales = filtered.filter(e => e.type === "paid_promo_premium").length;
  return { visits, paidStandardSales, paidPremiumSales, promoStandardSales, promoPremiumSales, promoRedemptions: promoStandardSales + promoPremiumSales, standardPrice: stats.standardPrice, premiumPrice: stats.premiumPrice, revenue: paidStandardSales * stats.standardPrice + paidPremiumSales * stats.premiumPrice };
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
// Seedream 5 Pro — генерация изображений с сохранением лица и идентичности пользователя
const IMAGE_MODEL = "seedream/5-pro-text-to-image";

function getOccasionStyleGuide(wishes: string): string {
  const w = wishes.toLowerCase();
  if (w.includes("пляж") || w.includes("отдых") || w.includes("курорт") || w.includes("яхта"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ОТДЫХА/ПЛЯЖА — ИГНОРИРУЙ стандартную структуру офис/вечер/color-block. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. RESORT CHIC: яркий этнический принт (фуксия/кобальт/терракот), рубашка+шорты или платье-рубашка, соломенная шляпа, зеркальные очки, эспадрильи, плетёная сумка. Вайб: Санторини, закат, "вау какая стильная".\n2. BEACH CLUB LUXE: монохромный яркий купальный look (лимонный/коралловый/аква), парео или льняные брюки, золотые украшения-ракушки, сандалии на платформе, oversized соломенная шляпа. Вайб: Ибица, яхта, глянцевый журнал.\n3. TROPICAL MAXIMALISM: смелый цветочный или анималистичный принт, сатиновое мини или макси платье, яркие аксессуары, цветные линзы, босоножки. Вайб: Бали, тропики, Instagram-perfect.`;
  if (w.includes("свидание") || w.includes("романтич"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ СВИДАНИЯ — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. ROMANTIC EVENING: элегантное платье миди в глубоком цвете (бордо/изумруд/полночный синий), тонкие украшения, каблук, клатч. Вайб: первое свидание, ресторан, "она потрясающая".\n2. CHIC & PLAYFUL: стильный комплект — шёлковая блуза + широкие брюки или юбка миди, интересный аксессуар как акцент, лоферы или мюли. Вайб: кофе перерастает в ужин, непринуждённо и красиво.\n3. BOLD DATE LOOK: смелый монохромный total look или statement платье, яркая помада, эффектные серьги. Вайб: она точно запомнится, уверенность и шарм.`;
  if (w.includes("ресторан"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ РЕСТОРАНА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. CLASSIC ELEGANCE: платье-футляр или костюм в нейтральном/глубоком цвете, жемчуг или тонкие украшения, каблук, маленькая сумочка. Вайб: fine dining, безупречно.\n2. MODERN CHIC: шёлковая блуза + брюки с высокой талией, интересный пояс, лоферы или мюли, statement серьги. Вайб: стильный ресторан, уверенная женщина.\n3. GLAMOUR NIGHT: вечернее платье с деталями (разрез/открытая спина/блеск), эффектные украшения, вечерняя сумочка. Вайб: особый повод, все взгляды на неё.`;
  if (w.includes("вечеринк") || w.includes("клуб") || w.includes("ночная"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ВЕЧЕРИНКИ/КЛУБА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. PARTY QUEEN: мини-платье с блеском или пайетками, высокие каблуки, bold макияж, клатч. Вайб: VIP-вечеринка, все смотрят.\n2. COOL GIRL NIGHT: кожаные брюки + шёлковый топ или корсет, ботильоны, statement украшения. Вайб: клуб, уверенность, стиль.\n3. NEON BOLD: яркий неоновый или металлический look, смелый цвет, эффектный силуэт. Вайб: фестиваль или ночной клуб, запоминающийся образ.`;
  if (w.includes("свадьб") || w.includes("торжеств") || w.includes("выпускн"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ТОРЖЕСТВА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. TIMELESS GLAMOUR: вечернее платье в пол (шампань/пудра/айвори), тонкие украшения с камнями, каблук, элегантная причёска. Вайб: свадьба, безупречная гостья.\n2. MODERN FORMAL: стильный костюм или платье-миди в насыщенном цвете (изумруд/сапфир/рубин), эффектные украшения. Вайб: торжество, запоминающийся образ.\n3. ROMANTIC PRINCESS: пышное или A-line платье с деталями (кружево/вышивка/объём), нежные украшения, романтичная причёска. Вайб: выпускной или свадьба, сказочный образ.`;
  if (w.includes("офис") || w.includes("деловая") || w.includes("бизнес"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ОФИСА/БИЗНЕСА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. POWER SUIT: идеально скроенный костюм (серый/тёмно-синий/кремовый), шёлковая блуза, каблук или лоферы, кожаная сумка. Вайб: CEO, авторитет и стиль.\n2. QUIET LUXURY OFFICE: монохромный look в нейтральных тонах, кашемировый джемпер + брюки, минималистичные украшения, дорогие детали. Вайб: Quiet Luxury, дорого без лишнего.\n3. SMART CREATIVE: пиджак с интересной деталью + брюки или юбка миди, акцентный аксессуар, лоферы. Вайб: творческий офис, стильно и профессионально.`;
  if (w.includes("спорт") || w.includes("фитнес"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ СПОРТА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. PREMIUM ATHLEISURE: дизайнерский спортивный комплект (Lululemon/Alo/Vuori уровень), монохромный или с акцентом, кроссовки премиум. Вайб: из спортзала прямо на кофе, безупречно.\n2. SPORT CHIC: стильный тренировочный look с модными деталями, яркий акцент, функционально и красиво. Вайб: фитнес-блогер, вдохновляет.\n3. OUTDOOR ACTIVE: premium outdoor look (беговые брюки + куртка + кроссовки), динамичная поза. Вайб: утренняя пробежка в парке, энергия и здоровье.`;
  if (w.includes("прогулк") || w.includes("кафе") || w.includes("шопинг") || w.includes("casual"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ПРОГУЛКИ/КАФЕ — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. EFFORTLESS CHIC: джинсы идеального кроя + шёлковая блуза или тонкий джемпер, лоферы, маленькая сумка. Вайб: Париж, непринуждённо и стильно.\n2. CASUAL LUXE: льняной комплект или платье в нейтральном тоне, плетёная сумка, сандалии, минималистичные украшения. Вайб: летний город, свежо и красиво.\n3. STREET STYLE COOL: интересный принт или яркий акцент, кроссовки премиум или ботинки, стильная сумка. Вайб: уличный стиль, запоминающийся образ.`;
  if (w.includes("театр") || w.includes("выставк"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ТЕАТРА/ВЫСТАВКИ — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. CULTURAL ELEGANCE: платье миди с интересным кроем или костюм, statement украшения, каблук или лоферы. Вайб: театральная премьера, утончённо.\n2. ARTISTIC CHIC: необычный силуэт или принт, авторские украшения, интересная обувь. Вайб: вернисаж, творческая личность с вкусом.\n3. DRAMATIC EVENING: вечернее платье с характером (асимметрия/объём/необычный цвет), эффектные украшения. Вайб: опера, незабываемый образ.`;
  if (w.includes("путешеств") || w.includes("самолёт"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ПУТЕШЕСТВИЯ — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. TRAVEL CHIC: стильный комфортный look (широкие брюки + блуза + лёгкий пиджак), кроссовки или лоферы, вместительная сумка. Вайб: бизнес-класс, путешественница с вкусом.\n2. CITY EXPLORER: джинсы + интересный верх + кроссовки премиум, рюкзак или crossbody, удобно и стильно. Вайб: исследование нового города.\n3. RESORT ARRIVAL: лёгкое платье или льняной комплект, сандалии, соломенная шляпа. Вайб: прилетела на курорт, сразу готова к отдыху.`;
  if (w.includes("фотосессия"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ФОТОСЕССИИ — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. STUDIO EDITORIAL: чистый минималистичный look с одним сильным акцентом (цвет/силуэт/деталь), идеальная посадка, рекламное качество. Вайб: обложка Vogue, безупречно.\n2. URBAN STREET STYLE: яркий или необычный look для городской съёмки, интересный фон, динамичная поза. Вайб: уличная мода, живой и современный.\n3. GLAMOUR PORTRAIT: эффектный вечерний или гламурный look, драматическое освещение, statement образ. Вайб: глянцевый журнал, запоминающийся портрет.`;
  if (w.includes("фестиваль") || w.includes("концерт"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ФЕСТИВАЛЯ/КОНЦЕРТА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. FESTIVAL BOHO: бохо-шик с этническими деталями, яркие аксессуары, ботинки или сандалии, венок или шляпа. Вайб: Coachella, свободный дух.\n2. CONCERT COOL: стильный rock-chic look (кожаная куртка/джинсы/ботинки), bold аксессуары. Вайб: рок-концерт, уверенно и стильно.\n3. RAVE NEON: яркий неоновый или металлический look, смелые аксессуары, кроссовки. Вайб: электронный фестиваль, заметна в толпе.`;
  if (w.includes("горнолыжн"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ГОРНОЛЫЖНОГО КУРОРТА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. SLOPE CHIC: premium горнолыжный комбинезон или комплект (Bogner/Fendi Ski уровень), яркий или монохромный, шлем с визором, перчатки. Вайб: Куршевель, стильно на склоне.\n2. APRÈS-SKI LUXE: кашемировый свитер + горнолыжные брюки или меховой жилет, угги или ботинки, шапка-бини. Вайб: шале, горячий шоколад, уютно и дорого.\n3. MOUNTAIN GLAM: вечерний look для ресторана курорта (платье + шуба или пуховик), элегантно в горах. Вайб: ужин в Альпах, гламур и снег.`;
  if (w.includes("корпоратив"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ КОРПОРАТИВА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. FESTIVE PROFESSIONAL: нарядный костюм или платье-миди в праздничном цвете (бордо/изумруд/золото), элегантно и уместно. Вайб: корпоратив в хорошей компании, запомнится.\n2. COCKTAIL CHIC: коктейльное платье или стильный комплект, интересные украшения, каблук. Вайб: вечеринка коллег, выглядит лучше всех.\n3. SMART PARTY: пиджак с блеском или интересной деталью + брюки/юбка, баланс между офисом и праздником. Вайб: профессионально и празднично одновременно.`;
  if (w.includes("загородн") || w.includes("природ") || w.includes("пикник"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ЗАГОРОДНОГО ОТДЫХА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. COUNTRY CHIC: льняное платье или комплект в нейтральных тонах, соломенная шляпа, сандалии или эспадрильи. Вайб: загородный дом, естественно и красиво.\n2. PICNIC STYLE: лёгкий сарафан или юбка с блузой, плетёная корзина-сумка, балетки или мюли. Вайб: пикник в поле, романтично.\n3. OUTDOOR ADVENTURE: стильный casual look (джинсы + рубашка + кроссовки), функционально и модно. Вайб: прогулка по лесу, активный отдых.`;
  return "";
}

function getOccasionAtmosphere(wishes: string, idx: number = 0): string {
  const w = wishes.toLowerCase();
  const i = idx % 3;
  if (w.includes("пляж") || w.includes("отдых") || w.includes("курорт") || w.includes("яхта"))
    return [
      " Sun-kissed glowing skin, golden hour light, Santorini white terrace overlooking the sea, warm amber tones, resort chic, vibrant ethnic prints, espadrilles, relaxed confident pose.",
      " Beach club setting, turquoise water in background, soft midday sun, tropical lush greenery, resort wear, barefoot on white sand, carefree summer energy.",
      " Luxury yacht deck, Mediterranean sunset, golden reflections on water, sophisticated resort look, champagne glass in hand, glamorous vacation mood.",
    ][i];
  if (w.includes("свидание") || w.includes("романтич"))
    return [
      " Intimate candlelit restaurant interior, warm golden light, elegant evening look, soft bokeh background, romantic date-night atmosphere.",
      " Rooftop terrace at sunset, city lights below, romantic warm glow, sophisticated evening silhouette, gentle breeze.",
      " Cozy wine bar, exposed brick walls, warm amber lighting, intimate close-up framing, elegant yet relaxed evening style.",
    ][i];
  if (w.includes("ресторан"))
    return [
      " Upscale restaurant interior, warm ambient chandelier light, polished marble table, sophisticated dining look, refined elegance.",
      " Outdoor restaurant terrace, golden evening light, lush greenery, chic summer dining look, relaxed confidence.",
      " Modern minimalist fine dining, dramatic spotlighting, architectural interior, sleek editorial fashion look.",
    ][i];
  if (w.includes("вечеринк") || w.includes("клуб") || w.includes("ночная"))
    return [
      " Upscale nightclub, dramatic neon pink and blue lighting, bold confident look, electric night atmosphere, dynamic pose.",
      " Rooftop party, city skyline at night, string lights, glamorous evening look, celebratory mood.",
      " Exclusive lounge, moody dark interior, spotlight from above, statement outfit, mysterious and alluring.",
    ][i];
  if (w.includes("свадьб") || w.includes("торжеств") || w.includes("выпускн"))
    return [
      " Grand ballroom, crystal chandeliers, elegant formal look, luxurious fabrics, dreamy soft lighting, special occasion glamour.",
      " Garden ceremony, soft natural light through trees, romantic floral backdrop, elegant flowing outfit.",
      " Historic venue exterior, golden hour light, architectural columns, sophisticated formal look, magazine-worthy composition.",
    ][i];
  if (w.includes("офис") || w.includes("деловая") || w.includes("бизнес"))
    return [
      " Modern glass office interior, natural daylight through floor-to-ceiling windows, professional confident look, clean structured lines.",
      " Business district street, architectural glass buildings, sharp tailored look, purposeful stride, urban professional.",
      " Minimalist conference room, soft diffused light, polished business look, authoritative yet approachable pose.",
    ][i];
  if (w.includes("спорт") || w.includes("фитнес"))
    return [
      " Modern gym interior, dramatic spotlighting, premium athletic wear, powerful dynamic pose, energy and strength.",
      " Outdoor park at sunrise, golden morning light, sporty premium look, running or stretching pose, fresh vitality.",
      " Urban rooftop workout space, city skyline background, athletic editorial look, motion blur effect, high energy.",
    ][i];
  if (w.includes("прогулк") || w.includes("кафе"))
    return [
      " Charming European cobblestone street, soft morning light, effortless chic look, relaxed confident walk.",
      " Outdoor café terrace, dappled sunlight through trees, casual stylish look, coffee cup in hand, leisurely mood.",
      " City park, lush greenery, golden afternoon light, relaxed elegant look, natural and fresh.",
    ][i];
  if (w.includes("театр") || w.includes("выставк"))
    return [
      " Grand theatre lobby, ornate architecture, dramatic chandelier light, sophisticated evening look, cultural elegance.",
      " Contemporary art gallery, white walls, dramatic spotlights on artwork, editorial fashion look, artistic atmosphere.",
      " Theatre exterior at night, illuminated marquee, elegant evening silhouette, dramatic shadows, glamorous arrival.",
    ][i];
  if (w.includes("путешеств") || w.includes("самолёт"))
    return [
      " Modern airport terminal, large windows with planes visible, stylish travel look, cosmopolitan chic, confident traveller.",
      " Iconic city landmark backdrop, tourist destination, fashionable explorer look, natural daylight, adventurous mood.",
      " Boutique hotel lobby, luxurious interior, travel-ready chic look, sophisticated wanderer aesthetic.",
    ][i];
  if (w.includes("фотосессия"))
    return [
      " Luxury penthouse interior, floor-to-ceiling windows, Manhattan skyline view, dramatic side lighting, high-fashion editorial atmosphere, advertising campaign quality.",
      " Urban street location, iconic architectural backdrop, natural daylight, editorial fashion photography, dynamic confident pose, real environment.",
      " Rooftop terrace, golden hour light, city panorama in background, atmospheric warm tones, artistic fashion editorial, real outdoor setting.",
    ][i];
  if (w.includes("фестиваль") || w.includes("концерт"))
    return [
      " Outdoor music festival, golden sunset light, bohemian expressive look, crowd energy in background, free-spirited.",
      " Concert venue, dramatic stage lighting, bold statement outfit, electric atmosphere, vibrant colors.",
      " Festival grounds, flower fields or art installations, eclectic creative look, warm natural light, joyful energy.",
    ][i];
  if (w.includes("горнолыжн"))
    return [
      " Alpine ski resort, snowy mountain peaks, luxury après-ski look, crisp winter light, stylish and warm.",
      " Ski slope, fresh powder snow, premium ski wear, dynamic action pose, mountain panorama.",
      " Cozy mountain chalet interior, fireplace glow, warm winter look, après-ski elegance, intimate alpine atmosphere.",
    ][i];
  if (w.includes("загородн") || w.includes("природ"))
    return [
      " Countryside estate, lush green meadow, soft natural daylight, relaxed elegant look, fresh air and freedom.",
      " Forest path, dappled sunlight through trees, nature-inspired look, organic textures, serene atmosphere.",
      " Lakeside dock, golden hour reflection on water, casual chic look, peaceful natural setting.",
    ][i];
  if (w.includes("корпоратив"))
    return [
      " Corporate event venue, professional yet festive look, warm event lighting, confident social pose.",
      " Hotel ballroom, business celebration, polished smart-casual look, networking atmosphere.",
      " Rooftop corporate party, city view, business chic look, evening event energy.",
    ][i];
  // Дефолтный реальный фон — чередуем для разных образов
  const defaults = [
    " Upscale European city street, golden afternoon light, architectural stone buildings, cobblestone pavement, natural urban environment, cinematic depth of field.",
    " Modern minimalist interior, large floor-to-ceiling windows with city view, warm natural daylight, stylish contemporary space, editorial atmosphere.",
    " Lush city park, dappled sunlight through trees, green bokeh background, fresh natural light, relaxed sophisticated outdoor setting.",
  ];
  return defaults[idx % 3];
}

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

// Helper: retry with exponential backoff
async function callWithRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 3000): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e: any) {
      console.error(`[Retry] Attempt ${i + 1}/${attempts} failed:`, e.message);
      if (i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error("All attempts failed");
}

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
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

  const response = await fetchWithTimeout(`${POLZA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${POLZA_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  }, 120000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Polza API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateImageWithFlux(prompt: string, referenceImageBase64?: string, referenceMimeType: string = "image/jpeg"): Promise<string | null> {
  const input: any = {
    prompt: prompt,
    aspect_ratio: "3:4",
    quality: "medium",
  };

  if (referenceImageBase64) {
    input.images = [
      { type: "base64", data: referenceImageBase64, mime_type: referenceMimeType }
    ];
  }

  const body: any = {
    model: IMAGE_MODEL,
    input,
  };

  console.log("[Image API] model:", IMAGE_MODEL, "prompt:", prompt.substring(0, 200) + "...");

  const response = await fetchWithTimeout(`${POLZA_BASE_URL}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${POLZA_API_KEY}`,
    },
    body: JSON.stringify(body),
  }, 120000);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Image API] Error response:", response.status, errorText);
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[Image API] Response keys:", Object.keys(data));

  // Polza.ai /media returns result in various formats
  const extractImageUrl = (d: any): string | null => {
    if (d.output && d.output.url) return d.output.url;
    if (d.output && d.output.data) return d.output.data;
    if (d.url) return d.url;
    if (d.data && Array.isArray(d.data) && d.data.length > 0) {
      const imageData = d.data[0];
      if (imageData.b64_json) return `data:image/png;base64,${imageData.b64_json}`;
      if (imageData.url) return imageData.url;
    }
    if (d.image) return d.image;
    if (d.images && Array.isArray(d.images) && d.images.length > 0) return d.images[0];
    return null;
  };

  // Sync response
  const syncUrl = extractImageUrl(data);
  if (syncUrl) return syncUrl;

  // Async polling (Seedream 5 Pro may return id + status)
  if (data.id) {
    console.log("[Image API] Async job, polling id:", data.id);
    const maxWait = 120000;
    const pollStart = Date.now();
    while (Date.now() - pollStart < maxWait) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const pollResp = await fetchWithTimeout(`${POLZA_BASE_URL}/media/${data.id}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${POLZA_API_KEY}` },
        }, 30000);
        const pollData = await pollResp.json();
        const url = extractImageUrl(pollData);
        if (url) return url;
        if (pollData.status === "failed") {
          console.error("[Image API] Job failed:", JSON.stringify(pollData).substring(0, 300));
          return null;
        }
      } catch (e) {
        console.error("[Image API] Poll error:", (e as Error).message);
      }
    }
    console.error("[Image API] Polling timed out");
    return null;
  }

  console.log("[Image API] Full response:", JSON.stringify(data).substring(0, 500));
  return null;
}

async function persistGeneratedImage(paymentId: string, lookIdx: number, image: string | null): Promise<string | null> {
  if (!image) return null;
  const id = sanitizeOrderId(paymentId);
  if (!id) return image;
  const resultDir = path.join(RESULTS_DIR, id);
  fs.mkdirSync(resultDir, { recursive: true });

  const dataMatch = image.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    const ext = dataMatch[1].includes("png") ? "png" : dataMatch[1].includes("webp") ? "webp" : "jpg";
    const imgFile = `look_${lookIdx}.${ext}`;
    fs.writeFileSync(path.join(resultDir, imgFile), Buffer.from(dataMatch[2], "base64"));
    return `/api/result-image/${id}/${imgFile}`;
  }

  if (/^https?:\/\//i.test(image)) {
    const response = await fetchWithTimeout(image, { method: "GET" }, 120000);
    if (!response.ok) throw new Error(`Не удалось сохранить готовое изображение: HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const imgFile = `look_${lookIdx}.${ext}`;
    fs.writeFileSync(path.join(resultDir, imgFile), Buffer.from(await response.arrayBuffer()));
    return `/api/result-image/${id}/${imgFile}`;
  }

  return image;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001', 10);

  const PROMO_FILE = path.join(PROJECT_ROOT, "promo-codes.json");

  type PromoEntry = { used: boolean; tier: "standard" | "premium"; createdAt: string; redeemedAt?: string };
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
  app.set("trust proxy", 1); // trust Nginx X-Forwarded-Proto
  app.use(express.json());

  app.post("/api/check-promo", (req: Request, res: Response) => {
    const code = (req.body.code || "").toString().trim().toUpperCase();
    if (!code) return res.json({ valid: false });
    const entry = promos[code];
    if (!entry) return res.json({ valid: false });
    if (entry.used) return res.json({ valid: false, reason: "used" });
    return res.json({ valid: true, tier: entry.tier, code });
  });

  app.post("/api/redeem-promo", (req: Request, res: Response) => {
    const code = (req.body.code || "").toString().trim().toUpperCase();
    if (!code) return res.json({ success: false, reason: "no_code" });
    const entry = promos[code];
    if (!entry) return res.json({ success: false, reason: "not_found" });
    if (entry.used) return res.json({ success: false, reason: "used" });
    // НЕ помечаем как использованный здесь — только после успешной генерации в /api/stylize.
    // Фронтенд сохранит код и передаст его в FormData при загрузке фото.
    return res.json({ success: true, tier: entry.tier, code });
  });

  // Помечает промокод как использованный. Вызывается ТОЛЬКО после успешной генерации образов.
  const markPromoUsed = (code: string): boolean => {
    try {
      const key = (code || "").toString().trim().toUpperCase();
      if (!key) return false;
      const store = loadPromos();
      const entry = store[key];
      if (!entry) return false;
      if (entry.used) return true; // уже использован — ничего не делаем
      entry.used = true;
      entry.redeemedAt = new Date().toISOString();
      savePromos(store);
      // Синхронизируем кэш promos в памяти, чтобы promo-list и другие роуты
      // видели актуальное состояние (и не перезаписали файл старым кэшем).
      promos[key] = entry;
      incPromoSale(entry.tier);
      return true;
    } catch { return false; }
  };

  app.post("/api/generate-promo", (req: Request, res: Response) => {
    if ((req.body.secret || "") !== "stilist-admin-key-913260") {
      return res.status(403).json({ error: "unauthorized" });
    }
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
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(100, parseInt((req.query.limit as string) || "20", 10));
    const status = (req.query.status as string) || "all";
    const tierF = (req.query.tier as string) || "all";
    const q = ((req.query.q as string) || "").trim().toUpperCase();

    let list = Object.entries(promos).map(([code, e]) => ({ code, ...e }));
    if (status === "free") list = list.filter(e => !e.used);
    else if (status === "used") list = list.filter(e => e.used);
    if (tierF === "standard" || tierF === "premium") list = list.filter(e => e.tier === tierF);
    if (q) list = list.filter(e => e.code.includes(q));
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const codes = list.slice((page - 1) * limit, page * limit);
    // Never expose unused count / tier breakdown publicly
    res.json({ total, codes, page, totalPages, limit });
  });

  app.post("/api/promo-delete", (req: Request, res: Response) => {
    if ((req.body.secret || "") !== "stilist-admin-key-913260") {
      return res.status(403).json({ error: "unauthorized" });
    }
    const code = (req.body.code || "").toString().trim().toUpperCase();
    if (!code || !promos[code]) return res.json({ success: false, reason: "not_found" });
    delete promos[code];
    savePromos(promos);
    res.json({ success: true, remaining: Object.keys(promos).length });
  });

  app.post("/api/promo-reset", (req: Request, res: Response) => {
    if ((req.body.secret || "") !== "stilist-admin-key-913260") {
      return res.status(403).json({ error: "unauthorized" });
    }
    const code = (req.body.code || "").toString().trim().toUpperCase();
    if (!code || !promos[code]) return res.json({ success: false, reason: "not_found" });
    promos[code].used = false;
    delete promos[code].redeemedAt;
    savePromos(promos);
    res.json({ success: true });
  });

  // ============ SHARE WITH OG:IMAGE PREVIEW ============
  // Storage for share metadata
  const SHARES_FILE = path.join(__dirname, "data", "shares.json");
  const SHARES_DIR = path.join(__dirname, "public", "share");
  type ShareMeta = { lookName: string; description: string; createdAt: string };
  let shares: Record<string, ShareMeta> = {};
  try { shares = JSON.parse(fs.readFileSync(SHARES_FILE, "utf-8")); } catch {}
  const saveShares = () => {
    try {
      fs.mkdirSync(path.dirname(SHARES_FILE), { recursive: true });
      fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
    } catch (e) { console.error("saveShares failed:", e); }
  };
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c
  ));

  // Upload a generated branded image, store it, return public share URL
  app.post("/api/share-image", upload.single("image"), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "no image" });
    const id = (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID() : Date.now() + "-" + Math.random()).toString().replace(/-/g, "").slice(0, 12);
    try {
      fs.mkdirSync(SHARES_DIR, { recursive: true });
      fs.writeFileSync(path.join(SHARES_DIR, `${id}.jpg`), req.file.buffer);
    } catch (e) {
      console.error("share-image write failed:", e);
      return res.status(500).json({ error: "write failed" });
    }
    shares[id] = {
      lookName: ((req.body.lookName as string) || "Образ").slice(0, 200),
      description: ((req.body.description as string) || "").slice(0, 500),
      createdAt: new Date().toISOString()
    };
    saveShares();
    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    res.json({ id, url: `${baseUrl}/s/${id}`, imageUrl: `${baseUrl}/share/${id}.jpg` });
  });

  // Static serving of share images
  app.use("/share", express.static(SHARES_DIR, { maxAge: "30d", immutable: true }));

  // Promo landing page with og:image (must be registered BEFORE SPA fallback)
  app.get("/s/:id", (req: Request, res: Response) => {
    const meta = shares[req.params.id];
    if (!meta) return res.status(404).type("text/html").send("<h1>Образ не найден</h1>");
    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    const imgUrl = `${baseUrl}/share/${req.params.id}.jpg`;
    const title = `${meta.lookName} — Твой стилист`;
    const firstLine = (meta.description.split("\n").find(l => l.trim()) || "Персональный AI-стилист").trim();
    const desc = firstLine.slice(0, 200);
    const pageUrl = `${baseUrl}/s/${req.params.id}`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html><html lang="ru"><head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:image" content="${imgUrl}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Твой стилист">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${imgUrl}">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#faf7f2;color:#1a1a1a;min-height:100vh;padding:20px}
.wrap{max-width:760px;margin:0 auto;text-align:center}
h1{font-family:Georgia,serif;font-size:28px;font-weight:500;margin:24px 0 12px;line-height:1.25}
.img-wrap{background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);margin-bottom:24px}
img{width:100%;height:auto;display:block}
.desc{color:#555;font-size:15px;line-height:1.6;margin:0 24px 28px;white-space:pre-wrap;text-align:left}
.cta{display:inline-block;background:#c9a84c;color:#1a1a1a;text-decoration:none;padding:16px 32px;border-radius:999px;font-weight:600;font-size:16px;margin-bottom:32px;box-shadow:0 4px 12px rgba(201,168,76,.3);transition:transform .15s ease}
.cta:hover{transform:translateY(-1px)}
.tagline{color:#888;font-size:13px;margin-top:8px}
.footer{color:#aaa;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #eee}
.footer a{color:#888;text-decoration:none}
@media(min-width:600px){h1{font-size:34px}}
</style>
</head><body>
<div class="wrap">
<h1>${escapeHtml(meta.lookName)}</h1>
<div class="img-wrap"><img src="${imgUrl}" alt="${escapeHtml(meta.lookName)}"></div>
<p class="desc">${escapeHtml(desc)}</p>
<a href="${baseUrl}/" class="cta">✨ Создать свой образ</a>
<p class="tagline">Персональный AI-стилист за 1 минуту</p>
<div class="footer"><a href="${baseUrl}/">stilist-ai.ru</a></div>
</div>
</body></html>`);
  });
  // ============ END SHARE ============

  // Admin page (открытый доступ)
  app.get("/api/admin", (req: Request, res: Response) => {
    const pin = (req.query.pin || "").toString();
    if (pin !== "913260") {
      return res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>Админка — Вход</title>
<style>
  body{font-family:-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf9f7;padding:16px;box-sizing:border-box}
  .box{background:#fff;padding:32px 24px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center;width:90%;max-width:340px}
  h2{margin:0 0 20px;font-size:20px;color:#333}
  input{padding:12px 16px;border:1px solid #ddd;border-radius:10px;font-size:18px;text-align:center;width:140px;margin-bottom:16px}
  button{padding:12px 32px;background:#c9a84c;color:#fff;border:none;border-radius:10px;font-size:15px;cursor:pointer}
  button:hover{background:#b8973b}
</style></head>
<body>
<div class="box">
  <h2>Введите PIN-код администратора</h2>
  <form>
    <input type="password" id="pin" maxlength="6" placeholder="******">
    <br>
    <button onclick="location.href='/api/admin?pin='+document.getElementById('pin').value;return false">Войти</button>
  </form>
</div>
</body></html>`);
    }
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Админка — Твой стилист</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:980px;margin:0 auto;padding:16px;background:#faf9f7;color:#1a1a1a;overflow-x:hidden}
  h1{font-size:22px;margin:0 0 24px;display:flex;align-items:center;gap:10px}
  h2{font-size:16px;color:#555;margin:0 0 12px}
  .card{background:#fff;border-radius:16px;padding:20px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #eee}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
  .stat{background:#fff;border-radius:12px;padding:14px;text-align:center;border:1px solid #eee}
  .stat-num{font-size:28px;font-weight:700;color:#c9a84c}
  .stat-label{font-size:11px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .stat-revenue .stat-num{color:#2e7d32}
  .stat-promo .stat-num{color:#6a1b9a}
  label{display:block;margin-bottom:6px;font-size:14px;color:#555;font-weight:500}
  input,select{padding:10px 14px;border:1px solid #ddd;border-radius:10px;font-size:15px;margin-right:8px;margin-bottom:8px}
  button{padding:10px 20px;background:#c9a84c;color:#1a1a1a;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
  button:hover{background:#b8973b}
  .btn-dark{background:#1a1a1a;color:#fff}
  .btn-dark:hover{background:#333}
  .btn-small{padding:6px 12px;font-size:13px}
  .btn-green{background:#2e7d32;color:#fff}
  .btn-green:hover{background:#1b5e20}
  .btn-red{background:#c62828;color:#fff;padding:5px 10px;font-size:12px;border-radius:8px}
  .btn-red:hover{background:#b71c1c}
  .btn-blue{background:#1565c0;color:#fff;padding:5px 10px;font-size:12px;border-radius:8px}
  .btn-blue:hover{background:#0d47a1}
  .btn-gray{background:#888;color:#fff;padding:5px 10px;font-size:12px;border-radius:8px}
  .btn-gray:hover{background:#666}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:10px 12px;background:#f9f8f6;border-bottom:2px solid #eee;color:#888;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:10px 12px;border-bottom:1px solid #f0ece4;vertical-align:middle}
  .mono{font-family:'SF Mono',Monaco,monospace;font-weight:600;font-size:13px}
  .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
  .tag-ok{background:#e8f5e9;color:#2e7d32}
  .tag-used{background:#ffebee;color:#c62828}
  .new-code{display:inline-block;background:#1a1a1a;color:#c9a84c;padding:6px 12px;border-radius:8px;font-family:'SF Mono',Monaco,monospace;font-size:14px;font-weight:700;margin:4px 4px 0 0;cursor:pointer}
  .new-code:hover{background:#333}
  .section-title{display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eee}
  .price-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .price-row input{width:100px}
  .price-row span{font-size:14px;color:#888}
  .usage-bar-wrap{background:#f0ece4;border-radius:8px;height:8px;overflow:hidden;margin-top:4px}
  .usage-bar{height:8px;background:linear-gradient(90deg,#c9a84c,#2e7d32);transition:width .3s}
  .usage-text{font-size:12px;color:#888;margin-top:4px}
  .chart-wrap{background:#f9f8f6;border-radius:12px;padding:16px;margin-top:16px}
  .chart-label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
  canvas{display:block;margin:0 auto;max-width:100%}
  .pagination{display:flex;align-items:center;gap:8px;margin:12px 0;flex-wrap:wrap}
  .filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
  .filters input,.filters select{margin:0}
  .filters input[type=text]{flex:1;min-width:160px}
  .row-actions{display:flex;gap:4px;flex-wrap:wrap}
  .toast{position:fixed;bottom:20px;right:20px;background:#1a1a1a;color:#c9a84c;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.3);opacity:0;transition:opacity .3s;pointer-events:none;z-index:1000}
  .toast.show{opacity:1}
  .legend{display:flex;gap:16px;font-size:11px;color:#888;margin-top:8px;flex-wrap:wrap}
  .legend-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle}
</style>
</head>
<body>
<h1>📊 Админка — Твой стилист</h1>

<div class="card">
  <div class="section-title"><h2>📈 Статистика</h2></div>
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button onclick="setPeriod('today')" id="btn-today" class="btn-small" style="border:1px solid #ddd">Сегодня</button>
    <button onclick="setPeriod('week')" id="btn-week" class="btn-small" style="border:1px solid #ddd">Неделя</button>
    <button onclick="setPeriod('month')" id="btn-month" class="btn-small" style="border:1px solid #ddd">Месяц</button>
    <button onclick="setPeriod('all')" id="btn-all" class="btn-small btn-dark">Всё время</button>
    <button onclick="exportCSV()" class="btn-small btn-green" style="margin-left:auto">📥 Экспорт CSV</button>
  </div>
  <div class="grid">
    <div class="stat"><div class="stat-num" id="visits">—</div><div class="stat-label">Посещений</div></div>
    <div class="stat"><div class="stat-num" id="standardSales">—</div><div class="stat-label">Продаж Стандарт</div></div>
    <div class="stat"><div class="stat-num" id="premiumSales">—</div><div class="stat-label">Продаж Премиум</div></div>
    <div class="stat stat-revenue"><div class="stat-num" id="revenue">— ₽</div><div class="stat-label">Выручка</div></div>
    <div class="stat"><div class="stat-num" id="avgTicket">— ₽</div><div class="stat-label">Ср. чек</div></div>
    <div class="stat stat-promo"><div class="stat-num" id="promoStandard">—</div><div class="stat-label">Промо Стандарт</div></div>
    <div class="stat stat-promo"><div class="stat-num" id="promoPremium">—</div><div class="stat-label">Промо Премиум</div></div>
    <div class="stat stat-promo"><div class="stat-num" id="promoTotal">—</div><div class="stat-label">Всего промо</div></div>
  </div>
  <div class="chart-wrap">
    <div class="chart-label">📊 Динамика (выручка / посещения / промо)</div>
    <canvas id="revenueChart" width="860" height="160"></canvas>
    <div class="legend">
      <span><span class="legend-dot" style="background:#2e7d32"></span>Выручка</span>
      <span><span class="legend-dot" style="background:#c9a84c"></span>Посещения</span>
      <span><span class="legend-dot" style="background:#6a1b9a"></span>Промо</span>
    </div>
  </div>
</div>

<div class="card">
  <div class="section-title"><h2>💰 Цены</h2></div>
  <div class="price-row">
    <label style="margin:0">Стандарт:</label>
    <input type="number" id="priceStandard" min="1" max="10000" value="100">
    <span>₽</span>
    <button onclick="savePrice('standard')" class="btn-small">Сохранить</button>
  </div>
  <div class="price-row" style="margin-top:12px">
    <label style="margin:0">Премиум:</label>
    <input type="number" id="pricePremium" min="1" max="10000" value="200">
    <span>₽</span>
    <button onclick="savePrice('premium')" class="btn-small">Сохранить</button>
  </div>
</div>

<div class="card">
  <div class="section-title"><h2>🎟 Промокоды — создание</h2><button onclick="refreshAll()" class="btn-dark" style="margin-left:auto;font-size:13px;padding:8px 16px">🔄 Обновить всё</button></div>
  <div class="price-row">
    <select id="tier"><option value="standard">Стандарт</option><option value="premium">Премиум</option></select>
    <input type="number" id="count" value="10" min="1" max="100" style="width:70px">
    <button id="createBtn" class="btn-small" onclick="doGenerate()">Создать коды</button>
    <button class="btn-small btn-gray" onclick="copyAllNew()" id="copyAllBtn" style="display:none">📋 Скопировать все</button>
  </div>
  <div id="newCodes" style="display:none;margin-top:16px"></div>
</div>

<div class="card">
  <div class="section-title"><h2>📋 Промокоды — список</h2><span id="codesCount" style="margin-left:8px;font-size:13px;color:#888;font-weight:400"></span></div>
  <div id="codesUsage" style="margin-bottom:12px"></div>
  <div class="filters">
    <input type="text" id="searchInput" placeholder="🔍 Поиск по коду..." oninput="debounceSearch()">
    <select id="filterStatus" onchange="loadList(1)">
      <option value="all">Все статусы</option>
      <option value="free">Свободные</option>
      <option value="used">Использованные</option>
    </select>
    <select id="filterTier" onchange="loadList(1)">
      <option value="all">Все тарифы</option>
      <option value="standard">Стандарт</option>
      <option value="premium">Премиум</option>
    </select>
    <span id="filterInfo" style="font-size:12px;color:#888;margin-left:auto"></span>
  </div>
  <div id="list"></div>
  <div class="pagination" id="pagination"></div>
</div>

<div id="toast" class="toast"></div>

<script>
const secret = "stilist-admin-key-913260";
let currentPeriod = 'all';
let promoPage = 1;
let totalPages = 1;
let lastNewCodes = [];

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function copyCode(c) { navigator.clipboard.writeText(c).then(() => showToast('Скопировано: ' + c)); }

function setPeriod(p) {
  currentPeriod = p;
  ['today','week','month','all'].forEach(k => {
    const btn = document.getElementById('btn-' + k);
    if (btn) btn.className = k === p ? 'btn-small btn-dark' : 'btn-small';
  });
  loadStats();
}

async function loadStats() {
  const r = await fetch('/api/admin-stats?period=' + currentPeriod);
  const d = await r.json();
  const s = d.stats || {};
  document.getElementById('visits').textContent = (s.visits || 0).toLocaleString();
  document.getElementById('standardSales').textContent = s.paidStandardSales || 0;
  document.getElementById('premiumSales').textContent = s.paidPremiumSales || 0;
  const rev = s.revenue || 0;
  document.getElementById('revenue').textContent = rev.toLocaleString() + ' ₽';
  const totalSales = (s.paidStandardSales || 0) + (s.paidPremiumSales || 0);
  document.getElementById('avgTicket').textContent = totalSales > 0 ? Math.round(rev / totalSales).toLocaleString() + ' ₽' : '—';
  document.getElementById('promoStandard').textContent = s.promoStandardSales || 0;
  document.getElementById('promoPremium').textContent = s.promoPremiumSales || 0;
  document.getElementById('promoTotal').textContent = s.promoRedemptions || 0;
  document.getElementById('priceStandard').value = s.standardPrice;
  document.getElementById('pricePremium').value = s.premiumPrice;
  drawChart(d.chartData || []);
}

function drawChart(data) {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!data.length) {
    ctx.fillStyle = '#aaa';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных для отображения', w / 2, h / 2);
    return;
  }
  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const maxVisits = Math.max(...data.map(d => d.visits), 1);
  const maxPromo = Math.max(...data.map(d => d.promoSales || 0), 1);
  const barW = Math.min(22, (w - 40) / data.length);
  const labels = data.map(d => d.date.slice(5));
  data.forEach((d, i) => {
    const x = 20 + i * (barW + 2);
    // Revenue (green, primary)
    const bhRev = (d.revenue / maxRev) * (h - 40);
    const grad = ctx.createLinearGradient(0, h - 20 - bhRev, 0, h - 20);
    grad.addColorStop(0, '#c9a84c');
    grad.addColorStop(1, '#2e7d32');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, h - 20 - bhRev, barW, bhRev, 3); else ctx.rect(x, h - 20 - bhRev, barW, bhRev);
    ctx.fill();
    // Visits (gold dot above)
    const bhVis = (d.visits / maxVisits) * (h - 40) * 0.4;
    ctx.fillStyle = '#c9a84c';
    ctx.beginPath();
    ctx.arc(x + barW / 2, h - 20 - bhRev - bhVis - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Promo (purple dot)
    const bhPromo = (d.promoSales / maxPromo) * (h - 40) * 0.3;
    ctx.fillStyle = '#6a1b9a';
    ctx.beginPath();
    ctx.arc(x + barW / 2, h - 20 - bhRev - bhVis - 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Label
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    if (i % Math.ceil(data.length / 15) === 0 || data.length <= 15) {
      ctx.fillText(labels[i], x + barW / 2, h - 4);
    }
  });
}

async function exportCSV() {
  const r = await fetch('/api/admin-stats?period=all');
  const d = await r.json();
  const rows = [['Дата', 'Посещений', 'Стандарт', 'Премиум', 'Промо', 'Выручка']];
  (d.chartData || []).forEach(row => {
    rows.push([row.date, row.visits, row.standardSales, row.premiumSales, row.promoSales || 0, row.revenue]);
  });
  const csv = rows.map(r => r.join(',')).join(String.fromCharCode(10));
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'stilist-stats.csv';
  a.click();
  showToast('CSV экспортирован');
}

async function savePrice(tier) {
  const price = tier === 'standard'
    ? document.getElementById('priceStandard').value
    : document.getElementById('pricePremium').value;
  await fetch('/api/admin-set-price', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({secret, tier, price: parseInt(price)})
  });
  showToast('Цена сохранена');
  loadStats();
}

async function doGenerate() {
  try {
    const tier = document.getElementById('tier').value;
    const count = document.getElementById('count').value;
    const r = await fetch('/api/generate-promo', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({secret, tier, count})
    });
    if (!r.ok) { alert('Ошибка сервера: ' + r.status); return; }
    const d = await r.json();
    if (!d.codes || !d.codes.length) { alert('Нет кодов: ' + JSON.stringify(d)); return; }
    lastNewCodes = d.codes;
    const div = document.getElementById('newCodes');
    div.innerHTML = '<div style="margin-bottom:8px;font-weight:600;color:#2e7d32">✨ Новые (' + d.codes.length + '):</div>' +
      d.codes.map(c => '<span class="new-code" onclick="copyCode(\\''+c+'\\')">' + c + '</span>').join(' ');
    div.style.display = 'block';
    document.getElementById('copyAllBtn').style.display = 'inline-block';
    showToast('Создано ' + d.codes.length + ' кодов');
    loadList(promoPage);
    loadStats();
  } catch(e) { alert('Ошибка: ' + e); }
}

function copyAllNew() {
  if (!lastNewCodes.length) return;
  navigator.clipboard.writeText(lastNewCodes.join(String.fromCharCode(10))).then(() => showToast('Скопировано ' + lastNewCodes.length + ' кодов'));
}

let searchTimer = null;
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadList(1), 300);
}

async function loadList(page) {
  promoPage = page || 1;
  const status = document.getElementById('filterStatus').value;
  const tier = document.getElementById('filterTier').value;
  const q = document.getElementById('searchInput').value.trim();
  const url = '/api/promo-list?page=' + promoPage + '&limit=20&status=' + status + '&tier=' + tier + '&q=' + encodeURIComponent(q);
  const r = await fetch(url);
  const d = await r.json();
  totalPages = d.totalPages || 1;
  const codes = d.codes || [];
  const total = d.total || 0;
  const unused = d.unused || 0;
  const used = d.used || 0;

  document.getElementById('codesCount').textContent = unused + ' свободных / ' + (unused + used) + ' всего';
  document.getElementById('filterInfo').textContent = 'Показано: ' + codes.length + ' из ' + total;

  const usedPct = (unused + used) > 0 ? Math.round(used / (unused + used) * 100) : 0;
  document.getElementById('codesUsage').innerHTML =
    '<div class="usage-bar-wrap"><div class="usage-bar" style="width:' + usedPct + '%"></div></div>' +
    '<div class="usage-text">Использовано: ' + usedPct + '% (' + used + '/' + (unused + used) + ')</div>';

  renderTable(codes);
  renderPagination();
}

function renderTable(codes) {
  const rows = codes.map(e =>
    '<tr><td class="mono">' + e.code + '</td><td>' +
    (e.tier === 'premium' ? 'Премиум' : 'Стандарт') + '</td><td>' +
    (e.used ? '<span class="tag tag-used">Использован</span>' : '<span class="tag tag-ok">Свободен</span>') +
    '</td><td style="color:#aaa;font-size:12px">' + (e.createdAt ? e.createdAt.slice(0,10) : '') + '</td>' +
    (e.used && e.redeemedAt ? '<td style="color:#aaa;font-size:12px">' + e.redeemedAt.slice(0,10) + '</td>' : '<td style="color:#ccc">—</td>') +
    '<td><div class="row-actions">' +
      '<button class="btn-gray" onclick="copyCode(\\''+e.code+'\\')">📋</button>' +
      (e.used ? '<button class="btn-blue" onclick="doReset(\\''+e.code+'\\')">↺ Сброс</button>' : '') +
      '<button class="btn-red" onclick="doDelete(\\''+e.code+'\\')">🗑</button>' +
    '</div></td></tr>'
  ).join('');
  document.getElementById('list').innerHTML = '<table><tr><th>Код</th><th>Тариф</th><th>Статус</th><th>Создан</th><th>Активирован</th><th>Действия</th></tr>' + rows + '</table>';
}

function renderPagination() {
  let pagHtml = '';
  if (totalPages > 1) {
    if (promoPage > 1) pagHtml += '<button class="btn-small" onclick="loadList(' + (promoPage - 1) + ')">← Назад</button>';
    pagHtml += '<span class="page-info">Страница ' + promoPage + ' из ' + totalPages + '</span>';
    if (promoPage < totalPages) pagHtml += '<button class="btn-small" onclick="loadList(' + (promoPage + 1) + ')">Вперёд →</button>';
  }
  document.getElementById('pagination').innerHTML = pagHtml;
}

async function doReset(code) {
  if (!confirm('Сбросить код ' + code + '? Он снова станет свободным.')) return;
  const r = await fetch('/api/promo-reset', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({secret, code})
  });
  const d = await r.json();
  if (d.success) { showToast('Код сброшен'); loadList(promoPage); loadStats(); }
  else showToast('Ошибка: ' + (d.reason || 'unknown'));
}

async function doDelete(code) {
  if (!confirm('Удалить код ' + code + ' безвозвратно?')) return;
  const r = await fetch('/api/promo-delete', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({secret, code})
  });
  const d = await r.json();
  if (d.success) { showToast('Код удалён'); loadList(promoPage); loadStats(); }
  else showToast('Ошибка: ' + (d.reason || 'unknown'));
}

function refreshAll() { loadStats(); loadList(promoPage); }

loadStats();
loadList(1);
</script>`);
  });

  // Admin stats endpoint
  app.get("/api/admin-stats", (req: Request, res: Response) => {
    const period = (req.query.period as string) || "all";
    const stats = loadStats();
    const computed = computeStats(stats, period);
    const chartData: { date: string; revenue: number; visits: number; standardSales: number; premiumSales: number; promoSales: number }[] = [];
    const days = period === "all" ? 30 : period === "month" ? 30 : period === "week" ? 7 : 1;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayEvents = (stats.events || []).filter((e: StatsEvent) => e.ts?.startsWith(key));
      const dayStandard = dayEvents.filter((e: StatsEvent) => e.type === "paid_standard").length;
      const dayPremium = dayEvents.filter((e: StatsEvent) => e.type === "paid_premium").length;
      const dayPromo = dayEvents.filter((e: StatsEvent) => e.type === "paid_promo_standard" || e.type === "paid_promo_premium").length;
      chartData.push({
        date: key,
        revenue: dayStandard * stats.standardPrice + dayPremium * stats.premiumPrice,
        visits: dayEvents.filter((e: StatsEvent) => e.type === "visit").length,
        standardSales: dayStandard,
        premiumSales: dayPremium,
        promoSales: dayPromo,
      });
    }
    res.json({ stats: computed, period, chartData });
  });

  // Admin set price endpoint
  app.post("/api/admin-set-price", (req: Request, res: Response) => {
    const { tier, price } = req.body;
    if (!tier || !price) return res.status(400).json({ error: "Missing params" });
    const stats = loadStats();
    if (tier === "standard") stats.standardPrice = parseInt(price);
    else if (tier === "premium") stats.premiumPrice = parseInt(price);
    saveStats(stats);
    res.json({ success: true, stats });
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
  async function ensurePaidOrder(paymentIdRaw: unknown): Promise<OrderRecord | null> {
    const paymentId = sanitizeOrderId(paymentIdRaw);
    if (!paymentId) return null;
    const existing = readOrder(paymentId);
    const canRecoverLatePayment = existing?.status === "expired" && !existing.startedAt && !existing.completedAt;
    if (existing && existing.status !== "awaiting_payment" && !canRecoverLatePayment) return existing;
    try {
      const payment = await yooKassa.getPayment(paymentId);
      if (payment.status !== "succeeded") return existing;
      const now = new Date().toISOString();
      const tier: "standard" | "premium" = payment.metadata?.tier === "premium" ? "premium" : "standard";
      let legacyPatch: Partial<OrderRecord> = {};
      if (!existing) {
        const legacyResultFile = path.join(RESULTS_DIR, paymentId, "result.json");
        if (fs.existsSync(legacyResultFile)) {
          try {
            const legacyResult = JSON.parse(fs.readFileSync(legacyResultFile, "utf-8"));
            const legacyLooks = Array.isArray(legacyResult.looks) ? legacyResult.looks : [];
            const completedLooks = legacyLooks.filter((look: any) => !!look.image).length;
            const isComplete = legacyLooks.length > 0 && completedLooks === legacyLooks.length;
            const completedMs = fs.statSync(legacyResultFile).mtimeMs;
            legacyPatch = {
              status: isComplete ? "ready" : "partial",
              startedAt: new Date(completedMs).toISOString(),
              completedAt: isComplete ? new Date(completedMs).toISOString() : undefined,
              expectedLooks: legacyLooks.length,
              completedLooks,
              resultExpiresAt: isComplete ? new Date(completedMs + RESULTS_TTL_MS).toISOString() : undefined,
              unfinishedExpiresAt: isComplete ? undefined : new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
            };
          } catch {}
        }
      }
      return saveOrder({
        paymentId,
        tier,
        status: "awaiting_input",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        paidAt: existing?.paidAt || now,
        unfinishedExpiresAt: canRecoverLatePayment
          ? new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString()
          : existing?.unfinishedExpiresAt || new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
        error: null,
        ...legacyPatch,
      });
    } catch (error) {
      console.error("[Order] Payment verification failed:", paymentId, (error as Error).message);
      return existing;
    }
  }

  // Maps orderId (idempotenceKey) -> paymentId — persisted to disk so restarts don't lose pending payments
  const pendingPaymentsFile = path.join(PROJECT_ROOT, "data", "pending_payments.json");
  function loadPendingPayments(): Map<string, string> {
    try {
      if (fs.existsSync(pendingPaymentsFile)) {
        return new Map(Object.entries(JSON.parse(fs.readFileSync(pendingPaymentsFile, "utf-8"))));
      }
    } catch {}
    return new Map();
  }
  function savePendingPayment(orderId: string, paymentId: string) {
    const m = loadPendingPayments();
    m.set(orderId, paymentId);
    const entries = [...m.entries()].slice(-500);
    fs.writeFileSync(pendingPaymentsFile, JSON.stringify(Object.fromEntries(entries)));
  }
  const pendingPayments = loadPendingPayments();

  app.post("/api/create-payment", async (req: Request, res: Response) => {
    try {
      const { tier } = req.body;
      const stats = loadStats();
      const amount = tier === "premium" ? stats.premiumPrice : stats.standardPrice;
      const paymentDescription = tier === "premium"
        ? "Премиум тариф - до 5 образов + 22 повода + астро-разбор"
        : "Стандарт тариф - 3 образа от стилиста";

      // Создаём платёж через YooKassa (авто-подтверждение)
      const idempotenceKey = crypto.randomUUID();
      const payment = await yooKassa.createPayment({
        amount: {
          value: amount.toFixed(2),
          currency: "RUB",
        },
        confirmation: {
          type: "redirect",
          return_url: `${process.env.BASE_URL || "https://stilist-ai.ru"}/api/confirm-payment?orderId=${idempotenceKey}`,
        },
        capture: true, // Автоматическое подтверждение платежа
        description: paymentDescription,
        metadata: {
          tier,
          idempotenceKey,
        },
      }, idempotenceKey);

      // Сохраняем маппинг orderId → paymentId для confirm-payment
      pendingPayments.set(idempotenceKey, payment.id);
      savePendingPayment(idempotenceKey, payment.id);
      const createdAt = new Date().toISOString();
      try {
        saveOrder({
          paymentId: payment.id,
          tier: tier === "premium" ? "premium" : "standard",
          status: "awaiting_payment",
          createdAt,
          updatedAt: createdAt,
          unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
          error: null,
        });
      } catch (orderError) {
        console.error("[Order] Failed to persist newly created payment:", payment.id, orderError);
      }

      console.log("[YooKassa] Payment created:", payment.id, "status:", payment.status);

      res.json({
        paymentId: payment.id,
        confirmationUrl: payment.confirmation?.confirmation_url,
        status: payment.status,
      });
    } catch (err: any) {
      console.error("[YooKassa] Payment error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/check-payment", async (req: Request, res: Response) => {
    try {
      const { paymentId } = req.body;
      if (!paymentId) return res.json({ status: "pending" });

      const payment = await yooKassa.getPayment(paymentId);
      res.json({ status: payment.status });
    } catch (err: any) {
      console.error("[YooKassa] Check payment error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Webhook для уведомлений от YooKassa
  app.post("/api/yookassa-webhook", async (req: Request, res: Response) => {
    try {
      const event = req.body;
      console.log("[YooKassa Webhook] Received event:", event.type, event.object?.id);

      if (event.type === "payment.succeeded") {
        const paymentId = event.object?.id;
        const tier = event.object?.metadata?.tier || "standard";
        const amount = event.object?.amount?.value || "?";

        if (paymentId) {
          await ensurePaidOrder(paymentId);
          incPaidSale(tier);
          console.log(`[YooKassa Webhook] Payment confirmed: ${paymentId}, tier: ${tier}`);
          const tierName = tier === "premium" ? "Премиум" : "Стандарт";
          fetch(`https://api.telegram.org/bot8780162148:AAGHjZ_PNo0q9rTJ1TZQTkJdpdV7uo2hOSY/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: 8602635380, text: `✅ Оплата ${amount}₽ (${tierName})` }),
          }).catch(() => {});
        }
      }

      res.status(200).json({ status: "ok" });
    } catch (err: any) {
      console.error("[YooKassa Webhook] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Подтверждение оплаты - вызывается после возврата с YooKassa
  app.get("/api/confirm-payment", async (req: Request, res: Response) => {
    try {
      const orderId = req.query.orderId as string;
      const paymentId = orderId ? pendingPayments.get(orderId) : (req.query.paymentId as string);
      if (!paymentId) {
        console.log(`[YooKassa] confirm-payment: no paymentId for orderId=${orderId}`);
        return res.redirect("/?payment_error=no_id");
      }

      let p = await yooKassa.getPayment(paymentId);
      console.log(`[YooKassa] confirm-payment status: ${p.status}, id: ${paymentId}`);

      // СБП может вернуть pending — ждём до 15 сек
      if (p.status === "pending") {
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 3000));
          p = await yooKassa.getPayment(paymentId);
          console.log(`[YooKassa] poll ${i + 1}: ${p.status}`);
          if (p.status !== "pending") break;
        }
      }

      // Если платёж ожидает захвата (two-stage), подтверждаем
      if (p.status === "waiting_for_capture") {
        await yooKassa.capturePayment(paymentId, undefined, paymentId);
        console.log(`[YooKassa] Payment captured: ${paymentId}`);
        p = await yooKassa.getPayment(paymentId);
      }

      if (p.status === "succeeded") {
        const tier = p.metadata?.tier || "standard";
        const amount = (p as any).amount?.value || "?";
        await ensurePaidOrder(paymentId);
        console.log(`[YooKassa] Payment confirmed: ${paymentId}, tier: ${tier}`);
        // Fallback: increment stats and notify Telegram (webhook may not have fired yet)
        incPaidSale(tier);
        const tierName = tier === "premium" ? "Премиум" : "Стандарт";
        fetch(`https://api.telegram.org/bot8780162148:AAGHjZ_PNo0q9rTJ1TZQTkJdpdV7uo2hOSY/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: 8602635380, text: `✅ Оплата ${amount}₽ (${tierName}) [confirm]` }),
        }).catch(() => {});
        res.redirect(`/?payment_success=true&payment_id=${paymentId}&tier=${tier}`);
      } else {
        console.log(`[YooKassa] Payment not succeeded: ${paymentId}, status: ${p.status}`);
        res.redirect("/?payment_error=cancelled");
      }
    } catch (err: any) {
      console.error("[YooKassa] Confirm payment error:", err);
      res.redirect("/?payment_error=check_failed");
    }
  });

  // API для проверки оплаченного заказа (вызывается из фронтенда)
  app.get("/api/check-paid", async (req: Request, res: Response) => {
    try {
      const paymentId = req.query.paymentId as string;
      if (!paymentId) return res.json({ paid: false });

      const payment = await yooKassa.getPayment(paymentId);
      if (payment.status === "succeeded") {
        const tier = payment.metadata?.tier || "standard";
        return res.json({ paid: true, tier });
      }
      res.json({ paid: false });
    } catch (err: any) {
      console.error("[YooKassa] Check paid error:", err);
      res.json({ paid: false });
    }
  });

  app.get("/api/order/:paymentId", async (req: Request, res: Response) => {
    const paymentId = sanitizeOrderId(req.params.paymentId);
    if (!paymentId) return res.status(400).json({ error: "invalid id" });
    const order = await ensurePaidOrder(paymentId);
    if (!order) return res.status(404).json({ status: "not_found", paid: false });
    const expiresAt = order.resultExpiresAt || order.unfinishedExpiresAt;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now() && order.status !== "expired") {
      cleanupOldResults();
      const expired = readOrder(paymentId);
      return res.json({ ...(expired || order), paid: !!order.paidAt, status: "expired" });
    }
    res.json({ ...order, paid: !!order.paidAt });
  });

  // Recover saved result by paymentId
  app.get("/api/result/:paymentId", (req: Request, res: Response) => {
    const id = sanitizeOrderId(req.params.paymentId);
    if (!id) return res.status(400).json({ error: "invalid id" });
    const order = readOrder(id);
    const expiresAt = order?.resultExpiresAt || order?.unfinishedExpiresAt;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      cleanupOldResults();
      return res.json({ ready: false, status: "expired", expired: true });
    }
    const file = path.join(RESULTS_DIR, id, "result.json");
    if (!fs.existsSync(file)) {
      if (order) {
        return res.json({
          ready: false,
          status: order.status,
          expired: order.status === "expired",
          expectedLooks: order.expectedLooks || 0,
          completedLooks: order.completedLooks || 0,
          error: order.error || null,
        });
      }
      return res.status(404).json({ ready: false, status: "not_found", expired: false });
    }
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      const looks = Array.isArray(data.looks) ? data.looks : [];
      const complete = looks.length > 0 && looks.every((look: any) => !!look.image);
      res.json({
        ready: true,
        status: complete ? "ready" : (order?.status || "partial"),
        expiresAt: order?.resultExpiresAt || null,
        ...data,
      });
    } catch {
      res.status(500).json({ error: "read failed" });
    }
  });

  // Serve saved result images
  app.get("/api/result-image/:paymentId/:file", (req: Request, res: Response) => {
    const id = req.params.paymentId.replace(/[^a-zA-Z0-9_-]/g, "");
    const file = req.params.file.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!id || !file) return res.status(400).end();
    const imgPath = path.join(RESULTS_DIR, id, file);
    if (!fs.existsSync(imgPath)) return res.status(404).end();
    res.sendFile(imgPath);
  });

  // Group styling endpoint
  app.post("/api/group-stylize", (req: Request, res: Response, next: NextFunction) => {
    upload.single("image")(req, res, (err) => {
      if (err && err.code === "LIMIT_FILE_SIZE") {
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.flushHeaders();
        res.write(JSON.stringify({ type: "error", error: "Фото слишком большое. Максимум 50 МБ." }) + "\n");
        return res.end();
      }
      if (err) return next(err);
      next();
    });
  }, async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const file = (req as any).file as MulterFile;
      if (!file) {
        res.write(JSON.stringify({ type: "error", error: "Фото не загружено" }) + "\n");
        return res.end();
      }

      heartbeat = setInterval(() => res.write(JSON.stringify({ type: "heartbeat" }) + "\n"), 15000);

      const imageBase64 = file.buffer.toString("base64");
      const mimeType = file.mimetype;
      const wishes = sanitizeWishes((req.body.wishes || "").toString().slice(0, 300));

      res.write(JSON.stringify({ type: "progress", step: 1.0, text: "Анализируем всех участников группы..." }) + "\n");

      const groupSystemPrompt = `Ты — групповой стилист-эксперт. Твоя задача — проанализировать групповое фото и создать 3 гармоничных образа для всей группы.

АНАЛИЗ: Определи всех людей на фото. Для каждого опиши внешность, тип фигуры, цветотип.

СОЗДАЙ 3 ГРУППОВЫХ ОБРАЗА:
1. Smart Casual / деловой
2. Вечерний / ресторан
3. Яркий / отпуск / color-block

ДЛЯ КАЖДОГО ОБРАЗА:
- lookName: креативное название
- description: для КАЖДОГО человека отдельно — что надеть, почему подходит, как гармонирует с группой. Пиши тепло и с комплиментами.
- editPrompt: на английском — групповая fashion editorial фотосессия, те же люди в тех же позах, новые скоординированные образы. Максимальное качество: 8k, highly detailed, professional fashion photography, perfect lighting. Aspect ratio 4:3 (horizontal/landscape). Preserve each person's facial features exactly.

ВАЖНО: Не нужны ссылки на товары. Фокус на гармонии стилей внутри группы.
${wishes ? `Пожелания: "${wishes}"` : ""}

Отвечай ТОЛЬКО валидным JSON:
{
  "greetingAndAnalysis": "тёплое приветствие + анализ группы",
  "looks": [
    {
      "lookName": "string",
      "description": "string",
      "editPrompt": "string in English"
    }
  ]
}`;

      const analysisText = await callPolzaChat({
        model: ANALYSIS_MODEL,
        systemPrompt: groupSystemPrompt,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Проанализируй это групповое фото и создай 3 скоординированных образа для всей группы." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        }],
        temperature: 0.9,
        maxTokens: 6000,
      });

      let analysisData: any;
      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        analysisData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { analysisData = null; }

      if (!analysisData?.looks?.length) {
        res.write(JSON.stringify({ type: "error", error: "Не удалось проанализировать фото. Попробуйте ещё раз." }) + "\n");
        return res.end();
      }

      res.write(JSON.stringify({ type: "progress", step: 2.0, text: `Генерируем ${analysisData.looks.length} групповых образа...` }) + "\n");

      // Generate one image per look
      const looksWithImages = await Promise.all(analysisData.looks.map(async (look: any, idx: number) => {
        let image = null;
        try {
          const prompt = `High-end fashion editorial photography. Group of people in the same poses as the reference photo, wearing new coordinated outfits. ${look.editPrompt} Aspect ratio 4:3, landscape orientation, 8k, highly detailed, professional lighting, fashion magazine quality.`;
          image = await generateImageWithFlux(prompt, imageBase64, mimeType);
        } catch (e: any) { console.error(`Group image ${idx} failed:`, e.message); }
        res.write(JSON.stringify({ type: "progress", step: 2.0 + ((idx + 1) / analysisData.looks.length) * 2, text: `Образ ${idx + 1}/${analysisData.looks.length} готов...` }) + "\n");
        return { ...look, image };
      }));

      clearInterval(heartbeat);
      res.write(JSON.stringify({
        type: "result",
        greetingAndAnalysis: analysisData.greetingAndAnalysis,
        looks: looksWithImages,
      }) + "\n");
      res.end();
    } catch (err: any) {
      clearInterval(heartbeat);
      console.error("[GroupStylize] Error:", err);
      res.write(JSON.stringify({ type: "error", error: err.message || "Ошибка генерации" }) + "\n");
      res.end();
    }
  });

  app.post("/api/stylize", (req: Request, res: Response, next: NextFunction) => {
    upload.array("images", 3)(req, res, (err) => {
      if (err && err.code === "LIMIT_FILE_SIZE") {
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.flushHeaders();
        res.write(JSON.stringify({ type: "error", error: "Фото слишком большое. Пожалуйста, уменьшите размер до 50 МБ или сделайте новое фото." }) + "\n");
        return res.end();
      }
      if (err) return next(err);
      next();
    });
  }, async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Track client connection — continue processing even if client disconnects
    let clientConnected = true;
    req.on('close', () => { clientConnected = false; });
    const safeWrite = (data: string) => {
      if (!res.writableEnded) {
        try { res.write(data); } catch (e) {}
      }
    };

    let heartbeat: ReturnType<typeof setInterval> | undefined;

    // Variables for emergency save in catch block
    let greetingAndAnalysis: string | undefined;
    let bodyTypeSummary: string | undefined;
    let astroReading: string | null | undefined;
    let looksWithImages: any[] | undefined;
    let lockedOrderId: string | null = null;
    let lockedPromoCode: string | null = null;
    let paymentId = "";

    try {
      safeWrite(JSON.stringify({ type: "progress", step: 0.8, text: "Фотографии получены сервером..." }) + "\n");

      const files = req.files as MulterFile[];
      if (!files || files.length === 0) {
        safeWrite(JSON.stringify({ type: "error", error: "No images uploaded" }) + "\n");
        return res.end();
      }

      paymentId = sanitizeOrderId(req.body.paymentId);
      const promoCodeForAccess = (req.body.promoCode || "").toString().trim().toUpperCase();
      if (paymentId) {
        const paidOrder = await ensurePaidOrder(paymentId);
        if (!paidOrder?.paidAt) {
          safeWrite(JSON.stringify({ type: "error", error: "Оплата заказа не подтверждена." }) + "\n");
          return res.end();
        }
        if (paidOrder.status === "expired") {
          safeWrite(JSON.stringify({ type: "error", error: "Срок продолжения этого заказа истёк." }) + "\n");
          return res.end();
        }
        const existingResult = path.join(RESULTS_DIR, paymentId, "result.json");
        if (fs.existsSync(existingResult)) {
          safeWrite(JSON.stringify({ type: "error", error: "Заказ уже создан. Откройте «Мои образы» — там можно повторить только отсутствующие фото." }) + "\n");
          return res.end();
        }
        if (activeOrderIds.has(paymentId) || paidOrder.status === "processing") {
          safeWrite(JSON.stringify({ type: "error", error: "Этот заказ уже генерируется. Его можно закрыть и открыть позже в разделе «Мои образы»." }) + "\n");
          return res.end();
        }
        activeOrderIds.add(paymentId);
        lockedOrderId = paymentId;

        const resultDir = path.join(RESULTS_DIR, paymentId);
        fs.mkdirSync(resultDir, { recursive: true });
        for (const name of fs.readdirSync(resultDir)) {
          if (/^source_\d+\.(jpg|png|webp)$/i.test(name)) fs.rmSync(path.join(resultDir, name), { force: true });
        }
        files.forEach((file, idx) => {
          const ext = file.mimetype.includes("png") ? "png" : file.mimetype.includes("webp") ? "webp" : "jpg";
          fs.writeFileSync(path.join(resultDir, `source_${idx}.${ext}`), file.buffer);
        });
        writeJsonAtomic(path.join(resultDir, "input.json"), {
          height: req.body.height || "",
          weight: req.body.weight || "",
          wishes: req.body.wishes || "",
          looksCount: req.body.looksCount || "",
          userName: req.body.userName || "",
          budget: req.body.budget || "",
          birthDate: req.body.birthDate || "",
          savedAt: new Date().toISOString(),
        });
        updateOrder(paymentId, {
          status: "processing",
          startedAt: new Date().toISOString(),
          completedLooks: 0,
          error: null,
          unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
        });
      } else {
        const promo = promoCodeForAccess ? promos[promoCodeForAccess] : null;
        if (!promo || promo.used) {
          safeWrite(JSON.stringify({ type: "error", error: "Для генерации нужна подтверждённая оплата или действующий промокод." }) + "\n");
          return res.end();
        }
        if (activePromoCodes.has(promoCodeForAccess)) {
          safeWrite(JSON.stringify({ type: "error", error: "Этот промокод уже используется для генерации." }) + "\n");
          return res.end();
        }
        activePromoCodes.add(promoCodeForAccess);
        lockedPromoCode = promoCodeForAccess;
      }

      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";
      const rawWishes = (req.body.wishes || "").toString().slice(0, 500).trim();

      // Блокировка повторной генерации: если для этого paymentId уже есть сохранённый
      // результат (моложе 5 часов) — не запускаем новую генерацию, сразу возвращаем ошибку.
      // Пользователь должен смотреть свои уже сгенерированные образы, а не тратить токены заново.
      const earlyPaymentId = paymentId;
      if (earlyPaymentId) {
        try {
          const existingResult = path.join(RESULTS_DIR, earlyPaymentId, "result.json");
          if (fs.existsSync(existingResult)) {
            const st = fs.statSync(existingResult);
            if (Date.now() - st.mtimeMs < RESULTS_TTL_MS) {
              safeWrite(JSON.stringify({ type: "error", error: "У вас уже есть сгенерированные образы. Откройте раздел «Мои образы», чтобы посмотреть их. Создать новые можно через 5 часов." }) + "\n");
              return res.end();
            }
          }
        } catch {}
      }
      // Detect season from wishes to pass explicitly to AI
      const wishesLower = rawWishes.toLowerCase();
      const seasonMap: Record<string, string> = {
        "лет": "лето", "жара": "лето", "пляж": "лето", "отпуск": "лето", "курорт": "лето",
        "осень": "осень", "дождь": "осень",
        "зим": "зима", "холод": "зима", "мороз": "зима",
        "весн": "весна",
      };
      const detectedSeason = Object.entries(seasonMap).find(([k]) => wishesLower.includes(k))?.[1];
      const seasonInstruction = detectedSeason
        ? `\n🗓️ Пользователь запросил образы для сезона: ${detectedSeason}. Все 3 образа должны соответствовать этому сезону.`
        : "";
      const wishes = sanitizeWishes(rawWishes);
      const promoCode = (req.body.promoCode || "").toString().trim().toUpperCase();
      const budgetRaw = parseInt((req.body.budget || "").toString()) || 0;
      const budgetInstruction = budgetRaw > 0
        ? `\n\n💰 БЮДЖЕТ ПОЛЬЗОВАТЕЛЯ: ${budgetRaw.toLocaleString("ru-RU")} ₽ на один образ. КРИТИЧЕСКИ ВАЖНО: сумма всех items[] в каждом образе НЕ должна превышать ${budgetRaw.toLocaleString("ru-RU")} ₽. Подбирай реальные вещи в этом ценовом диапазоне. Расставляй приоритеты: сначала ключевые вещи образа, потом аксессуары. Указывай честные цены — не занижай и не завышай.`
        : "";
      const looksCount = Math.min(5, Math.max(1, parseInt(req.body.looksCount) || 3));
      if (paymentId) updateOrder(paymentId, { expectedLooks: looksCount });
      const userName = (req.body.userName || "").toString().trim().slice(0, 50);
      const visitCount = Math.max(1, parseInt(req.body.visitCount) || 1);
      const pastLooks = (req.body.pastLooks || "").toString().trim().slice(0, 300);
      const pastLooksInstruction = pastLooks
        ? `ИСТОРИЯ ОБРАЗОВ: в прошлые визиты этому пользователю уже предлагались образы с названиями: "${pastLooks}". НЕ ПОВТОРЯЙ эти концепции и названия — создай принципиально другие образы по стилю, цвету и концепции. `
        : "";
      const isReturning = visitCount > 1;
      const returningInstruction = isReturning
        ? `ВАЖНО: это визит №${visitCount} этого пользователя. Тон приветствия должен быть тем теплее и дружелюбнее, чем больше визитов:
- Визит 2-3: как старый знакомый — "О, снова вы!", "Рад снова вас видеть!", "Снова в деле!"
- Визит 4-6: как близкий знакомый — "О, это уже традиция!", "Мой любимый клиент снова здесь!", "Я уже начинаю знать ваш вкус"
- Визит 7+: как лучший друг — "Ну наконец-то!", "Я уже скучал!", "Без вас тут было скучновато"
ЭКСПЕРИМЕНТ: поскольку человек уже был — предложи ему что-то смелее обычного. ОДИН из 3 образов сделай экспериментальным — выйди за рамки привычного стиля этого человека. В описании этого образа добавь реплику стилиста: например "А вот этот образ — чисто ради эксперимента. Я не был уверен, но что-то мне подсказывает, что вам пойдёт. Как вам?" или "Признаюсь, этот образ я предлагаю немного на удачу — но именно такие эксперименты иногда становятся любимыми". Каждый раз придумывай РАЗНЫЙ оборот для эксперимента. `
        : "";
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
        safeWrite(JSON.stringify({ type: "error", error: "API ключ не настроен. Добавьте POLZA_API_KEY в .env" }) + "\n");
        return res.end();
      }

      heartbeat = setInterval(() => {
        safeWrite(JSON.stringify({ type: "heartbeat" }) + "\n");
      }, 15000);

      // Use the first image as reference
      const referenceImage = files[0];
      const referenceImageBase64 = referenceImage.buffer.toString("base64");
      const mimeType = referenceImage.mimetype;

      // Prepare messages with image for Gemini analysis
      const occasionGuide = getOccasionStyleGuide(wishes);
      const wishesBlock = wishes
        ? `\n\n🌟 ОСОБЫЕ ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (PREMIUM — ВЫСШИЙ ПРИОРИТЕТ): "${wishes}"\n\n⚠️ КРИТИЧЕСКОЕ ПРАВИЛО ПРИ НАЛИЧИИ ПОЖЕЛАНИЙ:\nЕсли пользователь сформулировал конкретный запрос — ПОЛНОСТЬЮ ИГНОРИРУЙ структуру "офис/вечер/color-block" и стандартный список из 6 направлений. Создавай РОВНО то, что человек попросил.\n\nКонкретные сценарии:\n- "хочу образ рокера и 2 для свидания" → ровно 1 рокер + 2 свидания (НЕ офис/вечер/color-block!)\n- "три ярких на курорт" → все 3 курортных, можно оставить летние правила\n- "посоветуй макияж/причёску для X" → расширь раздел груминга в каждом образе с конкретикой под X (продукты, бренды, шаги)\n- "дай совет на первое свидание" → добавь блок "💬 Совет для свидания" в каждом образе: парфюм-нота, как зайти, что говорить, чего избегать\n- Любой другой запрос — БУКВАЛЬНО следуй пожеланию\n\nОБЯЗАТЕЛЬНЫЙ ПУНКТ ПАРФЮМ:\nЕсли пожелание касается свидания/вечера/мероприятия/стиля жизни — в каждом образе ОБЯЗАТЕЛЬНО рекомендуй парфюм (одну конкретную нишевую/премиум модель). ВАЖНО: каждый раз выбирай РАЗНЫЕ ароматы, не повторяй одни и те же. Для вдохновения — большой пул на выбор:\n\nМУЖСКИЕ/УНИСЕКС нишевые: Le Labo Santal 33, Le Labo Bergamote 22, Le Labo Rose 31, Maison Margiela Replica Jazz Club, Maison Margiela Replica By the Fireplace, Maison Margiela Replica Sailing Day, Tom Ford Tobacco Vanille, Tom Ford Oud Wood, Tom Ford Grey Vetiver, Tom Ford Neroli Portofino, Byredo Mojave Ghost, Byredo Bal d\'Afrique, Byredo Gypsy Water, Creed Aventus, Creed Silver Mountain Water, Acqua di Parma Colonia, Acqua di Parma Blu Mediterraneo, Diptyque Tam Dao, Diptyque Eau des Sens, Memo Paris Irish Leather, Parfums de Marly Layton, Parfums de Marly Percival, Initio Oud for Greatness, Initio Rehab, Nasomatto Black Afgano, Juliette Has a Gun Not a Perfume, Comme des Garçons Series 3 Incense Kyoto, Serge Lutens Ambre Sultan, Serge Lutens Chergui, Xerjoff Naxos, Xerjoff Alexandria II, Roja Dove Oligarch\n\nЖЕНСКИЕ/УНИСЕКС нишевые: Maison Francis Kurkdjian Baccarat Rouge 540, Maison Francis Kurkdjian Aqua Celestia, Maison Francis Kurkdjian À la Rose, Diptyque Philosykos, Diptyque Do Son, Diptyque Eau Rose, Chloé Atelier des Fleurs Rose Naturelle, Byredo Blanche, Byredo La Tulipe, Frederic Malle Portrait of a Lady, Frederic Malle Musc Ravageur, Frederic Malle Une Fleur de Cassie, Guerlain Spiritueuse Double Vanille, Guerlain Mon Guerlain Bloom of Rose, Penhaligon\'s Empressa, Penhaligon\'s Juniper Sling, Jo Malone Peony & Blush Suede, Jo Malone Wood Sage & Sea Salt, Jo Malone Lime Basil & Mandarin, Annick Goutal Petite Chérie, Memo Paris Inlé, Amouage Reflection Woman, Amouage Honour Woman, Serge Lutens Sa Majesté la Rose, Etat Libre d\'Orange Putain des Palaces, Comme des Garçons Wonderwood, Viktor&Rolf Flowerbomb Nectar, Narciso Rodriguez for Her Musc Noir\n\nВсегда объясняй ПОЧЕМУ этот конкретный аромат подходит к образу/ситуации/характеру человека.\n\nЕсли пожелания нет или они общие (типа "красиво") — следуй стандартной структуре офис/вечер/color-block.`
        : "";
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: `${returningInstruction}${pastLooksInstruction}${nameInstruction}CRITICAL OVERRIDE: You MUST generate EXACTLY ${looksCount} look${looksCount > 1 ? "s" : ""} in the "looks" array — no more, no less. Ignore any default number mentioned in your instructions.\n\n⚠️ GENDER DETECTION — CRITICAL: Determine the person's gender STRICTLY from the photo, NOT from the user's name. The account owner may be uploading a photo of someone else (e.g. a husband uploading his wife's photo). If the photo shows a WOMAN — generate women's looks and address her as a woman. If the photo shows a MAN — generate men's looks. If the name suggests a different gender than the photo, acknowledge it warmly in greetingAndAnalysis (e.g. "Андрей, судя по фото, это прекрасная девушка — создадим для неё идеальные образы!") and proceed with the correct gender.\n\nUser's Height: ${height} cm. User's Weight: ${weight} kg. Please analyze the attached photo and provide ${looksCount} distinct fashion look${looksCount > 1 ? "s" : ""} based on this person. Use the 2026 fashion trends from the knowledge base.${seasonInstruction}${budgetInstruction}${wishesBlock}${occasionGuide}${zodiacBlock}` },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` } },
          ],
        },
      ];

      // Step 0 (premium): если есть wishes — сначала ищем свежие тренды через Perplexity Sonar
      let trendsContext = "";
      if (wishes) {
        safeWrite(JSON.stringify({ type: "progress", step: 0.9, text: "Ищем свежие модные тренды по твоему запросу..." }) + "\n");
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
      safeWrite(JSON.stringify({ type: "progress", step: 1.0, text: "Анализ фото и подбор образов с помощью AI..." }) + "\n");

      // Высокая температура для разнообразия образов при каждой генерации
      const analysisTemp = 0.95;

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
        analysisText = await callWithRetry(() => callPolzaChat({
          model: ANALYSIS_MODEL,
          systemPrompt,
          messages,
          temperature: analysisTemp,
          maxTokens: 8192,
        }), 3, 4000);

        if (typeof analysisText === "string") {
          analysisData = safeJsonParse(analysisText);
        } else {
          analysisData = analysisText;
        }
      } catch (e: any) {
        clearInterval(heartbeat);
        if (paymentId) updateOrder(paymentId, { status: "failed", error: e.message || "Ошибка анализа изображения." });
        let msg = e.message;
        if (msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429")) {
          msg = "Превышен лимит запросов API. Подождите 1 минуту и попробуйте снова.";
        } else if (msg.includes("API key not valid") || msg.includes("API_KEY_INVALID") || msg.includes("401")) {
          msg = "Введен неверный API ключ. Пожалуйста, проверьте POLZA_API_KEY в настройках.";
        }
        safeWrite(JSON.stringify({ type: "error", error: "Ошибка AI: " + msg }) + "\n");
        return res.end();
      }

      // Assign to outer variables for emergency save in catch
      let looks: any[];
      ({ greetingAndAnalysis, bodyTypeSummary, looks } = analysisData as any);
      astroReading = analysisData?.astroReading;

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
        if (paymentId) updateOrder(paymentId, { status: "failed", error: "AI не смог подготовить описания образов." });
        safeWrite(JSON.stringify({ type: "error", error: "AI не смог сгенерировать образы. Попробуйте еще раз." }) + "\n");
        return res.end();
      }

      const checkpointLooks = looks.map((look: any) => ({ ...look, image: null, imageError: null }));
      if (paymentId) {
        const resultDir = path.join(RESULTS_DIR, paymentId);
        writeJsonAtomic(path.join(resultDir, "result.json"), {
          greetingAndAnalysis,
          bodyTypeSummary,
          astroReading: astroReading || null,
          looks: checkpointLooks,
          savedAt: new Date().toISOString(),
        });
      }

      safeWrite(JSON.stringify({ type: "progress", step: 1.5, text: "Анализ и подбор гардероба завершен. Переходим к визуализации..." }) + "\n");

      // Determine gender from photo BEFORE image generation to avoid wrong-gender renders
      let detectedGender: "man" | "woman" = "woman"; // safe default
      try {
        const genderResp = await fetchWithTimeout(`${POLZA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${POLZA_API_KEY}` },
          body: JSON.stringify({
            model: ANALYSIS_MODEL,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Look at the photo and answer with ONE word only: 'man' or 'woman'. This is the gender of the person in the photo. Answer based ONLY on what you see in the photo, not on any name. If unclear, answer 'woman'." },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` } },
                ],
              },
            ],
            temperature: 0,
            max_tokens: 10,
          }),
        }, 30000);
        if (genderResp.ok) {
          const gd = await genderResp.json();
          const gtext = (gd?.choices?.[0]?.message?.content || "").toString().toLowerCase();
          if (gtext.includes("man") && !gtext.includes("woman")) detectedGender = "man";
          else detectedGender = "woman";
          console.log("[Gender] Detected:", detectedGender, "raw:", gtext.trim());
        }
      } catch (e: any) {
        console.error("[Gender] Detection failed, using default:", e.message);
      }

      // Step 2: Generate images with Nano Banana 2 — IN PARALLEL
      safeWrite(JSON.stringify({ type: "progress", step: 2.0, text: `Визуализация ${looks.length} образов параллельно...` }) + "\n");

      // Track completed images for progress updates
      let completedImages = 0;
      const totalImages = looks.length;

      looksWithImages = await Promise.all(looks.map(async (look: any, idx: number) => {
        let generatedImageBase64 = null;
        let imageGenerationError = null;

        if (look.editPrompt) {
          let imageDataUrl: string | null = null;
          let lastError = "";
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const occasionAtmosphere = getOccasionAtmosphere(wishes, idx);
              const poseInstruction = wishes.toLowerCase().includes("фотосессия")
                ? " POSE: Professional fashion editorial pose — body angled 45° to camera, weight shifted to one leg, slight hip tilt, one hand in pocket with thumb out OR hand lightly touching lapel/collar, chin slightly down with direct confident gaze. OR: three-quarter turn, looking back over shoulder, asymmetric stance. GQ/Vogue magazine cover quality pose. NOT stiff, NOT arms hanging straight down."
                : " POSE: Natural confident pose — slight body angle to camera, weight on one leg, one hand in pocket or relaxed at side with slight elbow bend, shoulders relaxed back, chin parallel to ground, genuine expression. Avoid symmetry, create natural angles.";
              const qualityInstruction = " QUALITY: Maximum resolution, ultra-sharp details, professional studio lighting or perfect natural light, magazine cover quality, WOW factor — image must make viewer want to look twice. Shot on Phase One IQ4, 8K resolution.";
              const expressionInstruction = " EXPRESSION: Preserve the exact facial expression from the reference photo. Do NOT add a smile if the person is not smiling in the reference. Match the natural expression precisely.";
              const identityInstruction = ` IDENTITY: The person in the generated image MUST be the SAME person as in the reference photo. Preserve their gender, face, facial features, skin tone, eye color, jawline, and body type EXACTLY. Do NOT change gender. Do NOT swap to a different person. The reference photo is a ${detectedGender} — generate a ${detectedGender} with the same face. HAIR: Follow the hairstyle AND hair color described in the look prompt (cut, length, styling, toner, highlights, blonde or other shade). If a new hair color is specified, RENDER that color — do not keep the original hair color when a new shade is described. Keep the same hairline shape and hair density so the person stays recognizable.`;
              const bodyFacingInstruction = " BODY: The person's full body must face the CAMERA DIRECTLY — torso, hips, and legs are FRONT-FACING toward the viewer. Avoid 3/4 turns, side profiles, or angled body poses. The subject should face the camera head-on.";
              const heightNum = parseFloat(String(height).replace(",", "."));
              const weightNum = parseFloat(String(weight).replace(",", "."));
              let bodyBuildInstruction = "";
              if (!isNaN(heightNum) && !isNaN(weightNum) && heightNum > 100 && heightNum < 230 && weightNum > 30 && weightNum < 250) {
                const bmi = weightNum / Math.pow(heightNum / 100, 2);
                // Для полных людей — генерируем тело "минус 15-20 кг" от реального веса,
                // но не ниже здорового минимума (BMI не ниже 22). Одинаково для всех трёх образов.
                let targetWeight = weightNum;
                let buildDesc = "";
                let buildShort = "";
                if (bmi >= 40) {
                  // Очень полный — минус 20 кг, но не ниже BMI 22
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 20, minWeight);
                } else if (bmi >= 35) {
                  // Очень полный — минус 18 кг
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 18, minWeight);
                } else if (bmi >= 30) {
                  // Полный — минус 15 кг
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 15, minWeight);
                } else if (bmi >= 27) {
                  // Слегка полный — минус 8 кг
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 8, minWeight);
                }
                const targetBmi = targetWeight / Math.pow(heightNum / 100, 2);
                // Описание целевого тела (после лёгкого "стройнения" для полных)
                if (targetBmi >= 35) { buildDesc = `very large plus-size heavy-set person, full round midsection, thick torso, wide hips, thick limbs, large frame`; buildShort = `very large heavy-set`; }
                else if (targetBmi >= 30) { buildDesc = `plus-size heavy-set person, full midsection, broad frame, thick torso`; buildShort = `plus-size heavy-set`; }
                else if (targetBmi >= 27) { buildDesc = `slightly fuller person with a soft midsection, fuller frame`; buildShort = `fuller`; }
                else if (targetBmi >= 22) { buildDesc = `average medium-build person, proportionate frame, healthy weight`; buildShort = `average medium`; }
                else { buildDesc = `slim lean narrow-build person, slender frame`; buildShort = `slim lean`; }

                if (targetWeight < weightNum) {
                  // Полный человек — генерируем слегка стройнее (минус 15-20 кг), но не худой
                  bodyBuildInstruction = `BODY TYPE — HIGHEST PRIORITY, override any default body rendering: the person is ${heightNum} cm tall. Render them at a flattering weight of approximately ${Math.round(targetWeight)} kg (slightly slimmer than their real ${weightNum} kg — a natural, healthy-looking reduction of about ${Math.round(weightNum - targetWeight)} kg, NOT extreme, NOT skinny). The body must look like a ${buildDesc} — realistic and proportionate, with a natural healthy body volume. CRITICAL: do NOT render a skinny, thin, or athletic body. Do NOT render the original heavy body either. The result must be a believable "slightly slimmer but still full-figured" version of the person — as if they lost ${Math.round(weightNum - targetWeight)} kg healthily. The torso, waist, hips, arms and legs MUST reflect target weight ${Math.round(targetWeight)} kg. Clothing must be tailored to flatter this body — structured tailoring, vertical lines, proper fit (not baggy, not skin-tight).`;
                } else {
                  // Худой/средний — без изменений, реальное тело
                  bodyBuildInstruction = `BODY TYPE — HIGHEST PRIORITY, override any default body rendering: the person is ${heightNum} cm tall and weighs ${weightNum} kg, which means a ${buildDesc}. Draw the FULL BODY with these exact proportions: ${buildShort} build, realistic body volume and width matching height ${heightNum} cm and weight ${weightNum} kg. CRITICAL: do NOT render a slim or athletic body if the person is not slim. Do NOT slim down the person. The torso, waist, hips, arms and legs MUST reflect the real weight ${weightNum} kg. Clothing must be tailored to flatter this ${buildShort} body — structured tailoring, vertical lines, proper fit (not baggy, not skin-tight).`;
                }
              }
              const fluxPrompt = `${bodyBuildInstruction} High-end fashion editorial photography, single person, one subject in frame, full body visible. Youthful appearance, fresh glowing skin, natural healthy complexion, smooth skin texture — person looks approximately 5 years younger than their actual age, vibrant and energetic. No tired look, no aging signs.${identityInstruction}${bodyFacingInstruction}${occasionAtmosphere}${poseInstruction}${qualityInstruction}${expressionInstruction} ${sanitizeEditPrompt(look.editPrompt)}`;
              imageDataUrl = await generateImageWithFlux(fluxPrompt, referenceImageBase64, mimeType);
              if (imageDataUrl) break;
              lastError = "No image data returned from Flux model.";
            } catch (e: any) {
              lastError = e.message;
              if (attempt < 2) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
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
        safeWrite(JSON.stringify({
          type: "progress",
          step: progressStep,
          text: `Сгенерировано ${completedImages}/${totalImages} образов...`
        }) + "\n");

        const completedLook = { ...look, image: generatedImageBase64, imageError: imageGenerationError };
        if (paymentId) {
          try {
            const resultDir = path.join(RESULTS_DIR, paymentId);
            const imageRef = await persistGeneratedImage(paymentId, idx, generatedImageBase64);
            checkpointLooks[idx] = { ...look, image: imageRef, imageError: imageGenerationError };
            writeJsonAtomic(path.join(resultDir, "result.json"), {
              greetingAndAnalysis,
              bodyTypeSummary,
              astroReading: astroReading || null,
              looks: checkpointLooks,
              savedAt: new Date().toISOString(),
            });
            updateOrder(paymentId, {
              status: "processing",
              completedLooks: checkpointLooks.filter((item: any) => !!item.image).length,
              error: imageGenerationError || null,
            });
          } catch (checkpointError) {
            console.error("[Checkpoint] failed:", checkpointError);
          }
        }
        return completedLook;
      }));

      // Step 3: Send intermediate result with images so user sees greeting + looks immediately
      safeWrite(JSON.stringify({
        type: "partial_result",
        greetingAndAnalysis,
        bodyTypeSummary,
        astroReading: astroReading || null,
        looks: looksWithImages,
      }) + "\n");

      // Save partial result immediately after image generation — survives if shopping URLs fail
      if (paymentId) {
        try {
          const resultDir = path.join(RESULTS_DIR, paymentId);
          fs.mkdirSync(resultDir, { recursive: true });
          const looksForPartial = looksWithImages.map((look: any, idx: number) => ({
            ...look,
            image: checkpointLooks[idx]?.image || null,
          }));
          writeJsonAtomic(
            path.join(resultDir, "result.json"),
            { greetingAndAnalysis, bodyTypeSummary, astroReading: astroReading || null, looks: looksForPartial, savedAt: new Date().toISOString() }
          );
        } catch (e) { console.error("[Partial save] failed:", e); }
      }

      // Step 4: Build Google Shopping search URLs — универсальный поиск,
      // не привязан к одному магазину, выдаёт товары из десятков площадок РФ
      safeWrite(JSON.stringify({ type: "progress", step: 4.0, text: "Формируем поисковые ссылки..." }) + "\n");

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

      // Persist result BEFORE sending to client — update with shopping URLs
      if (paymentId) {
        try {
          const resultDir = path.join(RESULTS_DIR, paymentId);
          fs.mkdirSync(resultDir, { recursive: true });
          const looksForStorage = looksWithImagesAndUrls.map((look: any, idx: number) => ({
            ...look,
            image: checkpointLooks[idx]?.image || null,
          }));
          writeJsonAtomic(
            path.join(resultDir, "result.json"),
            { greetingAndAnalysis, bodyTypeSummary, astroReading: astroReading || null, looks: looksForStorage, savedAt: new Date().toISOString() }
          );
        } catch (e) { console.error("[Result] Save failed:", e); }
      }

      if (paymentId) {
        const completedLooks = checkpointLooks.filter((look: any) => !!look.image).length;
        const isComplete = completedLooks === looksWithImagesAndUrls.length;
        const completedAt = isComplete ? new Date().toISOString() : undefined;
        updateOrder(paymentId, {
          status: isComplete ? "ready" : "partial",
          completedLooks,
          completedAt,
          resultExpiresAt: isComplete ? new Date(Date.now() + RESULTS_TTL_MS).toISOString() : undefined,
          unfinishedExpiresAt: isComplete ? undefined : new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
          error: isComplete ? null : "Не все изображения удалось создать. Повторите только отсутствующие фото.",
        });
      }

      // Промокод помечаем использованным ТОЛЬКО после успешной генерации.
      // Если упадём в catch ниже — код останется "не использован", пользователь сможет повторить.
      if (promoCode) {
        try { markPromoUsed(promoCode); } catch (e) { console.error("[Promo] markPromoUsed failed:", e); }
      }

      safeWrite(JSON.stringify({
        type: "result",
        greetingAndAnalysis,
        bodyTypeSummary,
        astroReading: astroReading || null,
        looks: looksWithImagesAndUrls,
      }) + "\n");

      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();

    } catch (error) {
      clearInterval(heartbeat);
      console.error("Error processing image in /api/stylize:", error);

      // Emergency save: persist whatever was generated before the error
      const paymentIdEmergency = sanitizeOrderId(req.body?.paymentId);
      if (paymentIdEmergency && greetingAndAnalysis && looksWithImages && looksWithImages.length > 0) {
        try {
          const resultDir = path.join(RESULTS_DIR, paymentIdEmergency);
          fs.mkdirSync(resultDir, { recursive: true });
          // Check if result.json already exists (saved by partial save)
          const resultFile = path.join(resultDir, "result.json");
          if (!fs.existsSync(resultFile)) {
            const emergencyLooks = looksWithImages.map((look: any, idx: number) => {
              let imageRef = look.image;
              if (look.image && look.image.startsWith("data:")) {
                const m = look.image.match(/^data:([^;]+);base64,(.+)$/);
                if (m) {
                  const ext = m[1].includes("png") ? "png" : "jpg";
                  const imgFile = `look_${idx}.${ext}`;
                  fs.writeFileSync(path.join(resultDir, imgFile), Buffer.from(m[2], "base64"));
                  imageRef = `/api/result-image/${paymentIdEmergency}/${imgFile}`;
                }
              }
              return { ...look, image: imageRef };
            });
            writeJsonAtomic(resultFile, {
              greetingAndAnalysis, bodyTypeSummary, astroReading: astroReading || null,
              looks: emergencyLooks, savedAt: new Date().toISOString()
            });
            console.log("[Emergency save] Saved partial result for", paymentIdEmergency);
          }
        } catch (saveErr) { console.error("[Emergency save] failed:", saveErr); }
      }

      if (paymentIdEmergency) {
        const completedLooks = looksWithImages?.filter((look: any) => !!look.image).length || 0;
        updateOrder(paymentIdEmergency, {
          status: completedLooks > 0 ? "partial" : "failed",
          completedLooks,
          error: (error as Error).message,
          unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
        });
      }

      safeWrite(JSON.stringify({ type: "error", error: (error as Error).message }) + "\n");
      if (!res.writableEnded) res.end();
    } finally {
      if (lockedOrderId) activeOrderIds.delete(lockedOrderId);
      if (lockedPromoCode) activePromoCodes.delete(lockedPromoCode);
    }
  });

  // Regenerate a single look image
  app.post("/api/regenerate-image", upload.single("image"), async (req: Request, res: Response) => {
    let retryKey = "";
    try {
      const paymentId = sanitizeOrderId(req.body.paymentId);
      const lookIdx = parseInt(req.body.lookIdx || "0", 10);
      if (!paymentId || !Number.isInteger(lookIdx) || lookIdx < 0) {
        return res.status(400).json({ error: "Некорректный заказ или номер образа." });
      }

      const order = await ensurePaidOrder(paymentId);
      if (!order?.paidAt) return res.status(403).json({ error: "Оплата заказа не подтверждена." });
      const expiresAt = order.resultExpiresAt || order.unfinishedExpiresAt;
      if (order.status === "expired" || (expiresAt && new Date(expiresAt).getTime() <= Date.now())) {
        cleanupOldResults();
        return res.status(410).json({ error: "Срок хранения заказа истёк." });
      }
      if (order.status === "processing" || activeOrderIds.has(paymentId)) {
        return res.status(409).json({ error: "Основная генерация этого заказа ещё выполняется." });
      }

      const resultDir = path.join(RESULTS_DIR, paymentId);
      const resultFile = path.join(resultDir, "result.json");
      if (!fs.existsSync(resultFile)) return res.status(409).json({ error: "Описание образов ещё не готово." });
      const saved = JSON.parse(fs.readFileSync(resultFile, "utf-8"));
      if (!saved.looks?.[lookIdx]) return res.status(404).json({ error: "Образ не найден." });
      if (saved.looks[lookIdx].image) return res.json({ image: saved.looks[lookIdx].image, alreadyReady: true });

      retryKey = paymentId;
      if (activeRetryKeys.has(retryKey)) return res.status(409).json({ error: "Для этого заказа уже повторяется другое фото." });
      activeRetryKeys.add(retryKey);

      const uploadedFile = req.file as MulterFile | undefined;
      let sourceBuffer: Buffer;
      let mimeType: "image/jpeg" | "image/png" | "image/webp";
      if (uploadedFile) {
        sourceBuffer = uploadedFile.buffer;
        mimeType = uploadedFile.mimetype as "image/jpeg" | "image/png" | "image/webp";
      } else {
        const sourceName = fs.readdirSync(resultDir).find(name => /^source_0\.(jpg|png|webp)$/i.test(name));
        if (!sourceName) return res.status(409).json({ error: "Исходное фото заказа не найдено." });
        sourceBuffer = fs.readFileSync(path.join(resultDir, sourceName));
        mimeType = sourceName.endsWith(".png") ? "image/png" : sourceName.endsWith(".webp") ? "image/webp" : "image/jpeg";
      }

      let input: any = {};
      try {
        const inputFile = path.join(resultDir, "input.json");
        if (fs.existsSync(inputFile)) input = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
      } catch {}
      const editPrompt = (saved.looks[lookIdx].editPrompt || req.body.editPrompt || "").toString().trim();
      const wishes = (input.wishes || req.body.wishes || "").toString().trim();
      if (!editPrompt) return res.status(409).json({ error: "Инструкция для этого образа не сохранилась." });

      const referenceImageBase64 = sourceBuffer.toString("base64");
      updateOrder(paymentId, { status: "partial", error: null });

      let imageDataUrl: string | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const poseInstruction = wishes.toLowerCase().includes("фотосессия")
            ? " POSE: Professional fashion editorial pose — body angled 45° to camera, weight shifted to one leg."
            : " POSE: Natural confident pose — slight body angle to camera, weight on one leg.";
          const identityInstruction = " IDENTITY: The person in the generated image MUST be the SAME person as in the reference photo. Preserve their gender, face, facial features, skin tone, eye color, jawline, and body type EXACTLY. Do NOT change gender. Do NOT swap to a different person. HAIR: Follow the hairstyle AND hair color described in the look prompt. If a new hair color is specified, RENDER that color — do not keep the original hair color when a new shade is described. Keep the same hairline and hair density.";
          const bodyFacingInstruction = " BODY: The person's full body must face the CAMERA DIRECTLY — torso, hips, and legs are FRONT-FACING toward the viewer. Avoid 3/4 turns, side profiles, or angled body poses. The subject should face the camera head-on.";
          const expressionInstruction = " EXPRESSION: Preserve the exact facial expression from the reference photo. Do NOT add a smile if the person is not smiling in the reference.";
          const fluxPrompt = `High-end fashion editorial photography. Single person only.${identityInstruction}${bodyFacingInstruction}${poseInstruction}${expressionInstruction} QUALITY: Maximum resolution, magazine cover quality. ${sanitizeEditPrompt(editPrompt)}`;
          imageDataUrl = await generateImageWithFlux(fluxPrompt, referenceImageBase64, mimeType);
          if (imageDataUrl) break;
        } catch (e: any) {
          lastError = e.message;
          if (attempt < 4) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        }
      }

      if (!imageDataUrl) {
        updateOrder(paymentId, { status: "partial", error: lastError || "Не удалось повторить генерацию изображения." });
        return res.status(503).json({ error: "Не удалось создать фото после нескольких попыток. Попробуйте позже." });
      }

      const imageRef = await persistGeneratedImage(paymentId, lookIdx, imageDataUrl);
      saved.looks[lookIdx].image = imageRef;
      saved.looks[lookIdx].imageError = null;
      saved.savedAt = new Date().toISOString();
      writeJsonAtomic(resultFile, saved);

      const completedLooks = saved.looks.filter((look: any) => !!look.image).length;
      const isComplete = completedLooks === saved.looks.length;
      updateOrder(paymentId, {
        status: isComplete ? "ready" : "partial",
        completedLooks,
        completedAt: isComplete ? new Date().toISOString() : order.completedAt,
        resultExpiresAt: isComplete ? new Date(Date.now() + RESULTS_TTL_MS).toISOString() : order.resultExpiresAt,
        unfinishedExpiresAt: isComplete ? undefined : new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
        error: isComplete ? null : "Остались изображения, которые нужно повторить.",
      });

      res.json({ image: imageRef, completed: isComplete });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (retryKey) activeRetryKeys.delete(retryKey);
    }
  });

  // Trial endpoint — бесплатный текстовый анализ без генерации картинок
  app.post("/api/trial", upload.array("photos", 2), async (req: Request, res: Response) => {
    try {
      const files = req.files as MulterFile[];
      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "Нужно загрузить фото" });
      }

      const imageContent: any[] = files.map(f => ({
        type: "image_url",
        image_url: { url: `data:${f.mimetype};base64,${f.buffer.toString("base64")}` },
      }));

      const scorePrompt = `Оцени стиль человека на фото по шкале от 1 до 10. Рост: ${height} см, вес: ${weight} кг. Ответь ТОЛЬКО одним числом от 1 до 10. Ничего больше.`;

      const analysisPrompt = `Ты — профессиональный стилист. Рост: ${height} см, вес: ${weight} кг.
Дай детальный анализ стиля на русском языке строго в таком порядке:

✅ Что гармонично в образе:
(конкретные вещи с фото — что хорошо сидит, что подходит)

🔄 Что стоит сменить:
(конкретные предметы гардероба которые стоит заменить и почему)

💡 Рекомендации:
(цвета, силуэт, материалы, стиль)`;

      const [scoreRaw, analysisRaw] = await Promise.all([
        callPolzaChat({
          model: ANALYSIS_MODEL,
          systemPrompt: "Отвечай только одним числом.",
          messages: [{ role: "user", content: [{ type: "text", text: scorePrompt }, ...imageContent] }],
          temperature: 0.1, maxTokens: 10, useJsonFormat: false,
        }),
        callPolzaChat({
          model: ANALYSIS_MODEL,
          systemPrompt: "Ты профессиональный стилист. Отвечай только текстом на русском языке.",
          messages: [{ role: "user", content: [{ type: "text", text: analysisPrompt }, ...imageContent] }],
          temperature: 0.7, maxTokens: 1200, useJsonFormat: false,
        }),
      ]);

      const scoreStr = typeof scoreRaw === "string" ? scoreRaw : JSON.stringify(scoreRaw);
      const scoreNum = parseInt(scoreStr.replace(/\D/g, "").slice(0, 2));
      const score = isNaN(scoreNum) || scoreNum < 1 || scoreNum > 10 ? null : scoreNum;
      const scoreLabels = ["","Начинающий","Базовый","Базовый","Хороший","Хороший","Уверенный","Уверенный","Отличный","Безупречный","Безупречный"];
      const scoreLabel = score ? scoreLabels[score] : null;

      const analysis = typeof analysisRaw === "string" ? analysisRaw : JSON.stringify(analysisRaw);
      const cleanAnalysis = analysis.replace(/```[\w]*\s*/gi, "").replace(/```/gi, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();

      res.json({ score, scoreLabel, greetingAndAnalysis: cleanAnalysis });
    } catch (error) {
      console.error("Error in /api/trial:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/antistyle", upload.array("photos", 1), async (req: Request, res: Response) => {
    try {
      const files = req.files as MulterFile[];
      if (!files || files.length === 0) return res.status(400).json({ error: "Нужно загрузить фото" });
      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";
      const img = files[0];
      const b64 = img.buffer.toString("base64");
      const mime = img.mimetype;

      const prompt = `Ты — остроумный стилист-эксперт. Проанализируй внешность человека и опиши его персональный АНТИ-СТИЛЬ.

РОСТ: ${height} см
ВЕС: ${weight} кг

Ответь СТРОГО в формате JSON:
{
  "result": "текст на русском, 4-6 абзацев: 1) АНТИ-ОБРАЗ — конкретные вещи/цвета/фасоны которые нелепо смотрятся, 2) ПОЧЕМУ ЭТО КАТАСТРОФА — объяснение для каждого элемента, 3) ГЛАВНЫЕ ТАБУ — 3-4 правила",
  "editPrompt": "english prompt for image generation: person wearing the described anti-style outfit, ridiculous fashion, specific ugly clothing items, colors and accessories that clash with their appearance. Fashion photography style, full body shot."
}`;

      const analysisRaw = await callPolzaChat({
        model: ANALYSIS_MODEL,
        systemPrompt: "Ты стилист с чувством юмора. Отвечай ТОЛЬКО валидным JSON.",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }] }],
        temperature: 0.8,
        maxTokens: 2048,
      });

      let parsed: any = {};
      try { parsed = typeof analysisRaw === "string" ? JSON.parse(analysisRaw) : analysisRaw; } catch { parsed = { result: String(analysisRaw), editPrompt: "" }; }

      let text = (parsed.result || "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();
      const editPrompt = parsed.editPrompt || "";

      // Generate anti-style image
      let image: string | null = null;
      if (editPrompt) {
        image = await generateImageWithFlux(
          `Fashion photography, full body shot. IDENTITY: The person MUST be the SAME person as in the reference photo. Preserve their gender, face, skin tone, hair color, and body type EXACTLY. Do NOT change gender. BODY: The person's full body must face the CAMERA DIRECTLY — torso, hips, and legs are FRONT-FACING toward the viewer. Avoid 3/4 turns, side profiles, or angled body poses. ${editPrompt}`,
          b64, mime
        );
      }

      res.json({ result: text, image });
    } catch (error) {
      console.error("Error in /api/antistyle:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/analyze-style", upload.array("photos", 2), async (req: Request, res: Response) => {
    try {
      const files = req.files as MulterFile[];
      if (!files || files.length < 2) return res.status(400).json({ error: "Нужно загрузить 2 фото: портрет и в полный рост" });

      const images = files.map(f => ({ type: "image_url" as const, image_url: { url: `data:${f.mimetype};base64,${f.buffer.toString("base64")}` } }));

      const prompt = `Ты — профессиональный стилист. Перед тобой два фото одного человека: портрет и фото в полный рост.

Проанализируй стиль и внешний вид. Ответь СТРОГО в формате JSON:
{
  "score": число от 1 до 10,
  "summary": "2-3 предложения — общее впечатление о стиле",
  "strengths": ["что хорошо — 2-3 пункта"],
  "improvements": ["что стоит изменить — 3-4 конкретных пункта с объяснением почему"],
  "potential": "2-3 предложения — каким может стать стиль при правильном подходе"
}`;

      const raw = await callPolzaChat({
        model: ANALYSIS_MODEL,
        systemPrompt: "Ты профессиональный стилист. Отвечай ТОЛЬКО валидным JSON без markdown.",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...images] }],
        temperature: 0.7,
        maxTokens: 1500,
      });

      let result: any = {};
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        result = match ? JSON.parse(match[0]) : {};
      } catch { result = { score: 0, summary: raw, strengths: [], improvements: [], potential: "" }; }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Ошибка анализа" });
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
      if (req.path === "/" || req.path === "") incVisit();
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Development mode — use Vite middleware
    const vite = await createViteServer({
      root: PROJECT_ROOT,
      server: {
        middlewareMode: true as any,
        allowedHosts: ['.stilist-ai.ru', 'stilist-ai.ru'],
      },
      appType: "spa",
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === "GET" && req.path === "/") incVisit();
      next();
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

