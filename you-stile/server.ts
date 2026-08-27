import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import crypto from "crypto";
import dotenv from "dotenv";
import { createNailsSubscription, NAILS_MONTH_PRICE } from "./nails-subscription";

const require = createRequire(import.meta.url);
const YooCheckout = require("yookassa");

type MulterFile = Express.Multer.File;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const PROJECT_ROOT = __dirname;

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "8602635380").trim();

/** Уведомления владельцу. Токен только из .env — никогда не в фронтенде. */
function notifyTelegram(text: string): void {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы");
    return;
  }
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  }).catch((e) => console.warn("[Telegram] send failed:", (e as Error).message));
}

// YooKassa client
const yooKassa = new YooCheckout({
  shopId: process.env.YOOKASSA_SHOP_ID || "",
  secretKey: process.env.YOOKASSA_SECRET_KEY || "",
});

// Stats helpers — event-based with timestamps
interface StatsEvent {
  type:
    | "visit"
    | "paid_standard"
    | "paid_premium"
    | "paid_nails_month"
    | "paid_grooming"
    | "paid_promo_standard"
    | "paid_promo_premium";
  ts: string;
}
interface StatsData {
  events: StatsEvent[];
  standardPrice: number;
  premiumPrice: number;
  nailsMonthPrice: number;
  groomingPrice?: number;
}

const statsPath = path.join(PROJECT_ROOT, "data", "stats.json");
const pageviewsPath = path.join(PROJECT_ROOT, "data", "pageviews.json");

type PageView = {
  ts: string;
  visitorId: string;
  name: string; // пусто = аноним
  path: string;
  kind?: "page" | "click";
};

let _pageviewsCache: PageView[] | null = null;
function loadPageviews(): PageView[] {
  if (_pageviewsCache) return _pageviewsCache;
  try {
    if (fs.existsSync(pageviewsPath)) {
      const raw = JSON.parse(fs.readFileSync(pageviewsPath, "utf-8"));
      _pageviewsCache = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : [];
      return _pageviewsCache!;
    }
  } catch {}
  _pageviewsCache = [];
  return _pageviewsCache;
}
function savePageviews(events: PageView[]) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const pruned = events.filter((e) => new Date(e.ts).getTime() >= cutoff).slice(-50000);
  _pageviewsCache = pruned;
  const dir = path.dirname(pageviewsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pageviewsPath, JSON.stringify(pruned));
}
function appendPageView(hit: PageView) {
  const events = loadPageviews();
  events.push(hit);
  savePageviews(events);
}
function filterPageviewsByPeriod(events: PageView[], period?: string): PageView[] {
  let cutoff: Date | null = null;
  const now = new Date();
  if (period === "today") cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (period === "week") cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (period === "month") cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  return cutoff ? events.filter((e) => new Date(e.ts) >= cutoff!) : events;
}

/** Не считаем в статистике заходы админа и тестовые (по имени в профиле). */
function isInternalPageView(e: PageView): boolean {
  const n = (e.name || "").trim().toLowerCase();
  if (!n) return false;
  return /^(admin|админ|тест|test|tester|testing)([\s._-]|$)/i.test(n)
    || n.includes("админ")
    || n.includes("admin")
    || n === "тест"
    || n === "test";
}

function summarizePageviews(period?: string) {
  const filtered = filterPageviewsByPeriod(loadPageviews(), period).filter((e) => !isInternalPageView(e));
  const pages = filtered.filter((e) => (e.kind || "page") === "page");
  const clicks = filtered.filter((e) => e.kind === "click");
  const uniqueIds = new Set(filtered.map((e) => e.visitorId));
  const namedIds = new Set(filtered.filter((e) => e.name.trim()).map((e) => e.visitorId));

  const countBy = (events: PageView[], key: (e: PageView) => string) => {
    const map = new Map<string, number>();
    for (const e of events) {
      const k = key(e);
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, count]) => ({ name, count }));
  };

  // Последние визиторы с цепочкой действий (для админки)
  const byVisitor = new Map<string, PageView[]>();
  for (const e of filtered) {
    const list = byVisitor.get(e.visitorId) || [];
    list.push(e);
    byVisitor.set(e.visitorId, list);
  }
  const journeys = [...byVisitor.entries()]
    .map(([visitorId, events]) => {
      const sorted = events.slice().sort((a, b) => a.ts.localeCompare(b.ts));
      const names = sorted.map((e) => e.name.trim()).filter(Boolean);
      const name = names.length ? names[names.length - 1] : "";
      return {
        visitorId,
        name,
        firstAt: sorted[0]?.ts || "",
        lastAt: sorted[sorted.length - 1]?.ts || "",
        steps: sorted.length,
        path: sorted.map((e) => (e.kind === "click" ? `клик:${e.path}` : e.path)).slice(-25),
      };
    })
    .sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""))
    .slice(0, 80);

  return {
    totalViews: pages.length,
    totalClicks: clicks.length,
    uniqueVisitors: uniqueIds.size,
    namedVisitors: namedIds.size,
    anonymousVisitors: Math.max(0, uniqueIds.size - namedIds.size),
    topPages: countBy(pages, (e) => e.path),
    topClicks: countBy(clicks, (e) => e.path),
    journeys,
  };
}
const RESULTS_DIR = path.join(PROJECT_ROOT, "data", "results");
const ORDERS_DIR = path.join(PROJECT_ROOT, "data", "orders");
const USERS_DIR = path.join(PROJECT_ROOT, "data", "users");
const PHONES_DIR = path.join(PROJECT_ROOT, "data", "phones");
const GROOMING_IMG_DIR = path.join(PROJECT_ROOT, "data", "grooming");
const GROOMING_RESULTS_DIR = path.join(PROJECT_ROOT, "data", "grooming-results");
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_DIR)) fs.mkdirSync(ORDERS_DIR, { recursive: true });
if (!fs.existsSync(USERS_DIR)) fs.mkdirSync(USERS_DIR, { recursive: true });
if (!fs.existsSync(PHONES_DIR)) fs.mkdirSync(PHONES_DIR, { recursive: true });
const PICKUP_DIR = path.join(PROJECT_ROOT, "data", "pickup-codes");
if (!fs.existsSync(PICKUP_DIR)) fs.mkdirSync(PICKUP_DIR, { recursive: true });
if (!fs.existsSync(GROOMING_IMG_DIR)) fs.mkdirSync(GROOMING_IMG_DIR, { recursive: true });
if (!fs.existsSync(GROOMING_RESULTS_DIR)) fs.mkdirSync(GROOMING_RESULTS_DIR, { recursive: true });
const GROOMING_FREE_FILE = path.join(PROJECT_ROOT, "data", "grooming-free-used.json");

function readFreeGroomUsed(): Record<string, string> {
  try {
    if (!fs.existsSync(GROOMING_FREE_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(GROOMING_FREE_FILE, "utf-8"));
    return raw && typeof raw === "object" ? raw as Record<string, string> : {};
  } catch {
    return {};
  }
}

function hasUsedFreeGrooming(visitorId: string): boolean {
  if (!visitorId) return false;
  return !!readFreeGroomUsed()[visitorId];
}

function markFreeGroomingUsed(visitorId: string): void {
  if (!visitorId) return;
  const data = readFreeGroomUsed();
  data[visitorId] = new Date().toISOString();
  try {
    fs.writeFileSync(GROOMING_FREE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("[Grooming] markFreeGroomingUsed failed:", e);
  }
}

const RESULTS_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours — только черновики без оплаты
const RESULTS_TTL_PAID_MS = 24 * 60 * 60 * 1000; // сутки — после оплаты / промо / с профилем
const UNFINISHED_ORDER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/** После оплаты хранение сутки; имя/visitor — тоже. */
function resultsTtlForUser(userName?: string | null, opts?: { paid?: boolean; visitorId?: string }): number {
  if (opts?.paid || (opts?.visitorId || "").trim() || (userName || "").trim()) return RESULTS_TTL_PAID_MS;
  return RESULTS_TTL_MS;
}

type UserStyleLook = {
  lookName: string;
  categories: string[];
  season?: string;
  occasions?: string[];
};
type UserSession = {
  paymentId: string;
  tier: string;
  at: string;
  season?: string;
  wishes?: string;
  looks: UserStyleLook[];
};
type UserProfile = {
  visitorId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  orderIds: string[];
  sessions: UserSession[];
};

function sanitizeVisitorId(value: unknown): string {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}
function userFile(visitorId: string) {
  return path.join(USERS_DIR, `${sanitizeVisitorId(visitorId)}.json`);
}
function readUserProfile(visitorId: string): UserProfile | null {
  const id = sanitizeVisitorId(visitorId);
  if (!id) return null;
  try {
    const file = userFile(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as UserProfile;
  } catch {
    return null;
  }
}
function saveUserProfile(profile: UserProfile): void {
  const id = sanitizeVisitorId(profile.visitorId);
  if (!id) return;
  profile.visitorId = id;
  profile.updatedAt = new Date().toISOString();
  writeJsonAtomic(userFile(id), profile);
}
function ensureUserProfile(visitorId: string, name = ""): UserProfile | null {
  const id = sanitizeVisitorId(visitorId);
  if (!id) return null;
  const existing = readUserProfile(id);
  if (existing) {
    if (name && name.trim() && existing.name !== name.trim()) {
      existing.name = name.trim().slice(0, 80);
      saveUserProfile(existing);
    }
    return existing;
  }
  const created: UserProfile = {
    visitorId: id,
    name: (name || "").trim().slice(0, 80),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    orderIds: [],
    sessions: [],
  };
  saveUserProfile(created);
  return created;
}
function buildStyleHistoryInstruction(profile: UserProfile | null, clientPast: string): string {
  const fromSessions = (profile?.sessions || [])
    .flatMap((s) =>
      (s.looks || []).map((l) => {
        const cats = (l.categories || []).filter(Boolean).slice(0, 6).join("/");
        const season = l.season || s.season || "";
        return [l.lookName, cats && `(${cats})`, season && `[${season}]`].filter(Boolean).join(" ");
      })
    )
    .filter(Boolean);
  const fromClient = clientPast
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const item of [...fromSessions, ...fromClient]) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 18) break;
  }
  if (!merged.length) return "";
  const seasons = [...new Set((profile?.sessions || []).map((s) => s.season).filter(Boolean))];
  const seasonHint = seasons.length
    ? ` Ранее уже были сезоны: ${seasons.slice(-4).join(", ")} — варьируй палитру и слои, даже в том же сезоне.`
    : "";
  return (
    `ИСТОРИЯ СТИЛЯ ЭТОГО ПОЛЬЗОВАТЕЛЯ (сервер + прошлые визиты): уже предлагались: ${merged.join("; ")}. ` +
    `КРИТИЧЕСКИ: НЕ повторяй эти названия, силуэты, цветовые схемы и концепции. ` +
    `Сделай принципиально ДРУГОЙ вайб: другие ткани, пропорции, акценты, настроение.${seasonHint} `
  );
}
function recordUserStyleSession(opts: {
  visitorId: string;
  userName?: string;
  paymentId: string;
  tier: string;
  season?: string;
  wishes?: string;
  looks: any[];
}): void {
  const id = sanitizeVisitorId(opts.visitorId);
  if (!id || !opts.paymentId) return;
  const profile = ensureUserProfile(id, opts.userName || "") || readUserProfile(id);
  if (!profile) return;
  if (!profile.orderIds.includes(opts.paymentId)) profile.orderIds.push(opts.paymentId);
  if (profile.orderIds.length > 40) profile.orderIds = profile.orderIds.slice(-40);
  const looks: UserStyleLook[] = (opts.looks || []).slice(0, 8).map((look: any): UserStyleLook => {
    const cats: string[] = (Array.isArray(look.items) ? look.items : [])
      .map((it: any) => String(it.category || it.name || "").trim().toLowerCase())
      .filter((c: string) => c.length > 0);
    const uniqueCats: string[] = Array.from(new Set<string>(cats)).slice(0, 8);
    return {
      lookName: String(look.lookName || look.name || "образ").slice(0, 80),
      categories: uniqueCats,
      season: opts.season || undefined,
    };
  });
  profile.sessions.push({
    paymentId: opts.paymentId,
    tier: opts.tier || "standard",
    at: new Date().toISOString(),
    season: opts.season || undefined,
    wishes: (opts.wishes || "").slice(0, 200) || undefined,
    looks,
  });
  if (profile.sessions.length > 25) profile.sessions = profile.sessions.slice(-25);
  saveUserProfile(profile);
}
const GROOMING_IMG_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const GROOMING_RESULTS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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
  visitorId?: string;
  userName?: string;
  /** Старые заказы: телефон как запасной ключ */
  phone?: string;
  /** Код заказа для «Мои образы», без телефона: СТИЛЬ-K7M2QX */
  pickupCode?: string;
}

type PhoneIndex = {
  phone: string;
  orderIds: string[];
  updatedAt: string;
};

/** Приводит номер РФ к виду 7XXXXXXXXXX. Иначе "". */
function normalizePhone(raw: unknown): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  return "";
}

function phoneFile(phone: string) {
  return path.join(PHONES_DIR, `${phone}.json`);
}

function readPhoneIndex(phone: string): PhoneIndex | null {
  const id = normalizePhone(phone);
  if (!id) return null;
  try {
    const file = phoneFile(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as PhoneIndex;
  } catch {
    return null;
  }
}

function linkOrderToPhone(phoneRaw: unknown, paymentIdRaw: unknown): string {
  const phone = normalizePhone(phoneRaw);
  const paymentId = sanitizeOrderId(paymentIdRaw);
  if (!phone || !paymentId) return phone;
  const existing = readPhoneIndex(phone);
  const orderIds = existing?.orderIds ? [...existing.orderIds] : [];
  if (!orderIds.includes(paymentId)) orderIds.push(paymentId);
  const trimmed = orderIds.slice(-40);
  writeJsonAtomic(phoneFile(phone), {
    phone,
    orderIds: trimmed,
    updatedAt: new Date().toISOString(),
  } satisfies PhoneIndex);
  return phone;
}

const PICKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizePickupCode(raw: unknown): string {
  let s = String(raw || "").toUpperCase();
  s = s.replace(/СТИЛЬ/g, "").replace(/STIL[bЬ]?/g, "");
  s = s.replace(/[^A-Z0-9]/g, "");
  if (s.length < 6 || s.length > 10) return "";
  return s.slice(0, 8);
}

function displayPickupCode(body: string): string {
  return body ? `СТИЛЬ-${body}` : "";
}

function generatePickupBody(): string {
  let body = "";
  for (let i = 0; i < 6; i++) body += PICKUP_ALPHABET[crypto.randomInt(PICKUP_ALPHABET.length)];
  return body;
}

function pickupFile(body: string) {
  return path.join(PICKUP_DIR, `${body}.json`);
}

function readPickup(body: string): { paymentId: string; code: string } | null {
  const id = normalizePickupCode(body);
  if (!id) return null;
  try {
    const file = pickupFile(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function createUniquePickupCode(): string {
  for (let i = 0; i < 12; i++) {
    const body = generatePickupBody();
    if (!fs.existsSync(pickupFile(body))) return body;
  }
  return generatePickupBody() + PICKUP_ALPHABET[crypto.randomInt(PICKUP_ALPHABET.length)];
}

function linkOrderToPickupCode(body: string, paymentIdRaw: unknown): string {
  const code = normalizePickupCode(body);
  const paymentId = String(paymentIdRaw || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!code || !paymentId) return "";
  writeJsonAtomic(pickupFile(code), {
    code,
    paymentId,
    createdAt: new Date().toISOString(),
  });
  return code;
}

const ADMIN_PIN = (process.env.ADMIN_PIN || "").trim();
const ADMIN_KEY = (process.env.ADMIN_SECRET || "").trim();

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function adminSessionToken(): string {
  if (!ADMIN_KEY) return "";
  return crypto.createHmac("sha256", ADMIN_KEY).update("ys-admin").digest("hex");
}

function isAdminRequest(req: Request): boolean {
  if (!ADMIN_PIN || !ADMIN_KEY) return false;
  const token = adminSessionToken();
  const cookies = parseCookies(req);
  const cookie = cookies.ys_admin || cookies.ys_owner || "";
  if (token && cookie && cookie.length === token.length && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(token))) {
    return true;
  }
  const provided = String(req.body?.secret || req.query.secret || "").trim();
  return !!provided && provided === ADMIN_KEY;
}

const OWNER_IPS_FILE = path.join(PROJECT_ROOT, "data", "owner-ips.json");
function clientIp(req: Request): string {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const xr = String(req.headers["x-real-ip"] || "").trim();
  const sock = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  return xf || xr || sock || "";
}
function loadOwnerIps(): string[] {
  try {
    if (fs.existsSync(OWNER_IPS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(OWNER_IPS_FILE, "utf-8"));
      return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
    }
  } catch {}
  return [];
}
function rememberOwnerIp(ip: string) {
  const clean = String(ip || "").trim();
  if (!clean || clean === "127.0.0.1" || clean === "::1" || clean === "localhost") return;
  const list = loadOwnerIps();
  if (list.includes(clean)) return;
  list.push(clean);
  writeJsonAtomic(OWNER_IPS_FILE, list);
}
function isOwnerRequest(req: Request): boolean {
  if (isAdminRequest(req)) return true;
  const ip = clientIp(req);
  return !!ip && loadOwnerIps().includes(ip);
}
function ownerCookieHeaders(req: Request): string[] {
  const token = adminSessionToken();
  if (!token) return [];
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const base = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${400 * 86400}${secure ? "; Secure" : ""}`;
  return [
    `ys_admin=${token}; ${base}`,
    `ys_owner=${token}; ${base}`,
  ];
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
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

function groomingResultPath(jobId: string) {
  return path.join(GROOMING_RESULTS_DIR, `${sanitizeOrderId(jobId)}.json`);
}
function readGroomingResult(jobId: string): any | null {
  const id = sanitizeOrderId(jobId);
  if (!id) return null;
  try {
    const file = groomingResultPath(id);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
  } catch {
    return null;
  }
}
function saveGroomingResult(jobId: string, payload: Record<string, unknown>) {
  const id = sanitizeOrderId(jobId);
  if (!id) return;
  try {
    const prev = readGroomingResult(id) || {};
    const mode = String(payload.mode || prev.mode || "");
    const paid = mode === "paid";
    const ttl = paid ? RESULTS_TTL_PAID_MS : GROOMING_RESULTS_TTL_MS;
    const merged: Record<string, unknown> = { ...prev, ...payload, mode, jobId: id };
    if (prev.analysis && payload.analysis && typeof payload.analysis === "object") {
      merged.analysis = { ...prev.analysis, ...(payload.analysis as Record<string, unknown>) };
    }
    if (Array.isArray(prev.draftLooks) && !payload.draftLooks) {
      merged.draftLooks = prev.draftLooks;
    }
    if (prev.result && !payload.result) merged.result = prev.result;
    if (prev.sourceImage && !payload.sourceImage) merged.sourceImage = prev.sourceImage;
    if (prev.referenceMime && !payload.referenceMime) merged.referenceMime = prev.referenceMime;
    merged.updatedAt = new Date().toISOString();
    merged.expiresAt = new Date(Date.now() + ttl).toISOString();
    writeJsonAtomic(groomingResultPath(id), merged);
  } catch (e) {
    console.error("[Grooming] save result failed:", (e as Error).message);
  }
}

function groomingLookFromParsed(look: any, agePolicy: GroomingAgePolicy) {
  return {
    name: look?.name || "Причёска",
    hairColor: look?.hairColor || "",
    description: look?.description || "",
    why: look?.why || "",
    outfitNote: look?.outfitNote || "",
    afterNote: look?.afterNote || groomingDefaultAfterNote(agePolicy),
    masterHowTo: look?.masterHowTo || "",
    editPromptAfter: look?.editPromptAfter || look?.editPromptClose || look?.editPrompt || "",
    imageClose: null as string | null,
    imageAfter: null as string | null,
    imageFull: null as string | null,
    imageError: null as string | null,
  };
}

function mapGroomingShopProducts(list: any[], howKey: "dosage" | "howTo") {
  return (Array.isArray(list) ? list : []).map((p: any) => {
    const query = encodeURIComponent((p.searchQuery || `${p.brand || ""} ${p.name || ""}`).toString().trim());
    return {
      name: p.name || "",
      brand: p.brand || "",
      dosage: howKey === "dosage" ? (p.dosage || "") : undefined,
      howTo: howKey === "howTo" ? (p.howTo || p.dosage || "") : undefined,
      why: p.why || "",
      searchQuery: p.searchQuery || "",
      price: p.price || "",
      wbUrl: `https://www.wildberries.ru/catalog/0/search.aspx?search=${query}`,
      ozonUrl: `https://www.ozon.ru/search/?text=${query}`,
      ymUrl: `https://market.yandex.ru/search?text=${query}`,
    };
  });
}

