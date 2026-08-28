/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Smartphone, Sparkles, Shirt, ArrowRight, Check, ChevronLeft, ChevronRight, ChevronDown, Upload, X, ShoppingBag, AlertCircle, Camera, Download, Star, Share2, Heart, Search, Scissors, Send, Copy, MessageCircle } from 'lucide-react';
import { GroomingModal } from './GroomingModal';
import { StylistChatModal } from './StylistChatModal';

const TELEGRAM_CHANNEL_URL = "https://t.me/stilist_ai_ru";
const TELEGRAM_CHANNEL_HANDLE = "@stilist_ai_ru";

// --- Category emoji mapping ---
const CATEGORY_EMOJI: Record<string, string> = {
  "верх": "👕", "верхняя одежда": "🧥", "низ": "👖",
  "обувь": "👟", "сумка": "👜", "украшения": "💍",
  "аксессуары": "🧣", "головной убор": "🧢", "парфюм": "🌸",
  "пиджак": "🧥", "блуза": "👕", "рубашка": "👔",
  "платье": "👗", "юбка": "🩱", "брюки": "👖",
  "джинсы": "👖", "куртка": "🧥", "пальто": "🧥",
  "кроссовки": "👟", "ботинки": "👢", "сандалии": "🩴",
  "шляпа": "👒", "очки": "🕶️", "часы": "⌚",
  "браслет": "📿", "ожерелье": "📿", "серьги": "💎",
  "shoes": "👟", "footwear": "👟",
};

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "верх": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  "верхняя одежда": { bg: "bg-stone-200", text: "text-stone-900", border: "border-stone-400" },
  "низ": { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-300" },
  "обувь": { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300" },
  "сумка": { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" },
  "украшения": { bg: "bg-fuchsia-100", text: "text-fuchsia-900", border: "border-fuchsia-300" },
  "аксессуары": { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300" },
  "головной убор": { bg: "bg-orange-100", text: "text-orange-900", border: "border-orange-300" },
  "парфюм": { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" },
  "пиджак": { bg: "bg-stone-200", text: "text-stone-900", border: "border-stone-400" },
  "платье": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  "брюки": { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-300" },
  "юбка": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  "аксессуар": { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300" },
};
const getCategoryStyle = (cat: string) => CATEGORY_STYLES[cat.toLowerCase()] || { bg: "bg-charcoal", text: "text-ivory", border: "border-gold" };

const getDetailSectionKey = (header: string) => {
  const lower = header.toLowerCase().replace(/^[✦★☆❖✤✧•·\s]+/, "");
  if (lower.includes("концепц")) return "концепци";
  if (lower.includes("одежд") || lower.includes("верх") || lower.includes("пиджак") || lower.includes("платье") || lower.includes("брюки") || lower.includes("юбка")) return "одежд";
  if (lower.includes("обув")) return "обув";
  if (lower.includes("аксесс")) return "аксессуар";
  if (lower.includes("украш")) return "аксессуар";
  if (lower.includes("причёск") || lower.includes("причес") || lower.includes("груминг")) return "причёск";
  if (lower.includes("парф") || lower.includes("аромат")) return "аромат";
  if (lower.includes("почему")) return "почему";
  if (lower.includes("совет") || lower.includes("покуп")) return "совет";
  return "";
};

const DETAIL_SECTION_EMOJI: Record<string, string> = {
  "концепци": "🎨",
  "одежд": "👕",
  "обув": "👟",
  "аксессуар": "💎",
  "причёск": "💇",
  "груминг": "💇",
  "аромат": "🌸",
  "парфюм": "🌸",
  "почему": "✨",
  "совет": "🛍",
  "покупк": "🛍",
};

const getDetailSectionEmoji = (header: string) => {
  const key = getDetailSectionKey(header);
  if (key && DETAIL_SECTION_EMOJI[key]) return DETAIL_SECTION_EMOJI[key];
  return "✨";
};

/** Убирает ✦/★ и прочие символы, которые на Windows часто отображаются как «?» */
const stripDetailDecor = (text: string) =>
  text.replace(/^[✦★☆❖✤✧◆◇•·▪▫◦⁕⁜*\s]+/u, "").trim();


// --- Progress stages ---
const PROGRESS_STAGES = [
  { step: 0.5, label: "Оптимизация фото" },
  { step: 1.0, label: "Анализ типа фигуры" },
  { step: 1.5, label: "Подбор образов" },
  { step: 2.0, label: "Генерация визуализации" },
  { step: 3.0, label: "Создание образов" },
  { step: 4.0, label: "Поиск товаров" },
  { step: 5.0, label: "Готово!" },
];

// --- Demo gallery images (public/gallery/) ---
const GALLERY_IMAGES = [
  "/gallery/gen1.webp","/gallery/gen2.webp","/gallery/gen3.webp","/gallery/gen4.webp",
  "/gallery/gen5.webp","/gallery/gen6.webp","/gallery/gen7.webp","/gallery/gen8.webp",
  "/gallery/gen9.webp","/gallery/gen10.webp","/gallery/gen11.webp","/gallery/gen12.webp",
];
function getActiveStageIndex(s: number): number {
  for (let i = PROGRESS_STAGES.length - 1; i >= 0; i--) {
    if (s >= PROGRESS_STAGES[i].step) return i;
  }
  return 0;
}

// --- localStorage helpers ---
type Tier = "standard" | "premium";
type PricingSelection = Tier | "nails_month" | "grooming";
type SavedOrderTier = Tier | "grooming";
function asSavedOrderTier(raw: unknown): SavedOrderTier {
  if (raw === "premium") return "premium";
  if (raw === "grooming") return "grooming";
  return "standard";
}

const NAILS_ACCESS_KEY = "you-stile-nails-access";
const NAILS_PAYMENT_KEY = "you-stile-nails-payment-id";
const NAILS_MONTH_PRICE_RUB = 500;
type NailsAccessState = {
  token: string;
  kind: "once" | "month";
  expiresAt: string | null;
};
function loadNailsAccess(): NailsAccessState | null {
  try {
    const raw = localStorage.getItem(NAILS_ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NailsAccessState;
    if (!parsed?.token) return null;
    // Любой доступ с истекшим expiresAt (месяц или разовые сутки)
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(NAILS_ACCESS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function saveNailsAccess(access: NailsAccessState) {
  localStorage.setItem(NAILS_ACCESS_KEY, JSON.stringify(access));
}
function clearNailsAccess() {
  localStorage.removeItem(NAILS_ACCESS_KEY);
}
function saveNailsPaymentId(paymentId: string) {
  localStorage.setItem(NAILS_PAYMENT_KEY, paymentId);
}
function loadNailsPaymentId(): string {
  return localStorage.getItem(NAILS_PAYMENT_KEY) || "";
}
/** Активирует полный месяц базы по оплаченному paymentId. */
async function activateNailsMonthFromPayment(paymentId: string): Promise<NailsAccessState | null> {
  const r = await fetch(`/api/check-paid?paymentId=${encodeURIComponent(paymentId)}`);
  const d = await r.json();
  if (!d.paid || d.tier !== "nails_month" || !d.nailsToken) return null;
  const access: NailsAccessState = {
    token: d.nailsToken,
    kind: "month",
    expiresAt: d.expiresAt || null,
  };
  saveNailsAccess(access);
  saveNailsPaymentId(paymentId);
  return access;
}

function getSavedName(): string { return localStorage.getItem("you-stile-user-name") || ""; }
function getOrCreateVisitorId(): string {
  let id = localStorage.getItem("you-stile-user-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("you-stile-user-id", id);
  }
  return id;
}
function getSavedPhone(): string { return localStorage.getItem("you-stile-user-phone") || ""; }
function savePhone(phone: string) {
  const normalized = normalizePhoneClient(phone);
  if (normalized) localStorage.setItem("you-stile-user-phone", normalized);
}
function normalizePickupCodeClient(raw: string): string {
  let s = String(raw || "").toUpperCase();
  s = s.replace(/СТИЛЬ/g, "").replace(/STIL[bЬ]?/g, "");
  s = s.replace(/[^A-Z0-9]/g, "");
  if (s.length < 6 || s.length > 10) return "";
  return s.slice(0, 8);
}
function displayPickupCode(body: string): string {
  return body ? `СТИЛЬ-${body}` : "";
}
function getSavedPickupCode(): string {
  return localStorage.getItem("you-stile-pickup-code") || "";
}
function savePickupCode(code: string) {
  const body = normalizePickupCodeClient(code);
  if (!body) return;
  localStorage.setItem("you-stile-pickup-code", body);
}
/** РФ: 7XXXXXXXXXX или "". */
function normalizePhoneClient(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return digits;
  return "";
}
/** Красивый ввод: +7 999 123-45-67 */
function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.startsWith("7")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  const a = digits.slice(0, 3);
  const b = digits.slice(3, 6);
  const c = digits.slice(6, 8);
  const d = digits.slice(8, 10);
  let out = "+7";
  if (a) out += " " + a;
  if (b) out += " " + b;
  if (c) out += "-" + c;
  if (d) out += "-" + d;
  return out;
}
function displayPhone(normalized: string): string {
  if (!normalized || normalized.length !== 11) return normalized;
  return `+7 ${normalized.slice(1, 4)} ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9)}`;
}

// ---- Marketing attribution: ?ref=, ?utm_source, ?utm_medium, ?utm_campaign ----
// Сохраняем в localStorage при первом заходе и дальше шлём вместе с каждым
// pageview, чтобы в админке видеть конверсию по источникам.
type Attribution = {
  ref: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  capturedAt: string;
};
function parseAttribution(): Partial<Attribution> {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      ref: params.get("ref")?.trim().slice(0, 64) || "",
      utm_source: params.get("utm_source")?.trim().slice(0, 64) || "",
      utm_medium: params.get("utm_medium")?.trim().slice(0, 64) || "",
      utm_campaign: params.get("utm_campaign")?.trim().slice(0, 64) || "",
    };
  } catch {
    return {};
  }
}
function captureAttribution(): Attribution | null {
  const incoming = parseAttribution();
  const hasAny =
    incoming.ref || incoming.utm_source || incoming.utm_medium || incoming.utm_campaign;
  try {
    const stored = localStorage.getItem("you-stile-attribution");
    const prev: Attribution | null = stored ? JSON.parse(stored) : null;
    if (!hasAny) return prev;
    const next: Attribution = {
      ref: incoming.ref || prev?.ref || "",
      utm_source: incoming.utm_source || prev?.utm_source || "",
      utm_medium: incoming.utm_medium || prev?.utm_medium || "",
      utm_campaign: incoming.utm_campaign || prev?.utm_campaign || "",
      capturedAt: new Date().toISOString(),
    };
    localStorage.setItem("you-stile-attribution", JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}
function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem("you-stile-attribution");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
captureAttribution();

function trackEvent(path: string, kind: "page" | "click" = "page") {
  try {
    const attr = getAttribution();
    const payload = JSON.stringify({
      visitorId: getOrCreateVisitorId(),
      name: getSavedName() || "",
      path,
      kind,
      ref: attr?.ref || "",
      utm_source: attr?.utm_source || "",
      utm_medium: attr?.utm_medium || "",
      utm_campaign: attr?.utm_campaign || "",
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    }
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}
function trackPage(path: string) { trackEvent(path, "page"); }
function trackClick(action: string) { trackEvent(action.replace(/[^a-z0-9_/-]/gi, "").slice(0, 64) || "unknown", "click"); }
function getVisitCount(): number { return parseInt(localStorage.getItem("you-stile-visit-count") || "0"); }
function incrementVisitCount(): number {
  const count = getVisitCount() + 1;
  localStorage.setItem("you-stile-visit-count", String(count));
  return count;
}
function getPastLooks(): string[] {
  try { return JSON.parse(localStorage.getItem("you-stile-past-looks") || "[]"); } catch { return []; }
}
function savePastLooks(looks: string[]) {
  // Keep last 18 look names — для разнообразия следующих сессий
  const all = [...getPastLooks(), ...looks].filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of all) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  localStorage.setItem("you-stile-past-looks", JSON.stringify(unique.slice(-18)));
}
/** Подтянуть историю стиля с сервера (после оплаты / прошлые сессии). */
async function syncStyleHistoryFromServer() {
  try {
    const visitorId = getOrCreateVisitorId();
    const r = await fetch(`/api/user-profile?visitorId=${encodeURIComponent(visitorId)}`);
    if (!r.ok) return;
    const data = await r.json();
    if (Array.isArray(data.pastLooks) && data.pastLooks.length) {
      savePastLooks(data.pastLooks);
    }
    if (Array.isArray(data.orders) && data.orders.length) {
      for (const o of data.orders) {
        if (!o?.paymentId) continue;
        const createdAt = o.createdAt ? Date.parse(o.createdAt) || Date.now() : Date.now();
        saveMyOrder({ paymentId: o.paymentId, tier: asSavedOrderTier(o.tier), createdAt });
      }
    } else if (Array.isArray(data.orderIds) && data.orderIds.length) {
      const existing = new Set(getMyOrders().map((o) => o.paymentId));
      for (const paymentId of data.orderIds) {
        if (!paymentId || existing.has(paymentId)) continue;
        saveMyOrder({ paymentId, tier: "standard", createdAt: Date.now() });
      }
    }
  } catch { /* ignore */ }
}
/** Восстановить заказ по коду СТИЛЬ-XXXXXX. */
async function restoreOrdersByCode(codeRaw: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const code = normalizePickupCodeClient(codeRaw);
  if (!code) return { ok: false, count: 0, error: "Введите код заказа, например СТИЛЬ-K7M2QX" };
  try {
    const r = await fetch("/api/find-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, count: 0, error: data.error || "Не удалось найти заказ" };
    savePickupCode(code);
    const list = Array.isArray(data.orders) ? data.orders : [];
    for (const o of list) {
      if (!o?.paymentId) continue;
      const createdAt = o.createdAt ? Date.parse(o.createdAt) || Date.now() : Date.now();
      saveMyOrder({ paymentId: o.paymentId, tier: asSavedOrderTier(o.tier), createdAt });
    }
    return { ok: true, count: list.length };
  } catch {
    return { ok: false, count: 0, error: "Ошибка соединения" };
  }
}
/** Старые заказы, где ключом был телефон. */
async function restoreOrdersByPhone(phoneRaw: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const phone = normalizePhoneClient(phoneRaw);
  if (!phone) return { ok: false, count: 0, error: "Укажите старый номер в формате +7 XXX XXX-XX-XX" };
  try {
    const r = await fetch("/api/orders-by-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, count: 0, error: data.error || "Не удалось найти заказы" };
    savePhone(phone);
    const list = Array.isArray(data.orders) ? data.orders : [];
    for (const o of list) {
      if (!o?.paymentId) continue;
      const createdAt = o.createdAt ? Date.parse(o.createdAt) || Date.now() : Date.now();
      saveMyOrder({ paymentId: o.paymentId, tier: asSavedOrderTier(o.tier), createdAt });
    }
    return { ok: true, count: list.length };
  } catch {
    return { ok: false, count: 0, error: "Ошибка соединения" };
  }
}
function saveName(name: string) {
  if (!localStorage.getItem("you-stile-user-id")) {
    localStorage.setItem("you-stile-user-id", crypto.randomUUID());
  }
  localStorage.setItem("you-stile-user-name", name.trim());
  trackPage("home");
}

// --- My paid orders (persistent access to recovered looks) ---
type MyOrder = { paymentId: string; tier: SavedOrderTier; createdAt: number; thumbnail?: string };
function notifyMyOrdersChanged() {
  window.dispatchEvent(new Event("you-stile-orders-changed"));
}
function getMyOrders(): MyOrder[] {
  try { return JSON.parse(localStorage.getItem("you-stile-my-orders") || "[]"); } catch { return []; }
}
function saveMyOrder(order: MyOrder) {
  const all = getMyOrders();
  const prev = all.find((o) => o.paymentId === order.paymentId);
  const next = all.filter((o) => o.paymentId !== order.paymentId);
  next.push({
    ...prev,
    ...order,
    thumbnail: order.thumbnail || prev?.thumbnail,
  });
  localStorage.setItem("you-stile-my-orders", JSON.stringify(next.slice(-50)));
  notifyMyOrdersChanged();
}
function updateMyOrderThumbnail(paymentId: string, thumbnail: string) {
  const all = getMyOrders().map(o => o.paymentId === paymentId ? { ...o, thumbnail } : o);
  localStorage.setItem("you-stile-my-orders", JSON.stringify(all.slice(-50)));
  notifyMyOrdersChanged();
}
function removeMyOrder(paymentId: string) {
  const all = getMyOrders().filter(o => o.paymentId !== paymentId);
  localStorage.setItem("you-stile-my-orders", JSON.stringify(all));
  notifyMyOrdersChanged();
}
function clearMyOrders() {
  localStorage.removeItem("you-stile-my-orders");
  localStorage.removeItem("pending_payment_id");
  localStorage.removeItem("pending_payment_tier");
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("paid_")) localStorage.removeItem(k);
  }
  notifyMyOrdersChanged();
}

// --- Magic Mirror Component ---
const MagicMirror = () => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleMove(e.clientX);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleMove(e.touches[0].clientX);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    };
    const onMouseUp = () => setIsDragging(false);
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-[3/4] md:aspect-[4/5] overflow-hidden rounded-2xl cursor-ew-resize select-none touch-none shadow-2xl"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {/* Before Image (Bottom) */}
      <img
        src="/after.webp"
        alt="Before: Casual Home Clothes"
        loading="lazy"
        decoding="async"
        width={1400}
        height={2508}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />

      {/* After Image (Top, Clipped) */}
      <img
        src="/before.webp"
        alt="After: Premium Styled Look"
        loading="lazy"
        decoding="async"
        width={1400}
        height={2508}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
      />

      {/* Slider Handle */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-[0_0_10px_rgba(0,0,0,0.3)] z-10"
        style={{ left: `${sliderPosition}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center border border-ivory/50 text-charcoal">
          <ChevronLeft className="w-4 h-4 -mr-1 opacity-70" />
          <ChevronRight className="w-4 h-4 -ml-1 opacity-70" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-6 left-6 px-4 py-1.5 bg-charcoal/40 backdrop-blur-md rounded-full text-white text-xs font-medium tracking-widest uppercase">
        До
      </div>
      <div className="absolute top-6 right-6 px-4 py-1.5 bg-gold/80 backdrop-blur-md rounded-full text-white text-xs font-medium tracking-widest uppercase">
        После
      </div>
    </div>
  );
};

// --- Pricing & Payment Modal ---

const PaymentModal = ({ isOpen, tier, onPaid, onClose }: {
  isOpen: boolean;
  tier: Tier;
  onPaid: () => void;
  onClose: () => void;
}) => {
  const price = tier === "premium" ? 200 : 100;
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isOpen) { setQrCode(null); setPaymentId(null); return; }
    setLoading(true);
    fetch("/api/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier,
        visitorId: getOrCreateVisitorId(),
        userName: getSavedName() || "",
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          alert("Ошибка оплаты: " + d.error);
        } else {
          if (d.pickupCode) savePickupCode(d.pickupCode);
          setPaymentId(d.paymentId);
          // Если есть confirmationUrl - сразу редиректим
          if (d.confirmationUrl) {
            const tgWA = (window as any).Telegram?.WebApp;
            if (tgWA?.initData && tgWA.openLink) tgWA.openLink(d.confirmationUrl);
            else window.location.href = d.confirmationUrl;
          }
        }
      })
      .catch(() => alert("Ошибка создания платежа"))
      .finally(() => setLoading(false));
  }, [isOpen, tier, onClose]);

  const handleCheckPayment = () => {
    if (!paymentId) return;
    setChecking(true);
    fetch("/api/check-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.status === "succeeded") { onPaid(); onClose(); }
        else alert("Платёж ещё не поступил, попробуйте через минуту");
      })
      .catch(() => alert("Ошибка проверки платежа"))
      .finally(() => setChecking(false));
  };

  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="bg-ivory w-full max-w-sm rounded-3xl shadow-2xl p-8 relative"
        >
          <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-charcoal/5 rounded-full hover:bg-charcoal/10">
            <X className="w-5 h-5 text-charcoal" />
          </button>
          <p className="font-sans font-medium text-gold text-xs tracking-[0.3em] uppercase mb-2">Оплата</p>
          <h2 className="text-2xl font-serif text-charcoal mb-2">{price} ₽</h2>
          <p className="text-sm text-charcoal/60 mb-6">Тариф {tier === "premium" ? "Премиум" : "Стандарт"}</p>
          {loading ? (
            <div className="flex justify-center items-center h-48 text-charcoal/40">Загрузка QR...</div>
          ) : qrCode ? (
            <img src={qrCode} alt="QR для оплаты" className="w-48 h-48 mx-auto mb-6 rounded-xl" />
          ) : null}
          <p className="text-xs text-charcoal/50 text-center mb-4">Отсканируйте QR и оплатите, затем нажмите кнопку ниже</p>
          <button
            onClick={handleCheckPayment}
            disabled={checking || !paymentId}
            className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50"
          >
            {checking ? "Проверяем..." : "Я оплатил ✓"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


const PricingModal = ({ isOpen, onClose, onPaid, onNailsUnlocked, userName, initialTier, prices, ownerFree = false }: {
  isOpen: boolean;
  onClose: () => void;
  onPaid: (tier: Tier) => void;
  onNailsUnlocked?: () => void;
  userName?: string;
  initialTier?: Tier;
  prices?: { standard: number; premium: number; nailsMonth?: number };
  ownerFree?: boolean;
}) => {
  const localPrices = {
    standard: prices?.standard ?? 100,
    premium: prices?.premium ?? 200,
  };
  const [selectedTier, setSelectedTier] = useState<Tier>(
    initialTier === "premium" ? "premium" : "standard"
  );
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "used">("idle");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPromoCode("");
      setPromoStatus("idle");
      setSelectedTier(initialTier === "premium" ? "premium" : "standard");
      setIsProcessing(false);
      setShowPromo(false);
    }
  }, [isOpen, initialTier]);

  const price = selectedTier === "standard" ? localPrices.standard : localPrices.premium;

  const redeemNailsPromoCode = async (code: string): Promise<"ok" | "used" | "invalid"> => {
    const nailsRes = await fetch("/api/nails/check-promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const nailsData = await nailsRes.json();
    if (!nailsData.valid) return nailsData.reason === "used" ? "used" : "invalid";
    const rd = await fetch("/api/nails/redeem-promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const rj = await rd.json();
    if (rj.success && rj.token) {
      saveNailsAccess({ token: rj.token, kind: rj.kind, expiresAt: rj.expiresAt || null });
      setPromoStatus("valid");
      onClose();
      onNailsUnlocked?.();
      return "ok";
    }
    return rj.reason === "used" ? "used" : "invalid";
  };

  const handlePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoStatus("checking");
    const code = promoCode.trim();
    try {
      // Стандарт / Премиум
      const res = await fetch("/api/check-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.valid) {
        // Если это промокод ногтей — тихо открываем базу (кнопки ногтей в этом окне нет)
        const nailsStatus = await redeemNailsPromoCode(code);
        if (nailsStatus === "ok") return;
        setPromoStatus(data.reason === "used" ? "used" : nailsStatus === "used" ? "used" : "invalid");
        return;
      }
      setPromoStatus("valid");
      if (data.tier === "premium" || data.tier === "standard") setSelectedTier(data.tier);
      const tier: Tier = data.tier === "premium" ? "premium" : "standard";
      setTimeout(async () => {
        try {
          const rd = await fetch("/api/redeem-promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const rj = await rd.json();
          if (rj.success) {
            localStorage.removeItem("pending_payment_id");
            localStorage.setItem("pending_payment_tier", rj.tier === "premium" ? "premium" : "standard");
            localStorage.setItem("you-stile-promo-code", code.toUpperCase());
            onPaid((rj.tier === "premium" ? "premium" : tier) as Tier);
            onClose();
          } else {
            setPromoStatus(rj.reason === "used" ? "used" : "invalid");
          }
        } catch {
          setPromoStatus("invalid");
        }
      }, 800);
    } catch {
      setPromoStatus("invalid");
    }
  };

  const handlePay = async () => {
    setIsProcessing(true);
    try {
      const outfitTier: Tier = selectedTier === "premium" ? "premium" : "standard";
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: outfitTier,
          visitorId: getOrCreateVisitorId(),
          userName: userName || getSavedName() || "",
        }),
      });
      const data = await res.json();
      if (data.ownerFree && data.paymentId) {
        if (data.pickupCode) {
          savePickupCode(data.pickupCode);
          localStorage.setItem("pending_pickup_code", data.pickupCode);
        }
        localStorage.setItem("pending_payment_id", data.paymentId);
        localStorage.setItem("pending_payment_tier", outfitTier);
        saveMyOrder({ paymentId: data.paymentId, tier: outfitTier, createdAt: Date.now() });
        onPaid(outfitTier);
        onClose();
        return;
      }
      if (data.confirmationUrl) {
        if (data.pickupCode) {
          savePickupCode(data.pickupCode);
          localStorage.setItem("pending_pickup_code", data.pickupCode);
        }
        localStorage.setItem("pending_payment_id", data.paymentId);
        localStorage.setItem("pending_payment_tier", outfitTier);
        saveMyOrder({ paymentId: data.paymentId, tier: outfitTier, createdAt: Date.now() });
        const tgWP = (window as any).Telegram?.WebApp;
        if (tgWP?.initData && tgWP.openLink) tgWP.openLink(data.confirmationUrl);
        else window.location.href = data.confirmationUrl;
      } else {
        alert("Ошибка создания платежа: " + (data.error || "Попробуйте ещё раз"));
        setIsProcessing(false);
      }
    } catch {
      alert("Ошибка соединения");
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="bg-ivory w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto"
        >
          <button onClick={onClose} className="absolute top-5 right-5 p-3 bg-charcoal/5 rounded-full hover:bg-charcoal/10 z-10 touch-manipulation">
            <X className="w-5 h-5 text-charcoal" />
          </button>

          <div className="p-5 md:p-8 md:p-10">
            <p className="font-sans font-medium text-gold text-xs tracking-[0.3em] uppercase mb-2 text-center">
              Выберите тариф
            </p>
            <h2 className="text-2xl md:text-3xl font-serif text-charcoal text-center mb-6">
              Начните преображение
            </h2>
            {ownerFree && (
              <p className="text-center text-sm text-charcoal/70 bg-gold/15 border border-gold/30 rounded-2xl px-4 py-3 mb-6">
                На этом компьютере оплата не нужна — выберите Стандарт или Премиум и нажмите «Начать».
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <button onClick={() => setSelectedTier("standard")}
                className={`group rounded-2xl p-6 text-left transition-all border-2 ${selectedTier === "standard" ? "border-gold shadow-lg" : "border-charcoal/10 hover:border-gold/50"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl font-serif font-bold text-charcoal">{localPrices.standard} ₽</div>
                  {selectedTier === "standard" && <div className="w-6 h-6 rounded-full bg-gold flex items-center justify-center"><Check className="w-4 h-4 text-charcoal" /></div>}
                </div>
                <div className="font-medium text-charcoal mb-3">Стандарт</div>
                <ul className="text-sm space-y-1.5">
                  <li className="font-semibold text-charcoal">✓ 1 фото</li>
                  <li className="font-semibold text-charcoal">✓ 3 свободных образа от стилиста</li>
                  <li className="text-charcoal/60">✓ Сезон на каждый образ</li>
                  <li className="text-charcoal/60">✓ Анализ внешности</li>
                  <li className="text-charcoal/60">✓ Список покупок</li>
                  <li className="text-charcoal/60">✓ Результат хранится сутки</li>
                </ul>
              </button>

              <button onClick={() => setSelectedTier("premium")}
                className={`group rounded-2xl p-6 text-left transition-all relative overflow-hidden border-2 ${selectedTier === "premium" ? "border-gold shadow-lg bg-charcoal" : "border-charcoal/10 hover:border-gold/50 bg-white"}`}>
                <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-bold text-charcoal bg-gold px-2 py-0.5 rounded-full">Популярный</div>
                <div className="flex items-start justify-between mb-3">
                  <div className={`text-2xl font-serif font-bold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>{localPrices.premium} ₽</div>
                  {selectedTier === "premium" && <div className="w-6 h-6 rounded-full bg-gold flex items-center justify-center"><Check className="w-4 h-4 text-charcoal" /></div>}
                </div>
                <div className={`font-medium mb-3 ${selectedTier === "premium" ? "text-ivory" : "text-charcoal"}`}>Премиум</div>
                <ul className={`text-sm space-y-1.5 ${selectedTier === "premium" ? "text-ivory/70" : "text-charcoal/60"}`}>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ До 3 фото · до 5 образов</li>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ 22 мероприятия (свадьба, романтик, вечеринка...)</li>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ Образ на указанную сумму (бюджет)</li>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ Астро-разбор знака зодиака</li>
                  <li>✓ Анализ внешности</li>
                  <li>✓ Список покупок</li>
                  <li>✓ Результат хранится сутки</li>
                </ul>
              </button>
            </div>

            <p className="text-xs text-charcoal/50 text-center mb-4">
              Потребуется фото: JPG или PNG, до 50 МБ
            </p>

            {!ownerFree && (
            <div className="mb-4 max-w-md mx-auto rounded-2xl border border-charcoal/10 bg-white/70 px-4 py-3">
              <p className="text-sm font-medium text-charcoal text-center mb-1">Номер не берём — и в базу не кладём</p>
              <p className="text-charcoal/55 text-xs text-center leading-relaxed">
                Личное пространство и так уже тесное. После оплаты будет код, например <span className="font-medium text-charcoal">СТИЛЬ-K7M2QX</span>.
                По нему откроете образы, если страница закроется. Без рассылок, звонков и чужих баз.
              </p>
            </div>
            )}

            <button onClick={handlePay} disabled={isProcessing}
              className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold text-lg hover:bg-gold/90 transition-colors mb-4 disabled:opacity-60">
              {isProcessing
                ? (ownerFree ? "Открываем..." : "Подготовка оплаты...")
                : ownerFree
                  ? (selectedTier === "premium" ? "Начать · Премиум" : "Начать · Стандарт")
                  : `Оплатить ${price} ₽`}
            </button>

            {!ownerFree && (
            <div className="border-t border-charcoal/10 pt-4">
              <button onClick={() => setShowPromo(!showPromo)}
                className="text-sm text-gold hover:text-gold/70 mb-2 flex items-center gap-1 mx-auto font-medium">
                <span>{showPromo ? "Скрыть промокод" : "У меня есть промокод"}</span>
              </button>
              {showPromo && (
              <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                <input
                  id="promo-input"
                  type="text"
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoStatus("idle"); }}
                  onKeyDown={(e) => e.key === "Enter" && handlePromo()}
                  placeholder="Введите промокод"
                  className={`w-full flex-1 px-4 py-3 rounded-xl border text-sm text-center font-medium uppercase ${
                    promoStatus === "valid" ? "border-green-400 bg-green-50" :
                    promoStatus === "invalid" || promoStatus === "used" ? "border-red-300 bg-red-50" :
                    "border-charcoal/20 bg-white focus:border-gold focus:outline-none"
                  }`}
                />
                <button onClick={handlePromo} disabled={!promoCode.trim() || promoStatus === "checking"}
                  className="w-full sm:w-auto whitespace-nowrap px-6 py-3 rounded-xl bg-charcoal text-ivory text-sm font-medium hover:bg-charcoal/90 disabled:opacity-40 transition-colors">
                  {promoStatus === "checking" ? "..." : "Применить"}
                </button>
              </div>)}
              {promoStatus === "valid" && <p className="text-green-600 text-xs text-center mt-2">✓ Промокод применён!</p>}
              {promoStatus === "invalid" && <p className="text-red-500 text-xs text-center mt-2">Промокод не найден</p>}
              {promoStatus === "used" && <p className="text-red-500 text-xs text-center mt-2">Промокод уже использован</p>}
            </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- Render branded canvas: photo + title + description + wardrobe + watermark ---
type LookForCanvas = {
  image?: string;
  lookName?: string;
  description?: string;
  items?: Array<{ name?: string; price?: string; description?: string }>;
};

async function renderBrandedCanvas(look: LookForCanvas, lookIdx: number): Promise<Blob> {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('img load'));
    img.src = look.image as string;
  });

  const padding = 50;
  const gap = 50;
  const photoW = 900;
  const photoH = Math.round(img.height * (photoW / img.width));
  const textW = 1100;
  const totalW = padding + photoW + gap + textW + padding;

  const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (!paragraph.trim()) { lines.push(''); continue; }
      const words = paragraph.split(' ');
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  };

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) throw new Error('canvas ctx');

  const titleSize = 56;
  const bodySize = 28;
  const itemNameSize = 28;
  const itemDescSize = 22;
  const lineGap = 1.4;
  const watermarkSize = 22;
  const watermarkPadding = 30;

  mctx.font = `700 ${titleSize}px serif`;
  const titleLines = wrap(mctx, `Образ ${lookIdx + 1}: ${look.lookName || ''}`, textW);

  mctx.font = `400 ${bodySize}px sans-serif`;
  const descLines = wrap(mctx, look.description || '', textW);

  mctx.font = `700 ${titleSize - 12}px serif`;
  const itemsHeaderLines = wrap(mctx, '🛍 Гардероб', textW);

  const items = look.items || [];
  const itemsBlocks: { name: string[]; desc: string[] }[] = items.map(it => {
    mctx.font = `600 ${itemNameSize}px sans-serif`;
    const nameLines = wrap(mctx, (it.name || '') + (it.price ? `   —   ${it.price}` : ''), textW);
    mctx.font = `400 ${itemDescSize}px sans-serif`;
    const descL = wrap(mctx, it.description || '', textW);
    return { name: nameLines, desc: descL };
  });

  let textHeight = padding;
  textHeight += titleLines.length * titleSize * lineGap + 40;
  textHeight += descLines.length * bodySize * lineGap + 50;
  textHeight += itemsHeaderLines.length * (titleSize - 12) * lineGap + 30;
  for (const b of itemsBlocks) {
    textHeight += b.name.length * itemNameSize * lineGap;
    textHeight += b.desc.length * itemDescSize * lineGap + 22;
  }
  textHeight += padding + watermarkSize + watermarkPadding;

  const totalH = Math.max(photoH + padding * 2 + watermarkSize + watermarkPadding, textHeight);

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas ctx 2');

  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(img, padding, padding, photoW, photoH);

  let y = padding;
  const textX = padding + photoW + gap;
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#1a1a1a';
  ctx.font = `700 ${titleSize}px serif`;
  for (const l of titleLines) { ctx.fillText(l, textX, y); y += titleSize * lineGap; }
  y += 40;

  ctx.font = `400 ${bodySize}px sans-serif`;
  ctx.fillStyle = '#3a3a3a';
  for (const l of descLines) { ctx.fillText(l, textX, y); y += bodySize * lineGap; }
  y += 50;

  ctx.fillStyle = '#1a1a1a';
  ctx.font = `700 ${titleSize - 12}px serif`;
  for (const l of itemsHeaderLines) { ctx.fillText(l, textX, y); y += (titleSize - 12) * lineGap; }
  y += 30;

  for (const b of itemsBlocks) {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `600 ${itemNameSize}px sans-serif`;
    for (const l of b.name) { ctx.fillText(l, textX, y); y += itemNameSize * lineGap; }
    ctx.fillStyle = '#5a5a5a';
    ctx.font = `400 ${itemDescSize}px sans-serif`;
    for (const l of b.desc) { ctx.fillText(l, textX, y); y += itemDescSize * lineGap; }
    y += 22;
  }

  // Watermark — bottom right corner
  ctx.fillStyle = '#c9a84c';
  ctx.font = `600 ${watermarkSize}px sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.fillText('✨ stilist-ai.ru', totalW - watermarkPadding, totalH - watermarkPadding);
  ctx.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('blob failed'));
      else resolve(blob);
    }, 'image/jpeg', 0.92);
  });
}

// --- Share Menu (single button → native share on mobile, popup menu on desktop) ---
const ShareMenu = ({ look, lookIdx: _lookIdx }: { look: any; lookIdx: number }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const cachedImageUrl = useRef<string | null>(null);

  const lookName = look.lookName || "Образ";

  // Upload base64 image to server once, cache the hosted URL
  const ensureImageUrl = async (): Promise<string> => {
    if (cachedImageUrl.current) return cachedImageUrl.current;
    const resp = await fetch(look.image); // data URL → blob
    const blob = await resp.blob();
    const fd = new FormData();
    fd.append("image", blob, "look.jpg");
    const r = await fetch("/api/share-image", { method: "POST", body: fd });
    const data = await r.json() as { imageUrl: string };
    cachedImageUrl.current = data.imageUrl;
    return data.imageUrl;
  };

  const handleShareClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const imageUrl = await ensureImageUrl();

      // Mobile only: native share with URL (no file download to avoid page reload)
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator.share === "function") {
        try {
          await navigator.share({ url: imageUrl });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }

      setOpen(true);
      setTimeout(() => popupRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } finally {
      setLoading(false);
    }
  };

  const openShareUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
    setOpen(false);
  };

  const getUrl = () => cachedImageUrl.current || "";

  const shareWhatsApp = () => openShareUrl(`https://wa.me/?text=${encodeURIComponent(getUrl())}`);
  const shareTelegram = () => openShareUrl(`https://t.me/share/url?url=${encodeURIComponent(getUrl())}`);
  const shareVK = () => openShareUrl(`https://vk.com/share.php?url=${encodeURIComponent(getUrl())}`);
  const shareOK = () => openShareUrl(`https://connect.ok.ru/offer?url=${encodeURIComponent(getUrl())}`);
  const shareMAX = async () => {
    try { await navigator.clipboard.writeText(getUrl()); } catch { /* ignore */ }
    setOpen(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="relative">
      <button
        onClick={handleShareClick}
        disabled={loading}
        className="w-full py-3 rounded-full bg-gold text-charcoal text-sm font-medium tracking-wide flex items-center justify-center gap-2 hover:bg-gold/90 transition-colors shadow-md disabled:opacity-60 disabled:cursor-wait"
        title="Поделиться образом"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0110 10" strokeLinecap="round"/></svg>
            Готовим...
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            Поделиться
          </>
        )}
      </button>

      {copied && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[300] bg-charcoal text-ivory text-sm px-4 py-2 rounded-full shadow-lg whitespace-nowrap">
          Ссылка скопирована — вставьте в MAX
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setOpen(false)} />
          <div ref={popupRef} className="absolute top-full left-0 right-0 mt-2 z-[200] bg-charcoal rounded-2xl shadow-2xl p-4">
            <div className="flex justify-between gap-1">
              <button onClick={shareTelegram} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="w-10 h-10 rounded-full bg-[#0088cc] text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">Telegram</span>
              </button>
              <button onClick={shareWhatsApp} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">WhatsApp</span>
              </button>
              <button onClick={shareVK} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="w-10 h-10 rounded-full bg-[#0077FF] text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.372 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">ВКонтакте</span>
              </button>
              <button onClick={shareOK} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="w-10 h-10 rounded-full bg-[#EE8208] text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 6.5a2 2 0 110-4 2 2 0 010 4zm0 1.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-5.7 2.1c-.3.6-.1 1.4.6 1.8 1.1.7 2.4 1.2 3.7 1.4l-3.6 3.6c-.5.5-.5 1.4 0 1.9.5.5 1.4.5 1.9 0l3.1-3.1 3.1 3.1c.5.5 1.4.5 1.9 0 .5-.5.5-1.4 0-1.9l-3.6-3.6c1.3-.2 2.6-.7 3.7-1.4.7-.4.9-1.2.6-1.8-.4-.6-1.2-.8-1.9-.4-2.5 1.5-5.8 1.5-8.3 0-.7-.4-1.5-.2-1.9.4z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">ОК</span>
              </button>
              <button onClick={shareMAX} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0088ff] to-[#0055cc] text-white flex items-center justify-center font-bold text-lg">M</span>
                <span className="text-[10px] text-ivory/70">MAX</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// --- Lightbox: fullscreen image viewer with zoom/nav/download ---
type LightboxImage = { src: string; alt?: string; lookName?: string };
type LightboxState = { images: LightboxImage[]; index: number } | null;

const Lightbox = ({ state, onClose, onNavigate }: { state: LightboxState; onClose: () => void; onNavigate: (index: number) => void }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!state) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [state, state?.index]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNavigate((state.index + 1) % state.images.length);
      else if (e.key === "ArrowLeft") onNavigate((state.index - 1 + state.images.length) % state.images.length);
      else if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.25, 4));
      else if (e.key === "-") setZoom(z => Math.max(z - 0.25, 1));
      else if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [state, onClose, onNavigate]);

  if (!state) return null;
  const current = state.images[state.index];

  const handleDownload = async () => {
    try {
      const safeName = (current.lookName || `look-${state.index + 1}`).replace(/[^а-яa-z0-9\-_ ]/gi, '').trim() || `look-${state.index + 1}`;
      const resp = await fetch(current.src);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(current.src, '_blank');
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom === 1) return;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setPan({ x: dragStart.current.px + (e.clientX - dragStart.current.x), y: dragStart.current.py + (e.clientY - dragStart.current.y) });
  };
  const onPointerUp = () => { dragStart.current = null; };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-charcoal/95 backdrop-blur-sm flex items-center justify-center select-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ touchAction: zoom > 1 ? 'none' : 'pinch-zoom' }}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-black/40 to-transparent">
        <div className="text-ivory/80 text-sm font-medium truncate max-w-[60%]">
          {current.lookName ? `Образ: ${current.lookName}` : `${state.index + 1} / ${state.images.length}`}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(z - 0.25, 1))} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-ivory transition-colors" aria-label="Уменьшить">
            <span className="text-xl leading-none">−</span>
          </button>
          <span className="text-ivory/70 text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(z + 0.25, 4))} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-ivory transition-colors" aria-label="Увеличить">
            <span className="text-xl leading-none">+</span>
          </button>
          <button onClick={handleDownload} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-ivory transition-colors" aria-label="Скачать">
            <Download className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-ivory transition-colors" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Prev / Next */}
      {state.images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate((state.index - 1 + state.images.length) % state.images.length); }}
            className="absolute left-2 md:left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-ivory transition-colors"
            aria-label="Предыдущий"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate((state.index + 1) % state.images.length); }}
            className="absolute right-2 md:right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-ivory transition-colors"
            aria-label="Следующий"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Image */}
      <div
        className="flex items-center justify-center w-full h-full overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => { if (zoom === 1) { setZoom(2); } else { setZoom(1); setPan({ x: 0, y: 0 }); } }}
      >
        <img
          src={current.src}
          alt={current.alt || current.lookName || ''}
          draggable={false}
          className="max-w-[92vw] max-h-[88vh] object-contain transition-transform duration-150"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            cursor: zoom > 1 ? (dragStart.current ? 'grabbing' : 'grab') : 'zoom-in',
          }}
          onClick={(e) => { e.stopPropagation(); if (zoom === 1) setZoom(2); }}
        />
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-0 right-0 text-center text-ivory/40 text-xs pointer-events-none">
        {zoom > 1 ? 'Перетаскивайте для перемещения · двойной клик — сброс' : 'Клик — увеличить · двойной клик — 2× · ←/→ — навигация · Esc — закрыть'}
      </div>
    </div>,
    document.body
  );
};