function buildGroomingClientResult(saved: any, jobId: string) {
  if (saved?.result) return saved.result;
  const a = saved?.analysis || {};
  const looks = Array.isArray(saved?.draftLooks) ? saved.draftLooks : [];
  if (saved?.mode === "free") {
    return {
      type: "result",
      mode: "free",
      faceShape: a.faceShape || "",
      colorType: a.colorType || "",
      hairStatus: a.hairStatus || "",
      coachNote: a.coachNote || "",
      bestLook: looks[0] || {},
      upsellTeaser: a.upsellTeaser || "",
      groomingPrice: GROOMING_PRICE,
      jobId,
    };
  }
  return {
    type: "result",
    mode: "paid",
    coachNote: a.coachNote || "",
    faceAnalysis: a.faceAnalysis || {},
    looks,
    skincare: {
      summary: a.skincare?.summary || "",
      amRoutine: a.skincare?.amRoutine || "",
      pmRoutine: a.skincare?.pmRoutine || "",
      homeHowTo: a.skincare?.homeHowTo || "",
      products: mapGroomingShopProducts(a.skincare?.products, "dosage"),
    },
    makeup: a.makeup ? {
      summary: a.makeup.summary || "",
      dayLook: a.makeup.dayLook || "",
      eveningLook: a.makeup.eveningLook || "",
      placement: a.makeup.placement || "",
      products: mapGroomingShopProducts(a.makeup.products, "howTo"),
    } : undefined,
    groomingPrice: GROOMING_PRICE,
    jobId,
  };
}
function cleanupOldGroomingResults(): number {
  let removed = 0;
  const now = Date.now();
  if (!fs.existsSync(GROOMING_RESULTS_DIR)) return 0;
  for (const entry of fs.readdirSync(GROOMING_RESULTS_DIR)) {
    if (!entry.endsWith(".json")) continue;
    const file = path.join(GROOMING_RESULTS_DIR, entry);
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const exp = raw.expiresAt ? new Date(raw.expiresAt).getTime() : 0;
      const mtime = fs.statSync(file).mtimeMs;
      if ((exp && exp < now) || (!exp && now - mtime > GROOMING_RESULTS_TTL_MS)) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch {}
  }
  return removed;
}
cleanupOldGroomingResults();
setInterval(cleanupOldGroomingResults, 60 * 60 * 1000);
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
      resultExpiresAt: complete ? new Date(Date.now() + RESULTS_TTL_PAID_MS).toISOString() : order.resultExpiresAt,
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
      if (raw.events) {
        _statsCache = {
          events: raw.events,
          standardPrice: raw.standardPrice || 100,
          premiumPrice: raw.premiumPrice || 200,
          nailsMonthPrice: raw.nailsMonthPrice || NAILS_MONTH_PRICE,
          groomingPrice: raw.groomingPrice || 100,
        };
        return _statsCache;
      }
      const events: StatsEvent[] = [];
      for (let i = 0; i < (raw.visits || 0); i++) events.push({ type: "visit", ts: new Date().toISOString() });
      for (let i = 0; i < (raw.paidStandardSales || raw.standardSales || 0); i++) events.push({ type: "paid_standard", ts: new Date().toISOString() });
      for (let i = 0; i < (raw.paidPremiumSales || raw.premiumSales || 0); i++) events.push({ type: "paid_premium", ts: new Date().toISOString() });
      _statsCache = {
        events,
        standardPrice: raw.standardPrice || 100,
        premiumPrice: raw.premiumPrice || 200,
        nailsMonthPrice: raw.nailsMonthPrice || NAILS_MONTH_PRICE,
        groomingPrice: raw.groomingPrice || 100,
      };
      return _statsCache;
    }
  } catch {}
  _statsCache = {
    events: [],
    standardPrice: 100,
    premiumPrice: 200,
    nailsMonthPrice: NAILS_MONTH_PRICE,
    groomingPrice: 100,
  };
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
  const type: StatsEvent["type"] =
    tier === "premium"
      ? "paid_premium"
      : tier === "nails_month"
        ? "paid_nails_month"
        : tier === "grooming"
          ? "paid_grooming"
          : "paid_standard";
  stats.events.push({ type, ts: new Date().toISOString() });
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
  const paidNailsMonthSales = filtered.filter(e => e.type === "paid_nails_month").length;
  const paidGroomingSales = filtered.filter(e => e.type === "paid_grooming").length;
  const promoStandardSales = filtered.filter(e => e.type === "paid_promo_standard").length;
  const promoPremiumSales = filtered.filter(e => e.type === "paid_promo_premium").length;
  const nailsMonthPrice = stats.nailsMonthPrice || NAILS_MONTH_PRICE;
  const groomingPrice = stats.groomingPrice || 100;
  const revenue =
    paidStandardSales * stats.standardPrice +
    paidPremiumSales * stats.premiumPrice +
    paidNailsMonthSales * nailsMonthPrice +
    paidGroomingSales * groomingPrice;
  return {
    visits,
    paidStandardSales,
    paidPremiumSales,
    paidNailsMonthSales,
    paidGroomingSales,
    promoStandardSales,
    promoPremiumSales,
    promoRedemptions: promoStandardSales + promoPremiumSales,
    standardPrice: stats.standardPrice,
    premiumPrice: stats.premiumPrice,
    nailsMonthPrice,
    groomingPrice,
    revenue,
  };
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

// Grooming (причёски + уход) knowledge + prompt
const GROOMING_PRICE = 100;
const groomingParts = ["part0_trends_2026.md", "part1_haircuts.md", "part2_color.md", "part3_skincare.md", "part4_makeup.md"]
  .map((f) => {
    const p = path.join(PROJECT_ROOT, "src", "grooming", f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
  })
  .filter(Boolean)
  .join("\n\n---\n\n");
const groomingPromptPath = path.join(PROJECT_ROOT, "src", "grooming-system-prompt.txt");
let groomingSystemPromptTemplate = fs.existsSync(groomingPromptPath)
  ? fs.readFileSync(groomingPromptPath, "utf-8")
  : "";
function buildGroomingSystemPrompt(mode: "free" | "paid") {
  return groomingSystemPromptTemplate
    .replace("{{GROOMING_KNOWLEDGE_BASE}}", groomingParts)
    .replace("{{MODE}}", mode);
}

const stylistChatPromptPath = path.join(PROJECT_ROOT, "src", "stylist-chat-prompt.txt");
const stylistChatPromptTemplate = fs.existsSync(stylistChatPromptPath)
  ? fs.readFileSync(stylistChatPromptPath, "utf-8")
  : "Ты стилист. Отвечай по-русски только про гардероб, аксессуары, причёску и маникюр. В конце предлагай тарифы с картинками на stilist-ai.ru.";

function buildStylistChatPrompt(): string {
  const stats = loadStats();
  return stylistChatPromptTemplate
    .replace(/\{\{PRICE_STANDARD\}\}/g, String(stats.standardPrice || 100))
    .replace(/\{\{PRICE_PREMIUM\}\}/g, String(stats.premiumPrice || 200))
    .replace(/\{\{PRICE_GROOMING\}\}/g, String(stats.groomingPrice || 100))
    .replace(/\{\{PRICE_NAILS\}\}/g, String(stats.nailsMonthPrice || NAILS_MONTH_PRICE));
}

const POLZA_API_KEY = process.env.POLZA_API_KEY;
if (!POLZA_API_KEY) {
  console.error("POLZA_API_KEY is not set in environment variables");
  process.exit(1);
}
const POLZA_BASE_URL = process.env.POLZA_BASE_URL || "https://polza.ai/api/v1";

const ANALYSIS_MODEL = "google/gemini-3.7-flash";
const GENDER_MODEL = "google/gemini-3.5-flash-lite";
// OpenAI GPT-5.4 Image 2 — сильное сохранение лица при редактировании по референсу (Polza /media)
const IMAGE_MODEL = "openai/gpt-5.4-image-2";
const IMAGE_PROMPT_MAX = 4900; // лимит модели ~5000 символов

function clampImagePrompt(prompt: string): string {
  const p = (prompt || "").trim();
  if (p.length <= IMAGE_PROMPT_MAX) return p;
  return p.slice(0, IMAGE_PROMPT_MAX - 1).trimEnd();
}

/** Достаёт base64 из data-URL, локального /api/grooming-image или http(s) URL */
async function resolveImageToBase64(
  image: string | null | undefined
): Promise<{ base64: string; mime: string } | null> {
  if (!image) return null;
  try {
    const dataMatch = image.match(/^data:([^;]+);base64,(.+)$/);
    if (dataMatch) {
      return { mime: dataMatch[1] || "image/jpeg", base64: dataMatch[2] };
    }
    const localGroom = image.match(/^\/api\/grooming-image\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/);
    if (localGroom) {
      const imgPath = path.join(GROOMING_IMG_DIR, localGroom[1], localGroom[2]);
      if (!fs.existsSync(imgPath)) return null;
      const buf = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      return { base64: buf.toString("base64"), mime };
    }
    const localResult = image.match(/^\/api\/result-image\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)$/);
    if (localResult) {
      const imgPath = path.join(RESULTS_DIR, localResult[1], localResult[2]);
      if (!fs.existsSync(imgPath)) return null;
      const buf = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      return { base64: buf.toString("base64"), mime };
    }
    if (/^https?:\/\//i.test(image)) {
      const response = await fetchWithTimeout(image, { method: "GET" }, 120000);
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const mime = contentType.includes("png")
        ? "image/png"
        : contentType.includes("webp")
          ? "image/webp"
          : "image/jpeg";
      const buf = Buffer.from(await response.arrayBuffer());
      return { base64: buf.toString("base64"), mime };
    }
  } catch (e) {
    console.error("[resolveImageToBase64]", (e as Error).message);
  }
  return null;
}