type NailRecord = {
  id: number;
  filename: string;
  originalPath: string | null;
  thumbPath: string | null;
  source: string;
  color: string;
  complexity: string;
  tags: string[];
  verdict: string;
  wow_factor: number | null;
  design_category: string | null;
  shape: string | null;
  length: string | null;
  description: string | null;
  masterGuide: string | null;
  difficulty: string | null;
  timeMinutes: number | null;
  techniques: string[];
};

const QUIZ_DECK_SIZE = 30;
const QUIZ_SWIPE_THRESHOLD = 120;
const NAILS_CATALOG_PAGE = 24;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuizDeck(pool: NailRecord[]): NailRecord[] {
  const good = pool.filter(r => r.thumbPath && r.originalPath && r.verdict !== "reject");
  const wow = good.filter(r => r.verdict === "wow" || (r.wow_factor || 0) >= 8);
  const rest = good.filter(r => !wow.includes(r));
  // Prefer wow designs in the swipe deck, fill up to QUIZ_DECK_SIZE
  const deck = [...shuffleArray(wow), ...shuffleArray(rest)].slice(0, QUIZ_DECK_SIZE);
  return shuffleArray(deck);
}

function computeTop3(pool: NailRecord[], deck: NailRecord[], likedIds: Set<number>): NailRecord[] {
  const liked = deck.filter(d => likedIds.has(d.id));
  const usable = pool.filter(r => r.thumbPath && r.originalPath);
  const deckIds = new Set(deck.map(d => d.id));

  const pushUnique = (out: NailRecord[], candidate: NailRecord | undefined) => {
    if (!candidate) return;
    if (out.some(r => r.id === candidate.id)) return;
    out.push(candidate);
  };

  if (liked.length === 0) {
    const out: NailRecord[] = [];
    const popular = [...usable]
      .filter(r => !deckIds.has(r.id))
      .sort((a, b) => (b.wow_factor || 0) - (a.wow_factor || 0) || (b.tags.length - a.tags.length));
    const seen = new Set<string>();
    for (const r of popular) {
      const cat = r.design_category || r.color || "other";
      if (seen.has(cat)) continue;
      seen.add(cat);
      pushUnique(out, r);
      if (out.length >= 3) break;
    }
    for (const r of popular) {
      if (out.length >= 3) break;
      pushUnique(out, r);
    }
    // If the pool outside the deck is tiny, fall back to deck itself.
    for (const r of shuffleArray(deck)) {
      if (out.length >= 3) break;
      pushUnique(out, r);
    }
    return out.slice(0, 3);
  }

  const tagFreq = new Map<string, number>();
  const colorFreq = new Map<string, number>();
  const catFreq = new Map<string, number>();
  const shapeFreq = new Map<string, number>();
  const lengthFreq = new Map<string, number>();
  liked.forEach(r => {
    r.tags.forEach(t => tagFreq.set(t, (tagFreq.get(t) || 0) + 1));
    if (r.color) colorFreq.set(r.color, (colorFreq.get(r.color) || 0) + 1);
    if (r.design_category) catFreq.set(r.design_category, (catFreq.get(r.design_category) || 0) + 1);
    if (r.shape) shapeFreq.set(r.shape, (shapeFreq.get(r.shape) || 0) + 1);
    if (r.length) lengthFreq.set(r.length, (lengthFreq.get(r.length) || 0) + 1);
  });

  const scored = usable
    .filter(r => !deckIds.has(r.id))
    .map(r => {
      const tagScore = 2 * r.tags.reduce((s, t) => s + (tagFreq.get(t) || 0), 0);
      const colorScore = 3 * (colorFreq.get(r.color) || 0);
      const catScore = 5 * (r.design_category ? (catFreq.get(r.design_category) || 0) : 0);
      const shapeScore = 2 * (r.shape ? (shapeFreq.get(r.shape) || 0) : 0);
      const lengthScore = 1 * (r.length ? (lengthFreq.get(r.length) || 0) : 0);
      const wowScore = (r.wow_factor || 0) * 0.5;
      return { r, score: tagScore + colorScore + catScore + shapeScore + lengthScore + wowScore };
    })
    .sort((a, b) => b.score - a.score);

  const out: NailRecord[] = [];
  // Always keep the strongest likes first — user already confirmed these.
  for (const r of liked) {
    pushUnique(out, r);
    if (out.length >= 3) break;
  }
  const seenCats = new Set<string>(out.map(r => r.design_category || r.color || "other"));
  for (const { r } of scored) {
    const cat = r.design_category || r.color || "other";
    if (seenCats.has(cat)) continue;
    seenCats.add(cat);
    pushUnique(out, r);
    if (out.length >= 3) break;
  }
  for (const { r } of scored) {
    if (out.length >= 3) break;
    pushUnique(out, r);
  }
  return out.slice(0, 3);
}

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch {
    window.open(url, "_blank");
  }
}

async function shareImage(url: string, title: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text: "Посмотри какой дизайн ногтей мне подобрал ИИ-стилист!", url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Ссылка скопирована — вставь её куда хочешь поделиться.");
    }
  } catch {}
}