function getOccasionStyleGuide(wishes: string): string {
  const w = wishes.toLowerCase();
  if (w.includes("яхта"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ЯХТЫ — ИГНОРИРУЙ стандартную структуру офис/вечер/color-block. На фото человек НА ЯХТЕ (палуба, тик, поручни, море), не на берегу в кустах. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. YACHT DECK CHIC: лён/шёлк, светлый или яркий resort look, очки, эспадрильи или лоферы. Вайб: палуба, закат, глянец.\n2. RIVIERA LUXE: монохромный купальный или resort look + лёгкий верхний слой, золото, шляпа. Вайб: яхта, Ибица.\n3. SUNSET COCKTAIL: элегантный вечер на палубе — платье/костюм, который держит ветер, не парк. Вайб: аперитив на яхте.`;
  if (w.includes("горнолыжн"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ГОРНОЛЫЖНОГО КУРОРТА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. SLOPE CHIC: premium горнолыжный комбинезон или комплект (Bogner/Fendi Ski уровень), яркий или монохромный, шлем с визором, перчатки. Вайб: Куршевель, стильно на склоне.\n2. APRÈS-SKI LUXE: кашемировый свитер + горнолыжные брюки или меховой жилет, угги или ботинки, шапка-бини. Вайб: шале, горячий шоколад, уютно и дорого.\n3. MOUNTAIN GLAM: вечерний look для ресторана курорта (платье + шуба или пуховик), элегантно в горах. Вайб: ужин в Альпах, гламур и снег.`;
  if (w.includes("загородн") || w.includes("природ") || w.includes("пикник"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ЗАГОРОДНОГО ОТДЫХА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. COUNTRY CHIC: льняное платье или комплект в нейтральных тонах, соломенная шляпа, сандалии или эспадрильи. Вайб: загородный дом, естественно и красиво.\n2. PICNIC STYLE: лёгкий сарафан или юбка с блузой, плетёная корзина-сумка, балетки или мюли. Вайб: пикник в поле, романтично.\n3. OUTDOOR ADVENTURE: стильный casual look (джинсы + рубашка + кроссовки), функционально и модно. Вайб: прогулка по лесу, активный отдых.`;
  if (w.includes("пляж") || w.includes("отдых на пляже") || (w.includes("курорт") && !w.includes("горнолыж")))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ ОТДЫХА/ПЛЯЖА — ИГНОРИРУЙ стандартную структуру офис/вечер/color-block. На фото — пляж, море или beach club, не городской парк. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. RESORT CHIC: яркий этнический принт (фуксия/кобальт/терракот), рубашка+шорты или платье-рубашка, соломенная шляпа, зеркальные очки, эспадрильи, плетёная сумка. Вайб: Санторини, закат, "вау какая стильная".\n2. BEACH CLUB LUXE: монохромный яркий купальный look (лимонный/коралловый/аква), парео или льняные брюки, золотые украшения-ракушки, сандалии на платформе, oversized соломенная шляпа. Вайб: Ибица, глянцевый журнал.\n3. TROPICAL MAXIMALISM: смелый цветочный или анималистичный принт, сатиновое мини или макси платье, яркие аксессуары, цветные линзы, босоножки. Вайб: Бали, тропики, Instagram-perfect.`;
  if (w.includes("ресторан") || w.includes("ужин"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ РЕСТОРАНА — ИГНОРИРУЙ стандартную структуру. На фото человек ВНУТРИ зала ресторана (столы, свет, зал), не на улице и не в кустах, даже если сезон осень. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. CLASSIC ELEGANCE: платье-футляр или костюм в нейтральном/глубоком цвете, жемчуг или тонкие украшения, каблук, маленькая сумочка. Вайб: fine dining, безупречно.\n2. MODERN CHIC: шёлковая блуза + брюки с высокой талией, интересный пояс, лоферы или мюли, statement серьги. Вайб: стильный ресторан, уверенная женщина.\n3. GLAMOUR NIGHT: вечернее платье с деталями (разрез/открытая спина/блеск), эффектные украшения, вечерняя сумочка. Вайб: особый повод, все взгляды на неё.`;
  if (w.includes("свидание") || w.includes("романтич"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ СВИДАНИЯ — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. ROMANTIC EVENING: элегантное платье миди в глубоком цвете (бордо/изумруд/полночный синий), тонкие украшения, каблук, клатч. Вайб: первое свидание, ресторан, "она потрясающая".\n2. CHIC & PLAYFUL: стильный комплект — шёлковая блуза + широкие брюки или юбка миди, интересный аксессуар как акцент, лоферы или мюли. Вайб: кофе перерастает в ужин, непринуждённо и красиво.\n3. BOLD DATE LOOK: смелый монохромный total look или statement платье, яркая помада, эффектные серьги. Вайб: она точно запомнится, уверенность и шарм.`;
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
  if (w.includes("корпоратив"))
    return `\n\n🎯 ИНСТРУКЦИЯ ПО ОБРАЗАМ ДЛЯ КОРПОРАТИВА — ИГНОРИРУЙ стандартную структуру. Создай образы из этих направлений (число образов = looksCount, задан выше):\n1. FESTIVE PROFESSIONAL: нарядный костюм или платье-миди в праздничном цвете (бордо/изумруд/золото), элегантно и уместно. Вайб: корпоратив в хорошей компании, запомнится.\n2. COCKTAIL CHIC: коктейльное платье или стильный комплект, интересные украшения, каблук. Вайб: вечеринка коллег, выглядит лучше всех.\n3. SMART PARTY: пиджак с блеском или интересной деталью + брюки/юбка, баланс между офисом и праздником. Вайб: профессионально и празднично одновременно.`;
  return "";
}

/** Разворачивает «Ресторан — 2 образ(а), Курорт или яхта — 1» в список поводов по образам. */
function expandOccasionList(occasionRaw: string): string[] {
  const slots: string[] = [];
  const re = /([^,;]+?)\s*[—–-]\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(occasionRaw || ""))) {
    const name = m[1].replace(/^.*поводам:\s*/i, "").trim();
    const n = Math.min(5, Math.max(1, parseInt(m[2], 10) || 1));
    for (let i = 0; i < n && slots.length < 5; i++) slots.push(name);
  }
  return slots;
}

function seasonClimate(season?: string): string {
  const s = (season || "").toLowerCase();
  if (s.includes("зим"))
    return " SEASON: winter. Cold-season layers (coat, wool, boots). Outdoor: crisp cool daylight or night lamps on snow/stone. Indoor: warm tungsten vs cold window. No summer linen, no tropical beach unless SCENE is beach.";
  if (s.includes("весн"))
    return " SEASON: spring. Fresh cool daylight, lighter jacket/trench, tender distant greenery only — not a wall of bushes.";
  if (s.includes("лет"))
    return " SEASON: summer. Long daylight or golden hour, warm air, lighter fabrics, no winter coat or heavy wool overcoat.";
  if (s.includes("осень"))
    return " SEASON: autumn. Lower sun, longer warm-gold shadows, cooler air, trench/coat layers, dry leaves on stone — not a forest of bushes.";
  return " SEASON: match the outfit layers already listed. Time of day comes from LIGHT.";
}

/** SCENE + LIGHT + TIME для GPT Image 2: место, время суток, ключ, тень. */
function getOccasionAtmosphere(wishes: string, idx: number = 0): string {
  const w = wishes.toLowerCase();
  const i = idx % 3;
  const pick = (a: string[]) => a[i];
  if (w.includes("яхта"))
    return pick([
      " TIME: golden hour, late day. SCENE: ON a luxury yacht teak deck at sea, railing, superstructure, water — aboard, not on shore, not in bushes. LIGHT: warm 3000K sun from upper right 45°, long soft shadow left, sea bounce fill, catchlights.",
      " TIME: midday. SCENE: yacht flybridge / sun deck, helm and horizon, ON the yacht. LIGHT: bright 5200K sun from above, even fill, crisp shadows on teak, face not blown out.",
      " TIME: sunset. SCENE: yacht aft-deck lounge, white seating, ON the yacht. LIGHT: warm amber key camera-left 45°, golden water, gentle rim on hair, readable face.",
    ]);
  if (w.includes("горнолыжн"))
    return pick([
      " TIME: winter day. SCENE: alpine ski resort, snow peaks. LIGHT: crisp cold 5600K daylight, bright snow bounce under chin, sharp cool shadows.",
      " TIME: midday on snow. SCENE: ski slope, powder. LIGHT: clear high sun, hard snow sparkle, cool blue in shade, face filled by bounce.",
      " TIME: evening indoor. SCENE: mountain chalet, fireplace. LIGHT: 2700K fire glow camera-left, soft room fill, warm cloth sheen.",
    ]);
  if (w.includes("загородн") || w.includes("природ") || w.includes("пикник"))
    return pick([
      " TIME: daytime. SCENE: countryside meadow estate, house and lawn. LIGHT: soft 5400K daylight, open-sky fill, long soft ground shadows.",
      " TIME: day, dappled. SCENE: estate garden path with trees, not a bush wall. LIGHT: sun through leaves, cool green ambient, soft facial shadow from the key.",
      " TIME: golden hour. SCENE: lakeside dock. LIGHT: warm sun from right, water bounce, rim on hair, contact shadow on wood.",
    ]);
  if (w.includes("пляж") || w.includes("отдых на пляже") || (w.includes("курорт") && !w.includes("горнолыж")))
    return pick([
      " TIME: golden hour. SCENE: sandy beach by the sea, shoreline, not a city park. LIGHT: warm 3000K sun upper right, long shadow left, sand bounce under chin.",
      " TIME: midday. SCENE: beach club, turquoise water behind. LIGHT: soft 5200K sun from above, even fill, short crisp shadows, face not harsh.",
      " TIME: late day. SCENE: seaside pool terrace facing water, not bushes. LIGHT: warm sun from the right, water reflections, soft cloth highlights.",
    ]);
  if (w.includes("ресторан") || w.includes("ужин"))
    return pick([
      " TIME: evening indoor. SCENE: INSIDE an upscale restaurant dining room, set tables, chandelier — not outdoors, not park. LIGHT: 2800K tungsten overhead + weaker side fill, realistic indoor contrast, shadows on table linen.",
      " TIME: night indoor. SCENE: INSIDE fine-dining room, marble table, waiter aisle. LIGHT: focused warm spotlight above-front, deep soft background, face loop-lit.",
      " TIME: evening indoor. SCENE: INSIDE restaurant booth, lamps, guests softly out of focus. LIGHT: 2700K sconces from sides, cozy falloff, catchlights.",
    ]);
  if (w.includes("свидание") || w.includes("романтич"))
    return pick([
      " TIME: night indoor. SCENE: intimate restaurant INSIDE, candlelit, not a garden. LIGHT: 2700K candles below-front as key, soft falloff, warm cloth sheen.",
      " TIME: evening indoor. SCENE: wine bar, brick walls. LIGHT: amber sconces from sides, soft shadow under chin, readable eyes.",
      " TIME: night. SCENE: table for two INSIDE, city lights only through a window. LIGHT: warm interior key from the left, window as cool rim, not neon on skin.",
    ]);
  if (w.includes("вечеринк") || w.includes("клуб") || w.includes("ночная"))
    return pick([
      " TIME: night indoor. SCENE: upscale nightclub interior. LIGHT: one warm practical key above-left 45°, dim ambient, face clearly lit — no magenta/cyan wash on skin.",
      " TIME: night. SCENE: rooftop party, skyline. LIGHT: warm string lights + soft frontal fill, city glow behind, contact shadows on floor.",
      " TIME: night indoor. SCENE: exclusive dark lounge. LIGHT: single 2800K key above-left 45°, moody but readable face, no cyber neon.",
    ]);
  if (w.includes("свадьб") || w.includes("торжеств") || w.includes("выпускн"))
    return pick([
      " TIME: evening indoor. SCENE: grand ballroom, crystal chandeliers. LIGHT: soft 3000K overhead diffusion + 45° side accent on cloth, gold catch on fabric.",
      " TIME: daytime ceremony. SCENE: garden venue with trees, architecture visible. LIGHT: soft daylight through leaves, cool-green ambient, soft facial shadows.",
      " TIME: golden hour. SCENE: historic venue exterior, columns. LIGHT: warm key camera-right, long soft shadow left, stone bounce fill.",
    ]);
  if (w.includes("офис") || w.includes("деловая") || w.includes("бизнес"))
    return pick([
      " TIME: daytime indoor. SCENE: modern glass office, city through windows. LIGHT: 5500K window key camera-left 45°, weak desk-lamp fill, cool daylight on wool.",
      " TIME: overcast day. SCENE: business district street, glass buildings. LIGHT: bright open-sky 6000K, even soft shadows on pavement and cloth.",
      " TIME: daytime indoor. SCENE: minimalist conference room. LIGHT: soft overhead panels, clean neutral, low contrast, fabric still textured.",
    ]);
  if (w.includes("спорт") || w.includes("фитнес"))
    return pick([
      " TIME: daytime indoor. SCENE: modern premium gym. LIGHT: cool bright LEDs overhead, slight side contrast, sharp knit texture, face filled.",
      " TIME: sunrise. SCENE: city park path. LIGHT: warm low sun from left, long soft shadows, fresh cool air look.",
      " TIME: midday. SCENE: rooftop workout, skyline. LIGHT: clear sun from above, crisp shadows, high clarity, face not squinting-blown.",
    ]);
  if (w.includes("прогулк") || w.includes("кафе") || w.includes("шопинг") || w.includes("casual"))
    return pick([
      " TIME: morning. SCENE: European cobblestone street, stone facades. LIGHT: soft 5000K daylight upper left, natural urban color, longish morning shadows.",
      " TIME: afternoon. SCENE: café terrace on a street, architecture behind, not a forest of bushes. LIGHT: dappled sun, warm highlights, cloth folds in shade.",
      " TIME: golden afternoon. SCENE: city street path, buildings. LIGHT: sun from the right, soft leaf/stone shadows on ground, not a bush wall.",
    ]);
  if (w.includes("театр") || w.includes("выставк"))
    return pick([
      " TIME: evening indoor. SCENE: grand theatre lobby. LIGHT: warm chandelier overhead, gold reflections on fabric, face filled.",
      " TIME: daytime indoor. SCENE: white-wall art gallery. LIGHT: clean museum spots from above, 5000K, sharp cloth detail.",
      " TIME: night. SCENE: theatre entrance, marquee. LIGHT: cool marquee glow + warm frontal fill on face.",
    ]);
  if (w.includes("путешеств") || w.includes("самолёт"))
    return pick([
      " TIME: daytime indoor. SCENE: airport terminal, large windows. LIGHT: bright cool daylight from glass, soft ambient fill, cloth edges sharp.",
      " TIME: daytime. SCENE: iconic city landmark outdoors, architecture. LIGHT: clear natural daylight, vivid but realistic color, ground shadow.",
      " TIME: evening indoor. SCENE: boutique hotel lobby. LIGHT: warm side lamps, polished marble, gentle falloff on face.",
    ]);
  if (w.includes("фотосессия"))
    return pick([
      " TIME: late day indoor. SCENE: luxury penthouse, skyline windows. LIGHT: strong window key left 45°, soft fill right, editorial 1:3 contrast, fabric sheen from the key.",
      " TIME: daytime. SCENE: urban street, architecture behind. LIGHT: natural daylight, slight backlight rim, realistic street color, face filled.",
      " TIME: golden hour. SCENE: rooftop terrace, city panorama. LIGHT: warm key from right, long soft shadows, catchlights.",
    ]);
  if (w.includes("фестиваль") || w.includes("концерт"))
    return pick([
      " TIME: sunset. SCENE: outdoor festival field. LIGHT: warm low sun backlight, soft frontal fill, vivid natural color, long shadows.",
      " TIME: night indoor. SCENE: concert venue. LIGHT: warm stage practicals + soft front fill on face — no laser grid, no cyan/magenta skin.",
      " TIME: late day. SCENE: festival art installation outdoors. LIGHT: warm natural late-day light, saturated but realistic palette.",
    ]);
  if (w.includes("корпоратив"))
    return pick([
      " TIME: evening indoor. SCENE: corporate event venue. LIGHT: warm event wash from above, soft frontal fill, realistic cloth texture.",
      " TIME: evening indoor. SCENE: hotel ballroom celebration. LIGHT: chandelier ambient + gentle side accent on fabric.",
      " TIME: night. SCENE: rooftop corporate party, city view. LIGHT: evening city glow + soft warm key on face.",
    ]);
  return [
    " TIME: afternoon. SCENE: European city street, stone buildings. LIGHT: warm sun from upper left, soft urban shadows, realistic color, contact shadow under feet.",
    " TIME: daytime indoor. SCENE: modern interior, floor-to-ceiling windows. LIGHT: soft daylight from windows left, gentle indoor fill, cloth folds in shade.",
    " TIME: golden afternoon. SCENE: city café terrace on a street, architecture behind, not a forest of bushes. LIGHT: sun from the right, soft urban shadows.",
  ][idx % 3];
}

/** Промпт для GPT Image 2: CHANGE/PRESERVE, лицо с фото, лучший ракурс без профиля. */
function buildOutfitImagePrompt(opts: {
  editPrompt: string;
  detectedGender: string;
  wishes: string;
  lookIdx: number;
  bodyBuildInstruction?: string;
  season?: string;
}): string {
  const gender = opts.detectedGender || "person";
  const atmosphere = getOccasionAtmosphere(opts.wishes || "", opts.lookIdx);
  const seasonBlock = seasonClimate(opts.season);
  const bodyExtra = (opts.bodyBuildInstruction || "").trim();
  const isPhotoshoot = (opts.wishes || "").toLowerCase().includes("фотосессия");
  const bodyMove = isPhotoshoot
    ? "editorial fashion body language that fits the SCENE (walk, weight on one hip, sit on a ledge) — still face-to-camera"
    : "natural body language that fits the SCENE (stand at ease, walk, slight turn, or sit if the place asks for it)";

  return `Edit Image 1. Photorealistic virtual try-on of a REAL person. Image 1 is the identity lock — a close friend must instantly recognize this person.

CHANGE only:
- Replace EVERY garment, shoe, bag, glasses, jewelry, scarf, and hat from Image 1 with the outfit below. Seasonal clothes fully replace old ones (a winter coat must not keep a summer cap from the photo).
- Place the person IN the SCENE with this TIME of day/night and LIGHT. Architecture and materials (stone, walnut, teak, marble, glass) — not a park of bushes, not an empty white cyclorama.
- Best flattering fashion camera for THIS face: 3/4 full body, torso turned 15–25°, both eyes visible, face toward camera. Do NOT copy the selfie crop, arm pose, or awkward stance from Image 1.
- Body may ${bodyMove}. Head stay mostly frontal — never profile, never more than ~25° head turn, never hide an eye.

OUTFIT (apply precisely):
${sanitizeEditPrompt(opts.editPrompt)}

PRESERVE (do not drift — restated):
- Exact same face as Image 1: bone structure, eyes, brows, nose, lips, jaw, cheeks, forehead, ears
- Freckles, moles, scars, asymmetry; same age; same ${gender}; same ethnicity and skin undertone
- Same hair identity: color, length, hairline, parting, texture (tidy OK). Hair is NOT a cap/hat from Image 1
- EXPRESSION: same as Image 1 — do not invent a new smile or open-mouth laugh; keep the same mouth shape
- Body of THIS person${bodyExtra ? ` — ${bodyExtra}` : "; keep real proportions; clothing fit this body"}

CAMERA:
- Photorealistic 3:4, 85mm look, camera 3–5 m back so the face never distorts. Never 24–35mm near the head. Head-to-shoes; hem and shoes readable. Catchlights in both eyes.

LIGHT, SHADOW, CLOTH (must read as a real photograph):
${atmosphere}${seasonBlock}
LOCATION LOCK: season and time change clothes and light only — they do not move the person into park/bushes/forest unless the occasion is countryside/picnic. Restaurant/dinner = INSIDE. Yacht = ON the yacht. Beach = sand/sea. Club = inside. Office = office.
- One motivated key + weaker fill. Shadows fall from that key onto face, cloth, and ground (soft contact shadow under feet).
- Fabric physics: gravity drape at waist, elbow, hem; wool absorbs light; silk/satin sheen ONLY from the KEY; leather grain; knit loops; stitching, buttons, zippers, hems sharp. Not ironed cardboard, not cheap e-commerce, not plastic CGI.
- Face always sharp and readable in this light. Natural pores. No on-camera flash, no beauty-filter poreless skin, no mannequin, no cyberpunk neon on skin.

CONSTRAINTS: single person; no watermark, text, logo, collage, extra limbs.`;
}

function parseDetectedGender(raw: string): "man" | "woman" | null {
  const t = String(raw || "").toLowerCase().replace(/ё/g, "е");
  if (/\b(woman|female|женщин|девуш|девочк)\b/i.test(t)) return "woman";
  if (/\b(man|male|мужчин|парень|мальчик)\b/i.test(t)) return "man";
  return null;
}

async function detectGenderFromPhoto(imageBase64: string, mimeType: string): Promise<"man" | "woman" | null> {
  try {
    const genderResp = await fetchWithTimeout(`${POLZA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${POLZA_API_KEY}` },
      body: JSON.stringify({
        model: GENDER_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Look at the photo and answer with ONE word only: man or woman. Gender of the person in the photo. Based ONLY on the photo, not on any name." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    }, 30000);
    if (!genderResp.ok) return null;
    const gd = await genderResp.json();
    const gtext = (gd?.choices?.[0]?.message?.content || "").toString();
    const parsed = parseDetectedGender(gtext);
    console.log("[Gender] Detected:", parsed || "unknown", "raw:", gtext.trim());
    return parsed;
  } catch (e: any) {
    console.error("[Gender] Detection failed:", e.message);
    return null;
  }
}

function genderWardrobeInstruction(gender: "man" | "woman" | null): string {
  if (gender === "man") {
    return `\n\n⚠️ ПОЛ ПО ФОТО: МУЖЧИНА. Весь гардероб, description, items[], searchQuery, editPrompt и парфюм — ТОЛЬКО мужские. Запрещено: юбка, платье, сарафан, женские брюки, каблуки, лодочки, босоножки, женская блузка, женское пальто женского кроя, серьги-капли если это не мужской стиль. В каждом searchQuery должно быть слово «мужской». Парфюм — мужской или унисекс (не женский цветочный soliflore).\n`;
  }
  if (gender === "woman") {
    return `\n\n⚠️ ПОЛ ПО ФОТО: ЖЕНЩИНА. Весь гардероб — женский. В каждом searchQuery слово «женский». Парфюм — женский или унисекс.\n`;
  }
  return `\n\n⚠️ GENDER DETECTION — CRITICAL: Determine the person's gender STRICTLY from the photo, NOT from the user's name. If the photo shows a WOMAN — women's looks. If a MAN — men's looks only (no women's trousers, skirts, heels). If the name disagrees with the photo, acknowledge it in greetingAndAnalysis and follow the PHOTO.\n`;
}

function sanitizeLooksForGender(looks: any[], gender: "man" | "woman" | null): any[] {
  if (!Array.isArray(looks) || (gender !== "man" && gender !== "woman")) return looks;
  const feminineOnly = /юбк|плать|сарафан|босонож|лодочк|каблук|бюстгальтер|лифчик|блузк/i;
  const word = gender === "man" ? "мужской" : "женский";
  const swapPrefix = gender === "man"
    ? (s: string) => s.replace(/женск/gi, "мужск")
    : (s: string) => s.replace(/мужск/gi, "женск");
  return looks.map((look) => {
    const items = (look.items || []).map((item: any) => {
      let name = swapPrefix(String(item.name || ""));
      let searchQuery = swapPrefix(String(item.searchQuery || ""));
      if (gender === "man" && feminineOnly.test(`${name} ${searchQuery} ${item.category || ""}`)) {
        name = name.replace(/юбк\w*/gi, "брюки").replace(/плать\w*/gi, "рубашка").replace(/сарафан\w*/gi, "костюм");
        searchQuery = searchQuery.replace(/юбк\w*/gi, "брюки").replace(/плать\w*/gi, "рубашка");
      }
      if (searchQuery && !new RegExp(word, "i").test(searchQuery) && !/унисекс|парфюм|духи|аромат/i.test(searchQuery)) {
        searchQuery = `${searchQuery} ${word}`.trim();
      }
      return { ...item, name, searchQuery };
    });
    return { ...look, items };
  });
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

type GroomingAgePolicy = "deage5" | "deage5mature" | "deage3" | "deage2" | "teenKeep" | "unknown";

function groomingAgeYears(parsed: any): number | null {
  const raw = parsed?.estimatedAge ?? parsed?.faceAnalysis?.estimatedAge;
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n < 12 || n > 90) return null;
  return n;
}

function groomingAgePolicy(parsed: any): GroomingAgePolicy {
  const band = String(parsed?.ageBand || parsed?.faceAnalysis?.ageBand || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const age = groomingAgeYears(parsed);
  if (band === "teen" || band === "under18" || band === "<18") return "teenKeep";
  if (band === "60plus" || band === "60+" || band === "mature60") return "deage5mature";
  if (band === "under25" || band === "<25") return "deage2";
  if (band === "35plus" || band === "35+" || band === "over35") return "deage5";
  if (band === "25to34" || band === "2534") return "deage3";
  if (age != null && age < 18) return "teenKeep";
  if (age != null && age >= 60) return "deage5mature";
  if (age != null && age < 25) return "deage2";
  if (age != null && age >= 35) return "deage5";
  if (age != null && age < 35) return "deage3";
  return "unknown";
}

/** Убирает из промпта анализа формулировки, из‑за которых модель рисует чужое лицо. */
function stripGroomingFaceMorphLanguage(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b(\d+\s*[–-]?\s*)?years?\s+younger\b/gi, "more rested skin")
    .replace(/\b(looks?|appear(?:s|ing)?|face)\s+younger\b/gi, "more rested skin")
    .replace(/\byounger\s+(face|look|appearance|skin|woman|man|person)\b/gi, "rested skin")
    .replace(/\b(anti[- ]age\w*|rejuvenat\w*|de[- ]?age\w*|youthful\s+face|baby[- ]?face|plastic\s+surgery|facelift)\b/gi, "")
    .replace(/\b(slim(?:mer)?|narrow(?:er)?|sculpt(?:ed|ing)?|refine[d]?|sharpen(?:ed)?|point(?:ed)?|v[- ]?shaped?)\s+(the\s+)?(face|jaw|jawline|chin|nose|features)\b/gi, "")
    .replace(/\b(tighter|lift(?:ed|ing)?|contour(?:ed|ing)?)\s+(the\s+)?(jaw|jawline|face|cheeks?|chin)\b/gi, "")
    .replace(/\b(stock\s+model|beauty\s+filter|different\s+person|new\s+face|swap(?:ped)?\s+face)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function groomingAgePromptBlock(policy: GroomingAgePolicy): string {
  if (policy === "teenKeep") {
    return `AGE: teenager. SAME apparent age as Image 1. Not a woman in her 20s, not a child. Glow only — no years-younger. Modest knit/shirt. Hair must still change clearly.`;
  }
  if (policy === "deage5mature") {
    return `AGE: 60+. Skin a bit more rested than Image 1 — still this generation, not 40, not 35, not surgery. Hair: elegant bob/lob, volume, gray blending or silver shine.`;
  }
  if (policy === "deage5") {
    return `AGE: 35+ adult. Skin a bit more rested than Image 1 (glow, less tired under-eyes) — SAME bones, not 10–15 years younger, not a teen, not a model. Hair and outfit MUST clearly change.`;
  }
  if (policy === "deage2") {
    return `AGE: 18–24 adult. Slightly clearer rested skin. Not a child, not baby-face. Wow = new named hairstyle and color.`;
  }
  if (policy === "deage3") {
    return `AGE: 25–34 adult. Slightly less tired shadows, glow. SAME face bones. Not a teenager, not a different person. Difference = HAIR + outfit + glow.`;
  }
  return `SKIN: well-rested vs Image 1. Do not change bone structure. Hair must be a dramatic named change, not the same hair shinier.`;
}

function buildGroomingAfterPrompt(opts: {
  lookName?: string;
  hairColor?: string;
  outfitNote?: string;
  editPrompt?: string;
  agePolicy: GroomingAgePolicy;
  compact?: boolean;
}): string {
  const name = (opts.lookName || "salon cut").trim();
  const color = (opts.hairColor || "toned").trim();
  const outfit = (opts.outfitNote || "new elegant shoulder outfit, not the original clothes").trim();
  const details = stripGroomingFaceMorphLanguage(sanitizeEditPrompt(opts.editPrompt || "")).slice(0, 700);
  const core = `Edit Image 1. This is an IMAGE EDIT of the same real person — not a new generation, not a beauty-filter model.

CHANGE only:
- Haircut: ${name}
- Hair color: ${color}
- Finished salon styling (blowout or glass or soft waves)
- Clothes visible at shoulders: ${outfit}
- Soft studio light, head-and-shoulders close-up, facing camera

PRESERVE from Image 1 (a close friend must recognize them in 1 second):
- Exact nose (bridge width, tip, length), jaw WIDTH and shape, chin, eye spacing, brows, lip volume, cheeks, forehead, ears
- Same expression as Image 1 — do not add a smile if they are not smiling
- Freckles, moles, scars, asymmetry, ethnicity, gender
- Do NOT slim the face, do NOT narrow the nose, do NOT point the chin, do NOT change skull shape

SKIN (the only "younger"): slightly brighter, more even, less tired under-eyes, healthy glow. Pores stay. Same adult age group as Image 1.`;

  if (opts.compact) {
    return `${core}
Hair and clothes must clearly change. Face identity stays locked.`;
  }

  return `${core}

HAIR/CLOTHES DETAILS (ignore anything here about changing the face, jaw, nose, or age):
${details || `${name}, ${color}`}

${groomingAgePromptBlock(opts.agePolicy)}

FINAL: same face as Image 1. New hair + new clothes + slightly rested skin only.`;
}

function groomingDefaultAfterNote(policy: GroomingAgePolicy): string {
  if (policy === "teenKeep") {
    return "Справа — ориентир: новая причёска и ухоженный вид. Возраст тот же. Это не гарантия; решение за вами и мастером.";
  }
  if (policy === "deage5" || policy === "deage5mature") {
    return "Справа — ориентир: новая причёска и вы примерно на 5 лет свежее. Это не гарантия; решение за вами и специалистом.";
  }
  if (policy === "deage2") {
    return "Справа — ориентир: новая причёска и вы свежее, как в удачный день. Возраст взрослый, лицо своё. Это не гарантия.";
  }
  return "Справа — ориентир: новая причёска и вы заметно свежее и моложе. Это не гарантия; решение за вами и специалистом.";
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
      .replace(/[‘’]/g, "'")
      // Gemini sometimes prefixes JSON keys with markdown bullets: * "lookName":
      .replace(/(^|[{\[,]\s*)\*+\s+"/gm, '$1"')
      .replace(/(^|[{\[,]\s*)[-•]\s+"/gm, '$1"');

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
  } catch (e: any) {
    if (e?.name === "AbortError" || /aborted/i.test(String(e?.message || ""))) {
      throw new Error(`Превышено время ожидания ответа (${Math.round(timeoutMs / 1000)} с). Повторите генерацию.`);
    }
    throw e;
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
  timeoutMs?: number;
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
  }, options.timeoutMs ?? 120000);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Polza API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateImageWithFlux(
  prompt: string,
  referenceImageBase64?: string,
  referenceMimeType: string = "image/jpeg",
  opts?: { quality?: "basic" | "medium" | "high"; aspectRatio?: string }
): Promise<string | null> {
  const safePrompt = clampImagePrompt(prompt);
  const input: any = {
    prompt: safePrompt,
    aspect_ratio: opts?.aspectRatio || "3:4",
    // Polza: quality только basic | medium | high (не low!)
    quality: opts?.quality || "medium",
    image_resolution: "1K",
    n: 1,
  };

  if (referenceImageBase64) {
    // Polza media: base64 объект (как для Seedream) — модель редактирует по референсу
    input.images = [
      { type: "base64", data: referenceImageBase64, mime_type: referenceMimeType || "image/jpeg" },
    ];
  }

  const body: any = {
    model: IMAGE_MODEL,
    input,
  };

  console.log("[Image API] model:", IMAGE_MODEL, "prompt:", safePrompt.substring(0, 200) + "...");

  const response = await fetchWithTimeout(`${POLZA_BASE_URL}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${POLZA_API_KEY}`,
    },
    body: JSON.stringify(body),
  }, 360000); // gpt-image часто держит соединение дольше 2 мин — иначе AbortError

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Image API] Error response:", response.status, errorText);
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[Image API] Response keys:", Object.keys(data), "status:", data.status);

  const isDoneStatus = (st: any) => {
    const s = String(st || "").toLowerCase();
    return !s || ["completed", "succeeded", "success", "ready", "done", "complete"].includes(s);
  };

  // Polza.ai /media returns result in various formats
  const extractImageUrl = (d: any): string | null => {
    if (!isDoneStatus(d?.status) && !(d?.output?.url || d?.url)) {
      // Ещё обрабатывается — не забираем пустой/черновой data
      if (d?.status) return null;
    }
    if (d.output && d.output.url) return d.output.url;
    if (d.output && typeof d.output.data === "string" && d.output.data.startsWith("http")) return d.output.data;
    if (d.output && typeof d.output.data === "string" && d.output.data.startsWith("data:")) return d.output.data;
    if (typeof d.url === "string" && d.url.startsWith("http")) return d.url;
    if (d.data && Array.isArray(d.data) && d.data.length > 0) {
      const imageData = d.data[0];
      if (imageData?.b64_json) return `data:image/png;base64,${imageData.b64_json}`;
      if (typeof imageData?.url === "string" && imageData.url) return imageData.url;
    }
    if (typeof d.image === "string" && d.image) return d.image;
    if (d.images && Array.isArray(d.images) && d.images.length > 0 && typeof d.images[0] === "string") return d.images[0];
    return null;
  };

  // Sync response (только если уже готово)
  const syncUrl = extractImageUrl(data);
  if (syncUrl) return syncUrl;

  // Async polling (GPT Image / Seedream may return id + status)
  if (data.id) {
    console.log("[Image API] Async job, polling id:", data.id, "initial status:", data.status);
    const maxWait = 300000; // до 5 мин на кадр (medium gpt-image может быть долгим)
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
        const st = String(pollData.status || "").toLowerCase();
        if (st === "failed" || st === "error" || st === "cancelled") {
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

async function persistGroomingImage(folderId: string, slot: string, image: string | null): Promise<string | null> {
  if (!image || !folderId) return null;
  try {
    if (/^\/api\/grooming-image\//.test(image)) return image;
    const dir = path.join(GROOMING_IMG_DIR, folderId);
    fs.mkdirSync(dir, { recursive: true });
    let buf: Buffer;
    let ext = "jpg";
    const dataMatch = image.match(/^data:([^;]+);base64,(.+)$/);
    if (dataMatch) {
      ext = dataMatch[1].includes("png") ? "png" : dataMatch[1].includes("webp") ? "webp" : "jpg";
      buf = Buffer.from(dataMatch[2], "base64");
    } else if (/^https?:\/\//i.test(image)) {
      const response = await fetchWithTimeout(image, { method: "GET" }, 120000);
      if (!response.ok) {
        console.error("[Grooming] download image failed", response.status, image.slice(0, 80));
        return null;
      }
      const contentType = response.headers.get("content-type") || "image/jpeg";
      ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      buf = Buffer.from(await response.arrayBuffer());
    } else {
      return null;
    }
    if (!buf.length) return null;
    const imgFile = `${slot}.${ext}`;
    fs.writeFileSync(path.join(dir, imgFile), buf);
    return `/api/grooming-image/${folderId}/${imgFile}`;
  } catch (e) {
    console.error("[Grooming] persist image failed:", (e as Error).message);
    return null;
  }
}

/** Кэш превью товаров WB: query → { imageUrl, productUrl, ts } */
const productThumbCache = new Map<string, { imageUrl: string | null; productUrl: string | null; ts: number }>();
const PRODUCT_THUMB_TTL_MS = 12 * 60 * 60 * 1000;

/** Упорядоченные номера basket-* для артикула WB (таблица + оценка ~vol/195 для новых). */
function wbBasketHostOrder(vol: number): number[] {
  const legacy: Array<[number, number, number]> = [
    [0, 143, 1], [144, 287, 2], [288, 431, 3], [432, 719, 4], [720, 1007, 5],
    [1008, 1061, 6], [1062, 1115, 7], [1116, 1169, 8], [1170, 1313, 9], [1314, 1601, 10],
    [1602, 1655, 11], [1656, 1919, 12], [1920, 2045, 13], [2046, 2189, 14], [2190, 2405, 15],
    [2406, 2621, 16], [2622, 2837, 17], [2838, 3053, 18], [3054, 3269, 19], [3270, 3485, 20],
    [3486, 3701, 21], [3702, 3917, 22], [3918, 4133, 23], [4134, 4349, 24], [4350, 4565, 25],
    [4566, 4781, 26], [4782, 4997, 27], [4998, 5213, 28], [5214, 5429, 29], [5430, 5645, 30],
    [5646, 5861, 31], [5862, 6077, 32], [6078, 6293, 33], [6294, 6509, 34], [6510, 6725, 35],
    [6726, 6941, 36], [6942, 7157, 37], [7158, 7373, 38], [7374, 7589, 39], [7590, 7805, 40],
    [7806, 8021, 41], [8022, 8237, 42], [8238, 9000, 43],
  ];
  let primary = 0;
  for (const [from, to, host] of legacy) {
    if (vol >= from && vol <= to) { primary = host; break; }
  }
  // Новые артикулы: эмпирически ~195 vol на шарду (5460→28, 8471→38)
  const est = Math.min(45, Math.max(1, Math.round(vol / 195)));
  if (!primary) primary = est;
  const ordered: number[] = [];
  const seen = new Set<number>();
  const push = (h: number) => {
    if (h < 1 || h > 45 || seen.has(h)) return;
    seen.add(h);
    ordered.push(h);
  };
  push(primary);
  push(est);
  for (let d = 1; d <= 12; d++) {
    push(primary - d);
    push(primary + d);
    push(est - d);
    push(est + d);
  }
  return ordered;
}

function wbImageCandidates(nmId: number): string[] {
  const vol = Math.floor(nmId / 1e5);
  const part = Math.floor(nmId / 1e3);
  const urls: string[] = [];
  for (const h of wbBasketHostOrder(vol)) {
    const host = String(h).padStart(2, "0");
    for (const domain of [`basket-${host}.wbbasket.ru`, `basket-${host}.wb.ru`]) {
      urls.push(`https://${domain}/vol${vol}/part${part}/${nmId}/images/c246x328/1.webp`);
      urls.push(`https://${domain}/vol${vol}/part${part}/${nmId}/images/big/1.webp`);
    }
  }
  return urls;
}

async function resolveWbProductImage(nmId: number): Promise<string | null> {
  const urls = wbImageCandidates(nmId);
  const chunkSize = 10;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const found = await Promise.any(
      chunk.map(async (url) => {
        try {
          const r = await fetchWithTimeout(url, { method: "HEAD" }, 3000);
          if (r.ok) return url;
        } catch {}
        try {
          const g = await fetchWithTimeout(url, { method: "GET", headers: { Range: "bytes=0-64" } }, 4000);
          if (g.ok || g.status === 206) return url;
        } catch {}
        throw new Error("miss");
      })
    ).catch(() => null);
    if (found) return found;
  }
  return null;
}

const WB_SEARCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://www.wildberries.ru",
  Referer: "https://www.wildberries.ru/",
};

async function wbSearchProducts(q: string): Promise<any[]> {
  const versions = ["v7", "v5", "v4"] as const;
  for (const ver of versions) {
    const searchUrl =
      `https://search.wb.ru/exactmatch/ru/common/${ver}/search?appType=1&curr=rub&dest=-1257786` +
      `&query=${encodeURIComponent(q)}&resultset=catalog&sort=popular&spp=30`;
    let resp = await fetchWithTimeout(searchUrl, { method: "GET", headers: WB_SEARCH_HEADERS }, 12000);
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      resp = await fetchWithTimeout(searchUrl, { method: "GET", headers: WB_SEARCH_HEADERS }, 12000);
    }
    if (!resp.ok) continue;
    const data: any = await resp.json().catch(() => null);
    const products: any[] = data?.products || data?.data?.products || [];
    if (products.length) return products;
  }
  return [];
}

const BEAUTY_RE =
  /сыворотк|крем|гель|тоник|пенк|умыван|spf|retinol|serum|cleanser|moisturizer|маск|шампун|бальзам|помад|тушь|тональн|консилер|хайлайтер|румян|палетк|лак|ногт|уход|косметик|антиэйдж|витамин|ниацинамид|гиалурон|солнцезащит|антиелиос|moisturizer|emulsion|lotion|ампул|эссенц|скраб|пилинг|патч|мицелляр|гидрофил/i;
const PERFUME_RE =
  /парфюм|духи|туалетн|аромат|одеколон|edp|edt|perfume|cologne|fragrance/i;
const CLOTHES_RE =
  /футболк|плать|джинс|куртк|брюк|рубашк|свитер|кроссов|туфл|юбк|пальто|блуз|шорты|леггинс|худи|майк|пиджак|костюм|кед|сапог|ботин|шарф|шапк|носк|бель|лифчик|бюстгалтер|толстовк|кардиган|жилет|тренч|плащ|пуховик|бомбер|ветровк|парка|дублёнк|шуб|жакет|блейзер|overshirt|лонгслив|водолазк|комбинезон|сарафан|туник|лофер|босонож|балетки|каблук|сумк|рюкзак|пояс|ремень|перчатк/i;

/** Насколько карточка WB похожа на запрос — чтобы не подставлять футболку вместо сыворотки */
function scoreWbProduct(query: string, brandHint: string, product: any): number {
  const q = query.toLowerCase();
  const name = String(product?.name || "").toLowerCase();
  const brand = String(product?.brand || "").toLowerCase();
  const brandWanted = brandHint.trim().toLowerCase();
  let score = 0;

  if (brandWanted) {
    if (brand === brandWanted || brand.includes(brandWanted) || brandWanted.includes(brand)) score += 60;
    else {
      for (const part of brandWanted.split(/[\s.&/-]+/)) {
        if (part.length > 2 && (brand.includes(part) || name.includes(part))) score += 25;
      }
    }
  }

  const tokens = q
    .replace(/[^\p{L}\p{N}\s%+.-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !/^(для|или|and|the|with|ml|мл|шт)$/i.test(t));
  for (const t of tokens) {
    if (name.includes(t)) score += 10;
    if (brand.includes(t)) score += 6;
  }

  const wantPerfume = PERFUME_RE.test(q) || PERFUME_RE.test(brandWanted);
  const wantBeauty = BEAUTY_RE.test(q) || BEAUTY_RE.test(brandWanted);
  if (wantPerfume) {
    if (PERFUME_RE.test(name)) score += 50;
    if (CLOTHES_RE.test(name)) score -= 100;
  } else if (wantBeauty) {
    if (BEAUTY_RE.test(name)) score += 40;
    if (CLOTHES_RE.test(name)) score -= 100;
    // WB: уход/косметика часто parent 49 / близкие
    const parent = Number(product?.subjectParentId || 0);
    if ([49, 6236, 739, 1].includes(parent) || parent === 49) score += 12;
  } else if (CLOTHES_RE.test(q)) {
    // Образы: не подставлять косметику вместо одежды/верхней одежды
    if (CLOTHES_RE.test(name)) score += 30;
    if (BEAUTY_RE.test(name)) score -= 90;
  }

  return score;
}

async function findProductThumb(
  query: string,
  brandHint = ""
): Promise<{ imageUrl: string | null; productUrl: string | null }> {
  const key = `${brandHint} ${query}`.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return { imageUrl: null, productUrl: null };
  const cached = productThumbCache.get(key);
  if (cached && Date.now() - cached.ts < PRODUCT_THUMB_TTL_MS) {
    if (cached.imageUrl || Date.now() - cached.ts < 10 * 60 * 1000) {
      return { imageUrl: cached.imageUrl, productUrl: cached.productUrl };
    }
  }

  const brand = brandHint.trim();
  const qClean = query.trim();
  // Варианты: бренд+название целиком важнее укороченных (укороченные дают мусор вроде футболок)
  const queryVariants = [
    brand && qClean ? `${brand} ${qClean}` : "",
    qClean,
    brand && qClean ? `${brand} ${qClean.split(/\s+/).slice(0, 4).join(" ")}` : "",
    brand ? `${brand} ${qClean.replace(/[0-9.,%]+/g, " ").replace(/\s+/g, " ").trim()}` : "",
  ].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i);

  try {
    let best: { score: number; nmId: number; productUrl: string } | null = null;

    for (const q of queryVariants) {
      const products = await wbSearchProducts(q);
      for (const product of products.slice(0, 24)) {
        const nmId = Number(product?.id || product?.nmId || product?.nm_id);
        if (!nmId) continue;
        const score = scoreWbProduct(q, brand || qClean, product);
        if (!best || score > best.score) {
          best = {
            score,
            nmId,
            productUrl: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
          };
        }
      }
      // Если уже есть сильное совпадение (бренд + тип) — не крутим слабые варианты
      if (best && best.score >= 70) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    // Порог: лучше пустой плейсхолдер, чем фото футболки у сыворотки
    if (!best || best.score < 25) {
      productThumbCache.set(key, { imageUrl: null, productUrl: best?.productUrl || null, ts: Date.now() });
      return { imageUrl: null, productUrl: best?.productUrl || null };
    }

    const imageUrl = await resolveWbProductImage(best.nmId);
    const out = { imageUrl, productUrl: best.productUrl, ts: Date.now() };
    productThumbCache.set(key, out);
    return { imageUrl, productUrl: best.productUrl };
  } catch (e) {
    console.error("[product-thumb]", (e as Error).message);
    productThumbCache.set(key, { imageUrl: null, productUrl: null, ts: Date.now() });
    return { imageUrl: null, productUrl: null };
  }
}

/** Подтянуть фото WB к списку товаров (по очереди, чтобы не словить 429). */
async function enrichShopProductsWithThumbs(products: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const p of products) {
    const brand = String(p.brand || "").trim();
    const name = String(p.name || "").trim();
    const q = String(p.searchQuery || `${brand} ${name}`).trim();
    if (!q && !brand && !name) { out.push(p); continue; }
    try {
      const thumb = await findProductThumb(q || name, brand);
      out.push({
        ...p,
        imageUrl: thumb.imageUrl || p.imageUrl || null,
        wbUrl: thumb.productUrl || p.wbUrl,
      });
    } catch {
      out.push(p);
    }
    await new Promise((r) => setTimeout(r, 450));
  }
  return out;
}

/** Для образов стилиста: поиск → прямая карточка WB + фото; Ozon/YM остаются страницами поиска. */
async function enrichOutfitLooksWithWb(
  looks: any[],
  onProgress?: (done: number, total: number) => void
): Promise<any[]> {
  const flatCount = looks.reduce((n, look) => n + (look.items || []).length, 0);
  let done = 0;
  const out: any[] = [];

  for (const look of looks) {
    const enrichedItems: any[] = [];
    for (const item of look.items || []) {
      const q = String(item.searchQuery || item.name || "").trim();
      const queryEnc = encodeURIComponent(q);
      const base = {
        ...item,
        wbUrl: `https://www.wildberries.ru/catalog/0/search.aspx?search=${queryEnc}`,
        ozonUrl: `https://www.ozon.ru/search/?text=${queryEnc}`,
        ymUrl: `https://market.yandex.ru/search?text=${queryEnc}`,
      };
      if (!q) {
        enrichedItems.push(base);
        done++;
        onProgress?.(done, flatCount);
        continue;
      }
      try {
        const thumb = await findProductThumb(q, String(item.brand || ""));
        enrichedItems.push({
          ...base,
          imageUrl: thumb.imageUrl || base.imageUrl || null,
          wbUrl: thumb.productUrl || base.wbUrl,
          productUrl: thumb.productUrl || null,
        });
      } catch {
        enrichedItems.push(base);
      }
      done++;
      onProgress?.(done, flatCount);
      await new Promise((r) => setTimeout(r, 400));
    }
    out.push({ ...look, items: enrichedItems });
  }
  return out;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001', 10);

  const PROMO_FILE = path.join(PROJECT_ROOT, "promo-codes.json");

  type PromoEntry = { used: boolean; tier: "standard" | "premium" | "grooming"; createdAt: string; redeemedAt?: string };
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

  const syncPromosFromDisk = () => {
    try {
      const fresh = loadPromos();
      for (const k of Object.keys(promos)) {
        if (!(k in fresh)) delete promos[k];
      }
      Object.assign(promos, fresh);
    } catch (e) {
      console.error("[Promo] sync failed:", e);
    }
  };

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += "-";
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (/^https:\/\/(www\.)?stilist-ai\.ru$/.test(origin)) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  }));
  app.set("trust proxy", 1); // trust Nginx X-Forwarded-Proto
  app.use(express.json());

  const nailsSub = createNailsSubscription(PROJECT_ROOT, { isAdmin: isOwnerRequest });
  nailsSub.registerRoutes(app);

  // Do not expose full master guides via static catalog files.
  app.get(["/nails/catalog.json", "/nails/nails-data.json"], (_req: Request, res: Response) => {
    try {
      const file = _req.path.endsWith("nails-data.json")
        ? path.join(PROJECT_ROOT, "public", "nails", "nails-data.json")
        : path.join(PROJECT_ROOT, "public", "nails", "catalog.json");
      const distFile = path.join(PROJECT_ROOT, "dist", "nails", path.basename(file));
      const src = fs.existsSync(file) ? file : distFile;
      if (!fs.existsSync(src)) return res.status(404).json({ error: "not_found" });
      const raw = JSON.parse(fs.readFileSync(src, "utf-8"));
      const strip = (item: any) => {
        if (!item || typeof item !== "object") return item;
        const { masterGuide, master_guide, ...rest } = item;
        return rest;
      };
      if (Array.isArray(raw)) return res.json(raw.map(strip));
      if (raw && typeof raw === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(raw)) out[k] = strip(v);
        return res.json(out);
      }
      return res.json(raw);
    } catch {
      return res.status(500).json({ error: "catalog_error" });
    }
  });

  app.post("/api/check-promo", (req: Request, res: Response) => {
    syncPromosFromDisk();
    const code = (req.body.code || "").toString().trim().toUpperCase();
    const purpose = String(req.body.purpose || "outfits").toLowerCase(); // outfits | grooming
    if (!code) return res.json({ valid: false });
    const entry = promos[code];
    if (!entry) return res.json({ valid: false });
    if (entry.used) return res.json({ valid: false, reason: "used" });
    if (purpose === "grooming") {
      if (entry.tier === "grooming") return res.json({ valid: true, tier: "grooming", code });
      return res.json({ valid: false, reason: "outfits_only" });
    }
    // Промокоды причёсок — только в окне «Причёска и уход», не для образов
    if (entry.tier === "grooming") return res.json({ valid: false, reason: "grooming_only" });
    return res.json({ valid: true, tier: entry.tier, code });
  });

  app.post("/api/redeem-promo", (req: Request, res: Response) => {
    syncPromosFromDisk();
    const code = (req.body.code || "").toString().trim().toUpperCase();
    const purpose = String(req.body.purpose || "outfits").toLowerCase();
    if (!code) return res.json({ success: false, reason: "no_code" });
    const entry = promos[code];
    if (!entry) return res.json({ success: false, reason: "not_found" });
    if (entry.used) return res.json({ success: false, reason: "used" });
    if (purpose === "grooming") {
      if (entry.tier !== "grooming") return res.json({ success: false, reason: "outfits_only" });
      return res.json({ success: true, tier: "grooming", code });
    }
    if (entry.tier === "grooming") return res.json({ success: false, reason: "grooming_only" });
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
      if (entry.tier === "standard" || entry.tier === "premium") {
        incPromoSale(entry.tier);
      }
      return true;
    } catch { return false; }
  };

  app.post("/api/generate-promo", requireAdmin, (req: Request, res: Response) => {
    syncPromosFromDisk();
    const count = Math.min(parseInt(req.body.count || "10", 10) || 10, 100);
    const rawTier = (req.body.tier || "standard").toString();
    const tier: "standard" | "premium" | "grooming" =
      rawTier === "premium" ? "premium" : rawTier === "grooming" ? "grooming" : "standard";
    const newCodes: string[] = [];
    for (let i = 0; i < count; i++) {
      let code = generateCode();
      while (promos[code]) code = generateCode();
      promos[code] = { used: false, tier, createdAt: new Date().toISOString() };
      newCodes.push(code);
    }
    savePromos(promos);
    const where =
      tier === "grooming"
        ? "Только в окне «Причёска и уход» на сайте"
        : tier === "premium"
          ? "Только для тарифа Премиум (образы)"
          : "Только для тарифа Стандарт (образы)";
    res.json({ codes: newCodes, tier, count: newCodes.length, where });
  });

  app.get("/api/promo-list", requireAdmin, (req: Request, res: Response) => {
    syncPromosFromDisk();
    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(100, parseInt((req.query.limit as string) || "10", 10));
    const status = (req.query.status as string) || "all";
    const tierF = (req.query.tier as string) || "all";
    const q = ((req.query.q as string) || "").trim().toUpperCase();

    let list = Object.entries(promos).map(([code, e]) => ({ code, ...e }));
    if (status === "free") list = list.filter(e => !e.used);
    else if (status === "used") list = list.filter(e => e.used);
    if (tierF === "standard" || tierF === "premium" || tierF === "grooming") list = list.filter(e => e.tier === tierF);
    if (q) list = list.filter(e => e.code.includes(q));
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const unused = list.filter(e => !e.used).length;
    const used = list.filter(e => e.used).length;
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const codes = list.slice((page - 1) * limit, page * limit);
    res.json({ total, codes, page, totalPages, limit, unused, used });
  });

  app.post("/api/promo-delete", requireAdmin, (req: Request, res: Response) => {
    syncPromosFromDisk();
    const code = (req.body.code || "").toString().trim().toUpperCase();
    if (!code || !promos[code]) return res.json({ success: false, reason: "not_found" });
    delete promos[code];
    savePromos(promos);
    res.json({ success: true, remaining: Object.keys(promos).length });
  });

  app.post("/api/promo-reset", requireAdmin, (req: Request, res: Response) => {
    syncPromosFromDisk();
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
    const pinQ = String(req.query.pin || "");
    if (!isAdminRequest(req) && ADMIN_PIN && pinQ && pinQ === ADMIN_PIN) {
      rememberOwnerIp(clientIp(req));
      res.setHeader("Set-Cookie", ownerCookieHeaders(req));
    } else if (!isAdminRequest(req)) {
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
  .err{color:#c62828;font-size:13px;min-height:18px}
</style></head>
<body>
<div class="box">
  <h2>Введите PIN-код администратора</h2>
  <input type="password" id="pin" maxlength="12" placeholder="******" autocomplete="current-password">
  <br>
  <p class="err" id="err"></p>
  <button id="go">Войти</button>
</div>
<script>
document.getElementById('go').onclick = async function() {
  const pin = document.getElementById('pin').value;
  const r = await fetch('/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
  if (r.ok) location.href = '/api/admin';
  else document.getElementById('err').textContent = 'Неверный код';
};
document.getElementById('pin').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('go').click(); });
</script>
</body></html>`);
    }
    res.send(`<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Админка — Твой стилист</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:980px;margin:0 auto;padding:12px;background:#faf9f7;color:#1a1a1a;overflow-x:hidden}
  h1{font-size:20px;margin:0 0 14px;display:flex;align-items:center;gap:10px}
  h2{font-size:15px;color:#555;margin:0 0 8px}
  .card{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #eee}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
  .stat{background:#fff;border-radius:10px;padding:10px;text-align:center;border:1px solid #eee}
  .stat-num{font-size:22px;font-weight:700;color:#c9a84c}
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
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{text-align:left;padding:6px 8px;background:#f9f8f6;border-bottom:2px solid #eee;color:#888;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:6px 8px;border-bottom:1px solid #f0ece4;vertical-align:middle}
  .mono{font-family:'SF Mono',Monaco,monospace;font-weight:600;font-size:13px}
  .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
  .tag-ok{background:#e8f5e9;color:#2e7d32}
  .tag-used{background:#ffebee;color:#c62828}
  .new-code{display:inline-block;background:#1a1a1a;color:#c9a84c;padding:6px 12px;border-radius:8px;font-family:'SF Mono',Monaco,monospace;font-size:14px;font-weight:700;margin:4px 4px 0 0;cursor:pointer}
  .new-code:hover{background:#333}
  .section-title{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #eee}
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
    <div class="stat"><div class="stat-num" id="uniqueVisitors">—</div><div class="stat-label">Уникальных людей</div></div>
    <div class="stat"><div class="stat-num" id="pageViews">—</div><div class="stat-label">Просмотров разделов</div></div>
    <div class="stat"><div class="stat-num" id="namedVisitors">—</div><div class="stat-label">С именем</div></div>
    <div class="stat"><div class="stat-num" id="anonymousVisitors">—</div><div class="stat-label">Анонимно</div></div>
    <div class="stat"><div class="stat-num" id="standardSales">—</div><div class="stat-label">Продаж Стандарт</div></div>
    <div class="stat"><div class="stat-num" id="premiumSales">—</div><div class="stat-label">Продаж Премиум</div></div>
    <div class="stat"><div class="stat-num" id="nailsMonthSales">—</div><div class="stat-label">Подписка ногти (мес.)</div></div>
    <div class="stat"><div class="stat-num" id="groomingSales">—</div><div class="stat-label">Причёска и уход</div></div>
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
  <div class="section-title"><h2>🧭 Поведение на сайте</h2></div>
  <p style="font-size:12px;color:#888;margin:0 0 12px">Где смотрят и какие кнопки нажимают. Админ/тест не считаются. Клиенты с именем (например Анастасия) видны в таблице ниже.</p>
  <div class="grid" style="margin-bottom:14px">
    <div class="stat"><div class="stat-num" id="totalClicks">—</div><div class="stat-label">Кликов по кнопкам</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
    <div>
      <h2 style="margin-bottom:8px">Разделы</h2>
      <table><thead><tr><th>Раздел</th><th>Раз</th></tr></thead><tbody id="topPagesBody"><tr><td colspan="2">—</td></tr></tbody></table>
    </div>
    <div>
      <h2 style="margin-bottom:8px">Кнопки</h2>
      <table><thead><tr><th>Кнопка</th><th>Раз</th></tr></thead><tbody id="topClicksBody"><tr><td colspan="2">—</td></tr></tbody></table>
    </div>
  </div>
  <h2 style="margin-bottom:8px">Последние посетители и путь</h2>
  <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
    <table>
      <thead><tr><th>Имя</th><th>Шагов</th><th>Когда</th><th>Путь</th></tr></thead>
      <tbody id="journeysBody"><tr><td colspan="4">—</td></tr></tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="section-title"><h2>💰 Цены</h2></div>
  <div class="price-row">
    <label style="margin:0">Стандарт (образы):</label>
    <input type="number" id="priceStandard" min="1" max="10000" value="100">
    <span>₽</span>
    <button onclick="savePrice('standard')" class="btn-small">Сохранить</button>
  </div>
  <div class="price-row" style="margin-top:12px">
    <label style="margin:0">Премиум (образы):</label>
    <input type="number" id="pricePremium" min="1" max="10000" value="200">
    <span>₽</span>
    <button onclick="savePrice('premium')" class="btn-small">Сохранить</button>
  </div>
  <div class="price-row" style="margin-top:12px">
    <label style="margin:0">Подписка ногти — месяц:</label>
    <input type="number" id="priceNailsMonth" min="1" max="10000" value="500">
    <span>₽</span>
    <button onclick="savePrice('nails_month')" class="btn-small">Сохранить</button>
  </div>
  <div class="price-row" style="margin-top:12px">
    <label style="margin:0">Причёска и уход:</label>
    <input type="number" id="priceGrooming" min="1" max="10000" value="100">
    <span>₽</span>
    <button onclick="savePrice('grooming')" class="btn-small">Сохранить</button>
  </div>
</div>

<div class="card">
  <div class="section-title"><h2>🎟 Промокоды — создание</h2><button onclick="refreshAll()" class="btn-dark" style="margin-left:auto;font-size:13px;padding:8px 16px">🔄 Обновить всё</button></div>
  <div style="background:#fff8e6;border:1px solid #f0d78c;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.5;color:#5a4a1a">
    <b>Куда вводить код на сайте:</b><br>
    • <b>Образы Стандарт / Премиум</b> → «Начать преображение»<br>
    • <b>Причёска и уход</b> → окно «Причёска и уход»<br>
    • <b>Ногти сутки / месяц</b> → база ногтей
  </div>
  <div class="price-row" style="flex-wrap:wrap;align-items:flex-end;gap:8px">
    <div>
      <label style="margin:0 0 4px;display:block;font-size:12px;color:#888">Тип кода — все услуги</label>
      <select id="tier" onchange="updatePromoHint()">
        <option value="standard">Образы — Стандарт (100 ₽)</option>
        <option value="premium">Образы — Премиум (200 ₽)</option>
        <option value="grooming">Причёска и уход (100 ₽)</option>
        <option value="nails_once">База ногтей — на сутки</option>
        <option value="nails_month">База ногтей — на месяц</option>
      </select>
    </div>
    <div>
      <label style="margin:0 0 4px;display:block;font-size:12px;color:#888">Сколько создать</label>
      <input type="number" id="count" value="10" min="1" max="100" style="width:70px">
    </div>
    <button id="createBtn" class="btn-small" onclick="doGenerate()">Создать коды</button>
    <button class="btn-small btn-gray" onclick="copyAllNew()" id="copyAllBtn" style="display:none">📋 Скопировать все</button>
  </div>
  <p id="promoHint" style="font-size:12px;color:#666;margin:8px 0 0">Код Стандарт — только в «Начать преображение».</p>
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
      <option value="standard">Стандарт (образы)</option>
      <option value="premium">Премиум (образы)</option>
      <option value="grooming">Причёска и уход</option>
    </select>
    <span id="filterInfo" style="font-size:12px;color:#888;margin-left:auto"></span>
  </div>
  <div id="list"></div>
  <div class="pagination" id="pagination"></div>
</div>

<div class="card">
  <div class="section-title"><h2>💅 Промокоды базы ногтей — список</h2><span id="nailsCodesCount" style="margin-left:8px;font-size:13px;color:#888;font-weight:400"></span></div>
  <p style="font-size:13px;color:#666;margin:0 0 12px">Создавать коды ногтей можно сверху в общем «Тип кода». Здесь — только список и действия.</p>
  <div id="nailsCodesUsage" style="margin-bottom:12px"></div>
  <div class="filters">
    <input type="text" id="nailsSearchInput" placeholder="🔍 Поиск по коду..." oninput="debounceNailsSearch()">
    <select id="nailsFilterStatus" onchange="loadNailsList(1)">
      <option value="all">Все статусы</option>
      <option value="free">Свободные</option>
      <option value="used">Использованные</option>
    </select>
    <select id="nailsFilterKind" onchange="loadNailsList(1)">
      <option value="all">Все типы</option>
      <option value="once">На сутки</option>
      <option value="month">На месяц</option>
    </select>
  </div>
  <div id="nailsList"></div>
  <div class="pagination" id="nailsPagination"></div>
</div>

<div id="toast" class="toast"></div>

<script>
const secret = "";
let currentPeriod = 'all';
let promoPage = 1;
let totalPages = 1;
let lastNewCodes = [];
let nailsPromoPage = 1;
let nailsTotalPages = 1;
let lastNewNailsCodes = [];
let nailsSearchTimer = null;

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
  document.getElementById('uniqueVisitors').textContent = (s.uniqueVisitors || 0).toLocaleString();
  document.getElementById('pageViews').textContent = (s.pageViews || s.visits || 0).toLocaleString();
  document.getElementById('namedVisitors').textContent = (s.namedVisitors || 0).toLocaleString();
  document.getElementById('anonymousVisitors').textContent = (s.anonymousVisitors || 0).toLocaleString();
  document.getElementById('standardSales').textContent = s.paidStandardSales || 0;
  document.getElementById('premiumSales').textContent = s.paidPremiumSales || 0;
  document.getElementById('nailsMonthSales').textContent = s.paidNailsMonthSales || 0;
  document.getElementById('groomingSales').textContent = s.paidGroomingSales || 0;
  const rev = s.revenue || 0;
  document.getElementById('revenue').textContent = rev.toLocaleString() + ' ₽';
  const totalSales = (s.paidStandardSales || 0) + (s.paidPremiumSales || 0) + (s.paidNailsMonthSales || 0) + (s.paidGroomingSales || 0);
  document.getElementById('avgTicket').textContent = totalSales > 0 ? Math.round(rev / totalSales).toLocaleString() + ' ₽' : '—';
  document.getElementById('promoStandard').textContent = s.promoStandardSales || 0;
  document.getElementById('promoPremium').textContent = s.promoPremiumSales || 0;
  document.getElementById('promoTotal').textContent = s.promoRedemptions || 0;
  document.getElementById('priceStandard').value = s.standardPrice;
  document.getElementById('pricePremium').value = s.premiumPrice;
  if (document.getElementById('priceNailsMonth')) document.getElementById('priceNailsMonth').value = s.nailsMonthPrice || 500;
  if (document.getElementById('priceGrooming')) document.getElementById('priceGrooming').value = s.groomingPrice || 100;
  drawChart(d.chartData || []);
  renderBehavior(d.pageviews || {});
}

function renderBehavior(pv) {
  const clicksEl = document.getElementById('totalClicks');
  if (clicksEl) clicksEl.textContent = (pv.totalClicks || 0).toLocaleString();
  const pagesBody = document.getElementById('topPagesBody');
  const clicksBody = document.getElementById('topClicksBody');
  const journeysBody = document.getElementById('journeysBody');
  const pageLabels = {
    home: 'Главная', pricing: 'Тарифы', stylize_standard: 'Форма Стандарт', stylize_premium: 'Форма Премиум',
    grooming: 'Причёска', nails: 'Ногти', my_looks: 'Мои образы', stylist_chat: 'Чат со стилистом',
  };
  const clickLabels = {
    start_transform: 'Начать преображение', grooming: 'Причёска и уход', nails: 'Подобрать ногти',
    create_look: 'Создать образ', my_looks: 'Мои образы', stylist_chat: 'Чат со стилистом',
    pricing_standard: 'Тариф Стандарт',
    pricing_premium: 'Тариф Премиум', pay: 'Оплатить', feedback: 'Отзыв',
  };
  if (pagesBody) {
    const rows = (pv.topPages || []).map(r => '<tr><td>' + (pageLabels[r.name] || r.name) + '</td><td>' + r.count + '</td></tr>');
    pagesBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="2">Нет данных</td></tr>';
  }
  if (clicksBody) {
    const rows = (pv.topClicks || []).map(r => '<tr><td>' + (clickLabels[r.name] || r.name) + '</td><td>' + r.count + '</td></tr>');
    clicksBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="2">Нет данных</td></tr>';
  }
  if (journeysBody) {
    const rows = (pv.journeys || []).map(j => {
      const when = (j.lastAt || '').replace('T', ' ').slice(0, 16);
      const path = (j.path || []).map(p => {
        const raw = String(p || '');
        const isClick = raw.indexOf('клик:') === 0;
        const key = isClick ? raw.slice(5) : raw;
        return (isClick ? 'клик: ' : '') + (pageLabels[key] || clickLabels[key] || key);
      }).join(' → ');
      const name = j.name ? ('<b>' + j.name.replace(/</g,'') + '</b>') : '<span style="color:#aaa">аноним</span>';
      return '<tr><td>' + name + '</td><td>' + (j.steps || 0) + '</td><td style="white-space:nowrap">' + when + '</td><td style="font-size:11px;max-width:420px;word-break:break-word">' + path + '</td></tr>';
    });
    journeysBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="4">Нет данных</td></tr>';
  }
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
  let price;
  if (tier === 'standard') price = document.getElementById('priceStandard').value;
  else if (tier === 'premium') price = document.getElementById('pricePremium').value;
  else if (tier === 'nails_month') price = document.getElementById('priceNailsMonth').value;
  else if (tier === 'grooming') price = document.getElementById('priceGrooming').value;
  else return;
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
    let r, d, tierLabel;
    if (tier === 'nails_once' || tier === 'nails_month') {
      const kind = tier === 'nails_once' ? 'once' : 'month';
      r = await fetch('/api/nails/generate-promo', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({secret, kind, count})
      });
      if (!r.ok) { alert('Ошибка сервера: ' + r.status); return; }
      d = await r.json();
      tierLabel = kind === 'once' ? 'Ногти — на сутки' : 'Ногти — на месяц';
      lastNewCodes = d.codes || [];
      lastNewNailsCodes = lastNewCodes;
      if (document.getElementById('nailsFilterKind')) {
        document.getElementById('nailsFilterKind').value = kind;
      }
      loadNailsList(1);
    } else {
      r = await fetch('/api/generate-promo', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({secret, tier, count})
      });
      if (!r.ok) { alert('Ошибка сервера: ' + r.status); return; }
      d = await r.json();
      tierLabel = tier === 'grooming' ? 'Причёска и уход' : tier === 'premium' ? 'Образы Премиум' : 'Образы Стандарт';
      lastNewCodes = d.codes || [];
      if (tier === 'grooming') document.getElementById('filterTier').value = 'grooming';
      else if (tier === 'premium') document.getElementById('filterTier').value = 'premium';
      else document.getElementById('filterTier').value = 'standard';
      loadList(1);
    }
    if (!d.codes || !d.codes.length) { alert('Нет кодов: ' + JSON.stringify(d)); return; }
    const div = document.getElementById('newCodes');
    div.innerHTML = '<div style="margin-bottom:8px;font-weight:600;color:#2e7d32">✨ Новые ' + tierLabel + ' (' + d.codes.length + '):</div>' +
      (d.where ? '<div style="font-size:12px;color:#666;margin-bottom:10px">' + d.where + '</div>' : '') +
      d.codes.map(c => '<span class="new-code" onclick="copyCode(\\''+c+'\\')">' + c + '</span>').join(' ');
    div.style.display = 'block';
    document.getElementById('copyAllBtn').style.display = 'inline-block';
    showToast('Создано ' + d.codes.length + ' кодов (' + tierLabel + ')');
    loadStats();
  } catch(e) { alert('Ошибка: ' + e); }
}

function updatePromoHint() {
  const tier = document.getElementById('tier').value;
  const el = document.getElementById('promoHint');
  if (!el) return;
  if (tier === 'grooming') el.textContent = 'Код «Причёска и уход» — только в окне «Причёска и уход».';
  else if (tier === 'premium') el.textContent = 'Код Премиум — только в «Начать преображение» (тариф Премиум).';
  else if (tier === 'nails_once') el.textContent = 'Код ногтей «на сутки» — один просмотр инструкций в базе ногтей.';
  else if (tier === 'nails_month') el.textContent = 'Код ногтей «на месяц» — полный доступ к базе на 30 дней.';
  else el.textContent = 'Код Стандарт — только в «Начать преображение» (тариф Стандарт).';
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
  const url = '/api/promo-list?page=' + promoPage + '&limit=10&status=' + status + '&tier=' + tier + '&q=' + encodeURIComponent(q);
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
    (e.tier === 'premium' ? 'Премиум (образы)' : e.tier === 'grooming' ? 'Причёска и уход' : 'Стандарт (образы)') + '</td><td>' +
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

function refreshAll() { loadStats(); loadList(promoPage); loadNailsList(nailsPromoPage); }

async function doGenerateNails() {
  // Создание ногтей перенесено в общий select «Тип кода»
  showToast('Выберите тип «База ногтей» сверху и нажмите «Создать коды»');
}

function copyAllNewNails() {
  if (!lastNewNailsCodes.length) return;
  navigator.clipboard.writeText(lastNewNailsCodes.join('\\n')).then(() => showToast('Все коды скопированы'));
}

function debounceNailsSearch() {
  clearTimeout(nailsSearchTimer);
  nailsSearchTimer = setTimeout(() => loadNailsList(1), 300);
}

async function loadNailsList(page) {
  nailsPromoPage = page || 1;
  const status = document.getElementById('nailsFilterStatus').value;
  const kind = document.getElementById('nailsFilterKind').value;
  const q = document.getElementById('nailsSearchInput').value || '';
  const url = '/api/nails/promo-list?secret=' + encodeURIComponent(secret) + '&page=' + nailsPromoPage + '&limit=10&status=' + status + '&kind=' + kind + '&q=' + encodeURIComponent(q);
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) { document.getElementById('nailsList').innerHTML = '<p style="color:red">Нет доступа</p>'; return; }
  nailsTotalPages = d.totalPages || 1;
  document.getElementById('nailsCodesCount').textContent = 'всего ' + (d.total || 0);
  document.getElementById('nailsCodesUsage').innerHTML =
    '<span style="font-size:13px;color:#666">Свободных: <b>' + (d.unused || 0) + '</b> · Использованных: <b>' + (d.used || 0) + '</b></span>';
  const codes = d.codes || [];
  if (!codes.length) {
    document.getElementById('nailsList').innerHTML = '<p style="color:#888;font-size:13px">Пока нет кодов</p>';
    document.getElementById('nailsPagination').innerHTML = '';
    return;
  }
  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;color:#888;border-bottom:1px solid #eee"><th style="padding:8px 4px">Код</th><th>Тип</th><th>Статус</th><th>Создан</th><th></th></tr>';
  codes.forEach(e => {
    html += '<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:8px 4px;font-family:monospace">' + e.code +
      '</td><td>' + (e.kind === 'once' ? 'Раз' : 'Месяц') + '</td><td>' +
      (e.used ? '<span style="color:#c62828">Использован</span>' : '<span style="color:#2e7d32">Свободен</span>') + '</td><td style="color:#888;font-size:12px">' +
      (e.createdAt || '').slice(0, 10) + '</td><td style="text-align:right">' +
      '<button class="btn-small btn-gray" onclick="copyCode(\\'' + e.code + '\\')">📋</button> ' +
      (e.used ? '<button class="btn-small" onclick="resetNailsCode(\\'' + e.code + '\\')">Сброс</button> ' : '') +
      '<button class="btn-small btn-gray" onclick="deleteNailsCode(\\'' + e.code + '\\')">✕</button></td></tr>';
  });
  html += '</table>';
  document.getElementById('nailsList').innerHTML = html;
  let pagHtml = '';
  if (nailsPromoPage > 1) pagHtml += '<button class="btn-small" onclick="loadNailsList(' + (nailsPromoPage - 1) + ')">← Назад</button>';
  pagHtml += '<span class="page-info">Страница ' + nailsPromoPage + ' из ' + nailsTotalPages + '</span>';
  if (nailsPromoPage < nailsTotalPages) pagHtml += '<button class="btn-small" onclick="loadNailsList(' + (nailsPromoPage + 1) + ')">Вперёд →</button>';
  document.getElementById('nailsPagination').innerHTML = pagHtml;
}

async function resetNailsCode(code) {
  const r = await fetch('/api/nails/promo-reset', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({secret, code})
  });
  const d = await r.json();
  if (d.success) { showToast('Код сброшен'); loadNailsList(nailsPromoPage); }
  else showToast('Ошибка: ' + (d.reason || 'unknown'));
}

async function deleteNailsCode(code) {
  if (!confirm('Удалить код ' + code + '?')) return;
  const r = await fetch('/api/nails/promo-delete', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({secret, code})
  });
  const d = await r.json();
  if (d.success) { showToast('Код удалён'); loadNailsList(nailsPromoPage); }
  else showToast('Ошибка: ' + (d.reason || 'unknown'));
}

loadStats();
loadList(1);
loadNailsList(1);
updatePromoHint();
</script>`);
  });

  // Lightweight public pricing endpoint for the landing page.
  // Admin analytics are intentionally kept out of the initial page load.
  app.get("/api/prices", (req: Request, res: Response) => {
    const stats = loadStats();
    const ownerFree = isOwnerRequest(req);
    res.setHeader("Cache-Control", ownerFree ? "private, no-store" : "public, max-age=300");
    res.json({
      standard: stats.standardPrice,
      premium: stats.premiumPrice,
      nailsMonth: stats.nailsMonthPrice || NAILS_MONTH_PRICE,
      grooming: stats.groomingPrice || GROOMING_PRICE,
      ownerFree,
    });
  });

  // Admin stats endpoint
  app.get("/api/admin-stats", requireAdmin, (req: Request, res: Response) => {
    const period = (req.query.period as string) || "all";
    const stats = loadStats();
    const computed = computeStats(stats, period);
    const pageviews = summarizePageviews(period);
    const chartData: { date: string; revenue: number; visits: number; standardSales: number; premiumSales: number; promoSales: number }[] = [];
    const days = period === "all" ? 30 : period === "month" ? 30 : period === "week" ? 7 : 1;
    const allPv = loadPageviews();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayEvents = (stats.events || []).filter((e: StatsEvent) => e.ts?.startsWith(key));
      const dayStandard = dayEvents.filter((e: StatsEvent) => e.type === "paid_standard").length;
      const dayPremium = dayEvents.filter((e: StatsEvent) => e.type === "paid_premium").length;
      const dayNails = dayEvents.filter((e: StatsEvent) => e.type === "paid_nails_month").length;
      const dayGrooming = dayEvents.filter((e: StatsEvent) => e.type === "paid_grooming").length;
      const dayPromo = dayEvents.filter((e: StatsEvent) => e.type === "paid_promo_standard" || e.type === "paid_promo_premium").length;
      const dayPv = allPv.filter((e) => e.ts.startsWith(key) && !isInternalPageView(e)).length;
      const nailsPrice = stats.nailsMonthPrice || NAILS_MONTH_PRICE;
      const groomPrice = stats.groomingPrice || GROOMING_PRICE;
      chartData.push({
        date: key,
        revenue:
          dayStandard * stats.standardPrice +
          dayPremium * stats.premiumPrice +
          dayNails * nailsPrice +
          dayGrooming * groomPrice,
        visits: dayPv || dayEvents.filter((e: StatsEvent) => e.type === "visit").length,
        standardSales: dayStandard,
        premiumSales: dayPremium,
        promoSales: dayPromo,
      });
    }
    res.json({
      stats: {
        ...computed,
        uniqueVisitors: pageviews.uniqueVisitors,
        pageViews: pageviews.totalViews,
        namedVisitors: pageviews.namedVisitors,
        anonymousVisitors: pageviews.anonymousVisitors,
      },
      period,
      chartData,
      pageviews,
    });
  });

  app.post("/api/track", (req: Request, res: Response) => {
    try {
      const visitorId = String(req.body?.visitorId || "").trim().slice(0, 64);
      const pathKey = String(req.body?.path || "").trim().slice(0, 80).replace(/[^a-z0-9_/-]/gi, "");
      const name = String(req.body?.name || "").trim().slice(0, 80);
      const kindRaw = String(req.body?.kind || "page").trim().toLowerCase();
      const kind: "page" | "click" = kindRaw === "click" ? "click" : "page";
      if (!visitorId || !pathKey) return res.status(400).json({ ok: false });
      const hit: PageView = { ts: new Date().toISOString(), visitorId, name, path: pathKey, kind };
      // Не пишем в статистику заходы админа / теста
      if (!isInternalPageView(hit)) appendPageView(hit);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  app.get("/api/admin-visits", requireAdmin, (req: Request, res: Response) => {
    const period = (req.query.period as string) || "all";
    res.json(summarizePageviews(period));
  });

  // Профиль стиля пользователя (для «Мои образы» и разных результатов в следующих сессиях)
  app.get("/api/user-profile", (req: Request, res: Response) => {
    const visitorId = sanitizeVisitorId(req.query.visitorId);
    if (!visitorId) return res.status(400).json({ error: "visitorId required" });
    const profile = readUserProfile(visitorId);
    if (!profile) return res.json({ ok: true, profile: null, pastLooks: [], orderIds: [] });
    const pastLooks = profile.sessions
      .flatMap((s) => (s.looks || []).map((l) => l.lookName))
      .filter(Boolean)
      .slice(-18);
    res.json({
      ok: true,
      profile: {
        name: profile.name,
        sessions: profile.sessions.length,
        updatedAt: profile.updatedAt,
      },
      pastLooks,
      orderIds: profile.orderIds || [],
    });
  });

  // Кабинет «Мои образы» по телефону (после оплаты)
  const phoneLookupHits = new Map<string, { n: number; t: number }>();
  app.post("/api/orders-by-phone", (req: Request, res: Response) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ error: "Укажите телефон в формате +7 XXX XXX-XX-XX" });
    }
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
    const key = `${ip}:${phone}`;
    const now = Date.now();
    const hit = phoneLookupHits.get(key) || { n: 0, t: now };
    if (now - hit.t > 60 * 60 * 1000) { hit.n = 0; hit.t = now; }
    hit.n += 1;
    phoneLookupHits.set(key, hit);
    if (hit.n > 30) {
      return res.status(429).json({ error: "Слишком много попыток. Подождите немного." });
    }

    const index = readPhoneIndex(phone);
    const ids = index?.orderIds || [];
    const orders = ids
      .map((id) => {
        const order = readOrder(id);
        if (!order) return null;
        if (order.status === "expired") return null;
        return {
          paymentId: order.paymentId,
          tier: order.tier,
          status: order.status,
          createdAt: order.createdAt,
          paidAt: order.paidAt || null,
        };
      })
      .filter(Boolean)
      .reverse();

    res.json({ ok: true, phone, orders, count: orders.length });
  });

  const orderLookupHits = new Map<string, { n: number; t: number }>();
  app.post("/api/find-orders", (req: Request, res: Response) => {
    const pickup = normalizePickupCode(req.body?.code || req.body?.pickupCode);
    if (!pickup) {
      return res.status(400).json({ error: "Введите код заказа, например СТИЛЬ-K7M2QX" });
    }
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
    const key = `${ip}:${pickup}`;
    const now = Date.now();
    const hit = orderLookupHits.get(key) || { n: 0, t: now };
    if (now - hit.t > 60 * 60 * 1000) { hit.n = 0; hit.t = now; }
    hit.n += 1;
    orderLookupHits.set(key, hit);
    if (hit.n > 30) {
      return res.status(429).json({ error: "Слишком много попыток. Подождите немного." });
    }
    const rec = readPickup(pickup);
    const order = rec ? readOrder(rec.paymentId) : null;
    if (!order || order.status === "expired") {
      return res.json({ ok: true, pickupCode: displayPickupCode(pickup), orders: [], count: 0 });
    }
    res.json({
      ok: true,
      pickupCode: displayPickupCode(pickup),
      orders: [{
        paymentId: order.paymentId,
        tier: order.tier,
        status: order.status,
        createdAt: order.createdAt,
        paidAt: order.paidAt || null,
        pickupCode: order.pickupCode || displayPickupCode(pickup),
      }],
      count: 1,
    });
  });

  app.post("/api/admin-login", (req: Request, res: Response) => {
    if (!ADMIN_PIN || !ADMIN_KEY || String(req.body?.pin || "") !== ADMIN_PIN) {
      return res.status(403).json({ error: "wrong" });
    }
    rememberOwnerIp(clientIp(req));
    res.setHeader("Set-Cookie", ownerCookieHeaders(req));
    res.json({ ok: true, ownerFree: true });
  });

  app.get("/api/admin-behavior", requireAdmin, (req: Request, res: Response) => {
    const period = (req.query.period as string) || "all";
    res.json(summarizePageviews(period));
  });

  // Admin set price endpoint
  app.post("/api/admin-set-price", requireAdmin, (req: Request, res: Response) => {
    const { tier, price } = req.body;
    if (!tier || !price) return res.status(400).json({ error: "Missing params" });
    const stats = loadStats();
    if (tier === "standard") stats.standardPrice = parseInt(price);
    else if (tier === "premium") stats.premiumPrice = parseInt(price);
    else if (tier === "nails_month") stats.nailsMonthPrice = parseInt(price);
    else if (tier === "grooming") stats.groomingPrice = parseInt(price);
    else return res.status(400).json({ error: "Unknown tier" });
    saveStats(stats);
    res.json({ success: true, stats });
  });

  app.get("/api/test-key", (req: Request, res: Response) => {
    res.json({
      POLZA_API_KEY: POLZA_API_KEY ? "configured" : "missing",
      ANALYSIS_MODEL,
      GENDER_MODEL,
      IMAGE_MODEL,
    });
  });

  // Payment endpoints
  const PAYMENT_MODE = process.env.PAYMENT_MODE || "test";
  async function ensurePaidOrder(paymentIdRaw: unknown): Promise<OrderRecord | null> {
    const paymentId = sanitizeOrderId(paymentIdRaw);
    if (!paymentId) return null;
    const existing = readOrder(paymentId);
    // Промо и владелец ПК — не ЮKassa, только локальная запись
    if (paymentId.startsWith("promo_") || paymentId.startsWith("owner_")) return existing;
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
              resultExpiresAt: isComplete ? new Date(completedMs + RESULTS_TTL_PAID_MS).toISOString() : undefined,
              unfinishedExpiresAt: isComplete ? undefined : new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
            };
          } catch {}
        }
      }
      const metaPhone = normalizePhone((payment as any).metadata?.phone);
      const phone = existing?.phone || metaPhone || undefined;
      if (phone) linkOrderToPhone(phone, paymentId);
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
        visitorId: existing?.visitorId,
        userName: existing?.userName,
        phone,
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
      const phone = normalizePhone(req.body?.phone);
      const visitorId = sanitizeVisitorId(req.body?.visitorId);
      const userName = String(req.body?.userName || "").trim().slice(0, 80);
      const stats = loadStats();
      const isNailsMonth = tier === "nails_month";
      const isGrooming = tier === "grooming";
      if (isOwnerRequest(req)) {
        const paymentId = sanitizeOrderId(
          `owner_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        );
        const nowIso = new Date().toISOString();
        if (isNailsMonth) {
          const granted = nailsSub.grantFromPayment(paymentId);
          return res.json({
            paymentId,
            ownerFree: true,
            confirmationUrl: null,
            nailsToken: granted.token,
            expiresAt: granted.expiresAt,
            kind: "month",
            days: 30,
          });
        }
        if (!isGrooming) {
          const pickupBody = createUniquePickupCode();
          linkOrderToPickupCode(pickupBody, paymentId);
          if (phone) linkOrderToPhone(phone, paymentId);
          if (visitorId) ensureUserProfile(visitorId, userName);
          saveOrder({
            paymentId,
            tier: tier === "premium" ? "premium" : "standard",
            status: "awaiting_input",
            createdAt: nowIso,
            updatedAt: nowIso,
            paidAt: nowIso,
            unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
            error: null,
            pickupCode: displayPickupCode(pickupBody),
            phone: phone || undefined,
            visitorId: visitorId || undefined,
            userName: userName || undefined,
          });
        }
        return res.json({
          paymentId,
          ownerFree: true,
          confirmationUrl: null,
          pickupCode: !isNailsMonth && !isGrooming ? readOrder(paymentId)?.pickupCode : undefined,
        });
      }
      const amount = isNailsMonth
        ? (stats.nailsMonthPrice || NAILS_MONTH_PRICE)
        : isGrooming
          ? (stats.groomingPrice || GROOMING_PRICE)
          : tier === "premium"
            ? stats.premiumPrice
            : stats.standardPrice;
      const paymentDescription = isNailsMonth
        ? "База ногтей — доступ на месяц + инструкции для мастера"
        : isGrooming
          ? "Причёска и уход — 3 образа + рекомендации по коже"
          : tier === "premium"
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
          tier: isNailsMonth ? "nails_month" : isGrooming ? "grooming" : tier,
          idempotenceKey,
          ...(phone ? { phone } : {}),
          ...(visitorId ? { visitorId } : {}),
        },
      }, idempotenceKey);

      // Сохраняем маппинг orderId → paymentId для confirm-payment
      pendingPayments.set(idempotenceKey, payment.id);
      savePendingPayment(idempotenceKey, payment.id);
      if (!isNailsMonth && !isGrooming) {
        const createdAt = new Date().toISOString();
        try {
          const pickupBody = createUniquePickupCode();
          linkOrderToPickupCode(pickupBody, payment.id);
          if (phone) linkOrderToPhone(phone, payment.id);
          if (visitorId) ensureUserProfile(visitorId, userName);
          saveOrder({
            paymentId: payment.id,
            tier: tier === "premium" ? "premium" : "standard",
            status: "awaiting_payment",
            createdAt,
            updatedAt: createdAt,
            unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
            error: null,
            pickupCode: displayPickupCode(pickupBody),
            phone: phone || undefined,
            visitorId: visitorId || undefined,
            userName: userName || undefined,
          });
        } catch (orderError) {
          console.error("[Order] Failed to persist newly created payment:", payment.id, orderError);
        }
      }

      console.log("[YooKassa] Payment created:", payment.id, "status:", payment.status, "tier:", isNailsMonth ? "nails_month" : isGrooming ? "grooming" : tier);

      const created = readOrder(payment.id);
      res.json({
        paymentId: payment.id,
        confirmationUrl: payment.confirmation?.confirmation_url,
        status: payment.status,
        pickupCode: created?.pickupCode || null,
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
      const hintedId = String(req.body?.object?.id || "").trim();
      if (!hintedId) return res.status(200).json({ status: "ignored" });
      const payment = await yooKassa.getPayment(hintedId);
      console.log("[YooKassa Webhook] verified", payment.id, payment.status);

      if (payment.status === "succeeded") {
        const paymentId = payment.id;
        const tier = payment.metadata?.tier || "standard";
        const amount = (payment as any).amount?.value || "?";

        if (tier === "nails_month") {
          nailsSub.grantFromPayment(paymentId);
          notifyTelegram(`✅ Оплата ${amount}₽ (База ногтей — месяц)`);
        } else if (tier === "grooming") {
          notifyTelegram(`✅ Оплата ${amount}₽ (Причёска и уход)`);
        } else {
          await ensurePaidOrder(paymentId);
          incPaidSale(tier);
          const tierName = tier === "premium" ? "Премиум" : "Стандарт";
          notifyTelegram(`✅ Оплата ${amount}₽ (${tierName})`);
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
        if (tier === "nails_month") {
          const granted = nailsSub.grantFromPayment(paymentId);
          console.log(`[YooKassa] Nails month confirmed: ${paymentId}`);
          notifyTelegram(`✅ Оплата ${amount}₽ (База ногтей — месяц) [confirm]`);
          res.redirect(
            `/?payment_success=true&payment_id=${paymentId}&tier=nails_month&nails_token=${encodeURIComponent(granted.token)}`
          );
        } else if (tier === "grooming") {
          console.log(`[YooKassa] Grooming confirmed: ${paymentId}`);
          notifyTelegram(`✅ Оплата ${amount}₽ (Причёска и уход) [confirm]`);
          res.redirect(`/?payment_success=true&payment_id=${paymentId}&tier=grooming`);
        } else {
          await ensurePaidOrder(paymentId);
          console.log(`[YooKassa] Payment confirmed: ${paymentId}, tier: ${tier}`);
          // Fallback: increment stats and notify Telegram (webhook may not have fired yet)
          incPaidSale(tier);
          const tierName = tier === "premium" ? "Премиум" : "Стандарт";
          notifyTelegram(`✅ Оплата ${amount}₽ (${tierName}) [confirm]`);
          const pickup = readOrder(paymentId)?.pickupCode || "";
          res.redirect(
            `/?payment_success=true&payment_id=${paymentId}&tier=${tier}${pickup ? `&pickup_code=${encodeURIComponent(pickup)}` : ""}`,
          );
        }
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
      if (paymentId.startsWith("owner_") || paymentId.startsWith("promo_")) {
        const order = readOrder(paymentId);
        return res.json({ paid: !!order?.paidAt, tier: order?.tier || "standard", ownerFree: paymentId.startsWith("owner_") });
      }

      const payment = await yooKassa.getPayment(paymentId);
      if (payment.status === "succeeded") {
        const tier = payment.metadata?.tier || "standard";
        if (tier === "nails_month") {
          const granted = nailsSub.grantFromPayment(paymentId);
          return res.json({
            paid: true,
            tier: "nails_month",
            kind: "month",
            nailsToken: granted.token,
            expiresAt: granted.expiresAt,
            days: 30,
          });
        }
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
    // «processing» только пока этот процесс реально генерирует. Иначе окно «зайдите через 10 минут» блокирует повтор.
    if (order.status === "processing" && !activeOrderIds.has(paymentId)) {
      const complete = !!order.expectedLooks && (order.completedLooks || 0) >= order.expectedLooks;
      const nextStatus = complete ? "ready" : order.completedLooks ? "partial" : "failed";
      const patched = updateOrder(paymentId, {
        status: nextStatus,
        error: complete ? null : "Генерация прервалась. Можно продолжить без новой оплаты.",
      });
      const shown = patched || order;
      return res.json({ ...shown, paid: !!order.paidAt, status: nextStatus });
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

  // Serve grooming images (free/paid package photos)
  app.get("/api/grooming-image/:folderId/:file", (req: Request, res: Response) => {
    const id = String(req.params.folderId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const file = String(req.params.file || "").replace(/[^a-zA-Z0-9._-]/g, "");
    if (!id || !file) return res.status(400).end();
    const imgPath = path.join(GROOMING_IMG_DIR, id, file);
    if (!fs.existsSync(imgPath)) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(imgPath);
  });

  // Восстановление результата причёсок, если поток оборвался
  app.get("/api/grooming-result/:jobId", (req: Request, res: Response) => {
    const id = sanitizeOrderId(req.params.jobId);
    if (!id) return res.status(400).json({ error: "Некорректный id" });
    const saved = readGroomingResult(id);
    if (!saved) return res.status(404).json({ error: "Результат ещё не готов или уже удалён" });
    if (saved.expiresAt && new Date(saved.expiresAt).getTime() < Date.now()) {
      try { fs.unlinkSync(groomingResultPath(id)); } catch {}
      return res.status(404).json({ error: "Результат истёк" });
    }
    if (saved.status === "ready" && saved.result) {
      return res.json({ status: "ready", jobId: id, result: saved.result });
    }
    const draftLooks = Array.isArray(saved.draftLooks) ? saved.draftLooks : [];
    const looksTotal = saved.looksTotal || 0;
    const hasAdvice = !!(saved.analysis || saved.result);
    if (hasAdvice && draftLooks.length > 0 && (saved.status !== "processing" || draftLooks.length >= looksTotal)) {
      const recovered = buildGroomingClientResult(saved, id);
      saveGroomingResult(id, { status: "ready", mode: saved.mode, result: recovered, looksDone: draftLooks.length, looksTotal });
      return res.json({ status: "ready", jobId: id, result: recovered });
    }
    return res.status(202).json({
      status: saved.status || "processing",
      jobId: id,
      progressText: saved.progressText || "",
      looksDone: saved.looksDone || 0,
      looksTotal: saved.looksTotal || 0,
    });
  });

  app.post("/api/grooming-retry-image", async (req: Request, res: Response) => {
    try {
      const jobId = sanitizeOrderId(req.body?.jobId);
      const lookIndex = parseInt(String(req.body?.lookIndex ?? "0"), 10);
      if (!jobId || !Number.isInteger(lookIndex) || lookIndex < 0) {
        return res.status(400).json({ error: "Некорректный запрос" });
      }
      const saved = readGroomingResult(jobId);
      if (!saved) return res.status(404).json({ error: "Результат не найден" });
      const looks: any[] = saved.mode === "free"
        ? [saved.result?.bestLook || saved.draftLooks?.[0]].filter(Boolean)
        : (saved.result?.looks || saved.draftLooks || []);
      const look = looks[lookIndex];
      if (!look) return res.status(404).json({ error: "Причёска не найдена" });
      const ref = await resolveImageToBase64(saved.sourceImage || look.imageClose);
      if (!ref) return res.status(409).json({ error: "Исходное фото не сохранилось. Загрузите фото ещё раз." });
      const agePolicy = groomingAgePolicy(saved.analysis || saved.result || {});
      const prompt = buildGroomingAfterPrompt({
        lookName: look.name,
        hairColor: look.hairColor,
        outfitNote: look.outfitNote,
        editPrompt: look.editPromptAfter || look.editPromptClose || look.editPrompt,
        agePolicy,
      });
      let image: string | null = null;
      for (let attempt = 0; attempt < 3 && !image; attempt++) {
        try {
          const useCompact = attempt >= 2;
          image = await generateImageWithFlux(
            useCompact
              ? buildGroomingAfterPrompt({
                  lookName: look.name,
                  hairColor: look.hairColor,
                  outfitNote: look.outfitNote,
                  agePolicy,
                  compact: true,
                })
              : prompt,
            ref.base64,
            ref.mime,
            { quality: "medium" }
          );
        } catch (e: any) {
          console.error("[Grooming] retry attempt", attempt + 1, e?.message);
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      const folderId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const imageAfter = await persistGroomingImage(folderId, "after", image);
      if (!imageAfter) return res.status(503).json({ error: "Не удалось создать фото «после». Попробуйте ещё раз." });
      look.imageAfter = imageAfter;
      look.imageError = null;
      looks[lookIndex] = look;
      if (saved.result) {
        if (saved.mode === "free") saved.result.bestLook = look;
        else saved.result.looks = looks;
      }
      saveGroomingResult(jobId, {
        status: "ready",
        mode: saved.mode,
        result: saved.result || buildGroomingClientResult({ ...saved, draftLooks: looks }, jobId),
        draftLooks: looks,
      });
      res.json({ imageAfter, look });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Ошибка повтора" });
    }
  });

  // Превью товара по поисковому запросу (WB) — для карточек ухода/макияжа
  app.get("/api/product-thumb", async (req: Request, res: Response) => {
    const q = ((req.query.q as string) || "").toString().trim().slice(0, 120);
    const brand = ((req.query.brand as string) || "").toString().trim().slice(0, 60);
    if (!q && !brand) return res.json({ imageUrl: null, productUrl: null });
    const result = await findProductThumb(q || brand, brand);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json(result);
  });

  // Отзывы с сайта → Telegram владельцу + контакт для ответа
  app.post("/api/feedback", (req: Request, res: Response) => {
    const text = String(req.body?.text || "").trim().slice(0, 2000);
    const userName = String(req.body?.userName || "").trim().slice(0, 80);
    const paymentId = sanitizeOrderId(req.body?.paymentId) || "";
    let telegram = String(req.body?.telegram || "").trim().slice(0, 64);
    telegram = telegram.replace(/^@/, "").replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "");
    const telegramIdRaw = req.body?.telegramId;
    const telegramId =
      typeof telegramIdRaw === "number"
        ? telegramIdRaw
        : Number(String(telegramIdRaw || "").replace(/\D/g, "")) || 0;

    if (!text) return res.status(400).json({ ok: false, error: "Пустой отзыв" });
    // Нужен @username, телефон или id из Mini App — иначе ответить некому
    const looksLikePhone = /^\+?\d[\d\s()-]{8,20}$/.test(telegram);
    const looksLikeUser = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(telegram);
    if (!looksLikePhone && !looksLikeUser && !telegramId) {
      return res.status(400).json({
        ok: false,
        error: "Укажите Telegram (@ник) или телефон — чтобы мы могли ответить",
      });
    }

    const entry = {
      id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      userName,
      telegram: telegram || null,
      telegramId: telegramId || null,
      paymentId: paymentId || null,
      text,
    };
    try {
      const feedbackFile = path.join(PROJECT_ROOT, "data", "feedbacks.json");
      fs.mkdirSync(path.dirname(feedbackFile), { recursive: true });
      let list: any[] = [];
      if (fs.existsSync(feedbackFile)) {
        try { list = JSON.parse(fs.readFileSync(feedbackFile, "utf8")); } catch { list = []; }
      }
      if (!Array.isArray(list)) list = [];
      list.unshift(entry);
      if (list.length > 500) list = list.slice(0, 500);
      writeJsonAtomic(feedbackFile, list);
    } catch (e) {
      console.error("[Feedback] save failed:", e);
    }

    let contactLine = "";
    if (looksLikeUser) {
      contactLine = `📱 Telegram: @${telegram}\n➡️ Ответить: https://t.me/${telegram}`;
    } else if (looksLikePhone) {
      contactLine = `📱 Телефон / WhatsApp: ${telegram}`;
    } else if (telegramId) {
      contactLine = `📱 Telegram ID: ${telegramId}\n(из Mini App; ответить можно, если человек писал боту)`;
    }

    notifyTelegram(
      `💬 Отзыв от ${userName || "пользователя"}:\n${contactLine}\n${paymentId ? `🧾 Заказ: ${paymentId}\n` : ""}\n${text}`
    );
    res.json({ ok: true });
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
    let stylizeTier: "standard" | "premium" = "standard";

    try {
      safeWrite(JSON.stringify({ type: "progress", step: 0.8, text: "Фотографии получены сервером..." }) + "\n");

      const files = req.files as MulterFile[];
      if (!files || files.length === 0) {
        safeWrite(JSON.stringify({ type: "error", error: "No images uploaded" }) + "\n");
        return res.end();
      }

      paymentId = sanitizeOrderId(req.body.paymentId);
      const promoCodeForAccess = (req.body.promoCode || "").toString().trim().toUpperCase();
      if (!paymentId && !promoCodeForAccess && isOwnerRequest(req)) {
        paymentId = sanitizeOrderId(
          `owner_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        );
        const nowIso = new Date().toISOString();
        const pickupBody = createUniquePickupCode();
        linkOrderToPickupCode(pickupBody, paymentId);
        stylizeTier = String(req.body.tier || "") === "premium" || Number(req.body.looksCount) > 3 ? "premium" : "standard";
        saveOrder({
          paymentId,
          tier: stylizeTier,
          status: "processing",
          createdAt: nowIso,
          updatedAt: nowIso,
          paidAt: nowIso,
          startedAt: nowIso,
          unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
          error: null,
          pickupCode: displayPickupCode(pickupBody),
          visitorId: sanitizeVisitorId(req.body.visitorId) || undefined,
          userName: String(req.body.userName || "").trim().slice(0, 80) || undefined,
        });
        activeOrderIds.add(paymentId);
        lockedOrderId = paymentId;
        safeWrite(JSON.stringify({
          type: "order",
          paymentId,
          pickupCode: displayPickupCode(pickupBody),
          text: "Владелец — генерация без оплаты, результат в «Мои образы».",
        }) + "\n");
      } else if (paymentId) {
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
        if (activeOrderIds.has(paymentId)) {
          safeWrite(JSON.stringify({ type: "error", error: "Этот заказ уже генерируется. Его можно закрыть и открыть позже в разделе «Мои образы»." }) + "\n");
          return res.end();
        }
        if (paidOrder.status === "processing") {
          updateOrder(paymentId, { status: "failed", error: null });
        }
        stylizeTier = paidOrder.tier === "premium" ? "premium" : "standard";
        activeOrderIds.add(paymentId);
        lockedOrderId = paymentId;
      } else {
        const promo = promoCodeForAccess ? promos[promoCodeForAccess] : null;
        if (!promo || promo.used) {
          safeWrite(JSON.stringify({ type: "error", error: "Для генерации нужна подтверждённая оплата или действующий промокод." }) + "\n");
          return res.end();
        }
        if (promo.tier === "grooming") {
          safeWrite(JSON.stringify({ type: "error", error: "Этот промокод только для причёсок — откройте «Причёска и уход»." }) + "\n");
          return res.end();
        }
        if (promo.tier !== "standard" && promo.tier !== "premium") {
          safeWrite(JSON.stringify({ type: "error", error: "Этот промокод не для образов." }) + "\n");
          return res.end();
        }
        if (activePromoCodes.has(promoCodeForAccess)) {
          safeWrite(JSON.stringify({ type: "error", error: "Этот промокод уже используется для генерации." }) + "\n");
          return res.end();
        }
        // Как у оплаты: создаём заказ и папку результата — иначе при обрыве/рестарте нечего открыть в «Мои образы»
        paymentId = sanitizeOrderId(
          `promo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        );
        const nowIso = new Date().toISOString();
        const promoPhone = normalizePhone(req.body.phone);
        if (promoPhone) linkOrderToPhone(promoPhone, paymentId);
        const pickupBody = createUniquePickupCode();
        linkOrderToPickupCode(pickupBody, paymentId);
        stylizeTier = promo.tier === "premium" ? "premium" : "standard";
        saveOrder({
          paymentId,
          tier: promo.tier,
          status: "processing",
          createdAt: nowIso,
          updatedAt: nowIso,
          paidAt: nowIso,
          startedAt: nowIso,
          unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
          error: null,
          pickupCode: displayPickupCode(pickupBody),
          phone: promoPhone || undefined,
          visitorId: sanitizeVisitorId(req.body.visitorId) || undefined,
          userName: String(req.body.userName || "").trim().slice(0, 80) || undefined,
        });
        activePromoCodes.add(promoCodeForAccess);
        lockedPromoCode = promoCodeForAccess;
        activeOrderIds.add(paymentId);
        lockedOrderId = paymentId;
        safeWrite(JSON.stringify({
          type: "order",
          paymentId,
          tier: promo.tier,
          pickupCode: displayPickupCode(pickupBody),
          text: "Заказ по промокоду создан — результат сохранится в «Мои образы».",
        }) + "\n");
      }

      {
        const resultDir = path.join(RESULTS_DIR, paymentId);
        fs.mkdirSync(resultDir, { recursive: true });
        for (const name of fs.readdirSync(resultDir)) {
          if (/^source_\d+\.(jpg|png|webp)$/i.test(name)) fs.rmSync(path.join(resultDir, name), { force: true });
        }
        files.forEach((file, idx) => {
          const ext = file.mimetype.includes("png") ? "png" : file.mimetype.includes("webp") ? "webp" : "jpg";
          fs.writeFileSync(path.join(resultDir, `source_${idx}.${ext}`), file.buffer);
        });
        const visitorIdEarly = sanitizeVisitorId(req.body.visitorId);
        const phoneEarly = normalizePhone(req.body.phone) || readOrder(paymentId)?.phone || "";
        if (phoneEarly) linkOrderToPhone(phoneEarly, paymentId);
        writeJsonAtomic(path.join(resultDir, "input.json"), {
          height: req.body.height || "",
          weight: req.body.weight || "",
          wishes: req.body.wishes || "",
          looksCount: req.body.looksCount || "",
          userName: req.body.userName || "",
          budget: req.body.budget || "",
          birthDate: req.body.birthDate || "",
          season: req.body.season || "",
          seasons: req.body.seasons || "",
          occasions: req.body.occasions || "",
          promoCode: promoCodeForAccess || "",
          visitorId: visitorIdEarly || "",
          phone: phoneEarly || "",
          savedAt: new Date().toISOString(),
        });
        updateOrder(paymentId, {
          status: "processing",
          startedAt: new Date().toISOString(),
          completedLooks: 0,
          error: null,
          visitorId: visitorIdEarly || undefined,
          userName: String(req.body.userName || "").trim().slice(0, 80) || undefined,
          phone: phoneEarly || undefined,
          unfinishedExpiresAt: new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
        });
        if (visitorIdEarly) ensureUserProfile(visitorIdEarly, String(req.body.userName || ""));
      }

      const height = req.body.height || "не указан";
      const weight = req.body.weight || "не указан";
      const rawWishes = (req.body.wishes || "").toString().slice(0, 500).trim();
      const occasionRaw = (req.body.occasions || "").toString().slice(0, 600).trim();

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
      // Сезон: Стандарт может дать свой сезон на каждый образ (лето, лето, осень).
      const wishesLower = `${occasionRaw} ${rawWishes}`.toLowerCase();
      const seasonMap: Record<string, string> = {
        "лет": "лето", "жара": "лето", "пляж": "лето", "отпуск": "лето", "курорт": "лето",
        "осень": "осень", "дождь": "осень",
        "зим": "зима", "холод": "зима", "мороз": "зима",
        "весн": "весна",
      };
      const allowedSeasons = ["зима", "весна", "лето", "осень"];
      const parseLookSeasons = (body: any): string[] => {
        const raw = body?.seasons;
        if (raw) {
          try {
            const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (Array.isArray(arr)) {
              return arr
                .map((s: any) => String(s).trim().toLowerCase())
                .filter((s: string) => allowedSeasons.includes(s));
            }
          } catch {}
        }
        const one = (body?.season || "").toString().trim().toLowerCase();
        if (one.includes(",")) {
          return one.split(",").map((s: string) => s.trim()).filter((s: string) => allowedSeasons.includes(s));
        }
        return allowedSeasons.includes(one) ? [one] : [];
      };
      const parsedLookSeasons = parseLookSeasons(req.body);
      const seasonFromForm = (req.body.season || "").toString().trim().toLowerCase();
      const detectedSeason =
        (parsedLookSeasons.length === 1 ? parsedLookSeasons[0] : null)
        || (allowedSeasons.includes(seasonFromForm) ? seasonFromForm : null)
        || Object.entries(seasonMap).find(([k]) => wishesLower.includes(k))?.[1];
      const outerwearBySeason =
        `🧥 ВЕРХНЯЯ ОДЕЖДА — ОБЯЗАТЕЛЬНА в КАЖДОМ образе отдельным item в items[] с category "верхняя одежда" и searchQuery на русском:\n` +
        `- зима: пальто / пуховик / тёплая куртка / шерстяное пальто\n` +
        `- осень: тренч / лёгкое пальто / куртка / пиджак с подкладкой\n` +
        `- весна: плащ / лёгкое пальто / куртка / пиджак\n` +
        `- лето: лёгкий пиджак / overshirt / льняной пиджак / лёгкая куртка-бомбер (НЕ пропускай — рабочий и городской образ без верхнего слоя неполный)\n` +
        `Для офиса/корпоратива пиджак или куртка ОБЯЗАТЕЛЬНЫ всегда. Без ссылки на верхнюю одежду образ считается браком.`;
      const mixedSeasonLines = (seasons: string[]) =>
        seasons.map((s, i) => `- Образ ${i + 1}: строго ${s}`).join("\n");
      let seasonInstruction = parsedLookSeasons.length > 1
        ? `\n🗓️ СЕЗОНЫ ПО ОБРАЗАМ (ОБЯЗАТЕЛЬНО):\n${mixedSeasonLines(parsedLookSeasons)}\nКаждый look в массиве looks — СВОЙ сезон из списка. Если сезоны разные — НЕ делай все образы под одно время года. Ткани, обувь, слои и верхняя одежда должны соответствовать сезону этого образа.\n${outerwearBySeason}`
        : detectedSeason
        ? `\n🗓️ СЕЗОН (ОБЯЗАТЕЛЬНО): ${detectedSeason}. ВСЕ образы строго под этот сезон (ткани, обувь, слои).\n${outerwearBySeason}`
        : `\n🧥 ВЕРХНЯЯ ОДЕЖДА: в каждом образе добавь отдельный item category "верхняя одежда" (пиджак/куртка/пальто по погоде) с searchQuery — иначе образ неполный для покупки.`;
      const wishes = sanitizeWishes(rawWishes);
      const promoCode = (req.body.promoCode || "").toString().trim().toUpperCase();
      const budgetRaw = parseInt((req.body.budget || "").toString()) || 0;
      const budgetInstruction = budgetRaw > 0
        ? `\n\n💰 БЮДЖЕТ ПОЛЬЗОВАТЕЛЯ: ${budgetRaw.toLocaleString("ru-RU")} ₽ на один образ. КРИТИЧЕСКИ ВАЖНО: сумма всех items[] в каждом образе НЕ должна превышать ${budgetRaw.toLocaleString("ru-RU")} ₽. Подбирай реальные вещи в этом ценовом диапазоне. Расставляй приоритеты: сначала ключевые вещи образа, потом аксессуары. Указывай честные цены — не занижай и не завышай.`
        : "";
      const requestedLooks = parseInt(String(req.body.looksCount || ""), 10);
      const looksCount = stylizeTier === "premium"
        ? Math.min(5, Math.max(1, Number.isFinite(requestedLooks) && requestedLooks > 0 ? requestedLooks : 5))
        : 3;
      if (parsedLookSeasons.length > 1) {
        const forLooks = parsedLookSeasons.slice(0, looksCount);
        while (forLooks.length < looksCount) forLooks.push(forLooks[forLooks.length - 1] || "лето");
        seasonInstruction =
          `\n🗓️ СЕЗОНЫ ПО ОБРАЗАМ (ОБЯЗАТЕЛЬНО):\n${mixedSeasonLines(forLooks)}\nКаждый look в массиве looks — СВОЙ сезон из списка. Если сезоны разные — НЕ делай все образы под одно время года. Ткани, обувь, слои и верхняя одежда должны соответствовать сезону этого образа.\n${outerwearBySeason}`;
      }
      if (paymentId) updateOrder(paymentId, { expectedLooks: looksCount });
      const userName = (req.body.userName || "").toString().trim().slice(0, 50);
      const visitCount = Math.max(1, parseInt(req.body.visitCount) || 1);
      const visitorId = sanitizeVisitorId(req.body.visitorId);
      const pastLooksClient = (req.body.pastLooks || "").toString().trim().slice(0, 500);
      const userProfile = visitorId ? (ensureUserProfile(visitorId, userName) || readUserProfile(visitorId)) : null;
      const pastLooksInstruction = buildStyleHistoryInstruction(userProfile, pastLooksClient);
      const sessionCount = userProfile?.sessions?.length || 0;
      const isReturning = visitCount > 1 || sessionCount > 0;
      const effectiveVisit = Math.max(visitCount, sessionCount + 1);
      const returningInstruction = isReturning
        ? `ВАЖНО: это визит №${effectiveVisit} этого пользователя (уже было ${sessionCount} сохранённых сессий стиля). Тон приветствия должен быть тем теплее и дружелюбнее, чем больше визитов:
- Визит 2-3: как старый знакомый — "О, снова вы!", "Рад снова вас видеть!", "Снова в деле!"
- Визит 4-6: как близкий знакомый — "О, это уже традиция!", "Мой любимый клиент снова здесь!", "Я уже начинаю знать ваш вкус"
- Визит 7+: как лучший друг — "Ну наконец-то!", "Я уже скучал!", "Без вас тут было скучновато"
ЭКСПЕРИМЕНТ: поскольку человек уже был — предложи ему что-то смелее обычного и НЕ ПОХОЖЕЕ на прошлые сессии. ОДИН из образов сделай экспериментальным — выйди за рамки привычного стиля этого человека. В описании этого образа добавь реплику стилиста про эксперимент. Каждый раз придумывай РАЗНЫЙ оборот. `
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

      safeWrite(JSON.stringify({ type: "progress", step: 0.85, text: "Смотрим фото — определяем, чей это образ..." }) + "\n");
      const detectedGender = await detectGenderFromPhoto(referenceImageBase64, mimeType);
      const genderBlock = genderWardrobeInstruction(detectedGender);
      if (paymentId) {
        try {
          const inputPath = path.join(RESULTS_DIR, paymentId, "input.json");
          if (fs.existsSync(inputPath)) {
            const prev = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
            writeJsonAtomic(inputPath, { ...prev, detectedGender: detectedGender || null });
          }
        } catch {}
      }

      // Prepare messages with image for Gemini analysis
      const mixedOccasions = /[,;]/.test(occasionRaw) && occasionRaw.length > 24;
      const occasionGuide = mixedOccasions
        ? `\n\n🎯 ПОВОДЫ ПО ОБРАЗАМ (обязательно, тот же порядок, что и сезоны):\n${occasionRaw}\nКаждый look — СВОЙ повод. Не своди все образы к одному типу, если поводы разные.\n`
        : getOccasionStyleGuide(`${occasionRaw} ${wishes}`);
      const locationLock = `\n\n📍 МЕСТО НА ФОТО важнее сезона: ресторан/ужин — внутри зала, не кусты. Яхта — на палубе. Пляж — море/песок. Клуб — внутри клуба. Осень и лето меняют одежду и свет, но не переносят человека в парк.\n`;
      const wishesBlock = wishes
        ? `\n\n🌟 ОСОБЫЕ ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (PREMIUM — ВЫСШИЙ ПРИОРИТЕТ): "${wishes}"\n\n⚠️ КРИТИЧЕСКОЕ ПРАВИЛО ПРИ НАЛИЧИИ ПОЖЕЛАНИЙ:\nЕсли пользователь сформулировал конкретный запрос — ПОЛНОСТЬЮ ИГНОРИРУЙ структуру "офис/вечер/color-block" и стандартный список из 6 направлений. Создавай РОВНО то, что человек попросил.\n\nКонкретные сценарии:\n- "хочу образ рокера и 2 для свидания" → ровно 1 рокер + 2 свидания (НЕ офис/вечер/color-block!)\n- "три ярких на курорт" → все 3 курортных, можно оставить летние правила\n- "посоветуй макияж/причёску для X" → расширь раздел груминга в каждом образе с конкретикой под X (продукты, бренды, шаги)\n- "дай совет на первое свидание" → добавь блок "💬 Совет для свидания" в каждом образе: парфюм-нота, как зайти, что говорить, чего избегать\n- Любой другой запрос — БУКВАЛЬНО следуй пожеланию\n\nОБЯЗАТЕЛЬНЫЙ ПУНКТ ПАРФЮМ:\nЕсли пожелание касается свидания/вечера/мероприятия/стиля жизни — в каждом образе ОБЯЗАТЕЛЬНО рекомендуй парфюм (одну конкретную нишевую/премиум модель). ВАЖНО: каждый раз выбирай РАЗНЫЕ ароматы, не повторяй одни и те же. Для вдохновения — большой пул на выбор:\n\nМУЖСКИЕ/УНИСЕКС нишевые: Le Labo Santal 33, Le Labo Bergamote 22, Le Labo Rose 31, Maison Margiela Replica Jazz Club, Maison Margiela Replica By the Fireplace, Maison Margiela Replica Sailing Day, Tom Ford Tobacco Vanille, Tom Ford Oud Wood, Tom Ford Grey Vetiver, Tom Ford Neroli Portofino, Byredo Mojave Ghost, Byredo Bal d\'Afrique, Byredo Gypsy Water, Creed Aventus, Creed Silver Mountain Water, Acqua di Parma Colonia, Acqua di Parma Blu Mediterraneo, Diptyque Tam Dao, Diptyque Eau des Sens, Memo Paris Irish Leather, Parfums de Marly Layton, Parfums de Marly Percival, Initio Oud for Greatness, Initio Rehab, Nasomatto Black Afgano, Juliette Has a Gun Not a Perfume, Comme des Garçons Series 3 Incense Kyoto, Serge Lutens Ambre Sultan, Serge Lutens Chergui, Xerjoff Naxos, Xerjoff Alexandria II, Roja Dove Oligarch\n\nЖЕНСКИЕ/УНИСЕКС нишевые: Maison Francis Kurkdjian Baccarat Rouge 540, Maison Francis Kurkdjian Aqua Celestia, Maison Francis Kurkdjian À la Rose, Diptyque Philosykos, Diptyque Do Son, Diptyque Eau Rose, Chloé Atelier des Fleurs Rose Naturelle, Byredo Blanche, Byredo La Tulipe, Frederic Malle Portrait of a Lady, Frederic Malle Musc Ravageur, Frederic Malle Une Fleur de Cassie, Guerlain Spiritueuse Double Vanille, Guerlain Mon Guerlain Bloom of Rose, Penhaligon\'s Empressa, Penhaligon\'s Juniper Sling, Jo Malone Peony & Blush Suede, Jo Malone Wood Sage & Sea Salt, Jo Malone Lime Basil & Mandarin, Annick Goutal Petite Chérie, Memo Paris Inlé, Amouage Reflection Woman, Amouage Honour Woman, Serge Lutens Sa Majesté la Rose, Etat Libre d\'Orange Putain des Palaces, Comme des Garçons Wonderwood, Viktor&Rolf Flowerbomb Nectar, Narciso Rodriguez for Her Musc Noir\n\nВсегда объясняй ПОЧЕМУ этот конкретный аромат подходит к образу/ситуации/характеру человека.\n\nЕсли пожелания нет или они общие (типа "красиво") — следуй стандартной структуре офис/вечер/color-block.`
        : "";
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: `${returningInstruction}${pastLooksInstruction}${nameInstruction}CRITICAL OVERRIDE: You MUST generate EXACTLY ${looksCount} look${looksCount > 1 ? "s" : ""} in the "looks" array — no more, no less. Ignore any default number mentioned in your instructions.${genderBlock}\nUser's Height: ${height} cm. User's Weight: ${weight} kg. Please analyze the attached photo and provide ${looksCount} distinct fashion look${looksCount > 1 ? "s" : ""} based on this person. Use the 2026 fashion trends from the knowledge base.${seasonInstruction}${budgetInstruction}${wishesBlock}${occasionGuide}${locationLock}${zodiacBlock}` },
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
                { role: "user", content: `Найди свежие модные тренды 2026 по теме: "${wishes.slice(0, 180)}". Что реально носят сейчас? Какие конкретные вещи, цвета, бренды? Дай 3–5 пунктов конкретики.` },
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

      // Step 1: Analyze with Gemini 3.5 Flash Lite
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
        const analysis = await callWithRetry(async () => {
          const text = await callPolzaChat({
            model: ANALYSIS_MODEL,
            systemPrompt,
            messages,
            temperature: analysisTemp,
            maxTokens: looksCount >= 4 ? 12288 : 8192,
            timeoutMs: looksCount >= 4 ? 180000 : 120000,
          });
          const data = typeof text === "string" ? safeJsonParse(text) : text;
          return { text, data };
        }, 2, 4000);
        analysisText = analysis.text;
        analysisData = analysis.data;
      } catch (e: any) {
        console.error("[Analysis] failed:", e?.message || e);
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
      looks = sanitizeLooksForGender(looks, detectedGender);
      if (Array.isArray(looks) && looks.length > looksCount) looks = looks.slice(0, looksCount);

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

      // Step 2: все кадры сразу — Стандарт 3, Премиум до 5. Цена та же, ждать меньше.
      safeWrite(JSON.stringify({
        type: "progress",
        step: 2.0,
        text: `Рисуем ${looks.length} образов сразу — обычно около минуты…`,
      }) + "\n");

      // Track completed images for progress updates
      let completedImages = 0;
      const totalImages = looks.length;

      looksWithImages = await Promise.all(looks.map(async (look: any, idx: number) => {
        let generatedImageBase64 = null;
        let imageGenerationError = null;

        if (look.editPrompt) {
          let imageDataUrl: string | null = null;
          let lastError = "";
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
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
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 20, minWeight);
                } else if (bmi >= 35) {
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 18, minWeight);
                } else if (bmi >= 30) {
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 15, minWeight);
                } else if (bmi >= 27) {
                  const minWeight = 22 * Math.pow(heightNum / 100, 2);
                  targetWeight = Math.max(weightNum - 8, minWeight);
                }
                const targetBmi = targetWeight / Math.pow(heightNum / 100, 2);
                if (targetBmi >= 35) { buildDesc = `very large plus-size heavy-set person, full round midsection, thick torso, wide hips, thick limbs, large frame`; buildShort = `very large heavy-set`; }
                else if (targetBmi >= 30) { buildDesc = `plus-size heavy-set person, full midsection, broad frame, thick torso`; buildShort = `plus-size heavy-set`; }
                else if (targetBmi >= 27) { buildDesc = `slightly fuller person with a soft midsection, fuller frame`; buildShort = `fuller`; }
                else if (targetBmi >= 22) { buildDesc = `average medium-build person, proportionate frame, healthy weight`; buildShort = `average medium`; }
                else { buildDesc = `slim lean narrow-build person, slender frame`; buildShort = `slim lean`; }

                if (targetWeight < weightNum) {
                  bodyBuildInstruction = `BODY: ${heightNum} cm, render ~${Math.round(targetWeight)} kg (${buildDesc}) — slightly slimmer than real ${weightNum} kg but still full-figured, not skinny. Clothing fit flatters this build.`;
                } else {
                  bodyBuildInstruction = `BODY: ${heightNum} cm / ${weightNum} kg, ${buildDesc}. Keep real proportions — do not slim down. Clothing fit flatters this ${buildShort} build.`;
                }
              }
              const occasionSlots = expandOccasionList(occasionRaw);
              const lookOccasion = occasionSlots[idx] || occasionRaw;
              const fluxPrompt = buildOutfitImagePrompt({
                editPrompt: look.editPrompt,
                detectedGender: detectedGender || "person",
                wishes: `${lookOccasion} ${wishes}`.trim(),
                lookIdx: idx,
                bodyBuildInstruction,
                season: (parsedLookSeasons[idx] || detectedSeason || "").toString(),
              });
              imageDataUrl = await generateImageWithFlux(fluxPrompt, referenceImageBase64, mimeType);
              if (imageDataUrl) break;
              lastError = "No image data returned from Flux model.";
            } catch (e: any) {
              lastError = e.message;
              if (attempt < 1) await new Promise(r => setTimeout(r, 800));
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
          text: completedImages >= totalImages
            ? `Готовы все ${totalImages} образа`
            : `Готово ${completedImages} из ${totalImages} — остальные ещё рисуются…`,
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

      // Step 4: ищем реальные карточки на WB (как в уходе); Ozon/YM — страницы поиска
      safeWrite(JSON.stringify({ type: "progress", step: 4.0, text: "Ищем товары на Wildberries..." }) + "\n");

      const looksWithImagesAndUrls = await enrichOutfitLooksWithWb(looksWithImages, (done, total) => {
        if (total > 0 && (done === total || done % 3 === 0)) {
          safeWrite(JSON.stringify({
            type: "progress",
            step: 4.0,
            text: `Ищем товары на Wildberries... ${done}/${total}`,
          }) + "\n");
        }
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
        const ttlMs = resultsTtlForUser(userName, { paid: true, visitorId });
        updateOrder(paymentId, {
          status: isComplete ? "ready" : "partial",
          completedLooks,
          completedAt,
          visitorId: visitorId || undefined,
          userName: userName || undefined,
          resultExpiresAt: isComplete ? new Date(Date.now() + ttlMs).toISOString() : undefined,
          unfinishedExpiresAt: isComplete ? undefined : new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
          error: isComplete ? null : "Не все изображения удалось создать. Повторите только отсутствующие фото.",
        });
        // Профиль пользователя + история стиля (для следующих визитов — другие образы)
        if (visitorId) {
          try {
            recordUserStyleSession({
              visitorId,
              userName,
              paymentId,
              tier: String(req.body.tier || (promoCode ? "promo" : "standard")),
              season: parsedLookSeasons.length
                ? parsedLookSeasons.join(", ")
                : String(req.body.season || "").trim(),
              wishes: rawWishes,
              looks: looksWithImagesAndUrls,
            });
          } catch (e) {
            console.error("[UserProfile] record failed:", e);
          }
        }
      }

      // Промокод сгорает только когда ВСЕ фото готовы — иначе можно добить «Повторить генерацию»
      if (promoCode && paymentId) {
        const completedLooks = checkpointLooks.filter((look: any) => !!look.image).length;
        if (completedLooks === looksWithImagesAndUrls.length && completedLooks > 0) {
          try { markPromoUsed(promoCode); } catch (e) { console.error("[Promo] markPromoUsed failed:", e); }
        }
      }

      safeWrite(JSON.stringify({
        type: "result",
        paymentId: paymentId || undefined,
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
      const paymentIdEmergency = paymentId || sanitizeOrderId(req.body?.paymentId);
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
      // Только живая генерация в этом процессе — не блокируем «зависший» processing после рестарта
      if (activeOrderIds.has(paymentId)) {
        return res.status(409).json({ error: "Основная генерация этого заказа ещё выполняется." });
      }
      if (order.status === "processing") {
        updateOrder(paymentId, { status: "partial", error: null });
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
      const occasions = (input.occasions || req.body.occasions || "").toString().trim();
      if (!editPrompt) return res.status(409).json({ error: "Инструкция для этого образа не сохранилась." });

      const referenceImageBase64 = sourceBuffer.toString("base64");
      updateOrder(paymentId, { status: "partial", error: null });

      let imageDataUrl: string | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const occasionSlots = expandOccasionList(occasions);
          const lookOccasion = occasionSlots[lookIdx] || occasions;
          let retrySeason = String(input.season || "").toLowerCase();
          try {
            const raw = input.seasons;
            const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (Array.isArray(arr) && arr[lookIdx]) retrySeason = String(arr[lookIdx]).toLowerCase();
          } catch {}
          const fluxPrompt = buildOutfitImagePrompt({
            editPrompt,
            detectedGender: (input.detectedGender || "person").toString(),
            wishes: `${lookOccasion} ${wishes}`.trim(),
            lookIdx,
            season: retrySeason,
          });
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
      const ttlUser = String(input.userName || "").trim();
      updateOrder(paymentId, {
        status: isComplete ? "ready" : "partial",
        completedLooks,
        completedAt: isComplete ? new Date().toISOString() : order.completedAt,
        resultExpiresAt: isComplete
          ? new Date(Date.now() + resultsTtlForUser(ttlUser, { paid: true, visitorId: order.visitorId })).toISOString()
          : order.resultExpiresAt,
        unfinishedExpiresAt: isComplete ? undefined : new Date(Date.now() + UNFINISHED_ORDER_TTL_MS).toISOString(),
        error: isComplete ? null : "Остались изображения, которые нужно повторить.",
      });

      if (isComplete) {
        try {
          const inputFile = path.join(resultDir, "input.json");
          if (fs.existsSync(inputFile)) {
            const input = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
            const code = String(input.promoCode || "").trim().toUpperCase();
            if (code) markPromoUsed(code);
          }
        } catch {}
      }

      res.json({ image: imageRef, completed: isComplete });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (retryKey) activeRetryKeys.delete(retryKey);
    }
  });

  // Подбор причёски: free = 1 крупный план; paid = 3 крупных плана + уход. Стрим NDJSON как /api/stylize.
  app.post("/api/grooming", upload.array("photos", 1), async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    const safeWrite = (data: string) => {
      try { if (!res.writableEnded) res.write(data); } catch {}
    };
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let jobId = "";
    try {
      const files = req.files as MulterFile[];
      const mode = ((req.body.mode || "free") as string).toLowerCase() === "paid" ? "paid" : "free";
      const height = (req.body.height || "").toString().trim();
      const weight = (req.body.weight || "").toString().trim();
      const paymentId = sanitizeOrderId(req.body.paymentId);
      const promoCode = (req.body.promoCode || "").toString().trim().toUpperCase();
      const groomVisitorId = sanitizeVisitorId(req.body.visitorId);
      const groomUserName = String(req.body.userName || "").trim().slice(0, 80);
      if (groomVisitorId) ensureUserProfile(groomVisitorId, groomUserName);
      jobId = sanitizeOrderId(req.body.jobId)
        || paymentId
        || `groom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

      const fail = (msg: string, status = 400) => {
        if (jobId) {
          saveGroomingResult(jobId, { status: "failed", error: msg, mode });
        }
        res.statusCode = status;
        safeWrite(JSON.stringify({ type: "error", error: msg, jobId: jobId || undefined }) + "\n");
        clearInterval(heartbeat);
        return res.end();
      };

      if (!files || files.length === 0) return fail("Нужно загрузить фото лица");
      if (!height || !weight) return fail("Укажите рост и вес");
      if (!groomingSystemPromptTemplate) return fail("База причёсок временно недоступна", 503);

      if (mode === "free" && !isOwnerRequest(req)) {
        if (!groomVisitorId) return fail("Обновите страницу и попробуйте снова", 400);
        if (hasUsedFreeGrooming(groomVisitorId)) {
          return fail("Бесплатная причёска уже использована. Полный пакет — 100 ₽ или промокод «Причёска и уход».", 402);
        }
      }

      let accessViaPromo = false;
      if (mode === "paid") {
        if (isOwnerRequest(req) || paymentId.startsWith("owner_")) {
          accessViaPromo = true;
        } else {
        syncPromosFromDisk();
        if (promoCode) {
          const entry = promos[promoCode];
          if (!entry) return fail("Промокод не найден. Проверьте, что скопировали полностью.", 402);
          if (entry.tier !== "grooming") {
            return fail(
              entry.tier === "standard" || entry.tier === "premium"
                ? "Этот промокод для образов («Начать преображение»), а не для причёсок. В админке создайте код типа «Причёска и уход»."
                : "Промокод недействителен для причёсок",
              402
            );
          }
          if (entry.used) return fail("Этот промокод уже использован", 402);
          accessViaPromo = true;
        } else if (paymentId) {
          try {
            const payment = await yooKassa.getPayment(paymentId);
            if (payment.status !== "succeeded" || payment.metadata?.tier !== "grooming") {
              return fail("Оплата не подтверждена", 402);
            }
          } catch {
            return fail("Не удалось проверить оплату", 402);
          }
        } else {
          return fail("Нужна оплата 100 ₽ или промокод «Причёска и уход»", 402);
        }
        }
      }

      saveGroomingResult(jobId, {
        status: "processing",
        mode,
        progressText: "Анализ лица…",
        looksDone: 0,
        looksTotal: mode === "paid" ? 3 : 1,
      });

      heartbeat = setInterval(() => safeWrite(JSON.stringify({ type: "heartbeat", jobId }) + "\n"), 10000);
      safeWrite(JSON.stringify({
        type: "progress",
        jobId,
        step: 0.5,
        text: mode === "paid"
          ? "Фото получено. Анализируем лицо, цвет и форму…"
          : "Фото получено. Ищем лучшую причёску под вас…",
      }) + "\n");

      const file = files[0];
      const mimeType = file.mimetype || "image/jpeg";
      const referenceImageBase64 = file.buffer.toString("base64");
      const imageContent = [{
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` },
      }];

      const userText = `Режим: ${mode}. Рост: ${height} см. Вес: ${weight} кг.
Проанализируй лицо: пол, возраст, ageBand (teen / under25 / 25to34 / 35plus / 60plus), овал, цветотип, состояние волос. Верни JSON для режима ${mode}.
«После»: ТО ЖЕ лицо (нос, ширина челюсти, глаза, губы как на фото). Моложе = только свежее кожа и отдохнувший взгляд, не другое лицо, не уже челюсть, не другой нос. 35plus ~5 лет свежее кожа; 25to34 ~3–4; under25 ~2; teen — тот же возраст. В editPromptAfter не писать younger face / tighter jaw / slimmer.
Причёска — ИМЯ из каталога (Italian bob, butterfly, hush, octopus, collarbone, 90s blowout, glass lob…). Не «чуть свои волосы».
Цвет — рецепт из каталога, ротируй. Paid: три разных силуэта И хотя бы один светлый акцент (bronde / butter / champagne / honey / money piece), если это идёт цветотипу. Не три espresso.
Укладка blowout или glass или soft waves. Только close-up.`;

      const analysisRaw = await callPolzaChat({
        model: ANALYSIS_MODEL,
        systemPrompt: buildGroomingSystemPrompt(mode),
        messages: [{
          role: "user",
          content: [{ type: "text", text: userText }, ...imageContent],
        }],
        temperature: 0.55,
        maxTokens: mode === "paid" ? 9000 : 3500,
      });

      let parsed: any;
      try {
        const raw = typeof analysisRaw === "string" ? analysisRaw : JSON.stringify(analysisRaw);
        const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        return fail("Не удалось разобрать ответ стилиста. Попробуйте ещё раз.", 502);
      }

      saveGroomingResult(jobId, {
        status: "processing",
        mode,
        progressText: "Подбор готов, рисуем фото…",
        analysis: {
          estimatedAge: parsed.estimatedAge,
          ageBand: parsed.ageBand,
          faceShape: parsed.faceShape,
          colorType: parsed.colorType,
          hairStatus: parsed.hairStatus,
          coachNote: parsed.coachNote,
          faceAnalysis: parsed.faceAnalysis,
          skincare: parsed.skincare,
          makeup: parsed.makeup,
          upsellTeaser: parsed.upsellTeaser,
        },
        looksDone: 0,
        looksTotal: mode === "paid" ? 3 : 1,
      });

      safeWrite(JSON.stringify({
        type: "progress",
        jobId,
        step: 1.5,
        text: mode === "paid"
          ? "Подбор готов. Слева — ваше фото, справа рисуем преображение…"
          : "Подбор готов. Слева — ваше фото, справа рисуем «после»…",
      }) + "\n");

      // «До» = исходное фото пользователя (одна копия на весь заказ)
      const beforeFolderId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      let imageBeforeUrl = await persistGroomingImage(
        beforeFolderId,
        "before",
        `data:${mimeType};base64,${referenceImageBase64}`
      );
      if (!imageBeforeUrl) {
        try {
          const dir = path.join(GROOMING_IMG_DIR, beforeFolderId);
          fs.mkdirSync(dir, { recursive: true });
          const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
          fs.writeFileSync(path.join(dir, `before.${ext}`), file.buffer);
          imageBeforeUrl = `/api/grooming-image/${beforeFolderId}/before.${ext}`;
        } catch (e) {
          console.error("[Grooming] before fallback write failed:", (e as Error).message);
        }
      }

      // Вау-кадр: новая причёска и одежда. Лицо — то же; кожа чуть свежее.
      const agePolicy = groomingAgePolicy(parsed);

      const generateLookPair = async (
        look: any,
        opts: {
          stepAfter: number;
          textAfter: string;
          lookIndex: number;
          looksTotal: number;
          draftLooks: any[];
          skipStartProgress?: boolean;
        }
      ) => {
        const afterSrc = look.editPromptAfter || look.editPromptClose || look.editPrompt || "";
        const lookName = look.name || "Причёска";
        const hairColor = look.hairColor || "";
        let imageClose: string | null = imageBeforeUrl;
        let imageAfter: string | null = null;
        let imageError: string | null = null;
        const folderId = `g${Date.now().toString(36)}${opts.lookIndex}${Math.random().toString(36).slice(2, 8)}`;
        try {
          if (!opts.skipStartProgress) {
            safeWrite(JSON.stringify({ type: "progress", jobId, step: opts.stepAfter, text: opts.textAfter }) + "\n");
          }
          let a: string | null = null;
          for (let attempt = 0; attempt < 2 && !a; attempt++) {
            try {
              const prompt = buildGroomingAfterPrompt({
                lookName,
                hairColor,
                outfitNote: look.outfitNote,
                editPrompt: afterSrc,
                agePolicy,
                compact: attempt >= 1,
              });
              a = await generateImageWithFlux(prompt, referenceImageBase64, mimeType, { quality: "medium" });
            } catch (genErr: any) {
              console.error("[Grooming] after image attempt", attempt + 1, genErr?.message);
              if (attempt < 1) await new Promise((r) => setTimeout(r, 800));
            }
          }
          imageAfter = await persistGroomingImage(folderId, "after", a);
          if (!imageAfter) imageError = "Не удалось создать фото «после»";
        } catch (e: any) {
          imageError = e.message || "Ошибка генерации";
        }
        const pair = {
          ...groomingLookFromParsed(look, agePolicy),
          name: lookName,
          hairColor,
          imageClose,
          imageAfter,
          imageFull: null,
          imageError,
        };
        opts.draftLooks[opts.lookIndex] = pair;
        saveGroomingResult(jobId, {
          status: "processing",
          mode,
          progressText: opts.textAfter,
          looksDone: opts.draftLooks.filter((l) => l).length,
          looksTotal: opts.looksTotal,
          draftLooks: opts.draftLooks,
          sourceImage: imageBeforeUrl,
          referenceMime: mimeType,
        });
        return pair;
      };

      if (mode === "free") {
        const draftLooks: any[] = [groomingLookFromParsed(parsed.bestLook || {}, agePolicy)];
        draftLooks[0].imageClose = imageBeforeUrl;
        saveGroomingResult(jobId, {
          status: "processing",
          mode,
          analysis: parsed,
          draftLooks,
          sourceImage: imageBeforeUrl,
          referenceMime: mimeType,
          looksDone: 0,
          looksTotal: 1,
        });
        const look = await generateLookPair(parsed.bestLook || {}, {
          stepAfter: 3.0,
          textAfter: "Рисуем «после»: причёска, лучшая одежда и свежее лицо…",
          lookIndex: 0,
          looksTotal: 1,
          draftLooks,
        });
        const freeResult = {
          type: "result" as const,
          mode: "free" as const,
          faceShape: parsed.faceShape || "",
          colorType: parsed.colorType || "",
          hairStatus: parsed.hairStatus || "",
          coachNote: parsed.coachNote || "",
          bestLook: look,
          upsellTeaser: parsed.upsellTeaser
            || "Вы уже видите себя «до» и «после». В полном пакете — ещё два таких сравнения, уход и свежий образ лица.",
          groomingPrice: GROOMING_PRICE,
          jobId,
        };
        saveGroomingResult(jobId, { status: "ready", mode, result: freeResult, draftLooks, looksDone: 1, looksTotal: 1 });
        if (!isOwnerRequest(req) && (look.imageClose || look.imageAfter)) {
          markFreeGroomingUsed(groomVisitorId);
        }
        safeWrite(JSON.stringify({ type: "progress", jobId, step: 5.0, text: "Готово! Сравните «до» и «после»." }) + "\n");
        safeWrite(JSON.stringify(freeResult) + "\n");
        clearInterval(heartbeat);
        return res.end();
      }

      const looksIn = Array.isArray(parsed.looks) ? parsed.looks.slice(0, 3) : [];
      while (looksIn.length < 3 && looksIn.length > 0) looksIn.push({ ...looksIn[0] });
      const draftLooks = looksIn.map((l: any) => {
        const t = groomingLookFromParsed(l, agePolicy);
        t.imageClose = imageBeforeUrl;
        return t;
      });
      saveGroomingResult(jobId, {
        status: "processing",
        mode,
        progressText: "Текст причёсок и уход сохранены, рисуем фото…",
        analysis: {
          estimatedAge: parsed.estimatedAge,
          ageBand: parsed.ageBand,
          faceShape: parsed.faceShape,
          colorType: parsed.colorType,
          hairStatus: parsed.hairStatus,
          coachNote: parsed.coachNote,
          faceAnalysis: parsed.faceAnalysis,
          skincare: parsed.skincare,
          makeup: parsed.makeup,
          upsellTeaser: parsed.upsellTeaser,
        },
        draftLooks,
        sourceImage: imageBeforeUrl,
        referenceMime: mimeType,
        looksDone: 0,
        looksTotal: looksIn.length,
      });
      const productsRaw = mapGroomingShopProducts(parsed.skincare?.products, "dosage");
      const makeupProductsRaw = mapGroomingShopProducts(parsed.makeup?.products, "howTo");
      const thumbsPromise = Promise.all([
        enrichShopProductsWithThumbs(productsRaw).catch((e) => {
          console.error("[Grooming] shop thumbs failed:", (e as Error).message);
          return productsRaw;
        }),
        enrichShopProductsWithThumbs(makeupProductsRaw).catch((e) => {
          console.error("[Grooming] makeup thumbs failed:", (e as Error).message);
          return makeupProductsRaw;
        }),
      ]);

      safeWrite(JSON.stringify({
        type: "progress",
        jobId,
        step: 2.4,
        text: "Рисуем 3 фото сразу — обычно около минуты…",
      }) + "\n");

      let finished = 0;
      const looks = await Promise.all(looksIn.map((look: any, i: number) =>
        generateLookPair(look, {
          stepAfter: 2.4,
          textAfter: "Рисуем 3 фото сразу…",
          lookIndex: i,
          looksTotal: looksIn.length,
          draftLooks,
          skipStartProgress: true,
        }).then((pair) => {
          finished += 1;
          safeWrite(JSON.stringify({
            type: "progress",
            jobId,
            step: 2.4 + finished * 0.7,
            text: `Готово ${finished} из ${looksIn.length} фото «после»…`,
          }) + "\n");
          return pair;
        })
      ));

      safeWrite(JSON.stringify({ type: "progress", jobId, step: 4.8, text: "Подбираем фото товаров для ухода…" }) + "\n");
      const [products, makeupProducts] = await thumbsPromise;

      const paidResult = {
        type: "result" as const,
        mode: "paid" as const,
        coachNote: parsed.coachNote || "",
        faceAnalysis: parsed.faceAnalysis || {},
        looks,
        skincare: {
          summary: parsed.skincare?.summary || "",
          amRoutine: parsed.skincare?.amRoutine || "",
          pmRoutine: parsed.skincare?.pmRoutine || "",
          homeHowTo: parsed.skincare?.homeHowTo || "",
          products,
        },
        makeup: parsed.makeup ? {
          summary: parsed.makeup.summary || "",
          dayLook: parsed.makeup.dayLook || "",
          eveningLook: parsed.makeup.eveningLook || "",
          placement: parsed.makeup.placement || "",
          products: makeupProducts,
        } : undefined,
        groomingPrice: GROOMING_PRICE,
        jobId,
      };

      saveGroomingResult(jobId, {
        status: "ready",
        mode,
        result: paidResult,
        draftLooks: looks,
        looksDone: looks.length,
        looksTotal: looksIn.length,
      });

      if (accessViaPromo && promoCode && !isOwnerRequest(req)) {
        try { markPromoUsed(promoCode); } catch (e) { console.error("[Promo] markPromoUsed grooming failed:", e); }
      }

      safeWrite(JSON.stringify({ type: "progress", jobId, step: 5.0, text: "Готово: 3 причёски и уход!" }) + "\n");
      safeWrite(JSON.stringify(paidResult) + "\n");
      clearInterval(heartbeat);
      return res.end();
    } catch (error) {
      console.error("Error in /api/grooming:", error);
      if (jobId) {
        const prev = readGroomingResult(jobId);
        const hasLooks = (Array.isArray(prev?.draftLooks) && prev.draftLooks.length > 0) || prev?.result;
        if (hasLooks) {
          const recovered = buildGroomingClientResult(prev, jobId);
          saveGroomingResult(jobId, {
            status: "ready",
            result: recovered,
            error: (error as Error).message || "Часть фото не создалась",
          });
          safeWrite(JSON.stringify({ type: "progress", jobId, step: 5.0, text: "Сохранили причёски и уход, даже если фото не все." }) + "\n");
          safeWrite(JSON.stringify(recovered) + "\n");
          clearInterval(heartbeat);
          return res.end();
        }
        saveGroomingResult(jobId, {
          status: "failed",
          error: (error as Error).message || "Ошибка подбора причёски",
        });
      }
      clearInterval(heartbeat);
      safeWrite(JSON.stringify({
        type: "error",
        error: (error as Error).message || "Ошибка подбора причёски",
        jobId: jobId || undefined,
      }) + "\n");
      return res.end();
    }
  });


  // Бесплатный текстовый чат со стилистом (гардероб / маникюр / аксессуары / причёска)
  const stylistChatHits = new Map<string, { n: number; t: number }>();
  app.post("/api/stylist-chat", upload.array("photos", 4), async (req: Request, res: Response) => {
    try {
      if (!POLZA_API_KEY) {
        return res.status(500).json({ error: "API ключ не настроен" });
      }

      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
      const now = Date.now();
      const hit = stylistChatHits.get(ip) || { n: 0, t: now };
      if (now - hit.t > 60 * 60 * 1000) { hit.n = 0; hit.t = now; }
      hit.n += 1;
      stylistChatHits.set(ip, hit);
      if (hit.n > 25) {
        return res.status(429).json({ error: "Слишком много сообщений. Подождите немного или оформите тариф." });
      }

      const rawMessage = sanitizeWishes(String(req.body?.message || "").trim().slice(0, 800));
      const files = (req.files as MulterFile[] | undefined) || [];
      if (!rawMessage && files.length === 0) {
        return res.status(400).json({ error: "Напишите вопрос или прикрепите фото гардероба" });
      }

      let history: Array<{ role: string; content: string }> = [];
      try {
        const parsed = JSON.parse(String(req.body?.history || "[]"));
        if (Array.isArray(parsed)) {
          history = parsed
            .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
            .slice(-8)
            .map((m) => ({
              role: m.role,
              content: sanitizeWishes(String(m.content).slice(0, 1200)),
            }));
        }
      } catch { /* ignore bad history */ }

      const userText = rawMessage || "Посмотрите фото гардероба и дайте текстовый совет: что с чем сочетать и что докупить.";
      const contentParts: any[] = [{ type: "text", text: userText }];
      for (const file of files.slice(0, 4)) {
        if (!file?.buffer) continue;
        const mime = file.mimetype || "image/jpeg";
        if (!/^image\/(jpeg|png|webp)$/i.test(mime)) continue;
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${mime};base64,${file.buffer.toString("base64")}` },
        });
      }

      const messages: any[] = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: contentParts.length > 1 ? contentParts : userText },
      ];

      const reply = await callPolzaChat({
        model: ANALYSIS_MODEL,
        systemPrompt: buildStylistChatPrompt(),
        messages,
        temperature: 0.75,
        maxTokens: 2200,
        useJsonFormat: false,
      });

      const text = String(reply || "").trim();
      if (!text) {
        return res.status(502).json({ error: "Пустой ответ стилиста. Попробуйте ещё раз." });
      }
      res.json({ ok: true, reply: text });
    } catch (error) {
      console.error("Error in /api/stylist-chat:", error);
      res.status(500).json({ error: (error as Error).message || "Ошибка чата со стилистом" });
    }
  });

  // Serve production build if available, otherwise use Vite dev middleware
  const distIndexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distIndexPath)) {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        const normalizedPath = filePath.replace(/\\/g, "/");
        if (normalizedPath.endsWith("/index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else if (normalizedPath.includes("/assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.(?:avif|webp|png|jpe?g|gif|svg|woff2?)$/i.test(normalizedPath)) {
          res.setHeader("Cache-Control", "public, max-age=2592000");
        }
      },
    }));
    // SPA fallback: any non-API request gets index.html.
    // Using middleware (not "*" route) to be compatible with Express 5 / path-to-regexp v8.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/admin-panel")) return next();
      // Missing static assets (images/json/etc.) must not fall back to the SPA HTML.
      if (path.extname(req.path)) return res.status(404).end();
      // Посещения считаются через /api/track с фронта (уникальные + разделы)
      res.setHeader("Cache-Control", "no-cache");
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
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