const NailsQuizModal = ({
  isOpen,
  onClose,
  initialStep,
  ownerFree = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: "intro" | "catalog";
  ownerFree?: boolean;
}) => {
  const [step, setStep] = useState<"intro" | "swipe" | "result" | "catalog">("intro");
  const [pool, setPool] = useState<NailRecord[]>([]);
  const [deck, setDeck] = useState<NailRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [top3, setTop3] = useState<NailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [exitDir, setExitDir] = useState<null | "left" | "right">(null);
  const [access, setAccess] = useState<NailsAccessState | null>(null);
  const [guides, setGuides] = useState<Record<string, { masterGuide: string | null; difficulty: string | null; timeMinutes: number | null; techniques: string[] }>>({});
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogColor, setCatalogColor] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [detailNail, setDetailNail] = useState<NailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const hasAccess = !!access?.token || ownerFree;

  const refreshAccess = async () => {
    if (ownerFree) {
      try {
        const r = await fetch("/api/nails/access");
        const d = await r.json();
        if (d.allowed) {
          const next: NailsAccessState = { token: d.token || "owner", kind: "month", expiresAt: d.expiresAt || null };
          setAccess(next);
          return next;
        }
      } catch {}
    }
    const local = loadNailsAccess();
    if (!local) {
      setAccess(null);
      return null;
    }
    try {
      const r = await fetch(`/api/nails/access?token=${encodeURIComponent(local.token)}`);
      const d = await r.json();
      if (!d.allowed) {
        clearNailsAccess();
        setAccess(null);
        return null;
      }
      const next: NailsAccessState = { token: d.token, kind: d.kind, expiresAt: d.expiresAt || null };
      saveNailsAccess(next);
      setAccess(next);
      return next;
    } catch {
      setAccess(local);
      return local;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setStep("intro"); setDeck([]); setIndex(0); setLiked(new Set()); setTop3([]); setError(null);
      setDragX(0); setExitDir(null); setGuides({}); setPromoCode(""); setPromoMsg(null);
      setCatalogQuery(""); setCatalogColor(""); setCatalogPage(1); setDetailNail(null);
      return;
    }
    refreshAccess().then(async (acc) => {
      let active = acc;
      // После оплаты месяца токен мог ещё не подтянуться — восстанавливаем по paymentId
      if ((!active || active.kind !== "month") && initialStep === "catalog") {
        const pid = loadNailsPaymentId();
        if (pid) {
          try {
            const restored = await activateNailsMonthFromPayment(pid);
            if (restored) active = restored;
          } catch {}
        }
      }
      if (active) {
        setAccess(active);
        saveNailsAccess(active);
      }
      if (initialStep === "catalog" && active) {
        setLoading(true);
        try {
          const data = await loadPool();
          setPool(data);
          setStep("catalog");
        } catch (e: any) {
          setError(e.message || "Ошибка загрузки каталога");
          setStep("intro");
        } finally {
          setLoading(false);
        }
      } else {
        setStep("intro");
      }
    });
  }, [isOpen, initialStep]);

  useEffect(() => {
    if (step === "swipe" && index < deck.length) {
      const next = deck[index + 1];
      if (next?.thumbPath) {
        const img = new Image();
        img.src = next.thumbPath;
      }
    }
  }, [step, index, deck]);

  const onceViewedRef = useRef(false);

  useEffect(() => {
    if (step !== "result" || !hasAccess || top3.length === 0 || !access) return;
    const missing = top3.filter((n) => !guides[n.filename]);
    if (missing.length === 0) return;
    fetch("/api/nails/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: access.token, filenames: missing.map((n) => n.filename) }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.guides) {
          setGuides((prev) => ({ ...prev, ...d.guides }));
          onceViewedRef.current = true;
        }
      })
      .catch(() => {});
  }, [step, hasAccess, top3, access]);

  if (!isOpen) return null;

  const NAILS_ASSET_VER = "20260721a";
  const nailAsset = (path: string | null | undefined) => {
    if (!path) return "";
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}v=${NAILS_ASSET_VER}`;
  };

  const isCanonicalNail = (filename: string) =>
    /^(STIL-26-\d+\.jpe?g|t_[0-9a-f]+\.(?:png|jpe?g))$/i.test(filename);

  const thumbNameFor = (filename: string) => {
    const stil = filename.match(/^STIL-26-(\d+)\./i);
    if (stil) return `thumb_${stil[1].padStart(3, "0")}.jpg`;
    const t = filename.match(/^t_([0-9a-f]+)\./i);
    if (t) return `thumb_t_${t[1]}.jpg`;
    return null;
  };

  const normalizeRecord = (raw: any, idx: number): NailRecord | null => {
    const filename = String(raw?.filename || raw?.id || "").trim();
    if (!filename || !isCanonicalNail(filename)) return null;
    // Always derive thumb from filename — never trust stale thumb fields
    const thumbName = thumbNameFor(filename) || filename;
    const colors = Array.isArray(raw?.colors) ? raw.colors.filter(Boolean) : [];
    const tags = Array.isArray(raw?.tags)
      ? raw.tags.filter(Boolean)
      : [...colors, ...(String(raw?.style || "").split(/[,/]/).map((s: string) => s.trim()).filter(Boolean))];
    return {
      id: Number.isFinite(raw?.id) ? Number(raw.id) : idx + 1,
      filename,
      originalPath: `/nails/all/${filename}`,
      thumbPath: `/nails/all/${thumbName}`,
      source: "nails-catalog",
      color: String(raw?.color || colors[0] || ""),
      complexity: String(raw?.complexity || ""),
      tags,
      verdict: String(raw?.verdict || "good"),
      wow_factor: raw?.wow_factor ?? null,
      design_category: raw?.design_category || raw?.style || null,
      shape: raw?.shape || null,
      length: raw?.length || null,
      description: raw?.description || null,
      masterGuide: null,
      difficulty: raw?.difficulty || raw?.complexity || null,
      timeMinutes: Number.isFinite(raw?.timeMinutes) ? Number(raw.timeMinutes) : null,
      techniques: Array.isArray(raw?.techniques) ? raw.techniques.filter(Boolean) : [],
    };
  };

  const readJson = async (url: string) => {
    const res = await fetch(url, { cache: "no-cache" }).catch(() => null);
    if (!res?.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  const loadPool = async (): Promise<NailRecord[]> => {
    let data: NailRecord[] = [];
    const lite = await readJson("/api/nails/lite-catalog");
    if (Array.isArray(lite)) {
      data = lite.map((item, idx) => normalizeRecord(item, idx)).filter(Boolean) as NailRecord[];
    }
    if (data.length === 0) {
      const catalogRaw = await readJson("/nails/catalog.json");
      if (Array.isArray(catalogRaw)) {
        data = catalogRaw.map((item, idx) => normalizeRecord(item, idx)).filter(Boolean) as NailRecord[];
      }
    }
    if (data.length === 0) {
      const raw = await readJson("/nails/nails-data.json");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const entries = Object.entries(raw) as [string, any][];
        data = entries
          .map(([filename, val], idx) => normalizeRecord({ filename, ...val }, idx))
          .filter(Boolean) as NailRecord[];
      }
    }
    if (data.length === 0) {
      const rawFiles = await readJson("/nails/all/index.json");
      if (!Array.isArray(rawFiles)) throw new Error("Не удалось загрузить базу дизайнов");
      data = rawFiles
        .map((filename: string, idx: number) => normalizeRecord({ filename }, idx))
        .filter(Boolean) as NailRecord[];
    }
    if (data.length === 0) throw new Error("Нет дизайнов для квиза");
    return data;
  };

  const startQuiz = async () => {
    setLoading(true); setError(null);
    try {
      const data = await loadPool();
      setPool(data);
      const newDeck = pickQuizDeck(data);
      if (newDeck.length === 0) throw new Error("Нет дизайнов для квиза");
      setDeck(newDeck);
      setIndex(0); setLiked(new Set()); setStep("swipe");
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const openCatalog = async () => {
    const acc = await refreshAccess();
    if (!acc) {
      setPromoMsg("Нужна подписка на месяц или промокод");
      return;
    }
    setLoading(true); setError(null);
    try {
      if (pool.length === 0) {
        const data = await loadPool();
        setPool(data);
      }
      setCatalogPage(1);
      setStep("catalog");
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки каталога");
    } finally {
      setLoading(false);
    }
  };

  const handleVerdict = (isLike: boolean) => {
    const current = deck[index];
    if (!current) return;
    if (isLike) {
      setLiked(prev => { const n = new Set(prev); n.add(current.id); return n; });
    }
    setExitDir(isLike ? "right" : "left");
    setTimeout(() => {
      setExitDir(null);
      setDragX(0);
      if (index + 1 >= deck.length) {
        const top = computeTop3(pool.length ? pool : deck, deck,
          new Set([...liked, ...(isLike ? [current.id] : [])]));
        setTop3(top);
        setStep("result");
      } else {
        setIndex(i => i + 1);
      }
    }, 250);
  };

  const restart = () => {
    const newDeck = pickQuizDeck(pool);
    setDeck(newDeck); setIndex(0); setLiked(new Set()); setGuides({}); setStep("swipe");
  };

  const startNailsPayment = async () => {
    setPaying(true); setPromoMsg(null);
    try {
      const r = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "nails_month" }),
      });
      const d = await r.json();
      if (d.ownerFree) {
        if (d.nailsToken) {
          saveNailsAccess({ token: d.nailsToken, kind: "month", expiresAt: d.expiresAt || null });
          setAccess({ token: d.nailsToken, kind: "month", expiresAt: d.expiresAt || null });
        }
        setPromoMsg(null);
        setLoading(true);
        try {
          const data = await loadPool();
          setPool(data);
          setStep("catalog");
        } catch (e: any) {
          setError(e.message || "Ошибка загрузки каталога");
        } finally {
          setLoading(false);
        }
        return;
      }
      if (d.error || !d.confirmationUrl) {
        setPromoMsg(d.error || "Не удалось создать оплату");
        return;
      }
      // Чтобы после оплаты месяц точно восстановился даже при сбое редиректа
      localStorage.setItem("pending_payment_id", d.paymentId);
      localStorage.setItem("pending_payment_tier", "nails_month");
      saveNailsPaymentId(d.paymentId);
      const tgWA = (window as any).Telegram?.WebApp;
      if (tgWA?.initData && tgWA.openLink) tgWA.openLink(d.confirmationUrl);
      else window.location.href = d.confirmationUrl;
    } catch {
      setPromoMsg("Ошибка оплаты. Попробуйте ещё раз.");
    } finally {
      setPaying(false);
    }
  };

  const enterCatalogWithAccess = async (acc: NailsAccessState) => {
    setAccess(acc);
    setLoading(true);
    setError(null);
    try {
      const data = pool.length ? pool : await loadPool();
      if (!pool.length) setPool(data);
      setCatalogPage(1);
      setCatalogQuery("");
      setCatalogColor("");
      setStep("catalog");
      setPromoMsg(acc.kind === "month" ? "Доступ на месяц открыт!" : "Открыт один просмотр базы");
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки каталога");
      setPromoMsg(acc.kind === "month" ? "Доступ на месяц открыт — нажмите «Открыть каталог»" : "Доступ открыт — нажмите «Открыть каталог»");
    } finally {
      setLoading(false);
    }
  };

  const redeemPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setRedeeming(true); setPromoMsg(null);
    try {
      const r = await fetch("/api/nails/redeem-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json();
      if (!d.success) {
        setPromoMsg(d.reason === "used" ? "Код уже использован" : d.reason === "not_found" ? "Код не найден" : "Код не подходит");
        return;
      }
      const next: NailsAccessState = { token: d.token, kind: d.kind, expiresAt: d.expiresAt || null };
      saveNailsAccess(next);
      setGuides({});
      onceViewedRef.current = false;
      // Сразу открываем базу — и для «раз», и для «месяц»
      await enterCatalogWithAccess(next);
    } catch {
      setPromoMsg("Ошибка активации кода");
    } finally {
      setRedeeming(false);
    }
  };

  const finishOnceSessionIfNeeded = () => {
    const acc = access || loadNailsAccess();
    // Месяц после оплаты НИКОГДА не сжигаем — только промо «раз посмотреть»
    if (!acc || acc.kind !== "once" || !onceViewedRef.current) return;
    fetch("/api/nails/consume-once", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: acc.token }),
    }).catch(() => {});
    clearNailsAccess();
    setAccess(null);
  };

  const handleCloseNails = () => {
    finishOnceSessionIfNeeded();
    onClose();
  };

  const openDetail = async (nail: NailRecord) => {
    setDetailNail(nail);
    if (!access?.token) return;
    if (guides[nail.filename]?.masterGuide) return;
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/nails/guide?token=${encodeURIComponent(access.token)}&filename=${encodeURIComponent(nail.filename)}`);
      const d = await r.json();
      if (r.ok) {
        setGuides((prev) => ({
          ...prev,
          [nail.filename]: {
            masterGuide: d.masterGuide || null,
            difficulty: d.difficulty || null,
            timeMinutes: d.timeMinutes ?? null,
            techniques: Array.isArray(d.techniques) ? d.techniques : [],
          },
        }));
        onceViewedRef.current = true;
      }
    } catch {}
    finally { setDetailLoading(false); }
  };

  const current = deck[index];
  const progress = deck.length ? Math.round(((index) / deck.length) * 100) : 0;

  const colorOptions = Array.from(new Set(pool.map((p) => p.color).filter(Boolean))).sort();
  const q = catalogQuery.trim().toLowerCase();
  const filteredCatalog = pool.filter((n) => {
    if (catalogColor && n.color !== catalogColor) return false;
    if (!q) return true;
    const hay = [
      n.description, n.color, n.shape, n.length, n.design_category, n.complexity,
      ...(n.tags || []),
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
  const catalogTotalPages = Math.max(1, Math.ceil(filteredCatalog.length / NAILS_CATALOG_PAGE));
  const catalogSlice = filteredCatalog.slice((catalogPage - 1) * NAILS_CATALOG_PAGE, catalogPage * NAILS_CATALOG_PAGE);

  const renderGuideBlock = (filename: string) => {
    const g = guides[filename];
    if (!g?.masterGuide) return null;
    return (
      <div className="mb-3 rounded-xl bg-charcoal/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold mb-1">Для мастера</p>
        {(g.difficulty || g.timeMinutes) && (
          <p className="text-xs text-charcoal/50 mb-2">
            {[g.difficulty && `Сложность: ${g.difficulty}`, g.timeMinutes && `~${g.timeMinutes} мин`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p className="text-sm text-charcoal/80 leading-relaxed whitespace-pre-wrap">{g.masterGuide}</p>
      </div>
    );
  };

  const renderUnlockOffer = () => (
    <div className="mt-6 rounded-2xl border border-gold/40 bg-gold/10 p-5 text-center">
      <p className="font-sans text-xl text-charcoal mb-2">Вся база + инструкции для мастера</p>
      <p className="text-sm text-charcoal/60 mb-4 leading-relaxed">
        Месяц безлимитного доступа к каталогу, поиску и полным описаниям «Для мастера» — {NAILS_MONTH_PRICE_RUB} ₽
      </p>
      <button
        onClick={startNailsPayment}
        disabled={paying}
        className="w-full py-3.5 rounded-2xl bg-charcoal text-ivory font-semibold hover:bg-charcoal/90 disabled:opacity-40 transition-colors"
      >
        {paying ? "Переходим к оплате…" : `Открыть на месяц — ${NAILS_MONTH_PRICE_RUB} ₽`}
      </button>
      <div className="mt-4 flex gap-2">
        <input
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          placeholder="Промокод"
          className="flex-1 px-3 py-2.5 rounded-xl border border-charcoal/15 bg-white text-sm"
        />
        <button
          onClick={redeemPromo}
          disabled={redeeming || !promoCode.trim()}
          className="px-4 py-2.5 rounded-xl bg-gold text-charcoal text-sm font-semibold disabled:opacity-40"
        >
          {redeeming ? "…" : "OK"}
        </button>
      </div>
      {promoMsg && <p className="text-sm mt-3 text-charcoal/70">{promoMsg}</p>}
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) handleCloseNails(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="bg-ivory w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto"
        >
          <button onClick={handleCloseNails} className="absolute top-5 right-5 p-3 bg-charcoal/5 rounded-full hover:bg-charcoal/10 z-10 touch-manipulation">
            <X className="w-5 h-5 text-charcoal" />
          </button>

          {step === "intro" && (
            <div className="p-6 md:p-10 text-center">
              <p className="font-sans font-medium text-gold text-xs tracking-[0.2em] uppercase mb-3">База маникюра</p>
              <h2 className="font-serif text-3xl md:text-4xl text-charcoal mb-4">Подобрать ногти за 30 свайпов</h2>
              <p className="text-charcoal/60 mb-6 leading-relaxed">
                Оцени 30 дизайнов — лайк или пропустить. Получишь топ-3 под свой вкус. Полные инструкции для мастера и каталог — по подписке.
              </p>
              <button
                onClick={startQuiz}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold text-lg hover:bg-gold/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? "Загружаем…" : (<>Начать бесплатно <ArrowRight className="w-5 h-5" /></>)}
              </button>
              {hasAccess && (
                <button
                  onClick={openCatalog}
                  disabled={loading}
                  className="w-full mt-3 py-3 rounded-2xl border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors"
                >
                  {access?.kind === "once" ? "Открыть базу (один просмотр)" : "Открыть каталог"}
                </button>
              )}
              {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
              <p className="text-xs text-charcoal/40 mt-6">Бесплатно: квиз + топ-3 · Доступ: вся база и «Для мастера»</p>
              {!hasAccess && (
                <div className="mt-4 text-left">{renderUnlockOffer()}</div>
              )}
            </div>
          )}

          {step === "swipe" && current && (
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-charcoal/70">{index + 1} / {deck.length}</span>
                <span className="text-sm text-charcoal/50">❤️ {liked.size}</span>
              </div>
              <div className="w-full h-2 bg-charcoal/10 rounded-full mb-6 overflow-hidden">
                <div className="h-full bg-gold transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>

              <div className="relative mx-auto" style={{ maxWidth: 360, height: 480 }}>
                {deck.slice(index, index + 3).map((nail, stackIdx, stack) => {
                  const isTop = stackIdx === 0;
                  const depth = stack.length - 1 - stackIdx;
                  const offset = depth * 8;
                  return (
                    <motion.div
                      key={nail.id}
                      className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl bg-charcoal/5"
                      style={{ y: offset, zIndex: stack.length - stackIdx }}
                      drag={isTop ? "x" : false}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.6}
                      onDrag={(e, info) => { if (isTop) setDragX(info.offset.x); }}
                      onDragEnd={(e, info) => {
                        if (!isTop) return;
                        if (info.offset.x > QUIZ_SWIPE_THRESHOLD) handleVerdict(true);
                        else if (info.offset.x < -QUIZ_SWIPE_THRESHOLD) handleVerdict(false);
                        else setDragX(0);
                      }}
                      animate={
                        isTop && exitDir
                          ? { x: exitDir === "right" ? 500 : -500, opacity: 0, rotate: exitDir === "right" ? 20 : -20 }
                          : { x: isTop ? dragX : 0, opacity: 1, rotate: isTop ? dragX * 0.05 : 0 }
                      }
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      {nail.thumbPath && (
                        <img
                          src={nailAsset(nail.thumbPath)}
                          alt={nail.description || "Дизайн ногтей"}
                          className="w-full h-full object-cover"
                          draggable={false}
                          loading={isTop ? "eager" : "lazy"}
                          decoding="async"
                        />
                      )}
                      {isTop && dragX > 30 && (
                        <div className="absolute top-6 left-6 px-4 py-2 bg-green-500/90 text-white rounded-2xl font-bold text-lg rotate-[-12deg]">ЛАЙК</div>
                      )}
                      {isTop && dragX < -30 && (
                        <div className="absolute top-6 right-6 px-4 py-2 bg-red-500/90 text-white rounded-2xl font-bold text-lg rotate-[12deg]">ПРОПУСК</div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {current.description && (
                <p className="text-center text-sm text-charcoal/60 mt-5 px-4 leading-relaxed">{current.description}</p>
              )}

              <div className="flex items-center justify-center gap-6 mt-6">
                <button
                  onClick={() => handleVerdict(false)}
                  className="w-16 h-16 rounded-full bg-charcoal/5 hover:bg-charcoal/10 flex items-center justify-center transition-colors touch-manipulation"
                  aria-label="Пропустить"
                >
                  <X className="w-7 h-7 text-charcoal/70" />
                </button>
                <button
                  onClick={() => handleVerdict(true)}
                  className="w-16 h-16 rounded-full bg-gold/20 hover:bg-gold/30 flex items-center justify-center transition-colors touch-manipulation"
                  aria-label="Лайк"
                >
                  <Heart className="w-7 h-7 text-gold fill-gold" />
                </button>
              </div>
              <p className="text-center text-xs text-charcoal/40 mt-4">Свайп вправо = лайк • влево = пропустить</p>
            </div>
          )}

          {step === "result" && (
            <div className="p-6 md:p-8">
              <p className="font-sans font-medium text-gold text-xs tracking-[0.2em] uppercase mb-2 text-center">Ваш топ-3</p>
              <h2 className="font-serif text-2xl md:text-3xl text-charcoal mb-2 text-center">Идеально под ваш вкус</h2>
              <p className="text-sm text-charcoal/60 mb-6 text-center">
                {liked.size > 0 ? `На основе ${liked.size} ${liked.size === 1 ? "лайка" : "лайков"}` : "Подобрано по популярности"}
              </p>

              {top3.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-charcoal/60 mb-4">Не удалось подобрать — попробуйте ещё раз.</p>
                  <button onClick={restart} className="px-6 py-3 rounded-full bg-gold text-charcoal font-medium">Пройти заново</button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {top3.map((nail, i) => (
                    <div key={nail.filename} className="border border-charcoal/10 rounded-2xl overflow-hidden bg-white">
                      {nail.originalPath && (
                        <div className="relative aspect-[3/4] bg-charcoal/5">
                          <img src={nailAsset(nail.originalPath)} alt={nail.description || "Дизайн ногтей"} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute top-3 left-3 px-3 py-1 bg-charcoal/80 text-ivory rounded-full text-xs font-medium">#{i + 1}</div>
                        </div>
                      )}
                      <div className="p-4">
                        {nail.description && <p className="text-sm text-charcoal/80 mb-3 leading-relaxed">{nail.description}</p>}
                        {hasAccess ? (
                          renderGuideBlock(nail.filename) || (
                            <p className="text-xs text-charcoal/40 mb-3">Загружаем инструкцию для мастера…</p>
                          )
                        ) : (
                          <div className="mb-3 rounded-xl bg-charcoal/5 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gold mb-1">Для мастера</p>
                            <p className="text-sm text-charcoal/50">Полная пошаговая инструкция откроется после оплаты или промокода.</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          {nail.originalPath && (
                            <button
                              onClick={() => downloadImage(nail.originalPath!, nail.filename)}
                              className="flex-1 py-2.5 rounded-full bg-charcoal text-ivory text-sm font-medium hover:bg-charcoal/90 flex items-center justify-center gap-2 transition-colors"
                            >
                              <Download className="w-4 h-4" /> Скачать
                            </button>
                          )}
                          {nail.originalPath && (
                            <button
                              onClick={() => shareImage(window.location.origin + nail.originalPath, "Мой идеальный маникюр")}
                              className="flex-1 py-2.5 rounded-full border border-charcoal/20 text-charcoal text-sm font-medium hover:bg-charcoal/5 flex items-center justify-center gap-2 transition-colors"
                            >
                              <Share2 className="w-4 h-4" /> Поделиться
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!hasAccess && renderUnlockOffer()}

              {hasAccess && (
                <button
                  onClick={openCatalog}
                  className="w-full mt-4 py-3 rounded-2xl border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5"
                >
                  {access?.kind === "once" ? "Смотреть базу (один просмотр)" : "Смотреть всю базу"}
                </button>
              )}

              <div className="flex gap-3 mt-6">
                <button onClick={restart} className="flex-1 py-3 rounded-full border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors">
                  Пройти заново
                </button>
                <button onClick={handleCloseNails} className="flex-1 py-3 rounded-full bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors">
                  Готово
                </button>
              </div>
            </div>
          )}

          {step === "catalog" && (
            <div className="p-5 md:p-7">
              <p className="font-sans font-medium text-gold text-xs tracking-[0.2em] uppercase mb-2">Каталог</p>
              <h2 className="font-serif text-2xl text-charcoal mb-1">База дизайнов</h2>
              <p className="text-xs text-charcoal/50 mb-4">
                {filteredCatalog.length} из {pool.length}
                {access?.kind === "month"
                  ? access.expiresAt
                    ? ` · полный доступ до ${new Date(access.expiresAt).toLocaleDateString("ru-RU")}`
                    : " · полный доступ на месяц"
                  : access?.kind === "once"
                    ? access.expiresAt
                      ? ` · доступ на сутки до ${new Date(access.expiresAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                      : " · доступ на сутки"
                    : ""}
              </p>
              {access?.kind === "month" && (
                <p className="text-sm text-gold mb-4 font-medium">
                  Месяц оплачен: вся база, поиск и инструкции «Для мастера» без ограничений
                </p>
              )}

              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
                <input
                  value={catalogQuery}
                  onChange={(e) => { setCatalogQuery(e.target.value); setCatalogPage(1); }}
                  placeholder="Поиск: цвет, стиль, форма…"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-charcoal/15 bg-white text-sm"
                />
              </div>
              {colorOptions.length > 0 && (
                <select
                  value={catalogColor}
                  onChange={(e) => { setCatalogColor(e.target.value); setCatalogPage(1); }}
                  className="w-full mb-4 px-3 py-2.5 rounded-xl border border-charcoal/15 bg-white text-sm"
                >
                  <option value="">Все цвета</option>
                  {colorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}

              <div className="grid grid-cols-2 gap-3">
                {catalogSlice.map((nail) => (
                  <button
                    key={nail.filename}
                    type="button"
                    onClick={() => openDetail(nail)}
                    className="text-left rounded-2xl overflow-hidden border border-charcoal/10 bg-white hover:border-gold/50 transition-colors"
                  >
                    <div className="aspect-[3/4] bg-charcoal/5">
                      {nail.thumbPath && (
                        <img src={nailAsset(nail.thumbPath)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs text-charcoal/70 line-clamp-2 leading-snug">
                        {nail.description || nail.design_category || nail.color || "Дизайн"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {filteredCatalog.length === 0 && (
                <p className="text-center text-sm text-charcoal/50 py-8">Ничего не найдено — попробуйте другой запрос</p>
              )}

              {catalogTotalPages > 1 && (
                <div className="flex items-center justify-between mt-5 gap-2">
                  <button
                    disabled={catalogPage <= 1}
                    onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                    className="px-4 py-2 rounded-full border border-charcoal/15 text-sm disabled:opacity-30"
                  >
                    Назад
                  </button>
                  <span className="text-xs text-charcoal/50">{catalogPage} / {catalogTotalPages}</span>
                  <button
                    disabled={catalogPage >= catalogTotalPages}
                    onClick={() => setCatalogPage((p) => Math.min(catalogTotalPages, p + 1))}
                    className="px-4 py-2 rounded-full border border-charcoal/15 text-sm disabled:opacity-30"
                  >
                    Дальше
                  </button>
                </div>
              )}

              <button
                onClick={() => setStep(top3.length ? "result" : "intro")}
                className="w-full mt-5 py-3 rounded-full border border-charcoal/20 text-charcoal font-medium"
              >
                Назад
              </button>

              {detailNail && (
                <div
                  className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-charcoal/70"
                  onClick={(e) => { if (e.target === e.currentTarget) setDetailNail(null); }}
                >
                  <div className="bg-ivory w-full max-w-md rounded-3xl max-h-[85vh] overflow-y-auto p-5">
                    {detailNail.originalPath && (
                      <img src={nailAsset(detailNail.originalPath)} alt="" className="w-full rounded-2xl mb-4 object-cover aspect-[3/4]" loading="lazy" />
                    )}
                    {detailNail.description && (
                      <p className="text-sm text-charcoal/80 mb-3 leading-relaxed">{detailNail.description}</p>
                    )}
                    {detailLoading && <p className="text-xs text-charcoal/40 mb-3">Загружаем инструкцию…</p>}
                    {renderGuideBlock(detailNail.filename)}
                    <div className="flex gap-2 mt-2">
                      {detailNail.originalPath && (
                        <button
                          onClick={() => downloadImage(detailNail.originalPath!, detailNail.filename)}
                          className="flex-1 py-2.5 rounded-full bg-charcoal text-ivory text-sm font-medium"
                        >
                          Скачать
                        </button>
                      )}
                      <button
                        onClick={() => setDetailNail(null)}
                        className="flex-1 py-2.5 rounded-full border border-charcoal/20 text-sm font-medium"
                      >
                        Закрыть
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- Group Stylize Modal ---
const MyLooksModal = ({ isOpen, onClose, onOpenOrder, onClearAll, onOrderAgain }: {
  isOpen: boolean;
  onClose: () => void;
  onOpenOrder: (paymentId: string, tier: SavedOrderTier) => void;
  onClearAll: () => void;
  onOrderAgain?: () => void;
}) => {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [codeInput, setCodeInput] = useState(() => {
    const saved = getSavedPickupCode();
    return saved ? displayPickupCode(saved) : "";
  });
  const [phoneInput, setPhoneInput] = useState("");
  const [showOldPhone, setShowOldPhone] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [linkedCode, setLinkedCode] = useState(getSavedPickupCode);

  const refreshOrdersMeta = (list: MyOrder[]) => {
    list.forEach(o => {
      fetch(`/api/order/${o.paymentId}`)
        .then(r => r.json())
        .then(data => setStatuses(prev => ({ ...prev, [o.paymentId]: data.status || "not_found" })))
        .catch(() => {});
      if (o.thumbnail) return;
      fetch(`/api/result/${o.paymentId}`)
        .then(r => r.json())
        .then(data => {
          if (data.ready && data.looks?.length) {
            const firstLook = data.looks.find((l: any) => l.image);
            if (firstLook?.image) {
              updateMyOrderThumbnail(o.paymentId, firstLook.image);
              setOrders(getMyOrders());
            }
          }
        })
        .catch(() => {});
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const savedCode = getSavedPickupCode();
    setLinkedCode(savedCode);
    setCodeInput(savedCode ? displayPickupCode(savedCode) : "");
    setRestoreMsg("");
    const fresh = getMyOrders();
    setOrders(fresh);
    setStatuses({});
    refreshOrdersMeta(fresh);
    if (savedCode && fresh.length === 0) {
      restoreOrdersByCode(savedCode).then((r) => {
        if (r.ok) {
          const next = getMyOrders();
          setOrders(next);
          refreshOrdersMeta(next);
          if (r.count > 0) setRestoreMsg(`Найдено заказов: ${r.count}`);
        }
      });
    }
    const timer = window.setInterval(() => {
      getMyOrders().forEach(o => {
        fetch(`/api/order/${o.paymentId}`)
          .then(r => r.json())
          .then(data => setStatuses(prev => ({ ...prev, [o.paymentId]: data.status || "not_found" })))
          .catch(() => {});
      });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  };

  const handleOpen = async (o: MyOrder) => {
    setLoadingId(o.paymentId);
    await onOpenOrder(o.paymentId, o.tier);
    setLoadingId(null);
  };

  const applyRestore = (r: { ok: boolean; count: number; error?: string }, emptyText: string) => {
    if (!r.ok) {
      setRestoreMsg(r.error || "Не удалось найти заказ");
      return;
    }
    setLinkedCode(getSavedPickupCode());
    const next = getMyOrders();
    setOrders(next);
    refreshOrdersMeta(next);
    setRestoreMsg(r.count > 0
      ? `Готово: найдено ${r.count} заказ${r.count === 1 ? "" : r.count < 5 ? "а" : "ов"}`
      : emptyText);
  };

  const handleRestore = async () => {
    setRestoring(true);
    setRestoreMsg("");
    const r = await restoreOrdersByCode(codeInput);
    setRestoring(false);
    applyRestore(r, "По этому коду заказ не найден. Проверьте буквы или напишите нам.");
  };

  const handleRestoreOldPhone = async () => {
    setRestoring(true);
    setRestoreMsg("");
    const r = await restoreOrdersByPhone(phoneInput);
    setRestoring(false);
    applyRestore(r, "По этому номеру старых заказов нет.");
  };

  const handleClearAll = () => {
    if (confirm("Удалить все сохранённые образы из списка на этом устройстве? Оплата не вернётся — список можно снова открыть по коду заказа.")) {
      clearMyOrders();
      setOrders([]);
      onClearAll();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="bg-ivory w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden relative max-h-[90vh] overflow-y-auto"
        >
          <button onClick={onClose} className="absolute top-5 right-5 p-3 bg-charcoal/5 rounded-full hover:bg-charcoal/10 z-10 touch-manipulation">
            <X className="w-5 h-5 text-charcoal" />
          </button>

          <div className="p-6 md:p-8">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold text-charcoal mb-1">Мои образы</h2>
            <p className="text-[13px] md:text-sm text-charcoal/60 mb-4">
              Если оплатили, а страница закрылась — введите код заказа, например СТИЛЬ-K7M2QX. Здесь и преображение, и причёска с уходом. Всё хранится сутки. Свой номер не нужен и в базы не попадает.
            </p>

            <div className="rounded-2xl border border-charcoal/10 bg-white/60 p-4 mb-5">
              <p className="text-xs font-medium text-charcoal/70 mb-2">Найти заказ по коду</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  autoComplete="off"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleRestore()}
                  placeholder="СТИЛЬ-K7M2QX"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-charcoal/15 bg-white text-sm text-center tracking-wider focus:outline-none focus:border-gold"
                />
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className="px-5 py-2.5 rounded-xl bg-charcoal text-ivory text-sm font-medium hover:bg-charcoal/90 disabled:opacity-50 whitespace-nowrap"
                >
                  {restoring ? "Ищем…" : "Найти"}
                </button>
              </div>
              {linkedCode && (
                <p className="text-[11px] text-charcoal/45 mt-2 text-center">
                  Сохранён код: {displayPickupCode(linkedCode)}
                </p>
              )}
              {restoreMsg && (
                <p className="text-xs text-center mt-2 text-charcoal/70">{restoreMsg}</p>
              )}
              <button
                type="button"
                onClick={() => setShowOldPhone((v) => !v)}
                className="block mx-auto mt-3 text-[11px] text-charcoal/45 underline underline-offset-2"
              >
                {showOldPhone ? "Скрыть старый номер" : "Заказ был раньше, до кода? Найти по старому номеру"}
              </button>
              {showOldPhone && (
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(formatPhoneInput(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && handleRestoreOldPhone()}
                    placeholder="+7 999 123-45-67"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-charcoal/15 bg-white text-sm text-center focus:outline-none focus:border-gold"
                  />
                  <button
                    onClick={handleRestoreOldPhone}
                    disabled={restoring}
                    className="px-5 py-2.5 rounded-xl border border-charcoal/15 text-charcoal text-sm font-medium hover:bg-white disabled:opacity-50 whitespace-nowrap"
                  >
                    Найти старый
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => { onClose(); onOrderAgain?.(); }}
              className="w-full mb-5 py-3 rounded-2xl bg-gold text-charcoal font-semibold text-sm hover:bg-gold/90 transition-colors"
            >
              Заказать ещё образы
            </button>

            {orders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-charcoal/50 text-sm">Пока нет сохранённых образов.</p>
                <p className="text-charcoal/40 text-xs mt-2">Введите код заказа СТИЛЬ-… — сюда попадут и одежда, и причёска с уходом.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {[...orders].reverse().map(o => (
                    <div key={o.paymentId} className="border border-charcoal/10 rounded-2xl p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-charcoal/5 flex items-center justify-center flex-shrink-0">
                          {o.thumbnail ? (
                            <img src={o.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : o.tier === "grooming" ? (
                            <Scissors className="w-6 h-6 text-charcoal/30" />
                          ) : (
                            <Shirt className="w-6 h-6 text-charcoal/30" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-charcoal">
                            {o.tier === "premium" ? "Премиум" : o.tier === "grooming" ? "Причёска и уход" : "Стандарт"}
                          </p>
                          <p className="text-xs text-charcoal/50 mt-0.5">{formatDate(o.createdAt)}</p>
                          <p className="text-[11px] mt-1 text-charcoal/60">
                            {statuses[o.paymentId] === "ready" ? "Готово" :
                              statuses[o.paymentId] === "partial" ? "Нужно повторить часть фото" :
                              statuses[o.paymentId] === "processing" ? "Генерируется…" :
                              statuses[o.paymentId] === "awaiting_input" ? "Ожидает загрузки фото" :
                              statuses[o.paymentId] === "failed" ? "Нужно продолжить заказ" :
                              statuses[o.paymentId] === "expired" ? "Срок хранения истёк" : "Проверяем статус…"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpen(o)}
                        disabled={loadingId === o.paymentId}
                        className="px-5 py-2.5 rounded-full bg-charcoal text-ivory text-sm font-medium hover:bg-charcoal/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {loadingId === o.paymentId ? "Загрузка…" :
                          statuses[o.paymentId] === "processing" ? "Проверить" :
                          statuses[o.paymentId] === "awaiting_input" || statuses[o.paymentId] === "failed" ? "Продолжить" :
                          o.tier === "grooming" ? "Открыть" : "Открыть образы"}
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleClearAll}
                  className="mt-6 text-xs text-charcoal/40 hover:text-charcoal/70 transition-colors underline"
                >
                  Сбросить список на этом устройстве
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


// --- Stylize Modal Component ---
const StylizeModal = ({ isOpen, onClose, userName, tier, orderPaymentId, onToast, onNewLooks, recoveredResult, onRecoveredResultShown, onOpenLightbox }: { isOpen: boolean; onClose: () => void; userName: string; tier: Tier; orderPaymentId?: string; onToast: (msg: string, type: 'success'|'error'|'info') => void; onNewLooks: () => void; recoveredResult?: any; onRecoveredResultShown?: () => void; onOpenLightbox?: (state: LightboxState) => void }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [wishes, setWishes] = useState("");
  const [birthDay, setBirthDay] = useState(() => localStorage.getItem("you-stile-birth-day") || "");
  const [birthMonth, setBirthMonth] = useState(() => localStorage.getItem("you-stile-birth-month") || "");
  const [birthYear, setBirthYear] = useState(() => localStorage.getItem("you-stile-birth-year") || "");
  const [birthRegion, setBirthRegion] = useState("");
  const [birthCity, setBirthCity] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([]);
  const [occasionCounts, setOccasionCounts] = useState<Record<string, number>>({});
  type SeasonValue = "зима" | "весна" | "лето" | "осень";
  const SEASON_OPTIONS: { label: string; value: SeasonValue }[] = [
    { label: "❄️ Зима", value: "зима" },
    { label: "🌱 Весна", value: "весна" },
    { label: "☀️ Лето", value: "лето" },
    { label: "🍂 Осень", value: "осень" },
  ];
  const [season, setSeason] = useState<"" | SeasonValue>("");
  const [lookSeasons, setLookSeasons] = useState<("" | SeasonValue)[]>(["", "", "", "", ""]);
  const [looksCount, setLooksCount] = useState(tier === "premium" ? 5 : 3);
  const [budget, setBudget] = useState("");
  const [loadingState, setLoadingState] = useState<{ step: number; text: string } | null>(null);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewTelegram, setReviewTelegram] = useState(() => {
    try {
      const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      if (u?.username) return `@${u.username}`;
    } catch {}
    return localStorage.getItem("you-stile-feedback-tg") || "";
  });
  const [reviewError, setReviewError] = useState("");
  const [reviewSent, setReviewSent] = useState(false);
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form');
  const [retryingLook, setRetryingLook] = useState<number | null>(null);

  useEffect(() => { localStorage.setItem("you-stile-birth-day", birthDay); }, [birthDay]);
  useEffect(() => { localStorage.setItem("you-stile-birth-month", birthMonth); }, [birthMonth]);
  useEffect(() => { localStorage.setItem("you-stile-birth-year", birthYear); }, [birthYear]);

  useEffect(() => {
    setLooksCount(tier === "premium" ? 5 : 3);
  }, [tier]);

  useEffect(() => {
    if (tier !== "premium") return;
    const n = Object.values(occasionCounts).reduce((a, b) => a + b, 0);
    const slotCount = n > 0 ? Math.min(5, n) : 5;
    setLookSeasons((prev) => {
      const fill = (season || prev.find(Boolean) || "") as "" | SeasonValue;
      if (!fill) return prev;
      let changed = false;
      const next = [...prev];
      for (let i = 0; i < slotCount; i++) {
        if (!next[i]) {
          next[i] = fill;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tier, occasionCounts, season]);

  // Плавная анимация прогресс-бара — ползёт непрерывно, реальный прогресс только ускоряет
  useEffect(() => {
    if (!loadingState) { setDisplayPercent(0); return; }
    // При новом реальном шаге — если он выше текущего displayPercent, быстро догоняем
    const realPercent = Math.round((loadingState.step / 5) * 100);
    setDisplayPercent(prev => prev < realPercent ? realPercent : prev);
  }, [loadingState?.step]);

  useEffect(() => {
    if (!loadingState) return;
    // Непрерывно ползём до 95%, скорость замедляется по мере приближения
    const timer = setInterval(() => {
      setDisplayPercent(prev => {
        if (prev >= 95) return prev;
        // Быстро до 40%, потом медленнее, совсем медленно после 70%
        const speed = prev < 40 ? 0.8 : prev < 70 ? 0.3 : 0.1;
        return Math.min(95, prev + speed);
      });
    }, 200);
    return () => clearInterval(timer);
  }, [!!loadingState]);

  const sendReview = async () => {
    if (!reviewText.trim()) return;
    const tgContact = reviewTelegram.trim();
    if (!tgContact) {
      setReviewError("Укажите Telegram (@ник) или телефон — иначе мы не сможем ответить");
      return;
    }
    setReviewError("");
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: reviewText,
        userName: userName || tgUser?.first_name || "",
        telegram: tgContact,
        telegramId: tgUser?.id || undefined,
        paymentId: orderPaymentId || localStorage.getItem("pending_payment_id") || "",
      }),
    }).catch(() => null);
    if (res && !res.ok) {
      const data = await res.json().catch(() => ({}));
      setReviewError(data.error || "Не удалось отправить. Проверьте Telegram или телефон.");
      return;
    }
    try { localStorage.setItem("you-stile-feedback-tg", tgContact); } catch {}
    trackClick("feedback");
    setReviewSent(true);
    setTimeout(() => {
      setReviewOpen(false);
      setReviewText("");
      setReviewError("");
      setReviewSent(false);
    }, 2000);
  };

  // Reset state when modal opens (every time isOpen changes to true)
  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setPreviewUrls([]);
      setHeight("");
      setWeight("");
      setWishes("");
      setSelectedOccasions([]);
      setBirthDay("");
      setBirthMonth("");
      setBirthYear("");
      setBirthRegion("");
      setBirthCity("");
      setBirthTime("");
      setBudget("");
      setSelectedOccasions([]);
      setOccasionCounts({});
      setSeason("");
      setLookSeasons(["", "", "", "", ""]);
      setResult(null);
      setResultOrderId("");
      setErrorMsg(null);
      setLoadingState(null);
      setRetryingLook(null);
      // Если есть сохранённый результат (моложе 5 часов) — сразу показываем образы,
      // а не форму загрузки. Пользователь может запустить новую генерацию кнопкой "Создать новые образы".
      if (recoveredResult) {
        const rid = recoveredResult.paymentId || orderPaymentId || localStorage.getItem("pending_payment_id") || "";
        if (rid) setResultOrderId(rid);
        setResult({
          greetingAndAnalysis: recoveredResult.greetingAndAnalysis,
          bodyTypeSummary: recoveredResult.bodyTypeSummary,
          astroReading: recoveredResult.astroReading || null,
          paymentId: rid || undefined,
          looks: recoveredResult.looks,
        });
        setViewMode('result');
        onRecoveredResultShown?.();
      } else {
        setViewMode('form');
      }
    }
  }, [isOpen]);
  const [result, setResult] = useState<{
    greetingAndAnalysis: string;
    bodyTypeSummary?: string;
    astroReading?: string | null;
    paymentId?: string;
    looks: {
      lookName: string;
      shortName?: string;
      description: string;
      image: string | null;
      imageError?: string | null;
      editPrompt?: string;
      items: { name: string; category?: string; description?: string; price: string; url?: string; marketplace?: string; imageUrl?: string | null; productUrl?: string | null; wbUrl?: string | null; ozonUrl?: string | null; ymUrl?: string | null; similarity?: string | null; reason?: string | null }[];
    }[];
  } | null>(null);
  const [resultOrderId, setResultOrderId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => {
        const combined = [...prev, ...newFiles].slice(0, 3); // Keep up to 3 files
        setPreviewUrls(combined.map(file => URL.createObjectURL(file)));
        return combined;
      });
      setResult(null);
      setErrorMsg(null);
      // Reset input value so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const img = new window.Image();
            img.src = e.target?.result as string;
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                const max = 1400; // keep face detail for identity lock
                if (width > height) {
                  if (width > max) { height = Math.round((height * max) / width); width = max; }
                } else {
                  if (height > max) { width = Math.round((width * max) / height); height = max; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(file); return; }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                  if (blob) resolve(blob); else resolve(file);
                }, 'image/jpeg', 0.92);
              } catch { resolve(file); }
            };
            img.onerror = () => resolve(file);
          } catch { resolve(file); }
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
      } catch { resolve(file); }
    });
  };

  const premiumLookSlots = (() => {
    if (tier !== "premium") return [] as { label: string }[];
    const slots: { label: string }[] = [];
    for (const o of selectedOccasions) {
      const n = occasionCounts[o] || 1;
      for (let i = 0; i < n && slots.length < 5; i++) slots.push({ label: o });
    }
    if (slots.length === 0) {
      for (let i = 0; i < 5; i++) slots.push({ label: `Образ ${i + 1}` });
    }
    return slots;
  })();

  const handleUpload = async () => {
    if (files.length === 0) { setErrorMsg("Пожалуйста, загрузите хотя бы одно фото."); return; }
    if (!height || !height.trim()) { setErrorMsg("Пожалуйста, укажите рост."); return; }
    if (!weight || !weight.trim()) { setErrorMsg("Пожалуйста, укажите вес."); return; }
    const seasonsForLooks: SeasonValue[] = (tier === "standard"
      ? lookSeasons.slice(0, 3)
      : lookSeasons.slice(0, premiumLookSlots.length).map((s) => s || season)
    ).filter((s): s is SeasonValue => !!s);
    if (tier === "standard") {
      if (seasonsForLooks.length < 3) {
        setErrorMsg("Выберите сезон для каждого из трёх образов — можно разные, например два лета и одну осень.");
        return;
      }
    } else if (seasonsForLooks.length < premiumLookSlots.length) {
      setErrorMsg("Укажите сезон: нажмите «на все образы», потом поменяйте только те, где другое время года.");
      return;
    }
    setLoadingState({ step: 0.5, text: "Оптимизация фотографий для нейросети..." });
    setErrorMsg(null);
    
    try {
      const formData = new FormData();
      for (const file of files) {
        try {
          const resizedBlob = await resizeImage(file);
          formData.append("images", resizedBlob, file.name);
        } catch (e) {
          // fallback if resize fails — retry with lower quality to avoid MulterError
          try {
            const canvas = document.createElement('canvas');
            const img2 = new window.Image();
            await new Promise<void>((res, rej) => { img2.onload = () => res(); img2.onerror = rej; img2.src = URL.createObjectURL(file); });
            const max2 = 1100;
            let w2 = img2.width, h2 = img2.height;
            if (w2 > h2) { if (w2 > max2) { h2 = Math.round(h2 * max2 / w2); w2 = max2; } } else { if (h2 > max2) { w2 = Math.round(w2 * max2 / h2); h2 = max2; } }
            canvas.width = w2; canvas.height = h2;
            canvas.getContext('2d')?.drawImage(img2, 0, 0, w2, h2);
            const blob2 = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('blob failed')), 'image/jpeg', 0.85));
            formData.append("images", blob2, file.name);
          } catch {
            formData.append("images", file);
          }
        }
      }
      
      setLoadingState({ step: 1, text: "Анализ телосложения и параметров..." });
      
      formData.append("height", height);
      formData.append("weight", weight);
      const totalOccasionLooks = Object.values(occasionCounts).reduce((a, b) => a + b, 0);
      const effectiveLooksCount = tier === "premium"
        ? Math.min(5, Math.max(1, totalOccasionLooks || 5))
        : 3;
      const occasionText = selectedOccasions.length > 0
        ? `Создай образы по поводам: ${selectedOccasions.map(o => `${o} — ${occasionCounts[o] || 1} образ(а)`).join(", ")}`
        : "";
      formData.append("wishes", wishes);
      formData.append("looksCount", String(effectiveLooksCount));
      formData.append("tier", tier);
      formData.append("seasons", JSON.stringify(seasonsForLooks));
      formData.append("season", seasonsForLooks.join(","));
      if (occasionText) formData.append("occasions", occasionText);
      formData.append("userName", userName);
      formData.append("visitCount", String(incrementVisitCount()));
      formData.append("visitorId", getOrCreateVisitorId());
      {
        const phone = getSavedPhone();
        if (phone) formData.append("phone", phone);
      }
      if (budget) formData.append("budget", budget);
      await syncStyleHistoryFromServer();
      const pastLooks = getPastLooks();
      if (pastLooks.length > 0) formData.append("pastLooks", pastLooks.join(", "));
      if (birthDay && birthMonth && birthYear) {
        formData.append("birthDate", `${birthDay}.${birthMonth}.${birthYear}`);
      }
      if (birthRegion) {
        formData.append("birthRegion", birthRegion);
      }
      if (birthCity) {
        formData.append("birthCity", birthCity);
      }
      if (birthTime) {
        formData.append("birthTime", birthTime);
      }

      const pendingId = orderPaymentId || localStorage.getItem("pending_payment_id");
      if (pendingId) formData.append("paymentId", pendingId);

      const promoCode = localStorage.getItem("you-stile-promo-code");
      if (promoCode) formData.append("promoCode", promoCode);

      const response = await fetch("/api/stylize", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";
      let gotFinalResult = false;
      let streamOrderId = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete JSON objects separated by newline
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the incomplete line in the buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          
          let data;
          try {
            data = JSON.parse(line);
          } catch (e: any) {
            // If it's a chunk issue, just continue to wait for more data
            continue;
          }

          if (data.type === "order" && data.paymentId) {
            streamOrderId = data.paymentId;
            setResultOrderId(data.paymentId);
            if (data.pickupCode) savePickupCode(data.pickupCode);
            localStorage.setItem("pending_payment_id", data.paymentId);
            localStorage.setItem("pending_payment_tier", data.tier === "premium" ? "premium" : (localStorage.getItem("pending_payment_tier") || "standard"));
            saveMyOrder({
              paymentId: data.paymentId,
              tier: (data.tier === "premium" ? "premium" : "standard") as Tier,
              createdAt: Date.now(),
            });
            if (data.text) setLoadingState({ step: 1, text: data.text });
          } else if (data.type === "progress") {
            setLoadingState({ step: data.step, text: data.text });
          } else if (data.type === "partial_result") {
            setLoadingState({ step: 4.5, text: "Образы готовы! Ищем товары..." });
            const pid = streamOrderId || orderPaymentId || localStorage.getItem("pending_payment_id") || "";
            setResult({
              greetingAndAnalysis: data.greetingAndAnalysis,
              bodyTypeSummary: data.bodyTypeSummary,
              astroReading: data.astroReading || null,
              paymentId: pid || undefined,
              looks: data.looks
            });
            setViewMode('result');
            setTimeout(() => {
              document.getElementById('modal-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
          } else if (data.type === "result") {
            gotFinalResult = true;
            setLoadingState({ step: 5, text: "Готово!" });
            const pid = streamOrderId || orderPaymentId || localStorage.getItem("pending_payment_id") || "";
            if (pid) setResultOrderId(pid);
            const hasMissing = Array.isArray(data.looks) && data.looks.some((l: any) => !l.image);
            // Промокод сгорает только если все фото на месте; номер заказа оставляем, пока есть дыры — иначе «Повторить» не работает
            if (!hasMissing) {
              localStorage.removeItem("you-stile-promo-code");
              localStorage.removeItem("pending_payment_id");
              localStorage.removeItem("pending_payment_tier");
            } else if (pid) {
              localStorage.setItem("pending_payment_id", pid);
            }
            if (data.looks?.length) {
              savePastLooks(data.looks.map((l: any) => l.lookName).filter(Boolean));
              // На всякий случай ещё раз кладём заказ в «Мои образы»
              const doneId = streamOrderId || orderPaymentId || localStorage.getItem("pending_payment_id") || data.paymentId;
              if (doneId) {
                saveMyOrder({
                  paymentId: doneId,
                  tier: (localStorage.getItem("pending_payment_tier") === "premium" ? "premium" : "standard") as Tier,
                  createdAt: Date.now(),
                });
              }
            }
            setResult({
              greetingAndAnalysis: data.greetingAndAnalysis,
              bodyTypeSummary: data.bodyTypeSummary,
              astroReading: data.astroReading || null,
              paymentId: pid || undefined,
              looks: data.looks
            });
            setViewMode('result');
          } else if (data.type === "error") {
            throw new Error(data.error || "generation-error");
          }
        }
      }

      // Поток закрылся без финала (рестарт сервера / обрыв) — ждём сохранённый заказ
      if (!gotFinalResult) {
        const recoverId = streamOrderId || orderPaymentId || localStorage.getItem("pending_payment_id");
        if (recoverId) {
          setLoadingState({ step: 4.5, text: "Связь прервалась — проверяем сохранённый заказ…" });
          for (let i = 0; i < 24; i++) {
            await new Promise((r) => setTimeout(r, 5000));
            try {
              const rr = await fetch(`/api/result/${encodeURIComponent(recoverId)}`);
              if (!rr.ok) continue;
              const saved = await rr.json();
              if (saved?.ready && Array.isArray(saved.looks) && saved.looks.length > 0) {
                setResult({
                  greetingAndAnalysis: saved.greetingAndAnalysis,
                  bodyTypeSummary: saved.bodyTypeSummary,
                  astroReading: saved.astroReading || null,
                  looks: saved.looks,
                });
                setViewMode("result");
                setErrorMsg(null);
                onToast("Образы подтянулись из сохранённого заказа.", "success");
                return;
              }
              if (saved?.status === "failed" && !saved.ready) break;
            } catch { /* keep polling */ }
          }
          setErrorMsg("Связь прервалась. Откройте «Мои образы» через пару минут — заказ сохраняется на сервере.");
        } else {
          throw new Error("Stream ended without result");
        }
      }

    } catch (error: any) {
      console.error("Full error:", error);
      // Если поток оборвался — пробуем подтянуть уже сохранённый заказ (оплата или промо)
      const recoverId = orderPaymentId || localStorage.getItem("pending_payment_id");
      if (recoverId) {
        try {
          const rr = await fetch(`/api/result/${encodeURIComponent(recoverId)}`);
          if (rr.ok) {
            const saved = await rr.json();
            if (saved?.ready && Array.isArray(saved.looks) && saved.looks.length > 0) {
              setResult({
                greetingAndAnalysis: saved.greetingAndAnalysis,
                bodyTypeSummary: saved.bodyTypeSummary,
                astroReading: saved.astroReading || null,
                looks: saved.looks,
              });
              setViewMode("result");
              setErrorMsg(null);
              onToast("Связь прервалась, но образы сохранены — открыли из «Мои образы».", "info");
              return;
            }
          }
        } catch { /* ignore */ }
      }
      const msg = error?.message || "";
      if (/Ошибка AI|AI не смог|Превышено время|JSON parse/i.test(msg)) {
        setErrorMsg("Стилист не собрал образы с первого раза. Нажмите «Сгенерировать» ещё раз — оплата уже есть, повтор бесплатный.");
      } else if (msg.includes("No image data") || msg.includes("fetch failed") || msg.includes("Image generation failed")) {
        setErrorMsg("Сервис генерации изображений временно недоступен. Попробуйте ещё раз через 1-2 минуты.");
      } else if (recoverId) {
        setErrorMsg("Связь прервалась. Откройте «Мои образы» через пару минут — заказ сохраняется на сервере.");
      } else {
        setErrorMsg("Произошла ошибка. Зайдите через 10 минут — ваш заказ будет готов.");
      }
    } finally {
      setLoadingState(null);
    }
  };

  if (!isOpen) return null;

  const loadingOverlay = (
    <AnimatePresence>
      {loadingState && (
        <motion.div
          key="stylist-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 w-screen h-[100dvh] bg-charcoal/95 backdrop-blur-xl flex flex-col items-center text-white z-[400] overflow-y-auto py-10"
        >
          <div className="pointer-events-none absolute top-1/4 left-1/4 w-64 h-64 md:w-[28rem] md:h-[28rem] bg-gold/20 rounded-full mix-blend-screen filter blur-[80px] animate-pulse"></div>
          <div className="pointer-events-none absolute bottom-1/4 right-1/4 w-64 h-64 md:w-[28rem] md:h-[28rem] bg-blue-500/20 rounded-full mix-blend-screen filter blur-[80px] animate-pulse" style={{ animationDelay: '1s' }}></div>

          <div className="flex flex-col items-center m-auto relative z-10">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="mb-8 relative"
                  >
                    <div className="absolute inset-0 bg-gold/40 blur-2xl rounded-full"></div>
                    <Sparkles className="w-16 h-16 text-gold relative z-10" />
                  </motion.div>
                  
                  <h3 className="text-3xl font-serif mb-3 text-center px-4 tracking-wide">Создаем магию...</h3>

                  <p className="text-sm text-white/50 mb-6 text-center px-6 max-w-[320px] leading-relaxed">
                    {tier === "premium"
                      ? `Рисуем ${Math.min(5, Math.max(1, Object.values(occasionCounts).reduce((a, b) => a + b, 0) || 5))} образов сразу. Обычно около минуты на фото — вкладку не закрывайте.`
                      : "Рисуем 3 образа сразу. Обычно около минуты на фото — вкладку не закрывайте."}
                  </p>

                  <div className="w-full max-w-[288px] bg-white/10 rounded-full h-2.5 mb-4 overflow-hidden relative">

                    <motion.div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-gold/50 via-gold to-gold/50"
                      initial={{ width: "0%" }}
                      animate={{ width: `${displayPercent}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <div className="text-gold text-sm font-medium mb-6">
                    {Math.round(displayPercent)}%
                  </div>

                  <div className="w-full max-w-[288px] space-y-2 mt-2">
                    {PROGRESS_STAGES.map((stage, i) => {
                      const activeIndex = getActiveStageIndex((displayPercent / 100) * 5);
                      const isCompleted = i < activeIndex;
                      const isActive = i === activeIndex;
                      return (
                        <div key={i} className={`flex items-center gap-3 transition-all duration-300 ${
                          isActive ? 'text-white' : isCompleted ? 'text-white/60' : 'text-white/30'
                        }`}>
                          <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            {isCompleted ? (
                              <Check className="w-4 h-4 text-gold" />
                            ) : isActive ? (
                              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                <Sparkles className="w-4 h-4 text-gold" />
                              </motion.div>
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                            )}
                          </span>
                          <div>
                            <span className={`text-sm ${isActive ? 'font-medium' : 'font-light'}`}>{stage.label}</span>
                            {(isActive || isCompleted) && loadingState.text && (
                              <p className="text-xs text-white/40 mt-0.5">{loadingState.text}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
  );

  return (
    <>
      {createPortal(loadingOverlay, document.body)}
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start justify-center p-3 pt-4 md:p-4 md:pt-16 bg-charcoal/80 backdrop-blur-sm overflow-y-auto"
        id="modal-scroll-container"
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-ivory w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden overflow-x-hidden relative mb-20"
        >
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-3 bg-charcoal/5 rounded-full hover:bg-charcoal/10 transition-colors z-10 touch-manipulation"
          >
            <X className="w-6 h-6 text-charcoal" />
          </button>

          <div className="p-5 md:p-8 lg:p-12 relative">

            <h2 className="text-3xl font-serif text-charcoal mb-2">Создать новый образ</h2>

            {getSavedPickupCode() && (
              <div className="mb-4 max-w-xl rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3">
                <p className="text-sm font-medium text-charcoal">Код заказа: {displayPickupCode(getSavedPickupCode())}</p>
                <p className="text-xs text-charcoal/60 mt-1 leading-relaxed">Запишите его. Если страница закроется — откроете образы в «Мои образы» по этому коду. Телефон не нужен.</p>
              </div>
            )}

            <p className="text-charcoal/60 mb-4">{tier === "standard" ? "Загрузите фото, укажите рост, вес и сезон для каждого из 3 образов — можно разные, например два лета и одну осень." : "Загрузите до 3 фото. Поводы — до 5 образов. Сезон можно разный на каждый: сначала на все, потом поправить только нужные."}</p>

            {!loadingState && viewMode === 'form' && (
              <div className="w-full max-w-md mx-auto mb-6 bg-gold/10 border border-gold/30 rounded-xl p-3 text-sm text-charcoal/80 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                <span>
                  {tier === "premium"
                    ? "Подождите 4–7 минут — стилист внимательно оценит вашу фактуру и лицо, подберёт лучшие образы под ваш повод и бюджет. Можно налить кофе или почитать новости ☕"
                    : "Подождите 2–4 минуты — стилист анализирует все ваши данные и создаёт образы. Можно немного отдохнуть ☕"}
                </span>
              </div>
            )}

            {errorMsg && (

              <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex items-start gap-3 border border-red-100">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {viewMode === 'form' ? (
              <div className="flex flex-col items-center">

                {!loadingState && (
                  <div className="w-full max-w-md mb-4 bg-charcoal/[0.04] border border-charcoal/10 rounded-xl p-3 text-xs text-charcoal/60 leading-relaxed">
                    Если связь слабая или включён VPN — лучше выключить VPN перед загрузкой фото. Если страница закроется, зайдите через 10 минут в «Мои образы» и введите код заказа СТИЛЬ-…
                  </div>
                )}

                {/* Parameters */}
                <div className="flex gap-4 w-full max-w-md mb-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-charcoal/70 mb-1">Рост (см)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="Например, 175"
                      className="w-full px-4 py-3 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-charcoal/70 mb-1">Вес (кг)</label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="Например, 65"
                      className="w-full px-4 py-3 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors"
                    />
                  </div>
                </div>

                {/* Сезон — Стандарт: три отдельных выбора. Премиум: компактно после поводов. */}
                {tier === "standard" && (
                <div className="w-full max-w-md mb-4">
                  <label className="block text-sm font-medium text-charcoal/70 mb-2">
                    Сезон <span className="text-charcoal/40 font-normal">(обязательно)</span>
                  </label>
                  <p className="text-xs text-charcoal/50 mb-3">У каждого из трёх образов свой сезон. Можно два лета и одну осень — ткани и верхняя одежда будут разными.</p>
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className="mb-3">
                      <p className="text-xs font-medium text-charcoal/60 mb-1.5">Образ {idx + 1}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SEASON_OPTIONS.map(({ label, value }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setLookSeasons((prev) => {
                              const next = [...prev];
                              next[idx] = value;
                              return next;
                            })}
                            className={`py-2.5 px-1 rounded-xl text-xs sm:text-sm font-medium transition-colors border ${
                              lookSeasons[idx] === value
                                ? "bg-gold text-charcoal border-gold shadow-sm"
                                : "bg-white text-charcoal/70 border-charcoal/15 hover:border-gold/50"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                )}

                {/* Occasion buttons — premium only */}
                {tier === "premium" && (
                <div className="w-full max-w-md mb-6">
                  <label className="block text-sm font-medium text-charcoal/70 mb-2">Повод</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "📸 Фотосессия", value: "Фотосессия" },
                      { label: "🍽️ Ресторан", value: "Ресторан" },
                      { label: "💑 Свидание", value: "Свидание" },
                      { label: "🏖️ Отдых / пляж", value: "Отдых на пляже" },
                      { label: "🎉 Вечеринка", value: "Вечеринка" },
                      { label: "💍 Свадьба", value: "Свадьба" },
                      { label: "💼 Офис", value: "Офис" },
                      { label: "🏃 Спорт", value: "Спорт" },
                      { label: "☕ Прогулка / кафе", value: "Прогулка или кафе" },
                      { label: "🎭 Театр", value: "Театр" },
                      { label: "✈️ Путешествие", value: "Путешествие" },
                      { label: "🎵 Клуб", value: "Ночной клуб" },
                      { label: "🎓 Выпускной", value: "Выпускной" },
                      { label: "🛍️ Шопинг / casual", value: "Шопинг и casual" },
                      { label: "🧘 Йога / spa", value: "Йога или spa" },
                      { label: "⛵ Курорт / яхта", value: "Курорт или яхта" },
                      { label: "🎸 Фестиваль / концерт", value: "Фестиваль или концерт" },
                      { label: "🏢 Корпоратив", value: "Корпоратив" },
                      { label: "🎈 Детский праздник", value: "Детский праздник" },
                      { label: "🌿 Загородный отдых", value: "Загородный отдых" },
                      { label: "⛷️ Горнолыжный курорт", value: "Горнолыжный курорт" },
                      { label: "🕯️ Романтический ужин", value: "Романтический ужин" },
                    ].map(({ label, value }) => (
                      <div key={value} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedOccasions.includes(value)) {
                              setSelectedOccasions(prev => prev.filter(v => v !== value));
                              setOccasionCounts(prev => { const n = {...prev}; delete n[value]; return n; });
                            } else if (selectedOccasions.length < 5) {
                              const currentTotal = Object.values(occasionCounts).reduce((a, b) => a + b, 0);
                              if (currentTotal < 5) {
                                setSelectedOccasions(prev => [...prev, value]);
                                setOccasionCounts(prev => ({...prev, [value]: 1}));
                              }
                            }
                          }}
                          className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm border transition-colors touch-manipulation ${
                            selectedOccasions.includes(value)
                              ? "bg-gold text-charcoal border-gold font-medium"
                              : "bg-white text-charcoal/70 border-charcoal/20 hover:border-gold"
                          }`}
                        >
                          {label}
                        </button>
                        {selectedOccasions.includes(value) && (
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => setOccasionCounts(prev => ({...prev, [value]: Math.max(1, (prev[value]||1)-1)}))} className="w-6 h-6 rounded-full bg-charcoal/10 text-charcoal text-xs flex items-center justify-center hover:bg-charcoal/20 touch-manipulation">−</button>
                            <span className="text-xs font-medium w-4 text-center">{occasionCounts[value]||1}</span>
                            <button type="button" onClick={() => { const total = Object.values(occasionCounts).reduce((a,b)=>a+b,0); if(total < 5) setOccasionCounts(prev => ({...prev, [value]: (prev[value]||1)+1})); }} className="w-6 h-6 rounded-full bg-charcoal/10 text-charcoal text-xs flex items-center justify-center hover:bg-charcoal/20 touch-manipulation">+</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {tier === "premium" && (
                <div className="w-full max-w-md mb-4">
                  <label className="block text-sm font-medium text-charcoal/70 mb-2">
                    Сезон на каждый образ <span className="text-charcoal/40 font-normal">(обязательно)</span>
                  </label>
                  <p className="text-xs text-charcoal/50 mb-2">Сначала «на все», потом поправьте только те образы, где другое время года. Например: свидание летом, офис осенью.</p>
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span className="text-[11px] text-charcoal/45 mr-1">На все</span>
                    {SEASON_OPTIONS.map(({ label, value }) => (
                      <button
                        key={`all-${value}`}
                        type="button"
                        onClick={() => {
                          setSeason(value);
                          setLookSeasons((prev) => {
                            const next = [...prev];
                            for (let i = 0; i < premiumLookSlots.length; i++) next[i] = value;
                            return next;
                          });
                        }}
                        className={`py-1 px-2 rounded-lg text-[11px] font-medium border transition-colors ${
                          lookSeasons.slice(0, premiumLookSlots.length).every((s) => (s || season) === value) && (season === value || lookSeasons[0] === value)
                            ? "bg-gold text-charcoal border-gold"
                            : "bg-white text-charcoal/70 border-charcoal/15 hover:border-gold/50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {premiumLookSlots.map((slot, idx) => {
                      const chosen = lookSeasons[idx] || season;
                      return (
                        <div key={`${slot.label}-${idx}`} className="flex items-center gap-2">
                          <span className="text-[11px] text-charcoal/60 w-[42%] min-w-0 truncate">{idx + 1}. {slot.label}</span>
                          <div className="flex flex-1 gap-1">
                            {SEASON_OPTIONS.map(({ value }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setLookSeasons((prev) => {
                                  const next = [...prev];
                                  next[idx] = value;
                                  return next;
                                })}
                                className={`flex-1 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                                  chosen === value
                                    ? "bg-gold text-charcoal border-gold"
                                    : "bg-white text-charcoal/55 border-charcoal/10 hover:border-gold/40"
                                }`}
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* Budget field — premium only */}
                {tier === "premium" && (
                <div className="w-full max-w-md mb-6">
                  <label className="text-sm font-medium text-charcoal/70 mb-1 block">
                    Бюджет на образ (₽)
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="Например: 5000"
                    className="w-full px-4 py-3 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm"
                  />
                  <p className="text-[11px] text-charcoal/40 mt-1">Стилист подберёт вещи в этом ценовом диапазоне</p>
                </div>
                )}

                {/* Birth date — premium astro feature */}
                {tier === "premium" && (
                <div className="w-full max-w-md mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-charcoal/70">
                        Дата рождения
                      </label>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                        Астро
                      </span>
                    </div>
                    <p className="text-[11px] text-charcoal/40 mb-2">
                      Укажите дату — стилист учтёт энергетику вашего знака зодиака
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number"
                        min={1} max={31}
                        value={birthDay}
                        onChange={(e) => setBirthDay(e.target.value)}
                        placeholder="ДД"
                        className="w-16 px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm text-center"
                      />
                      <input
                        type="number"
                        min={1} max={12}
                        value={birthMonth}
                        onChange={(e) => setBirthMonth(e.target.value)}
                        placeholder="ММ"
                        className="w-16 px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm text-center"
                      />
                      <input
                        type="number"
                        min={1900} max={2010}
                        value={birthYear}
                        onChange={(e) => setBirthYear(e.target.value)}
                        placeholder="ГГГГ"
                        className="w-24 px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm text-center"
                      />
                    </div>
                  </div>
                )}

                {previewUrls.length === 0 ? (
                  <div className="w-full max-w-md">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-[3/4] border-2 border-dashed border-charcoal/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-gold/5 transition-all group"
                    >
                      <div className="w-16 h-16 bg-charcoal/5 rounded-full flex items-center justify-center mb-4 group-hover:bg-gold/20 transition-colors">
                        <Upload className="w-8 h-8 text-charcoal/50 group-hover:text-gold transition-colors" />
                      </div>
                      <span className="font-medium text-charcoal">Нажмите, чтобы загрузить фото</span>
                      <span className="text-sm text-charcoal/50 mt-2">{tier === "standard" ? "1 фото (JPEG, PNG)" : "До 3 фото (JPEG, PNG)"}</span>
                    </div>
                    {tier === "standard" ? (
                      <div className="mt-3 bg-gold/5 rounded-xl p-3 text-xs text-charcoal/70 space-y-1">
                        <p className="font-medium text-charcoal mb-1">📸 Как сделать идеальное фото:</p>
                        <p>✓ Чёткое фото лица анфас — взгляд в камеру</p>
                        <p>✓ Хорошее освещение, без теней на лице</p>
                        <p>✓ Нейтральный фон (стена, улица)</p>
                        <p>✓ Без очков, без фильтров и масок</p>
                        <p>✓ Волосы убраны от лица</p>
                        <p className="text-charcoal/50 mt-1">Чем чётче лицо — тем точнее стилист воссоздаст ваш образ</p>
                      </div>
                    ) : (
                      <div className="mt-3 bg-gold/5 rounded-xl p-3 text-xs text-charcoal/70 space-y-1">
                        <p className="font-medium text-charcoal mb-1">📸 Советы по фото для лучшего результата:</p>
                        <p>✓ Фото 1: чёткое лицо анфас, хорошее освещение</p>
                        <p>✓ Фото 2–3: в полный рост или по пояс в нейтральной одежде</p>
                        <p>✓ Без фильтров, без очков, волосы убраны от лица</p>
                        <p>✓ Нейтральный фон, дневной свет</p>
                        <p className="text-charcoal/50 mt-1">Больше фото — точнее образ и лучше сходство</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full max-w-md relative rounded-2xl overflow-hidden shadow-lg bg-charcoal/5 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {previewUrls.map((url, idx) => (
                        <div key={idx} className="aspect-[3/4] rounded-xl overflow-hidden relative">
                           <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {previewUrls.length < (tier === "standard" ? 1 : 3) && (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-[3/4] rounded-xl border-2 border-dashed border-charcoal/20 flex items-center justify-center cursor-pointer hover:border-gold hover:bg-gold/5 transition-colors"
                        >
                          <Upload className="w-6 h-6 text-charcoal/40" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  multiple={tier !== "standard"}
                  className="hidden"
                />

                {previewUrls.length > 0 && !loadingState && (
                  <div className="flex gap-4 mt-8 w-full max-w-md">
                    <button 
                      onClick={() => { setFiles([]); setPreviewUrls([]); }}
                      className="flex-1 py-4 rounded-full border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors"
                    >
                      Очистить
                    </button>
                    <button 
                      onClick={handleUpload}
                      className="flex-1 py-4 rounded-full bg-charcoal text-ivory font-medium hover:bg-charcoal/90 transition-colors flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4 text-gold" />
                      Сгенерировать
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6 md:gap-12">

                {/* Back to form button — critical UX */}
                <button
                  onClick={() => setViewMode('form')}
                  className="flex items-center justify-center gap-2 py-3 rounded-full border border-charcoal/20 text-charcoal/70 text-sm font-medium hover:bg-charcoal/5 hover:text-charcoal transition-colors touch-manipulation"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Вернуться к форме
                </button>

                {/* Greeting & Analysis */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-charcoal/5">
                  <h3 className="text-xl font-serif text-charcoal mb-3 flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-gold" />
                    Анализ от стилиста
                  </h3>
                  <p className="text-sm text-charcoal/75 leading-relaxed whitespace-pre-wrap">
                    {result.greetingAndAnalysis}
                  </p>
                </div>

                {/* Astro Reading */}
                {result.astroReading && (
                  <div className="bg-gradient-to-br from-[#1a1040] to-[#2d1b69] p-8 rounded-3xl shadow-sm border border-purple-500/20 text-white">
                    <h3 className="text-xl font-serif mb-3 flex items-center gap-3">
                      <span className="text-2xl">✨</span>
                      Астро-разбор
                    </h3>
                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                      {result.astroReading}
                    </p>
                  </div>
                )}

                {/* 3 Looks */}
                <div className="space-y-16">
                  {result.looks.map((look, lookIdx) => (
                    <div key={lookIdx} className="grid md:grid-cols-2 gap-6 md:gap-12 items-start">
                      {/* Result Image */}
                      <div className="flex flex-col gap-3 md:sticky md:top-8">
                        <div className="rounded-2xl overflow-hidden shadow-xl relative">
                          {look.image ? (
                            <button type="button" onClick={() => onOpenLightbox?.({ images: result.looks.filter((l: any) => l.image).map((l: any) => ({ src: l.image, alt: l.lookName, lookName: l.lookName })), index: result.looks.filter((l: any) => l.image).findIndex((l: any) => l === look) })} className="block w-full touch-manipulation cursor-zoom-in group">
                              <img src={look.image} alt={look.lookName} className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.02]" />
                              <span className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-charcoal/70 text-ivory text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Открыть
                              </span>
                            </button>
                          ) : (
                            <div className="w-full aspect-[3/4] bg-charcoal/5 flex flex-col p-6 items-center justify-center text-center text-charcoal/50">
                              <Camera className="w-12 h-12 mb-4 opacity-50 text-charcoal/40" />
                              <span className="font-medium text-lg text-charcoal mb-2">Не удалось сгенерировать фото</span>
                              {look.imageError && (
                                  <span className="text-sm font-mono text-red-500/80 mt-4 max-w-full truncate whitespace-normal leading-relaxed">Ошибка API: {look.imageError}</span>
                              )}
                              <button
                                type="button"
                                disabled={retryingLook === lookIdx}
                                className="mt-4 px-4 py-2 bg-gold text-charcoal rounded-full text-sm font-medium hover:bg-gold/90 transition-colors disabled:opacity-60 relative z-10 touch-manipulation"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const pid =
                                    resultOrderId
                                    || result?.paymentId
                                    || orderPaymentId
                                    || localStorage.getItem("pending_payment_id")
                                    || (getMyOrders().slice().reverse().find(o => o.tier === "premium" || o.tier === "standard")?.paymentId)
                                    || "";
                                  if (!pid) {
                                    onToast("Не найден заказ. Откройте его через «Мои образы» по коду СТИЛЬ-… и повторите.", "error");
                                    return;
                                  }
                                  setResultOrderId(pid);
                                  localStorage.setItem("pending_payment_id", pid);
                                  const fd = new FormData();
                                  if (files.length) {
                                    try { const b = await resizeImage(files[0]); fd.append("image", b, files[0].name); } catch { fd.append("image", files[0]); }
                                  }
                                  if (look.editPrompt) fd.append("editPrompt", look.editPrompt);
                                  fd.append("wishes", wishes);
                                  fd.append("lookIdx", String(lookIdx));
                                  fd.append("paymentId", pid);
                                  setRetryingLook(lookIdx);
                                  try {
                                    const r = await fetch("/api/regenerate-image", { method: "POST", body: fd });
                                    const d = await r.json().catch(() => ({}));
                                    if (d.image) {
                                      setResult(prev => prev ? { ...prev, paymentId: pid, looks: prev.looks.map((l, i) => i === lookIdx ? { ...l, image: d.image, imageError: null } : l) } : prev);
                                      onToast("Фото успешно создано и сохранено.", "success");
                                    } else {
                                      onToast(d.error || "Не удалось создать фото. Попробуйте позже.", "error");
                                    }
                                  } catch {
                                    onToast("Связь прервалась. Проверьте заказ в «Моих образах».", "error");
                                  } finally {
                                    setRetryingLook(null);
                                  }
                                }}
                              >
                                {retryingLook === lookIdx ? "Генерирую…" : "🔄 Повторить генерацию"}
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Short Description — below image, before buttons */}
                        {look.shortName && (
                          <div className="text-center">
                            <span className="px-4 py-2 bg-gold/10 border border-gold/30 rounded-full text-charcoal text-sm font-medium tracking-wide inline-block">
                              {look.shortName}
                            </span>
                          </div>
                        )}
                        <p className="text-charcoal/70 text-sm leading-relaxed text-center">
                          Образ {lookIdx + 1}: <span className="font-medium text-charcoal">{look.lookName}</span>
                        </p>
                        {look.image && (
                          <button
                            onClick={async () => {
                              const safeName = (look.lookName || `look-${lookIdx + 1}`).replace(/[^а-яa-z0-9\-_ ]/gi, '').trim() || `look-${lookIdx + 1}`;
                              try {
                                const blob = await renderBrandedCanvas(look, lookIdx);
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${safeName}.jpg`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              } catch {
                                window.open(look.image as string, '_blank');
                              }
                            }}
                            className="w-full py-3 rounded-full bg-charcoal text-ivory text-sm font-medium tracking-wide flex items-center justify-center gap-2 hover:bg-gold hover:text-charcoal transition-colors group shadow-md"
                          >
                            <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                            Сохранить образ с описанием
                          </button>
                        )}
                        {/* Share Button */}
                        <ShareMenu look={look} lookIdx={lookIdx} />
                      </div>
                      
                      {/* Description & Shopping List */}
                      <div className="flex flex-col">
                        <h3 className="text-xl font-serif text-charcoal mb-3 flex items-center gap-2">
                          <span className="text-lg">📝</span>
                          Детали образа
                        </h3>
                        {(() => {
                          const desc = look.description || "";
                          const sectionEmoji: Record<string, string> = {
                            "концепци": "🎨", "одежд": "👕", "обув": "👟", "аксессуар": "💎",
                            "причёск": "💇", "груминг": "💇", "парфюм": "🌸", "аромат": "🌸",
                            "почему": "✨", "совет": "🛍", "покупк": "🛍",
                          };
                          const sectionColor: Record<string, { bg: string; text: string; border: string }> = {
                            "концепци": { bg: "bg-charcoal", text: "text-ivory", border: "border-gold" },
                            "одежд": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
                            "обув": { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300" },
                            "аксессуар": { bg: "bg-fuchsia-100", text: "text-fuchsia-900", border: "border-fuchsia-300" },
                            "причёск": { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300" },
                            "груминг": { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300" },
                            "парфюм": { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" },
                            "аромат": { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300" },
                            "почему": { bg: "bg-gold", text: "text-charcoal", border: "border-gold" },
                            "совет": { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-300" },
                            "покупк": { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-300" },
                          };
                          const getSectionKey = (header: string) => {
                            const key = getDetailSectionKey(header);
                            if (key) return key;
                            const lower = header.toLowerCase();
                            for (const k of Object.keys(sectionEmoji)) {
                              if (lower.includes(k)) return k;
                            }
                            return "";
                          };
                          const lines = desc.split("\n");
                          const blocks: { emoji: string; title: string; body: string; color: { bg: string; text: string; border: string } }[] = [];
                          let current: { emoji: string; title: string; body: string; color: { bg: string; text: string; border: string } } | null = null;
                          for (const line of lines) {
                            const trimmed = stripDetailDecor(line.trim());
                            if (!trimmed) {
                              if (current) current.body += "\n";
                              continue;
                            }
                            // Заголовок: «👕 Одежда: …» / «Одежда: …» / «✦ Одежда» / «КОНЦЕПЦИЯ ОБРАЗА»
                            const emojiMatch = trimmed.match(/^([🎨👕👞👟💎💇🌸✨🛍🧥👖👜💍🧣🧢👔👗🩱👢🩴👒🕶️⌚📿])\s*(.+)$/u);
                            const restAfterEmoji = emojiMatch ? stripDetailDecor(emojiMatch[2]) : trimmed;
                            const colonMatch = restAfterEmoji.match(/^(.+?):\s*(.*)$/u);
                            // Отдельная строка-заголовок без двоеточия (модель часто так пишет)
                            const headerOnlyKey = !colonMatch
                              && restAfterEmoji.length < 48
                              && !/[.!?…]/.test(restAfterEmoji)
                              && /^(концепци|одежд|обув|аксессуар|украш|причёск|причес|груминг|парфюм|аромат|почему|совет|покупк)/.test(restAfterEmoji.toLowerCase())
                              ? getDetailSectionKey(restAfterEmoji)
                              : "";
                            if (emojiMatch || colonMatch || headerOnlyKey) {
                              if (current) blocks.push(current);
                              const rawTitle = stripDetailDecor(
                                (colonMatch ? colonMatch[1] : restAfterEmoji).replace(/:\s*$/, "").trim()
                              );
                              const bodyLine = colonMatch ? colonMatch[2].trim() : "";
                              // Стикер всегда по смыслу раздела — ✦ от модели игнорируем
                              const emoji = getDetailSectionEmoji(rawTitle);
                              const key = getSectionKey(rawTitle);
                              current = {
                                emoji,
                                title: rawTitle.replace(/:\s*$/, ""),
                                body: bodyLine || "",
                                color: sectionColor[key] || { bg: "bg-charcoal", text: "text-ivory", border: "border-gold" },
                              };
                            } else if (current) {
                              current.body += (current.body ? "\n" : "") + line;
                            } else if (trimmed) {
                              current = { emoji: "🎨", title: "Концепция образа", body: line, color: sectionColor["концепци"] };
                            }
                          }
                          if (current) blocks.push(current);
                          if (!blocks.length) {
                            return <p className="text-sm text-charcoal/75 leading-relaxed mb-8 whitespace-pre-wrap">{desc}</p>;
                          }
                          return (
                            <div className="space-y-4 mb-8">
                              {blocks.map((b, i) => (
                                <div key={i} className="flex flex-col gap-2">
                                  <div className={`inline-flex items-center gap-2 self-start ${b.color.bg} ${b.color.text} ${b.color.border} border-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm`}>
                                    <span className="text-sm">{b.emoji}</span>
                                    <span>{b.title}</span>
                                  </div>
                                  {b.body.trim() && (
                                    <p className="text-sm text-charcoal/75 leading-relaxed whitespace-pre-wrap pl-1">
                                      {b.body.trim()}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}


                        <h4 className="text-lg font-serif text-charcoal mb-5 flex items-center gap-3">
                          <ShoppingBag className="w-4 h-4 text-gold" />
                          Гардероб
                        </h4>

                        <div className="space-y-3">
                          {look.items.map((item, idx) => (
                            <div key={idx} className="p-3 bg-white rounded-2xl border border-charcoal/5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2">
                              {/* Product Image with category sticker */}
                              {item.imageUrl && (
                                <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-charcoal/5">
                                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                  {item.category && (
                                    <div className={`absolute top-2 left-2 ${getCategoryStyle(item.category).bg} ${getCategoryStyle(item.category).text} ${getCategoryStyle(item.category).border} border-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-md backdrop-blur-sm flex items-center gap-1.5`}>
                                      <span className="text-sm">{CATEGORY_EMOJI[item.category.toLowerCase()] || "✨"}</span>
                                      <span>{item.category}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {item.category && !item.imageUrl && (
                                <div className={`flex items-center gap-2 ${getCategoryStyle(item.category).bg} ${getCategoryStyle(item.category).text} ${getCategoryStyle(item.category).border} border-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide self-start`}>
                                  <span className="text-sm">{CATEGORY_EMOJI[item.category.toLowerCase()] || "✨"}</span>
                                  <span>{item.category}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  {item.category && <span className="text-lg flex-shrink-0">{CATEGORY_EMOJI[item.category.toLowerCase()] || "✨"}</span>}
                                  <h4 className="font-medium text-charcoal text-sm leading-tight">{item.name}</h4>
                                </div>
                                <span className="font-serif text-gold text-sm whitespace-nowrap">{item.price}</span>
                              </div>
                              {item.category && (
                                <p className="text-xs text-charcoal/50">{item.category}</p>
                              )}
                              {/* Description — почему именно эта вещь */}
                              {item.description && (
                                <p className="text-xs text-charcoal/60 leading-relaxed">{item.description}</p>
                              )}
                              {/* Similarity badge */}
                              {item.similarity && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs px-2 py-0.5 bg-gold/10 text-gold rounded-full font-medium">
                                    Сходство: {item.similarity}
                                  </span>
                                </div>
                              )}
                              {/* Reason */}
                              {item.reason && (
                                <p className="text-xs text-charcoal/60 leading-relaxed">{item.reason}</p>
                              )}
                              <div className="flex gap-2 flex-wrap mt-1">
                                <a href={item.wbUrl || "#"} target="_blank" rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-full bg-[#CB11AB] text-white text-xs font-medium hover:opacity-90 transition-opacity">
                                  WB
                                </a>
                                <a href={item.ozonUrl || "#"} target="_blank" rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-full bg-[#005BFF] text-white text-xs font-medium hover:opacity-90 transition-opacity">
                                  Ozon
                                </a>
                                <a href={item.ymUrl || "#"} target="_blank" rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-full bg-[#FFCC00] text-charcoal text-xs font-medium hover:opacity-90 transition-opacity">
                                  Яндекс
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={onNewLooks}
                  className="mt-8 w-full max-w-md mx-auto py-4 rounded-full border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors"
                >
                  Создать новые образы
                </button>

                <button
                  onClick={() => setReviewOpen(true)}
                  className="mt-3 w-full max-w-md mx-auto py-3 rounded-full border border-gold/30 text-gold text-sm font-medium hover:bg-gold/5 transition-colors flex items-center justify-center gap-2"
                >
                  ✍️ Оставить отзыв
                </button>

                {reviewOpen && createPortal(
                  <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setReviewOpen(false)}>
                    <div className="bg-ivory rounded-3xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-serif text-charcoal mb-3">Ваш отзыв</h3>
                      {reviewSent ? (
                        <p className="text-green-600 text-center py-4 font-medium">Спасибо! Отзыв отправлен ✓</p>
                      ) : (
                        <>
                          <p className="text-xs text-charcoal/50 mb-2">
                            Укажите Telegram — мы ответим лично, если нужно уточнить или сообщить о правках.
                          </p>
                          <input
                            type="text"
                            value={reviewTelegram}
                            onChange={e => { setReviewTelegram(e.target.value); setReviewError(""); }}
                            placeholder="@username или +7…"
                            className="w-full border border-charcoal/20 rounded-xl p-3 text-sm mb-2 focus:outline-none focus:border-gold"
                            autoComplete="username"
                          />
                          <textarea
                            value={reviewText}
                            onChange={e => setReviewText(e.target.value)}
                            placeholder="Напишите что понравилось или что улучшить..."
                            className="w-full border border-charcoal/20 rounded-xl p-3 text-sm resize-none h-28 focus:outline-none focus:border-gold"
                          />
                          {reviewError && (
                            <p className="text-xs text-red-600 mt-2">{reviewError}</p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => setReviewOpen(false)} className="flex-1 py-2.5 rounded-xl border border-charcoal/20 text-charcoal text-sm">Отмена</button>
                            <button onClick={sendReview} disabled={!reviewText.trim() || !reviewTelegram.trim()} className="flex-1 py-2.5 rounded-xl bg-gold text-charcoal text-sm font-medium disabled:opacity-40">Отправить</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </>
  );
};

const HOME_FAQ: { q: string; a: string }[] = [
  {
    q: "Что умеет сайт? Какие есть разделы?",
    a: "Слоган простой: подчеркните свою индивидуальность. Не как все в ленте, не как все в салоне, не как все в офисе.\n\nОбразы одежды. «Начать преображение». Вы на фото уже в луке, который не выглядит «как у подруги с Pinterest». Рядом — ссылки на маркетплейсы. Стандарт 100 ₽ — одно фото, три образа, поводы не выбираете: стилист сам решает. Премиум 200 ₽ — до трёх фото, до пяти образов и 22 повода со счётчиком, сколько луков на каждый повод.\n\nПричёска и уход. 100 ₽. Три генерации сразу: вы «до» и три кадра «после», где причёска и лицо уже не из общего ряда. Плюс средства ИИ-косметолога со ссылками. Одно сравнение — бесплатно.\n\nБаза маникюра. Больше 450 дизайнов, тренды 2026, сложные работы, от которых руки запоминают. Поиск по цвету и стилю, инструкция для мастера. Квиз из 30 дизайнов бесплатно, вся база — 500 ₽ на месяц.\n\nЧат со стилистом. Бесплатно текстом: как собрать образ, который про вас, а не «как все». Можно до 4 фото из шкафа.\n\nГотовые заказы — «Мои образы» вверху сайта.",
  },
  {
    q: "Как потом найти заказ, если закрылась страница?",
    a: "Свой телефон оставлять не нужно — и в контактные базы мы его не заносим. Личное пространство остаётся вашим.\n\nПосле оплаты вы получаете код заказа, например СТИЛЬ-K7M2QX — как номер гардероба в театре. Генерация идёт несколько минут: интернет может моргнуть, вкладка закрыться. Запишите код. По нему в «Мои образы» забираете фото и ссылки. Это не регистрация. Звонков, смс и рекламы нет.",
  },
  {
    q: "Вы занесёте меня в базу и будете писать?",
    a: "Нет. Номер мы даже не спрашиваем — значит, некуда его «добавить» и некому потом звонить. Рассылок нет. Наш телефон внизу сайта — это поддержка, если нужно написать нам, а не сбор ваших контактов.",
  },
  {
    q: "Что делать, если пропал интернет или я случайно вышел с сайта?",
    a: "Не платите второй раз. Заказ уже на сервере.\n\nЕсли заказывали образы (Стандарт или Премиум) или «Причёска и уход»:\nШаг 1. Снова откройте stilist-ai.ru.\nШаг 2. Вверху нажмите «Мои образы».\nШаг 3. Введите код заказа, например СТИЛЬ-K7M2QX, и нажмите «Найти».\nШаг 4. Откройте нужный заказ — в списке отдельно преображение и причёска с уходом. Если генерация оборвалась, нажмите «Продолжить»: повторно платить не нужно. Результат хранится сутки.\n\nЕсли оплатили базу ногтей на месяц:\nШаг 1. Снова откройте сайт.\nШаг 2. Нажмите «Подобрать ногти».\nШаг 3. База должна открыться сама. Если каталог закрыт — не платите снова, напишите нам: внизу сайта почта и наш телефон поддержки.",
  },
  {
    q: "Оплатил, деньги списались, а образов нет. Что нажать?",
    a: "Шаг 1. Не нажимайте «Оплатить» повторно.\nШаг 2. Вверху сайта откройте «Мои образы».\nШаг 3. Введите код заказа СТИЛЬ-… → «Найти».\nШаг 4. В списке будут и одежда, и причёска с уходом. Если генерации нет — нажмите «Продолжить», оплата уже есть.\nШаг 5. Если через 15–20 минут заказа нет — напишите на почту gesper2004@mail.ru или по телефону поддержки 8 958 848-13-13, укажите время оплаты и код заказа. Мы найдём платёж.",
  },
  {
    q: "Как открыть готовый заказ в «Мои образы»?",
    a: "Шаг 1. Нажмите «Мои образы» вверху страницы (на смартфоне — в меню).\nШаг 2. Введите код заказа, например СТИЛЬ-K7M2QX, и нажмите «Найти».\nШаг 3. Выберите заказ в списке — «Стандарт»/«Премиум» откроет образы одежды, «Причёска и уход» откроет причёски. Если генерация не успела, нажмите «Продолжить».\n\nТак можно зайти с другого устройства или после очистки браузера. Хранение — сутки.",
  },
  {
    q: "Нужна ли регистрация, почта или пароль?",
    a: "Нет. Аккаунт, почта и пароль не нужны. Свой телефон не оставляете — его не будет ни в рассылке, ни в чужой базе. После оплаты сохраните код заказа СТИЛЬ-… — по нему найдёте образы. Имя — по желанию.",
  },
  {
    q: "Что я получаю на тарифе Стандарт (100 ₽)? Как заказать?",
    a: "За 100 ₽ вы видите себя в трёх образах, которых нет у всех в ленте. Стилист не копирует тренд «как у всех» — собирает лук под вашу внешность, цвет и фигуру. Поводы не выбираете: три свободных образа решает стилист. Сезон указываете сами — на каждый образ свой, например два лета и одна осень.\n\nВ каждом образе — ваше лицо, список вещей со ссылками на маркетплейсы (такие же или очень похожие) и советы по грумингу. Одно фото. Сутки в «Мои образы».\n\nКак заказать:\nШаг 1. «Начать преображение» или тариф Стандарт.\nШаг 2. Оплатить 100 ₽ — телефон не спрашиваем.\nШаг 3. Запишите код заказа СТИЛЬ-…, затем фото лица анфас, рост, вес и сезон на каждый из трёх образов.\nШаг 4. Обычно 2–4 минуты: три образа рисуются сразу.\nШаг 5. Смотрите, скачивайте, отправляйте. Закрыли сайт — «Мои образы» и тот же код.",
  },
  {
    q: "Что я получаю на тарифе Премиум (200 ₽)? Как заказать?",
    a: "Премиум — чтобы на свидании, в клубе или на фотосессии вас не спутали ни с кем. До пяти образов на вашем лице и 22 повода: отдых и пляж, фотосессия, клуб, ресторан, свидание, свадьба, офис, вечеринка, путешествие, театр, выпускной, корпоратив, романтический ужин… У каждого выбранного повода — счётчик, сколько луков на него. Всего не больше пяти. Можно смешать: два на свидание, один в клуб, два на отдых.\n\nПишете бюджет, например 5 000 ₽ — стилист собирает лук в этих деньгах и даёт ссылки на маркетплейсы. Не «как у всех в этом сезоне», а ваш. Дата рождения — по желанию, для астро-разбора. До трёх фото — чтобы посадка была вашей, не шаблонной. Сезон можно разный на каждый образ. Сутки в «Мои образы».\n\nКак заказать:\nШаг 1. Тариф Премиум.\nШаг 2. Оплатить 200 ₽ — телефон не спрашиваем.\nШаг 3. Запишите код СТИЛЬ-…, затем до трёх фото, рост, вес, сезон, поводы и бюджет.\nШаг 4. Обычно 4–7 минут: выбранные образы рисуются сразу.\nШаг 5. Фото + покупки — на экране и в «Мои образы».",
  },
  {
    q: "Что я получаю в «Причёска и уход» (100 ₽)? Как купить?",
    a: "Большинство стрижек в городе — одни и те же. Здесь вы видите себя с причёской, которая подчёркивает вас, а не «как у всех в этом сезоне».\n\nТри генерации сразу: ваше фото «до» и три кадра «после» — новая форма, цвет, более свежее лицо, как если уже пользоваться средствами ИИ-косметолога. К ним — уход и ссылки на маркетплейсы. Одно сравнение бесплатно.\n\nПолный пакет — 100 ₽:\nШаг 1. «Причёска и уход».\nШаг 2. Проба или оплата.\nШаг 3. Фото анфас, рост и вес.\nШаг 4. Три варианта сразу, обычно 2–5 минут. Скачайте, отправьте, откройте ссылки на уход.\n\nЗакрыли сайт — снова «Причёска и уход», без второй оплаты. Оплаченный результат хранится сутки.",
  },
  {
    q: "Что внутри базы маникюра за 500 ₽?",
    a: "Знакомый мастер может сказать: «кому такие ногти, все делают обычные». Именно поэтому база и нужна. Обычный нюд делает руки как у всех в очереди. Здесь — больше 450 дизайнов: тренды 2026 и сложные работы, которые в салоне сами редко предлагают. После них вас узнают по рукам.\n\nПоиск по цвету и стилю. К каждому дизайну — инструкция для вашего мастера: не «сделайте красиво», а как повторить задуманное. Скачали фото, отдали в салон — получили индивидуальность, не шаблон.\n\nБесплатно: квиз из 30 дизайнов и топ-3 под ваш вкус (фото можно скачать). Полные инструкции «Для мастера» и весь каталог — 30 дней за 500 ₽.\n\nШаг 1. «Подобрать ногти».\nШаг 2. Квиз бесплатно или «Открыть на месяц — 500 ₽».\nШаг 3. Каталог и инструкции ваши.\n\nОплатили и закрыли сайт — снова «Подобрать ногти». Не открылось — напишите нам, не платите второй раз.",
  },
  {
    q: "Что можно попробовать бесплатно?",
    a: "Чат со стилистом — сколько угодно текстом: гардероб, сочетания, аксессуары, причёска, маникюр. Можно прислать до 4 фото вещей из шкафа.\nОдно сравнение «до / после» в «Причёска и уход» — увидеть себя с новой причёской бесплатно.\nКвиз из 30 дизайнов в базе маникюра — топ-3 под вкус; инструкции для мастера открываются после оплаты месяца.\n\nПолные три или пять образов одежды на вашем лице — в Стандарте и Премиуме.",
  },
  {
    q: "Как пользоваться бесплатным чатом со стилистом?",
    a: "Нажмите «Чат со стилистом» и напишите, как подруге: «что надеть в ресторан», «эти джинсы с чем». Можно прикрепить до 4 фото из шкафа. Стилист ответит текстом — быстро, без оплаты.\n\nЕсли хочется уже увидеть себя в образе или с новой причёской — откройте Стандарт, Премиум или «Причёска и уход». Уход за лицом в чате не разбираем, это как раз в тарифе причёски.",
  },
  {
    q: "Какое фото нужно?",
    a: "Одинаковые правила для Стандарта, Премиума и «Причёски и ухода» — от этого зависит, узнаете ли вы себя на результате.\n\nНужно: чёткое фото лица анфас, взгляд в камеру, ровный свет, без очков, фильтров, тёмных теней и чужих лиц крупным планом. Волосы лучше не закрывать лицо. Формат JPG или PNG, до 50 МБ.\n\nПочему так:\n• анфас — стилист видит форму лица, линию роста волос и пропорции, иначе причёска и воротник «поедут»;\n• без очков и фильтров — стёкла и ретушь меняют глаза и кожу, нейросеть рисует уже не вас;\n• ровный свет без жёсткой тени — иначе «после» будет темнее или с пятнами, не похоже на вас;\n• одно лицо в кадре — иначе модель может «перепутать» людей;\n• на Премиуме 2–3 фото (по пояс или в рост в простой одежде) помогают точнее посадить длину брюк, пиджака и платья. Больше трёх фото загрузить нельзя.\n\nПлохое селфи из полутьмы часто даёт красивую картинку «похожего человека». Хорошее фото — вас в новом образе.",
  },
  {
    q: "Это будет моё лицо или «похожий человек»?",
    a: "Задача сервиса — сохранить вашу внешность и показать вас в новом образе, причёске или цвете волос. Рост и вес вы вводите сами, чтобы одежда сидела по фигуре.",
  },
  {
    q: "Зачем спрашивают рост и вес?",
    a: "Только чтобы подобрать длину, силуэт и пропорции одежды. Это не публикуется и не уходит в рекламу.",
  },
  {
    q: "Сколько ждать результат?",
    a: "Стандарт — обычно 2–4 минуты: три образа рисуются сразу. Премиум — обычно 4–7 минут, до пяти образов сразу. «Причёска и уход»: бесплатное сравнение — 1–2 минуты, полный пакет из трёх кадров — обычно 2–5 минут. На экране виден прогресс.\n\nВкладку лучше не закрывать специально. Если закрыли или пропал интернет — заказ не пропадает: откройте его как в вопросе про обрыв связи.",
  },
  {
    q: "Почему лучше выключить VPN?",
    a: "VPN иногда обрывает длинную генерацию: деньги уже списаны, а картинки не успели дойти. Это совет, не запрет. Если VPN нужен — оставьте. При обрыве откройте заказ по шагам выше, не оплачивая заново.",
  },
  {
    q: "Сохраняете ли вы мои фото?",
    a: "Ваши фото, рост и вес — только для вашего заказа. Мы не публикуем их, не продаём и не передаём другим людям. Не используем в рекламе и не показываем другим клиентам. Готовые образы лежат сутки в «Мои образы», чтобы вы сами могли их открыть. Потом заказ с сайта уходит.",
  },
  {
    q: "Как оплатить? Что если списали дважды?",
    a: "Картой на сайте, через защищённую оплату. После оплаты начинается генерация или открывается база ногтей.\n\nЕсли окно банка закрылось, а деньги ушли — не жмите «Оплатить» снова. Сначала «Мои образы» / «Причёска и уход» / «Подобрать ногти». Двойное списание — напишите нам с временем платежа, разберёмся.",
  },
  {
    q: "Будут ли ссылки, где купить одежду?",
    a: "Да, в Стандарте и Премиуме к каждому образу — список вещей со ссылками на маркетплейсы: такие же или очень похожие модели, которые можно сразу найти и купить. Если страница оборвалась, список лежит в том же заказе в «Мои образы». В «Причёска и уход» ИИ-косметолог даёт ссылки на средства ухода — тоже на маркетплейсы.",
  },
  {
    q: "Как скачать фото и отправить подруге?",
    a: "Под готовым образом есть кнопки скачать и «Поделиться»: Telegram, WhatsApp, VK, Одноклассники, MAX. В «Причёска и уход» можно скачать отдельно «до» и «после».",
  },
  {
    q: "Картинка не создалась или получилась плохо. Что делать?",
    a: "У готового образа нажмите «Повторить генерацию» — это не новая оплата, если заказ уже оплачен. В «Причёска и уход» у кадра «после» тоже есть повтор, если картинка не собралась. Проверьте, что фото было чётким и анфас. Не помогло — оставьте отзыв с Telegram или напишите на почту / телефон внизу сайта.",
  },
  {
    q: "Как ввести промокод?",
    a: "В окне тарифа нажмите «У меня есть промокод», введите код и «Применить». Для причёски — поле промокода в окне «Причёска и уход». Для ногтей — поле в каталоге. Код для образов не откроет причёску, и наоборот: сайт сам подскажет, если код от другого раздела.",
  },
  {
    q: "Результат не понравился. Куда писать?",
    a: "Внизу сайта: почта gesper2004@mail.ru и телефон 8 958 848-13-13. Либо кнопка отзыва после заказа — укажите Telegram, чтобы мы ответили. Для совета без новой картинки откройте бесплатный чат со стилистом.",
  },
];

const FAQ_SECTION_TITLES = new Set([
  "Образы одежды.",
  "Причёска и уход.",
  "База маникюра.",
  "Чат со стилистом.",
]);

function FaqLine({ line }: { line: string }) {
  const body = "text-[13px] md:text-[13.5px] text-charcoal/65 leading-relaxed break-words";
  const head = "font-serif font-semibold text-charcoal text-[16px] md:text-[18px] leading-snug";

  const step = line.match(/^(Шаг \d+\.)\s*(.*)$/);
  if (step) {
    return (
      <p className={body}>
        <span className="font-semibold text-charcoal text-[13.5px] md:text-sm">{step[1]} </span>
        {step[2]}
      </p>
    );
  }

  if (/^[^.]{2,80}:$/.test(line.trim())) {
    return <p className={`${head} pt-1`}>{line}</p>;
  }

  const firstDot = line.indexOf(". ");
  if (firstDot > 0 && firstDot <= 42) {
    const title = line.slice(0, firstDot + 1);
    const rest = line.slice(firstDot + 2);
    if (FAQ_SECTION_TITLES.has(title)) {
      return (
        <p className={body}>
          <span className={`block ${head} mb-1`}>{title.replace(/\.$/, "")}</span>
          {rest}
        </p>
      );
    }
  }

  return <p className={body}>{line}</p>;
}

function FaqAnswer({ text }: { text: string }) {
  return (
    <div className="pb-4 space-y-3">
      {text.split(/\n\n/).map((block, i) => (
        <div key={i} className="space-y-1.5">
          {block.split("\n").map((line, j) => (
            <FaqLine key={j} line={line} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HomeFaq() {
  return (
    <section id="faq" className="py-10 md:py-16 px-4 md:px-6 bg-ivory border-b border-charcoal/5 overflow-x-hidden">
      <div className="max-w-3xl mx-auto">
        <p className="font-sans font-medium text-gold text-[10px] md:text-xs tracking-[0.22em] md:tracking-[0.3em] uppercase mb-2 text-center">Подчеркните свою индивидуальность</p>
        <h2 className="text-[1.85rem] sm:text-4xl md:text-5xl font-serif font-semibold text-charcoal text-center mb-3 leading-tight">Часто задаваемые вопросы</h2>
        <p className="text-[13px] md:text-sm text-charcoal/55 text-center mb-6 md:mb-8 max-w-xl mx-auto leading-relaxed">
          Зачем быть не как все, что внутри тарифов и как забрать заказ, если пропал интернет.
        </p>
        <div className="flex flex-col gap-2">
          {HOME_FAQ.map((item, i) => (
            <details
              key={item.q}
              open={i === 3}
              className="group rounded-2xl border border-charcoal/10 bg-white px-3.5 md:px-5 py-1"
            >
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none py-3.5 md:py-4 text-left min-h-[48px] touch-manipulation [&::-webkit-details-marker]:hidden">
                <span className="font-serif font-semibold text-[16px] md:text-[19px] leading-snug text-charcoal">{item.q}</span>
                <ChevronDown className="w-5 h-5 text-gold shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <FaqAnswer text={item.a} />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- Main Landing Page ---
export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isMyLooksOpen, setIsMyLooksOpen] = useState(false);
  const [isNailsQuizOpen, setIsNailsQuizOpen] = useState(false);
  const [nailsInitialStep, setNailsInitialStep] = useState<"intro" | "catalog">("intro");
  const [isGroomingOpen, setIsGroomingOpen] = useState(false);
  const [isStylistChatOpen, setIsStylistChatOpen] = useState(false);
  const [groomingPaymentId, setGroomingPaymentId] = useState("");
  const [modalKey, setModalKey] = useState(0);
  const [currentTier, setCurrentTier] = useState<Tier>("standard");
  const [activeOrderId, setActiveOrderId] = useState(() => localStorage.getItem("pending_payment_id") || "");
  const [userName, setUserName] = useState(getSavedName);
  const [prices, setPrices] = useState({ standard: 100, premium: 200, nailsMonth: NAILS_MONTH_PRICE_RUB, grooming: 100 });
  const [ownerFree, setOwnerFree] = useState(false);
  const [recoveredResult, setRecoveredResult] = useState<any>(null);
  const [showProcessing, setShowProcessing] = useState(false);
  const processingDismissedRef = useRef(false);
  const isModalOpenRef = useRef(false);
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  // Статистика посещений + подтянуть историю стиля / заказы с сервера
  useEffect(() => {
    getOrCreateVisitorId();
    trackPage("home");
    syncStyleHistoryFromServer();
    const code = getSavedPickupCode();
    if (code) restoreOrdersByCode(code).catch(() => {});
  }, []);

  useEffect(() => {
    if (isPricingOpen) trackPage("pricing");
  }, [isPricingOpen]);
  useEffect(() => {
    isModalOpenRef.current = isModalOpen;
  }, [isModalOpen]);
  useEffect(() => {
    if (isModalOpen) trackPage(currentTier === "premium" ? "stylize_premium" : "stylize_standard");
  }, [isModalOpen, currentTier]);
  useEffect(() => {
    if (isGroomingOpen) trackPage("grooming");
  }, [isGroomingOpen]);
  useEffect(() => {
    if (isNailsQuizOpen) trackPage("nails");
  }, [isNailsQuizOpen]);
  useEffect(() => {
    if (isMyLooksOpen) trackPage("my_looks");
  }, [isMyLooksOpen]);
  useEffect(() => {
    if (isStylistChatOpen) trackPage("stylist_chat");
  }, [isStylistChatOpen]);

  // Telegram Mini App init
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      // Автозаполнение имени из Telegram если ещё не введено
      const tgUser = tg.initDataUnsafe?.user;
      const tgName = tgUser?.first_name;
      if (tgName && !getSavedName()) {
        saveName(tgName);
        setUserName(tgName);
      }
      // Обработка возврата после оплаты через Telegram start param
      const startParam = tg.initDataUnsafe?.start_param;
      if (startParam?.startsWith("paid_")) {
        const parts = startParam.split("_");
        const tier = parts[1];
        const paymentId = parts.slice(2).join("_");
        if (tier && paymentId) {
          if (tier === "grooming") {
            localStorage.setItem("grooming_payment_id", paymentId);
            localStorage.setItem("pending_payment_id", paymentId);
            localStorage.setItem("pending_payment_tier", "grooming");
            saveMyOrder({ paymentId, tier: "grooming", createdAt: Date.now() });
            setGroomingPaymentId(paymentId);
            setTimeout(() => setIsGroomingOpen(true), 500);
            return;
          }
          localStorage.setItem(`paid_${tier}_${paymentId}`, "true");
          localStorage.setItem("pending_payment_id", paymentId);
          localStorage.setItem("pending_payment_tier", tier === "premium" ? "premium" : "standard");
          saveMyOrder({ paymentId, tier: asSavedOrderTier(tier), createdAt: Date.now() });
          setActiveOrderId(paymentId);
          setCurrentTier(tier === "premium" ? "premium" : "standard");
          setTimeout(() => setIsModalOpen(true), 500);
        }
      }
    }
  }, []);

  useEffect(() => {
    const pin = new URLSearchParams(window.location.search).get("pin");
    if (pin) {
      fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      })
        .then((r) => r.json())
        .then((d) => { if (d?.ok || d?.ownerFree) setOwnerFree(true); })
        .catch(() => {});
    }
    fetch("/api/prices")
      .then(r => r.json())
      .then(d => {
        if (Number.isFinite(d.standard) && Number.isFinite(d.premium)) {
          setPrices({
            standard: d.standard,
            premium: d.premium,
            nailsMonth: Number.isFinite(d.nailsMonth) ? d.nailsMonth : NAILS_MONTH_PRICE_RUB,
            grooming: Number.isFinite(d.grooming) ? d.grooming : 100,
          });
        }
        if (d.ownerFree) setOwnerFree(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("payment_success") === "true") return;
    const pendingId = localStorage.getItem("pending_payment_id");
    const nailsPaymentId = loadNailsPaymentId();
    const pendingTier = localStorage.getItem("pending_payment_tier");

    // Восстановление оплаты базы ногтей на месяц (полная база 30 дней)
    if (pendingTier === "nails_month") {
      const paymentId = pendingId || nailsPaymentId;
      if (!paymentId) return;
      let cancelled = false;
      activateNailsMonthFromPayment(paymentId)
        .then((access) => {
          if (cancelled || !access) return;
          localStorage.removeItem("pending_payment_id");
          localStorage.removeItem("pending_payment_tier");
          setNailsInitialStep("catalog");
          setIsNailsQuizOpen(true);
          setToast({ message: "База ногтей открыта на месяц — полный доступ.", type: "success" });
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }

    if (pendingTier === "grooming" && pendingId) {
      localStorage.setItem("grooming_payment_id", pendingId);
      setGroomingPaymentId(pendingId);
      setIsGroomingOpen(true);
      return;
    }

    // Тихо восстанавливаем месяц, если токен пропал, а оплата была
    if (!loadNailsAccess() && nailsPaymentId) {
      activateNailsMonthFromPayment(nailsPaymentId).catch(() => {});
    }

    if (!pendingId) return;
    let cancelled = false;
    let opened = false;
    const tier = (pendingTier as Tier) || "standard";

    const checkOrder = async () => {
      try {
        const orderResponse = await fetch(`/api/order/${pendingId}`);
        if (!orderResponse.ok || cancelled) return;
        const order = await orderResponse.json();
        if (cancelled) return;

        if (order.tier === "grooming") {
          localStorage.setItem("grooming_payment_id", pendingId);
          localStorage.setItem("pending_payment_tier", "grooming");
          saveMyOrder({ paymentId: pendingId, tier: "grooming", createdAt: Date.now() });
          setGroomingPaymentId(pendingId);
          setIsGroomingOpen(true);
          return;
        }

        if (order.status === "expired") {
          setShowProcessing(false);
          setToast({ message: "Если вы оплатили этот заказ, откройте «Мои образы» — генерация должна сохраниться.", type: "info" });
          return;
        }

        setActiveOrderId(pendingId);
        if (order.status === "awaiting_input" && order.paid && !opened) {
          // Старый бесплатный заказ владельца не должен сразу открывать Стандарт —
          // пусть сначала выберут тариф.
          if (String(pendingId).startsWith("owner_")) return;
          opened = true;
          setCurrentTier(order.tier || tier);
          setModalKey(k => k + 1);
          setIsModalOpen(true);
          return;
        }

        if (order.status === "processing") {
          // Не накрывать форму генерации — иначе не видно «нажмите Сгенерировать ещё раз»
          if (!processingDismissedRef.current && !isModalOpenRef.current) setShowProcessing(true);
          return;
        }

        if (order.status === "ready" || order.status === "partial" || order.status === "failed") {
          const resultResponse = await fetch(`/api/result/${pendingId}`);
          const data = await resultResponse.json();
          if (cancelled) return;
          setShowProcessing(false);
          if (data.ready && data.looks && !opened) {
            opened = true;
            setCurrentTier(order.tier || tier);
            setRecoveredResult(data);
            setModalKey(k => k + 1);
            setIsModalOpen(true);
          } else if (order.status === "failed" && !opened) {
            opened = true;
            setCurrentTier(order.tier || tier);
            setModalKey(k => k + 1);
            setIsModalOpen(true);
            setToast({ message: "Генерация прервалась. Продолжите оплаченный заказ.", type: "info" });
          }
        }
      } catch {}
    };

    checkOrder();
    const timer = window.setInterval(checkOrder, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{message: string; type: 'success'|'error'|'info'}|null>(null);

  const copyTelegramChannelLink = async () => {
    try {
      await navigator.clipboard.writeText(TELEGRAM_CHANNEL_URL);
      trackClick("telegram_channel_copy");
      setToast({ message: "Ссылка скопирована — можно отправить знакомому", type: "success" });
    } catch {
      setToast({ message: `Скопируйте вручную: ${TELEGRAM_CHANNEL_URL}`, type: "info" });
    }
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), toast.message.includes("СТИЛЬ-") ? 9000 : 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const [selectedPricingTier, setSelectedPricingTier] = useState<Tier>("standard");

  const openModal = (tier?: PricingSelection) => {
    if (tier === "nails_month") {
      if (ownerFree) setNailsInitialStep("catalog");
      else setNailsInitialStep("intro");
      setIsNailsQuizOpen(true);
      return;
    }
    if (tier === "grooming") {
      trackClick("grooming");
      setIsGroomingOpen(true);
      return;
    }
    const t: Tier = tier === "premium"
      ? "premium"
      : tier === "standard"
        ? "standard"
        : ownerFree
          ? "premium"
          : "standard";
    setSelectedPricingTier(t);
    setIsPricingOpen(true);
  };

  const openNailsAfterUnlock = () => {
    setNailsInitialStep("catalog");
    setTimeout(() => setIsNailsQuizOpen(true), 200);
  };

  const openMyOrder = async (paymentId: string, tier: SavedOrderTier) => {
    try {
      setActiveOrderId(paymentId);
      const res = await fetch(`/api/result/${paymentId}`);
      const data = await res.json();
      const isGrooming = data.kind === "grooming" || tier === "grooming";
      if (data.expired) {
        removeMyOrder(paymentId);
        if (localStorage.getItem("pending_payment_id") === paymentId) {
          localStorage.removeItem("pending_payment_id");
          localStorage.removeItem("pending_payment_tier");
        }
        setToast({ message: "Срок хранения этих образов истёк (сутки после оплаты).", type: "info" });
        return;
      }
      if (isGrooming) {
        localStorage.setItem("grooming_payment_id", paymentId);
        localStorage.setItem("grooming_last_paid_job_id", paymentId);
        localStorage.setItem("pending_payment_id", paymentId);
        localStorage.setItem("pending_payment_tier", "grooming");
        saveMyOrder({ paymentId, tier: "grooming", createdAt: Date.now() });
        if (data.status === "processing" || data.grooming || data.ready) {
          localStorage.setItem("grooming_job_id", paymentId);
        } else {
          localStorage.removeItem("grooming_job_id");
        }
        setGroomingPaymentId(paymentId);
        setIsMyLooksOpen(false);
        setIsGroomingOpen(true);
        if (data.status === "awaiting_input") {
          setToast({ message: "Оплата на месте. Загрузите фото — повторно платить не нужно.", type: "info" });
        } else if (data.status === "failed" || data.status === "partial") {
          setToast({ message: "Генерация прервалась. Продолжите без новой оплаты.", type: "info" });
        }
        return;
      }
      if (data.ready && data.looks && data.status !== "processing") {
        setCurrentTier(tier === "premium" ? "premium" : "standard");
        setRecoveredResult({ ...data, paymentId });
        setModalKey(k => k + 1);
        setIsMyLooksOpen(false);
        setIsModalOpen(true);
        localStorage.setItem("pending_payment_id", paymentId);
        localStorage.setItem("pending_payment_tier", tier === "premium" ? "premium" : "standard");
      } else if (data.status === "awaiting_input" || data.status === "failed") {
        setCurrentTier(tier === "premium" ? "premium" : "standard");
        localStorage.setItem("pending_payment_id", paymentId);
        localStorage.setItem("pending_payment_tier", tier === "premium" ? "premium" : "standard");
        setModalKey(k => k + 1);
        setIsMyLooksOpen(false);
        setIsModalOpen(true);
      } else {
        setToast({ message: "Образы ещё генерируются. Можно закрыть сайт и вернуться позже.", type: "info" });
      }
    } catch {
      setToast({ message: "Не удалось загрузить образы. Попробуйте позже.", type: "error" });
    }
  };


  const handlePaid = (tier: Tier) => {
    setActiveOrderId(localStorage.getItem("pending_payment_id") || "");
    setCurrentTier(tier);
    setModalKey(k => k + 1);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Проверяем параметры оплаты из URL после возврата с YooKassa
    const paymentSuccess = params.get("payment_success");
    const paymentId = params.get("payment_id");
    const tier = params.get("tier");
    const paymentError = params.get("payment_error");
    const pickupFromUrl = params.get("pickup_code") || localStorage.getItem("pending_pickup_code") || "";
    if (pickupFromUrl) {
      savePickupCode(pickupFromUrl);
      localStorage.removeItem("pending_pickup_code");
    }
    const savedPickupLabel = displayPickupCode(normalizePickupCodeClient(pickupFromUrl) || getSavedPickupCode());

    if (paymentSuccess === "true" && paymentId && tier) {
      // База ногтей — месяц: полный доступ на 30 дней
      if (tier === "nails_month") {
        const nailsToken = params.get("nails_token");
        window.history.replaceState({}, "", "/");
        localStorage.removeItem("pending_payment_id");
        localStorage.removeItem("pending_payment_tier");
        saveNailsPaymentId(paymentId);

        const openFullMonthBase = (token: string, expiresAt: string | null) => {
          saveNailsAccess({ token, kind: "month", expiresAt });
          setNailsInitialStep("catalog");
          setToast({ message: "Оплата прошла! База ногтей открыта на месяц.", type: "success" });
          setTimeout(() => setIsNailsQuizOpen(true), 400);
        };

        // Сразу открываем по токену из редиректа, затем подтверждаем месяц через API
        if (nailsToken) {
          openFullMonthBase(nailsToken, null);
        }
        activateNailsMonthFromPayment(paymentId)
          .then((access) => {
            if (access) {
              saveNailsAccess(access);
              if (!nailsToken) openFullMonthBase(access.token, access.expiresAt);
            } else if (!nailsToken) {
              alert("Оплата прошла, но доступ к базе не открылся. Напишите в поддержку.");
            }
          })
          .catch(() => {
            if (!nailsToken) alert("Не удалось проверить оплату базы ногтей.");
          });
        return;
      }

      if (tier === "grooming") {
        window.history.replaceState({}, "", "/");
        localStorage.setItem("grooming_payment_id", paymentId);
        localStorage.setItem("pending_payment_id", paymentId);
        localStorage.setItem("pending_payment_tier", "grooming");
        saveMyOrder({ paymentId, tier: "grooming", createdAt: Date.now() });
        setGroomingPaymentId(paymentId);
        setToast({
          message: savedPickupLabel
            ? `Оплата прошла. Сохраните код ${savedPickupLabel} — причёска будет в «Мои образы».`
            : "Оплата прошла! Загрузите фото для 3 причёсок и ухода. Если окно закроется — откройте «Мои образы».",
          type: "success",
        });
        setTimeout(() => setIsGroomingOpen(true), 400);
        return;
      }

      // Оплата прошла успешно - открываем модальное окно загрузки
      localStorage.setItem(`paid_${tier}_${paymentId}`, "true");
      localStorage.setItem("pending_payment_id", paymentId);
      localStorage.setItem("pending_payment_tier", tier);
      saveMyOrder({ paymentId, tier: tier as Tier, createdAt: Date.now() });
      setActiveOrderId(paymentId);

      // Убираем параметры из URL
      window.history.replaceState({}, "", "/");

      if (savedPickupLabel) {
        setToast({ message: `Оплата прошла. Сохраните код ${savedPickupLabel}`, type: "success" });
      }

      // Открываем окно загрузки
      setCurrentTier(tier as Tier);
      setTimeout(() => {
        setIsModalOpen(true);
      }, 500);
      return;
    }

    if (paymentError) {
      window.history.replaceState({}, "", "/");
      setTimeout(() => {
        alert("Оплата не прошла. Попробуйте ещё раз.");
      }, 500);
      return;
    }

    // Проверяем token для реферальной ссылки
    const token = params.get("token");
    if (!token) return;
    fetch("/api/use-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          window.history.replaceState({}, "", "/");
          handlePaid(data.tier as Tier);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {showProcessing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-charcoal/80 backdrop-blur-sm">
          <div className="bg-ivory rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <p className="text-lg font-sans text-charcoal mb-3">Ваш заказ обрабатывается</p>
            <p className="text-charcoal/60 text-sm mb-6">Если образы уже собираются — подождите. Если видите ошибку или прошло больше пары минут — продолжите заказ, платить снова не нужно.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { processingDismissedRef.current = true; setShowProcessing(false); setCurrentTier((localStorage.getItem("pending_payment_tier") as Tier) || "standard"); setIsModalOpen(true); }} className="px-6 py-3 rounded-full bg-gold text-charcoal font-medium text-sm">
                Продолжить заказ
              </button>
              <button onClick={() => { processingDismissedRef.current = true; setShowProcessing(false); }} className="px-6 py-3 rounded-full bg-charcoal/10 text-charcoal font-medium text-sm">
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
      <PricingModal
        key={`${selectedPricingTier}-${ownerFree ? "owner" : "pay"}`}
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        onPaid={handlePaid}
        onNailsUnlocked={openNailsAfterUnlock}
        userName={userName}
        initialTier={selectedPricingTier}
        prices={prices}
        ownerFree={ownerFree}
      />
      <StylizeModal key={modalKey} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} userName={userName} tier={currentTier} orderPaymentId={activeOrderId || undefined} onToast={(msg, type) => setToast({message: msg, type})} onNewLooks={() => { setIsModalOpen(false); setTimeout(() => openModal(), 100); }} recoveredResult={recoveredResult} onRecoveredResultShown={() => setRecoveredResult(null)} onOpenLightbox={setLightbox} />
      <MyLooksModal
        isOpen={isMyLooksOpen}
        onClose={() => setIsMyLooksOpen(false)}
        onOpenOrder={openMyOrder}
        onClearAll={() => { /* список уже обновлён внутри */ }}
        onOrderAgain={() => openModal()}
      />
      <NailsQuizModal
        isOpen={isNailsQuizOpen}
        initialStep={nailsInitialStep}
        ownerFree={ownerFree}
        onClose={() => { setIsNailsQuizOpen(false); setNailsInitialStep("intro"); }}
      />
      <GroomingModal
        isOpen={isGroomingOpen}
        onClose={() => setIsGroomingOpen(false)}
        price={prices.grooming}
        paymentId={groomingPaymentId || undefined}
        ownerFree={ownerFree}
        onToast={(msg, type) => setToast({ message: msg, type })}
        onOpenLightbox={setLightbox}
      />
      <StylistChatModal
        isOpen={isStylistChatOpen}
        onClose={() => setIsStylistChatOpen(false)}
        onToast={(msg, type) => setToast({ message: msg, type })}
        onOpenTariffs={() => {
          setIsStylistChatOpen(false);
          setTimeout(() => {
            document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }}
      />

      {/* Lightbox — fullscreen image viewer */}
      <Lightbox state={lightbox} onClose={() => setLightbox(null)} onNavigate={(index) => setLightbox(s => s ? { ...s, index } : s)} />

      {/* 1. Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-ivory/70 backdrop-blur-lg border-b border-charcoal/5 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-serif text-lg md:text-2xl font-semibold tracking-tight text-charcoal">
              Твой личный стилист
            </div>
            {userName && (
              <span className="hidden md:block text-sm text-charcoal/40 font-light">
                С возвращением, {userName} ✨
              </span>
            )}
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex gap-6 text-sm font-medium text-charcoal/70">
              <a href="#faq" className="hover:text-charcoal transition-colors">Часто задаваемые вопросы</a>
              <a href="#how-it-works" className="hover:text-charcoal transition-colors">Как это работает</a>
              <a href="#lookbook" className="hover:text-charcoal transition-colors">Лукбук</a>
              <a href="#pricing" className="hover:text-charcoal transition-colors">Тарифы</a>
            </nav>
            <button
              onClick={() => { trackClick("my_looks"); setIsMyLooksOpen(true); }}
              className="text-sm font-medium text-charcoal/70 hover:text-charcoal transition-colors"
            >
              Мои образы
            </button>
            <button
              onClick={() => { trackClick("stylist_chat"); setIsStylistChatOpen(true); }}
              className="text-sm font-medium text-charcoal/70 hover:text-charcoal transition-colors inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5 text-gold" />
              Чат со стилистом
            </button>
            <div className="inline-flex items-center rounded-full border border-gold/30 bg-gold/5 overflow-hidden">
              <a
                href={TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick("telegram_channel")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal/80 hover:text-charcoal hover:bg-gold/10 px-3.5 py-2 transition-colors"
                title="Открыть Telegram-канал"
              >
                <Send className="w-3.5 h-3.5 text-gold" />
                Telegram
              </a>
              <button
                type="button"
                onClick={copyTelegramChannelLink}
                className="inline-flex items-center gap-1 text-sm font-medium text-charcoal/70 hover:text-charcoal hover:bg-gold/10 px-3 py-2 border-l border-gold/25 transition-colors"
                title="Скопировать ссылку на канал"
                aria-label="Скопировать ссылку на канал"
              >
                <Copy className="w-3.5 h-3.5 text-gold" />
                <span className="hidden lg:inline">Ссылка</span>
              </button>
            </div>
            <button
              onClick={() => { trackClick("create_look"); openModal(); }}
              className="bg-charcoal text-ivory px-6 py-2.5 rounded-full text-sm font-medium hover:bg-charcoal/90 transition-colors"
            >
              Создать образ
            </button>
          </div>

          {/* Mobile: Telegram сразу видно при входе + меню */}
          <div className="md:hidden flex items-center gap-2">
            <div className="inline-flex items-center rounded-full border border-gold/35 bg-gold/10 overflow-hidden">
              <a
                href={TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick("telegram_channel")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-charcoal px-3 py-2"
                aria-label="Открыть Telegram-канал"
              >
                <Send className="w-3.5 h-3.5 text-gold" />
                Telegram
              </a>
              <button
                type="button"
                onClick={copyTelegramChannelLink}
                className="inline-flex items-center px-2.5 py-2 border-l border-gold/25"
                aria-label="Скопировать ссылку на канал"
                title="Скопировать ссылку"
              >
                <Copy className="w-3.5 h-3.5 text-gold" />
              </button>
            </div>
            <button
              className="p-2 text-charcoal"
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Меню"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="md:hidden bg-ivory border-t border-charcoal/5 px-4 py-3 flex flex-col gap-1 max-h-[calc(100svh-5rem)] overflow-y-auto"
            >
              <a href="#faq" onClick={() => setMenuOpen(false)} className="text-charcoal font-medium py-3 border-b border-charcoal/5">Часто задаваемые вопросы</a>
              <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-charcoal font-medium py-3 border-b border-charcoal/5">Как это работает</a>
              <a href="#lookbook" onClick={() => setMenuOpen(false)} className="text-charcoal font-medium py-3 border-b border-charcoal/5">Лукбук</a>
              <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-charcoal font-medium py-3 border-b border-charcoal/5">Тарифы</a>
              <button
                onClick={() => { trackClick("my_looks"); setMenuOpen(false); setIsMyLooksOpen(true); }}
                className="text-left text-charcoal font-medium py-3 border-b border-charcoal/5"
              >
                Мои образы
              </button>
              <button
                onClick={() => { trackClick("stylist_chat"); setMenuOpen(false); setIsStylistChatOpen(true); }}
                className="text-left text-charcoal font-medium py-3 border-b border-charcoal/5 inline-flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-gold" />
                Чат со стилистом
              </button>
              <button
                onClick={() => { setMenuOpen(false); openModal(); }}
                className="bg-charcoal text-ivory px-6 py-3 rounded-full text-sm font-medium w-full mt-1"
              >
                Создать образ
              </button>
              <button
                onClick={() => { setMenuOpen(false); setIsGroomingOpen(true); }}
                className="border border-gold/40 text-charcoal px-6 py-3 rounded-full text-sm font-medium w-full mt-1 flex items-center justify-center gap-2"
              >
                <Scissors className="w-4 h-4 text-gold" />
                Причёска и уход
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 2. Hero Section — full height, text centered, Gucci background */}
      <section className="relative min-h-[100svh] flex items-center justify-center px-4 md:px-6 overflow-x-hidden pt-24 pb-10">
        {/* Background image */}
        <picture className="absolute inset-0 overflow-hidden">
          <source media="(max-width: 767px)" srcSet="/hero-mobile.webp" type="image/webp" />
          <img
            src="/hero-desktop.webp"
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            width={1920}
            height={1072}
            className="w-full h-full object-cover object-center"
          />
        </picture>
        {/* Overlay — центр тёмнее для читаемости, края прозрачнее */}
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/60 via-charcoal/50 to-charcoal/70" />

        <div className="relative text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            <p className="font-sans font-medium text-gold text-[10px] md:text-xs tracking-[0.2em] md:tracking-[0.4em] uppercase mb-5 md:mb-6">Подчеркните свою индивидуальность</p>
            <h1 className="text-[2.15rem] sm:text-5xl md:text-7xl lg:text-8xl font-semibold leading-[1.08] mb-5 md:mb-8 text-ivory max-w-full">
              Увидь свою <br />
              <span className="italic text-gold">лучшую версию.</span>
            </h1>
            <p className="text-[14px] md:text-xl text-ivory/70 mb-5 md:mb-6 leading-relaxed font-light max-w-2xl mx-auto">
              Не как все в ленте и не как все в салоне. Стилист, причёска и маникюр — под вас. Загрузите чёткое фото лица: рост и вес нужны, чтобы одежда села по фигуре.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center flex-wrap">
              <button
                onClick={() => { trackClick("start_transform"); openModal(); }}
                className="bg-gold text-charcoal px-8 py-3 sm:py-4 rounded-full text-base font-semibold hover:bg-gold/90 transition-all flex items-center justify-center gap-2 group"
              >
                Начать преображение
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => { trackClick("grooming"); setIsGroomingOpen(true); }}
                className="bg-gold text-charcoal px-8 py-3 sm:py-4 rounded-full text-base font-semibold hover:bg-gold/90 transition-all flex items-center justify-center gap-2 group"
              >
                <Scissors className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Причёска и уход
              </button>
              <button
                onClick={() => { trackClick("nails"); if (ownerFree) setNailsInitialStep("catalog"); setIsNailsQuizOpen(true); }}
                className="bg-gold text-charcoal px-8 py-3 sm:py-4 rounded-full text-base font-semibold hover:bg-gold/90 transition-all flex items-center justify-center gap-2 group"
              >
                <Heart className="w-4 h-4 fill-charcoal/20 group-hover:scale-110 transition-transform" />
                Подобрать ногти
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center">
              <button
                onClick={() => { trackClick("stylist_chat"); setIsStylistChatOpen(true); }}
                className="bg-white text-charcoal px-8 py-3 sm:py-3.5 rounded-full text-base font-semibold hover:bg-ivory transition-all flex items-center justify-center gap-2 group shadow-lg shadow-charcoal/20"
              >
                <MessageCircle className="w-4 h-4 text-gold group-hover:scale-110 transition-transform" />
                Чат со стилистом
              </button>
              <p className="text-xs sm:text-sm text-ivory/55 mt-3 text-center font-light max-w-md leading-relaxed">
                Бесплатная текстовая консультация: гардероб и сочетания, аксессуары, причёска и цвет волос, маникюр. Можно прикрепить фото вещей из шкафа. Уход за лицом и другие темы — не консультируем.
              </p>
            </div>

            <p className="text-xs sm:text-sm text-ivory/45 mt-4 text-center font-light">Если включён VPN — лучше выключить: так результат дойдёт спокойнее</p>
            <a href="#faq" className="inline-block mt-3 text-xs sm:text-sm text-gold/90 hover:text-gold underline underline-offset-4">
              Номер не берём, как найти заказ по коду и что если пропал интернет — ответы здесь
            </a>
          </motion.div>
        </div>
      </section>

      <HomeFaq />

      {/* 3. Lookbook — сразу после hero */}
      <section id="lookbook" className="py-16 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4"
          >
            <div>
              <h2 className="text-[1.85rem] md:text-5xl font-semibold mb-3 leading-tight">Работы нашего стилиста</h2>
              <p className="text-charcoal/60 text-sm md:text-lg font-light">Примеры генераций нашего ИИ-стилиста.</p>
            </div>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {GALLERY_IMAGES.map((src, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: idx * 0.05 }} className="overflow-hidden rounded-2xl aspect-[3/4]">
                <button type="button" onClick={() => setLightbox({ images: GALLERY_IMAGES.map(s => ({ src: s, alt: 'Образ стилиста' })), index: idx })} className="block w-full h-full touch-manipulation cursor-zoom-in">
                  <img src={src} alt={`Образ ${idx + 1}`} loading="lazy" decoding="async" width={597} height={800} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. How it works */}
      <section id="how-it-works" className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-[1.85rem] md:text-5xl font-semibold mb-4 leading-tight">Как это работает</h2>
            <p className="text-charcoal/60 text-sm md:text-lg max-w-2xl mx-auto font-light">
              Три простых шага к вашему новому безупречному стилю.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-8 mb-16 md:mb-20">
            {[
              { icon: Smartphone, title: "Загрузите фото", desc: "Чёткое фото лица анфас, хорошее освещение, нейтральный фон — без очков, фильтров и теней." },
              { icon: Sparkles, title: "Нейросеть анализирует", desc: "ИИ обучен на миллионах образов от ведущих дизайнеров и подиумов. Учитывает тип фигуры, цветотип и тренды 2026 — подбирает только то, что работает именно для вас." },
              { icon: Shirt, title: "Получите капсулу", desc: "3 готовых образа с подробным разбором одежды, обуви и аксессуаров." }
            ].map((step, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15 }}
                className="p-8 border border-charcoal/10 rounded-2xl hover:border-gold/30 transition-colors bg-ivory/30"
              >
                <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center mb-6 text-gold">
                  <step.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg md:text-xl font-serif font-semibold mb-3">{step.title}</h3>
                <p className="text-[13px] md:text-base text-charcoal/70 leading-relaxed font-light">{step.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Magic Mirror — интерактивная демонстрация трансформации */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-lg mx-auto"
          >
            <p className="text-center text-charcoal/50 text-sm uppercase tracking-widest mb-6 font-medium">Сдвиньте, чтобы увидеть разницу</p>
            <div className="relative">
              <div className="absolute -inset-6 bg-gold/8 blur-2xl rounded-full" />
              <MagicMirror />
            </div>
          </motion.div>
        </div>
      </section>

      {/* 5. Pricing & Final CTA */}
      {/* Reviews */}
      <section className="py-24 px-6 bg-ivory/50">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-[1.85rem] md:text-5xl font-semibold mb-4 leading-tight">Отзывы</h2>
            <p className="text-charcoal/60 text-sm md:text-lg max-w-2xl mx-auto font-light">
              Наши клиенты уже преобразились
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "Марина К.",
                city: "Москва",
                text: "Заказала образ для собеседования. Результат поразил — получила job! Стилист учёл и тип фигуры, и цветотип. Теперь всегда обращаюсь перед важными мероприятиями.",
                avatar: "МК",
                stars: 5
              },
              {
                name: "Дмитрий В.",
                city: "Санкт-Петербург",
                text: "Долго не мог подобрать свой стиль. За 15 минут получил 3 готовых образа — все под моё телосложение. Жена в восторге, говорит выгляжу на миллион!",
                avatar: "ДВ",
                stars: 5
              },
              {
                name: "Анна С.",
                city: "Екатеринбург",
                text: "Наконец-то нашла сервис, где не нужно мерять 50 вещей в магазине. Сгенерированные образы — это магия. Всё подошло идеально с первой попытки.",
                avatar: "АС",
                stars: 5
              },
            ].map((review, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl p-8 shadow-sm border border-charcoal/5 hover:shadow-lg transition-shadow"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(review.stars)].map((_, j) => (
                    <Star key={j} className="w-5 h-5 text-gold fill-gold" />
                  ))}
                </div>
                <p className="text-[13px] md:text-base text-charcoal/80 leading-relaxed mb-6">{review.text}</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold to-charcoal flex items-center justify-center text-white font-medium">
                    {review.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-charcoal">{review.name}</p>
                    <p className="text-sm text-charcoal/50">{review.city}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 px-6 bg-charcoal text-ivory">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-[1.85rem] md:text-5xl font-semibold mb-4 leading-tight text-white">Инвестируй в себя</h2>
            <p className="text-ivory/60 text-sm md:text-lg max-w-2xl mx-auto font-light">
              Выберите формат преображения, который подходит именно вам.
            </p>
            <p className="text-ivory/45 text-sm max-w-xl mx-auto mt-3 font-light">
              Номер не спрашиваем и в базы не кладём. После оплаты будет код СТИЛЬ-… — по нему откроете образы, если связь оборвётся. Личное пространство остаётся вашим.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-8">
            {[
              {
                title: "Премиум",
                tier: "premium" as PricingSelection,
                price: `${prices.premium} ₽`,
                desc: "Образы под ваш повод, бюджет и знак зодиака.",
                features: [
                  "До 3 фото для анализа внешности",
                  "До 5 образов на ваш выбор",
                  "22 мероприятия (свадьба, романтик, вечеринка…)",
                  "Образ на указанную сумму (бюджет)",
                  "Астро-разбор вашего знака зодиака",
                  "ИИ-визуализация с вашим лицом",
                  "Список вещей со ссылками на магазины",
                  "Результат хранится сутки",
                ],
                highlighted: true,
                badge: "Популярный",
              },
              {
                title: "Стандарт",
                tier: "standard" as PricingSelection,
                price: `${prices.standard} ₽`,
                desc: "Три готовых образа от стилиста с визуализацией.",
                features: [
                  "1 фото для анализа внешности",
                  "3 свободных образа от стилиста",
                  "Сезон можно разный на каждый образ",
                  "ИИ-визуализация каждого образа с вашим лицом",
                  "Подбор цвета и стиля под вас",
                  "Список вещей со ссылками на магазины",
                  "Советы по грумингу и парфюму",
                  "Результат хранится сутки",
                ],
                highlighted: false,
                badge: null as string | null,
              },
              {
                title: "Причёска и уход",
                tier: "grooming" as PricingSelection,
                price: `${prices.grooming} ₽`,
                desc: "Причёска, цвет, уход и макияж — чтобы выглядеть моложе уже сегодня.",
                features: [
                  "3 варианта причёски и цвета под ваше лицо",
                  "Сравнение «до / после» на каждом варианте",
                  "«До» — ваше фото; «после» — новая причёска, лучшая одежда и свежее лицо",
                  "Разбор лица: что старит взгляд и что возвращает свежесть",
                  "Уход утро/вечер с брендами и ссылками на магазины",
                  "Макияж для женщин или лёгкий freshen-up для мужчин",
                  "Можно сначала попробовать 1 сравнение бесплатно",
                ],
                highlighted: false,
                badge: null as string | null,
              },
            ].map((plan, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.12 }}
                className={`p-8 rounded-3xl flex flex-col ${plan.highlighted ? 'bg-gold/10 border-2 border-gold relative transform md:-translate-y-4' : 'bg-white/5 border border-white/10'}`}
              >
                {plan.highlighted && plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gold text-charcoal px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-2xl font-serif font-semibold mb-2 text-white">{plan.title}</h3>
                <div className="text-3xl md:text-4xl font-semibold mb-4 text-gold">{plan.price}</div>
                <p className="text-ivory/60 text-[13px] md:text-sm mb-8">{plan.desc}</p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-ivory/80">
                      <Check className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={() => openModal(plan.tier)}
                  className={`w-full py-4 rounded-full text-sm font-medium transition-colors ${plan.highlighted ? 'bg-gold text-charcoal hover:bg-gold/90' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  Выбрать тариф
                </button>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative max-w-3xl mx-auto mb-16 p-8 rounded-3xl bg-white/5 border border-white/10"
          >
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-ivory/15 text-gold border border-gold/40 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
              на месяц
            </div>
            <div className="flex flex-col md:flex-row md:items-start gap-8">
              <div className="md:w-56 shrink-0">
                <h3 className="text-2xl font-serif font-semibold mb-2 text-white">База ногтей</h3>
                <div className="text-3xl md:text-4xl font-semibold mb-3 text-gold">{prices.nailsMonth} ₽</div>
                <p className="text-ivory/60 text-[13px] md:text-sm">Месяц доступа ко всей базе маникюра и инструкциям для мастера.</p>
              </div>
              <ul className="space-y-3 flex-1">
                {[
                  "Вся база дизайнов без лимита на месяц",
                  "Поиск и фильтры по цвету и стилю",
                  "Полные инструкции «Для мастера» к каждому дизайну",
                  "Квиз: топ-3 дизайна под ваш вкус",
                  "Скачивание фото для маникюра",
                ].map((feat) => (
                  <li key={feat} className="flex items-center gap-3 text-sm text-ivory/80">
                    <Check className="w-4 h-4 text-gold shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => openModal("nails_month")}
                className="w-full md:w-auto md:self-end shrink-0 px-8 py-4 rounded-full text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                Выбрать тариф
              </button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <button
              onClick={() => openModal()}
              className="bg-ivory text-charcoal px-10 py-5 rounded-full text-lg font-medium hover:bg-white transition-all hover:scale-105 flex items-center justify-center gap-2 mx-auto group"
            >
              Начать преображение
              <Sparkles className="w-5 h-5 text-gold group-hover:rotate-12 transition-transform" />
            </button>
            <p className="text-xs sm:text-sm text-ivory/45 mt-3 text-center font-light">Если включён VPN — лучше выключить: так результат дойдёт спокойнее</p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-charcoal/10 text-center text-sm text-charcoal/70">
        <p>© 2026 Твой личный стилист. Все права защищены.</p>
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick("telegram_channel_footer")}
            className="inline-flex items-center gap-1.5 text-charcoal hover:text-charcoal/80 font-medium"
          >
            <Send className="w-3.5 h-3.5 text-gold" />
            Telegram {TELEGRAM_CHANNEL_HANDLE}
          </a>
          <span className="hidden sm:inline text-charcoal/30">·</span>
          <button
            type="button"
            onClick={copyTelegramChannelLink}
            className="inline-flex items-center gap-1.5 text-charcoal/80 hover:text-charcoal underline underline-offset-2 decoration-gold/50"
          >
            <Copy className="w-3.5 h-3.5 text-gold" />
            Скопировать ссылку на канал
          </button>
        </div>
        <p className="mt-2 text-xs text-charcoal/45 select-all">{TELEGRAM_CHANNEL_URL}</p>
        <div className="mt-4 space-y-1">
          <p>ИП Черданцев А.В.</p>
          <p>ИНН 222304889746</p>
          <p>📧 gesper2004@mail.ru | 📞 89588481313</p>
        </div>
      </footer>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg text-sm font-medium tracking-wide text-ivory"
            style={{ backgroundColor: toast.type === 'error' ? '#c62828' : toast.type === 'success' ? '#2e7d32' : '#1a1a1a' }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
