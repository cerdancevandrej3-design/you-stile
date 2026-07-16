/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Smartphone, Sparkles, Shirt, ArrowRight, Check, ChevronLeft, ChevronRight, Upload, X, ShoppingBag, AlertCircle, Camera, Download, Star, Share2, Heart } from 'lucide-react';

// --- Category emoji mapping ---
const CATEGORY_EMOJI: Record<string, string> = {
  "верх": "👕", "верхняя одежда": "🧥", "низ": "👖",
  "обувь": "👟", "сумка": "👜", "украшения": "💍",
  "аксессуары": "🧣", "головной убор": "🧢",
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
  "пиджак": { bg: "bg-stone-200", text: "text-stone-900", border: "border-stone-400" },
  "платье": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  "брюки": { bg: "bg-blue-100", text: "text-blue-900", border: "border-blue-300" },
  "юбка": { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-300" },
  "аксессуар": { bg: "bg-purple-100", text: "text-purple-900", border: "border-purple-300" },
};
const getCategoryStyle = (cat: string) => CATEGORY_STYLES[cat.toLowerCase()] || { bg: "bg-charcoal", text: "text-ivory", border: "border-gold" };

const getDetailSectionKey = (header: string) => {
  const lower = header.toLowerCase();
  if (lower.includes("концепц")) return "концепци";
  if (lower.includes("одежд") || lower.includes("верх") || lower.includes("пиджак") || lower.includes("платье") || lower.includes("брюки") || lower.includes("юбка")) return "одежд";
  if (lower.includes("обув")) return "обув";
  if (lower.includes("аксесс")) return "аксессуар";
  if (lower.includes("украш")) return "аксессуар";
  if (lower.includes("причёск") || lower.includes("причес")) return "причёск";
  if (lower.includes("груминг")) return "груминг";
  if (lower.includes("парф")) return "аромат";
  if (lower.includes("почему")) return "почему";
  if (lower.includes("совет")) return "совет";
  if (lower.includes("покуп")) return "покупк";
  return "";
};

const getDetailSectionEmoji = (header: string) => {
  const lower = header.toLowerCase();
  if (lower.includes("концепц")) return "🎨";
  if (lower.includes("пиджак") || lower.includes("верх") || lower.includes("платье") || lower.includes("брюки") || lower.includes("юбка") || lower.includes("одежд")) return "👕";
  if (lower.includes("обув")) return "👟";
  if (lower.includes("аксесс")) return "💎";
  if (lower.includes("украш")) return "💍";
  if (lower.includes("причёск") || lower.includes("причес")) return "💇";
  if (lower.includes("парф")) return "🌸";
  if (lower.includes("почему")) return "✨";
  if (lower.includes("совет") || lower.includes("покуп")) return "🛍";
  return "🎨";
};

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
  "/gallery/gen1.jpg","/gallery/gen2.jpg","/gallery/gen3.jpg","/gallery/gen4.jpg",
  "/gallery/gen5.jpg","/gallery/gen6.jpg","/gallery/gen7.jpg","/gallery/gen8.jpg",
  "/gallery/gen9.jpg","/gallery/gen10.jpg","/gallery/gen11.jpg","/gallery/gen12.jpg",
];
function getActiveStageIndex(s: number): number {
  for (let i = PROGRESS_STAGES.length - 1; i >= 0; i--) {
    if (s >= PROGRESS_STAGES[i].step) return i;
  }
  return 0;
}

// --- localStorage helpers ---
type Tier = "standard" | "premium";
function getSavedName(): string { return localStorage.getItem("you-stile-user-name") || ""; }
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
  // Keep last 9 look names
  const all = [...getPastLooks(), ...looks].slice(-9);
  localStorage.setItem("you-stile-past-looks", JSON.stringify(all));
}
function saveName(name: string) {
  if (!localStorage.getItem("you-stile-user-id")) {
    localStorage.setItem("you-stile-user-id", crypto.randomUUID());
  }
  localStorage.setItem("you-stile-user-name", name.trim());
}

// --- My paid orders (persistent access to recovered looks) ---
type MyOrder = { paymentId: string; tier: Tier; createdAt: number; thumbnail?: string };
function getMyOrders(): MyOrder[] {
  try { return JSON.parse(localStorage.getItem("you-stile-my-orders") || "[]"); } catch { return []; }
}
function saveMyOrder(order: MyOrder) {
  const all = getMyOrders().filter(o => o.paymentId !== order.paymentId);
  all.push(order);
  localStorage.setItem("you-stile-my-orders", JSON.stringify(all.slice(-20)));
}
function updateMyOrderThumbnail(paymentId: string, thumbnail: string) {
  const all = getMyOrders().map(o => o.paymentId === paymentId ? { ...o, thumbnail } : o);
  localStorage.setItem("you-stile-my-orders", JSON.stringify(all.slice(-20)));
}
function removeMyOrder(paymentId: string) {
  const all = getMyOrders().filter(o => o.paymentId !== paymentId);
  localStorage.setItem("you-stile-my-orders", JSON.stringify(all));
}
function clearMyOrders() {
  localStorage.removeItem("you-stile-my-orders");
  localStorage.removeItem("pending_payment_id");
  localStorage.removeItem("pending_payment_tier");
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("paid_")) localStorage.removeItem(k);
  }
}

// --- Welcome Screen ---
const WelcomeScreen = ({ onSubmit }: { onSubmit: (name: string) => void }) => {
  const [nameInput, setNameInput] = useState("");
  const handle = () => { if (nameInput.trim()) onSubmit(nameInput.trim()); };
  return (
    <motion.div
      initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.7, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] bg-charcoal/80 backdrop-blur-md flex flex-col items-center justify-center px-6 overflow-y-auto py-10"
    >
      <p className="font-serif text-gold text-xs tracking-[0.3em] uppercase mb-8">Ваш личный стилист</p>
      <h1 className="font-serif text-ivory text-3xl md:text-4xl text-center mb-3">Добрый день ✨</h1>
      <p className="text-ivory/50 text-center mb-10 font-light text-lg">Как мне к вам обращаться?</p>
      <input
        autoFocus value={nameInput}
        onChange={e => setNameInput(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handle()}
        placeholder="Ваше имя"
        className="w-full max-w-xs px-5 py-3 rounded-full bg-white/10 text-ivory placeholder:text-ivory/30 border border-ivory/20 focus:outline-none focus:border-gold text-center text-lg mb-4"
      />
      <button onClick={handle} disabled={!nameInput.trim()}
        className="px-10 py-3 rounded-full bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors disabled:opacity-30">
        Продолжить
      </button>
    </motion.div>
  );
};

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
        src="/after.jpg"
        alt="Before: Casual Home Clothes"
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />

      {/* After Image (Top, Clipped) */}
      <img
        src="/before.jpg"
        alt="After: Premium Styled Look"
        loading="lazy"
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
      body: JSON.stringify({ tier }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          alert("Ошибка оплаты: " + d.error);
        } else {
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
  }, [isOpen, tier]);

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
          <p className="font-serif text-gold text-xs tracking-[0.3em] uppercase mb-2">Оплата</p>
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

// --- Trial Modal — бесплатный анализ ---
const TrialModal = ({ isOpen, onClose }: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [trialFiles, setTrialFiles] = useState<File[]>([]);
  const [trialPreviewUrls, setTrialPreviewUrls] = useState<string[]>([]);
  const [trialHeight, setTrialHeight] = useState("");
  const [trialWeight, setTrialWeight] = useState("");
  const [trialResult, setTrialResult] = useState<{ greetingAndAnalysis: string } | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialStep, setTrialStep] = useState(0);
  const trialFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setTrialFiles([]);
      setTrialPreviewUrls([]);
      setTrialHeight("");
      setTrialWeight("");
      setTrialResult(null);
      setTrialError(null);
      setTrialLoading(false);
      setTrialStep(0);
    }
  }, [isOpen]);

  const handleTrialFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setTrialFiles(newFiles.slice(0, 3));
      setTrialPreviewUrls(newFiles.slice(0, 3).map(file => URL.createObjectURL(file)));
    }
  };

  const handleTrialSubmit = async () => {
    if (trialFiles.length === 0 || !trialHeight || !trialWeight) return;
    setTrialLoading(true);
    setTrialError(null);
    setTrialStep(1);

    const formData = new FormData();
    trialFiles.forEach(file => formData.append("photos", file));
    formData.append("height", trialHeight);
    formData.append("weight", trialWeight);
    formData.append("trial", "true");

    setTrialStep(2);

    try {
      const response = await fetch("/api/trial", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Ошибка сервера");
      const data = await response.json();
      setTrialStep(3);
      setTrialResult(data);
    } catch (err: any) {
      setTrialError(err.message || "Что-то пошло не так");
    } finally {
      setTrialLoading(false);
    }
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
          className="bg-ivory w-full max-w-[1400px] rounded-3xl shadow-2xl p-8 relative overflow-auto max-h-[90vh]"
        >
          <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-charcoal/5 rounded-full hover:bg-charcoal/10">
            <X className="w-5 h-5 text-charcoal" />
          </button>

          <p className="font-serif text-gold text-xs tracking-[0.3em] uppercase mb-2">Бесплатный анализ</p>
          <h2 className="text-2xl font-serif text-charcoal mb-6">Узнайте свой стиль</h2>

          {!trialResult ? (
            <>
              <p className="text-sm text-charcoal/60 mb-6">
                Чёткое фото лица при хорошем освещении — для максимального сходства в генерациях
              </p>

              <div className="flex gap-3 mb-6">
                <div className="flex-1">
                  <label className="text-xs text-charcoal/60 mb-1 block">Рост (см)</label>
                  <input
                    type="number"
                    value={trialHeight}
                    onChange={(e) => setTrialHeight(e.target.value)}
                    placeholder="Например, 175"
                    className="w-full px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-charcoal/60 mb-1 block">Вес (кг)</label>
                  <input
                    type="number"
                    value={trialWeight}
                    onChange={(e) => setTrialWeight(e.target.value)}
                    placeholder="Например, 65"
                    className="w-full px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold"
                  />
                </div>
              </div>

              {trialPreviewUrls.length === 0 ? (
                <div
                  onClick={() => trialFileInputRef.current?.click()}
                  className="border-2 border-dashed border-charcoal/20 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-gold/5 transition-all mb-6"
                >
                  <Camera className="w-6 h-6 text-charcoal/30 mb-1" />
                  <p className="text-xs text-charcoal/50">Загрузить фото</p>
                </div>
              ) : (
                <div className="flex gap-2 mb-6">
                  {trialPreviewUrls.map((url, idx) => (
                    <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden relative">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => {
                          setTrialFiles(files => files.filter((_, i) => i !== idx));
                          setTrialPreviewUrls(urls => urls.filter((_, i) => i !== idx));
                        }}
                        className="absolute top-0.5 right-0.5 bg-charcoal/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={trialFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleTrialFileSelect}
                className="hidden"
              />

              {trialError && (
                <p className="text-red-500 text-sm mb-4">{trialError}</p>
              )}

              <button
                onClick={handleTrialSubmit}
                disabled={trialLoading || trialFiles.length === 0 || !trialHeight || !trialWeight}
                className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50"
              >
                {trialLoading ? "Анализируем..." : "Получить бесплатный анализ"}
              </button>

              {trialLoading && (
                <div className="mt-4">
                  <div className="w-full bg-charcoal/10 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-gold rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: trialStep === 1 ? "33%" : trialStep === 2 ? "66%" : "100%" }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-xs text-charcoal/50 mt-2 text-center">
                    {trialStep === 1 ? "Отправка данных..." : trialStep === 2 ? "Анализ фото..." : "Загрузка..."}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-gold/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-gold" />
              </div>
              <h3 className="text-xl font-serif text-charcoal mb-4">Анализ готов!</h3>
              <div className="bg-gold/5 rounded-2xl p-4 text-left max-h-64 overflow-y-auto">
                <p className="text-sm text-charcoal/80 whitespace-pre-wrap leading-relaxed">
                  {typeof trialResult?.greetingAndAnalysis === 'string'
                    ? trialResult?.greetingAndAnalysis
                    : JSON.stringify(trialResult, null, 2)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-6 w-full py-4 rounded-2xl bg-charcoal text-ivory font-semibold hover:bg-charcoal/90 transition-colors"
              >
                Закрыть
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- Trial Payment Modal: оплата 99₽ за 3 образа ---
const TrialPaymentModal = ({ isOpen, onClose, onPaid }: {
  isOpen: boolean;
  onClose: () => void;
  onPaid: () => void;
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePayment = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: "trial" }),
      });
      const data = await response.json();

      if (data.error) {
        alert("Ошибка: " + data.error);
        setLoading(false);
        return;
      }

      if (data.confirmationUrl) {
        // Редирект на YooKassa
        const tgWT = (window as any).Telegram?.WebApp;
        if (tgWT?.initData && tgWT.openLink) tgWT.openLink(data.confirmationUrl);
        else window.location.href = data.confirmationUrl;
      }
    } catch (err) {
      alert("Ошибка создания платежа");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm">
      <div className="bg-ivory w-full max-w-sm rounded-3xl shadow-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-charcoal/5 rounded-full hover:bg-charcoal/10">
          <X className="w-5 h-5 text-charcoal" />
        </button>

        <p className="font-serif text-gold text-xs tracking-widest uppercase mb-2 text-center">Оплата</p>
        <h2 className="text-2xl font-serif text-charcoal text-center mb-6">99 ₽</h2>

        <div className="text-center mb-6">
          <p className="text-sm text-charcoal/70 mb-4">3 фото-визуализации вас в разных образах</p>
          <div className="bg-gold/10 rounded-xl p-4">
            <p className="text-sm text-charcoal font-medium">✨ Полный пакет включает:</p>
            <ul className="text-xs text-charcoal/60 mt-2 text-left space-y-1">
              <li>🎨 3 фото-визуализации в разных стилях</li>
              <li>📝 Подробные описания каждого образа</li>
              <li>🛒 Ссылки на все вещи на WB, Ozon, Яндекс</li>
            </ul>
          </div>
        </div>

        <button
          onClick={handlePayment}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50"
        >
          {loading ? "Обрабатываем..." : "Оплатить 99 ₽"}
        </button>

        <button onClick={onClose} className="w-full py-2 text-sm text-charcoal/50 mt-3">
          Отмена
        </button>

        <p className="text-xs text-charcoal/40 text-center mt-4">
          💳 Оплата через YooKassa (скоро)
        </p>
      </div>
    </div>
  );
};

// --- Trial Modal: бесплатный анализ без картинок ---
const TrialModalContent = ({ isOpen, onClose, userName, onUnlock }: {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onUnlock: () => void;
}) => {
  const [step, setStep] = useState<'form' | 'loading' | 'result'>('form');
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [fullBodyPreview, setFullBodyPreview] = useState<string | null>(null);
  const [portraitPreview, setPortraitPreview] = useState<string | null>(null);
  const [fullBodyFile, setFullBodyFile] = useState<File | null>(null);
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const fullBodyRef = useRef<HTMLInputElement>(null);
  const portraitRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('form');
      setFullBodyPreview(null);
      setPortraitPreview(null);
      setFullBodyFile(null);
      setPortraitFile(null);
      setResult(null);
      setHeight("");
      setWeight("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!fullBodyFile || !portraitFile || !height || !weight) return;
    setStep('loading');
    const formData = new FormData();
    formData.append("photos", fullBodyFile);
    formData.append("photos", portraitFile);
    formData.append("height", height);
    formData.append("weight", weight);
    try {
      const res = await fetch("/api/trial", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Ошибка сервера");
      const data = await res.json();
      setResult(data);
      localStorage.setItem("trial_used", "true");
      setStep('result');
    } catch (err: any) {
      alert("Ошибка: " + (err?.message || "Попробуйте ещё раз"));
      setStep('form');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-8 bg-charcoal/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-ivory w-full max-w-xl rounded-3xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 bg-charcoal/5 rounded-full">
          <X className="w-5 h-5 text-charcoal" />
        </button>

        {step === 'form' && (
          <>
            <p className="font-serif text-gold text-xs tracking-widest uppercase mb-1">Бесплатно</p>
            <h2 className="text-2xl font-serif text-charcoal mb-2">Оцени свой стиль</h2>
            <p className="text-sm text-charcoal/60 mb-4">Стилист оценит ваш стиль по 10-балльной шкале и даст рекомендации</p>

            <div className="flex gap-3 mb-4">
              <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="Рост (см)"
                className="flex-1 px-3 py-2 rounded-lg border border-charcoal/20 text-sm" />
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Вес (кг)"
                className="flex-1 px-3 py-2 rounded-lg border border-charcoal/20 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Фото в полный рост */}
              <div>
                <p className="text-xs text-charcoal/60 mb-1 font-medium">Фото в полный рост</p>
                {fullBodyPreview ? (
                  <div className="relative rounded-xl overflow-hidden aspect-[3/4]">
                    <img src={fullBodyPreview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => { setFullBodyPreview(null); setFullBodyFile(null); }}
                      className="absolute top-1 right-1 p-1 bg-black/50 rounded-full">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <div onClick={() => fullBodyRef.current?.click()}
                    className="border-2 border-dashed border-charcoal/20 rounded-xl aspect-[3/4] flex flex-col items-center justify-center cursor-pointer hover:border-gold transition-colors">
                    <Upload className="w-6 h-6 text-charcoal/30 mb-1" />
                    <p className="text-xs text-charcoal/50 text-center px-2">В полный рост</p>
                  </div>
                )}
                <input ref={fullBodyRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFullBodyFile(f); setFullBodyPreview(URL.createObjectURL(f)); } }} />
              </div>

              {/* Портретное фото */}
              <div>
                <p className="text-xs text-charcoal/60 mb-1 font-medium">Портретное фото</p>
                {portraitPreview ? (
                  <div className="relative rounded-xl overflow-hidden aspect-[3/4]">
                    <img src={portraitPreview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => { setPortraitPreview(null); setPortraitFile(null); }}
                      className="absolute top-1 right-1 p-1 bg-black/50 rounded-full">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <div onClick={() => portraitRef.current?.click()}
                    className="border-2 border-dashed border-charcoal/20 rounded-xl aspect-[3/4] flex flex-col items-center justify-center cursor-pointer hover:border-gold transition-colors">
                    <Upload className="w-6 h-6 text-charcoal/30 mb-1" />
                    <p className="text-xs text-charcoal/50 text-center px-2">Лицо крупно</p>
                  </div>
                )}
                <input ref={portraitRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setPortraitFile(f); setPortraitPreview(URL.createObjectURL(f)); } }} />
              </div>
            </div>

            <button type="button" onClick={handleSubmit}
              disabled={!fullBodyFile || !portraitFile || !height || !weight}
              className="w-full py-3 rounded-full bg-gold text-charcoal text-sm font-semibold disabled:opacity-50 hover:bg-gold/90 transition-colors">
              Оценить мой стиль бесплатно
            </button>
          </>
        )}

        {step === 'loading' && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-charcoal/60">Стилист анализирует ваш стиль...</p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <p className="font-serif text-gold text-xs tracking-widest uppercase">Результат оценки</p>
            {/* Оценка по 10 баллам */}
            {result.score != null && (
              <div className="flex items-center gap-4 bg-gold/10 rounded-2xl p-4">
                <div className="text-5xl font-serif text-gold font-bold">{result.score}</div>
                <div>
                  <p className="text-xs text-charcoal/50 uppercase tracking-wider">из 10</p>
                  <p className="text-sm font-medium text-charcoal">{result.scoreLabel || "Оценка стиля"}</p>
                </div>
              </div>
            )}
            {/* Описание стилиста */}
            <div className="bg-gold/5 rounded-2xl p-4 border-l-2 border-gold">
              <p className="text-sm text-charcoal/85 whitespace-pre-wrap leading-relaxed">{result.greetingAndAnalysis || ""}</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={onUnlock} className="flex-1 py-3 rounded-2xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors text-sm">
                Создать образ
              </button>
              <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-charcoal/20 text-charcoal/70 text-sm hover:bg-charcoal/5 transition-colors">
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PricingModal = ({ isOpen, onClose, onPaid, userName, initialTier, prices }: {
  isOpen: boolean;
  onClose: () => void;
  onPaid: (tier: Tier) => void;
  userName?: string;
  initialTier?: Tier;
  prices?: { standard: number; premium: number };
}) => {
  const localPrices = prices || { standard: 100, premium: 200 };
  const [selectedTier, setSelectedTier] = useState<Tier>(initialTier || "standard");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "used">("idle");
  const [isTrialUsed, setIsTrialUsed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPromoCode("");
      setPromoStatus("idle");
      setSelectedTier(initialTier || "standard");
      setIsTrialUsed(!!localStorage.getItem("trial_used"));
      setIsProcessing(false);
      setShowPromo(false);
    }
  }, [isOpen, initialTier]);

  const price = selectedTier === "standard" ? localPrices.standard : localPrices.premium;

  const handlePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoStatus("checking");
    try {
      const res = await fetch("/api/check-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!data.valid) {
        setPromoStatus(data.reason === "used" ? "used" : "invalid");
        return;
      }
      setPromoStatus("valid");
      if (data.tier) setSelectedTier(data.tier);
      const tier = data.tier || selectedTier;
      setTimeout(async () => {
        try {
          const rd = await fetch("/api/redeem-promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: promoCode.trim() }),
          });
          const rj = await rd.json();
          if (rj.success) {
            // Сохраняем промокод — он будет помечен "used" на сервере только после успешной генерации.
            localStorage.setItem("you-stile-promo-code", promoCode.trim().toUpperCase());
            onPaid(rj.tier || tier);
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
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: selectedTier }),
      });
      const data = await res.json();
      if (data.confirmationUrl) {
        // Сохраняем paymentId для проверки после возврата
        localStorage.setItem("pending_payment_id", data.paymentId);
        localStorage.setItem("pending_payment_tier", selectedTier);
        // Редирект на YooKassa — через openLink в Telegram, иначе обычный редирект
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
            {isTrialUsed && userName && (
              <div className="bg-gold/10 border border-gold/30 rounded-xl p-4 mb-6">
                <p className="text-sm text-charcoal"><span className="font-medium">{userName}</span>, рады снова видеть вас! ✨</p>
                <p className="text-sm text-charcoal/70 mt-1">Вы уже получили бесплатную консультацию. Выберите тариф ниже, чтобы получить полный пакет с визуализацией.</p>
              </div>
            )}

            <p className="font-serif text-gold text-xs tracking-[0.3em] uppercase mb-2 text-center">
              {isTrialUsed ? "Полный пакет" : "Выберите тариф"}
            </p>
            <h2 className="text-2xl md:text-3xl font-serif text-charcoal text-center mb-6">
              {isTrialUsed ? "Разблокируйте визуализацию" : "Начните преображение"}
            </h2>

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
                  <li className="text-charcoal/60">✓ Анализ внешности</li>
                  <li className="text-charcoal/60">✓ Список покупок</li>
                  <li className="text-charcoal/60">✓ Страничка хранится 5 часов</li>
                </ul>
              </button>

              <button onClick={() => setSelectedTier("premium")}
                className={`group rounded-2xl p-6 text-left transition-all relative overflow-hidden ${selectedTier === "premium" ? "border-gold shadow-lg bg-charcoal" : "border-charcoal/10 hover:border-gold/50 bg-white"}`}>
                <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-bold text-charcoal bg-gold px-2 py-0.5 rounded-full">Популярный</div>
                <div className="flex items-start justify-between mb-3">
                  <div className={`text-2xl font-serif font-bold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>{localPrices.premium} ₽</div>
                  {selectedTier === "premium" && <div className="w-6 h-6 rounded-full bg-gold flex items-center justify-center"><Check className="w-4 h-4 text-charcoal" /></div>}
                </div>
                <div className={`font-medium mb-3 ${selectedTier === "premium" ? "text-ivory" : "text-charcoal"}`}>Премиум</div>
                <ul className={`text-sm space-y-1.5 ${selectedTier === "premium" ? "text-ivory/70" : "text-charcoal/60"}`}>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ До 5 образов на выбор</li>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ 22 мероприятия (свадьба, романтик, вечеринка...)</li>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ Образ на указанную сумму (бюджет)</li>
                  <li className={`font-semibold ${selectedTier === "premium" ? "text-gold" : "text-charcoal"}`}>✓ Астро-разбор знака зодиака</li>
                  <li>✓ Анализ внешности</li>
                  <li>✓ Список покупок</li>
                  <li>✓ Страничка хранится 5 часов</li>
                </ul>
              </button>
            </div>

            <p className="text-xs text-charcoal/50 text-center mb-4">Потребуется фото: JPG или PNG, до 20 МБ</p>

            <button onClick={handlePay} disabled={isProcessing}
              className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold text-lg hover:bg-gold/90 transition-colors mb-4 disabled:opacity-60">
              {isProcessing ? "Подготовка оплаты..." : `Оплатить ${price} ₽`}
            </button>

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
};

const QUIZ_DECK_SIZE = 30;
const QUIZ_SWIPE_THRESHOLD = 120;

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuizDeck(pool: NailRecord[]): NailRecord[] {
  const good = pool.filter(r => r.thumbPath && r.originalPath);
  return shuffleArray(good).slice(0, QUIZ_DECK_SIZE);
}

function computeTop3(pool: NailRecord[], deck: NailRecord[], likedIds: Set<number>): NailRecord[] {
  const liked = deck.filter(d => likedIds.has(d.id));
  if (liked.length === 0) {
    const top = [...pool].filter(r => r.verdict === "wow" && !deck.includes(r) && r.thumbPath && r.originalPath)
      .sort((a, b) => (b.wow_factor || 0) - (a.wow_factor || 0));
    const seen = new Set<string>();
    const out: NailRecord[] = [];
    for (const r of top) {
      const cat = r.design_category || "other";
      if (seen.has(cat)) continue;
      seen.add(cat);
      out.push(r);
      if (out.length >= 3) break;
    }
    return out;
  }
  const tagFreq = new Map<string, number>();
  const colorFreq = new Map<string, number>();
  const catFreq = new Map<string, number>();
  const shapeFreq = new Map<string, number>();
  const lengthFreq = new Map<string, number>();
  liked.forEach(r => {
    r.tags.forEach(t => tagFreq.set(t, (tagFreq.get(t) || 0) + 1));
    colorFreq.set(r.color, (colorFreq.get(r.color) || 0) + 1);
    if (r.design_category) catFreq.set(r.design_category, (catFreq.get(r.design_category) || 0) + 1);
    if (r.shape) shapeFreq.set(r.shape, (shapeFreq.get(r.shape) || 0) + 1);
    if (r.length) lengthFreq.set(r.length, (lengthFreq.get(r.length) || 0) + 1);
  });
  const deckIds = new Set(deck.map(d => d.id));
  const scored = pool
    .filter(r => (r.verdict === "wow" || r.verdict === "good") && !deckIds.has(r.id) && r.thumbPath && r.originalPath)
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
  const seenCats = new Set<string>();
  const out: NailRecord[] = [];
  for (const { r } of scored) {
    const cat = r.design_category || "other";
    if (seenCats.has(cat)) continue;
    seenCats.add(cat);
    out.push(r);
    if (out.length >= 3) break;
  }
  if (out.length < 3) {
    for (const { r } of scored) {
      if (out.includes(r)) continue;
      out.push(r);
      if (out.length >= 3) break;
    }
  }
  return out;
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

const NailsQuizModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [step, setStep] = useState<"intro" | "swipe" | "result">("intro");
  const [pool, setPool] = useState<NailRecord[]>([]);
  const [deck, setDeck] = useState<NailRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [top3, setTop3] = useState<NailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [exitDir, setExitDir] = useState<null | "left" | "right">(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("intro"); setDeck([]); setIndex(0); setLiked(new Set()); setTop3([]); setError(null);
      setDragX(0); setExitDir(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === "swipe" && index < deck.length) {
      const next = deck[index + 1];
      if (next?.thumbPath) {
        const img = new Image();
        img.src = next.thumbPath;
      }
    }
  }, [step, index, deck]);

  if (!isOpen) return null;

  const startQuiz = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/nails/all/index.json").catch(() => null);
      let data: NailRecord[];
      if (res && res.ok) {
        const rawFiles: string[] = await res.json();
        const files = rawFiles.filter(f => f !== 'index.json' && /\.(jpe?g|png|webp)$/i.test(f));
        data = files.map((filename, idx) => ({
          id: idx,
          filename,
          originalPath: `/nails/all/${filename}`,
          thumbPath: `/nails/all/${filename}`,
          source: "nails-all",
          color: "",
          complexity: "",
          tags: [],
          verdict: "good",
          wow_factor: null,
          design_category: null,
          shape: null,
          length: null,
          description: null,
        }));
      } else {
        const res2 = await fetch("/nails/nails-data.json");
        if (!res2.ok) throw new Error("Не удалось загрузить базу дизайнов");
        const raw = await res2.json();
        const entries = Object.entries(raw) as [string, any][];
        data = entries.map(([filename, val], idx) => {
          const base = filename.replace(/\.[^.]+$/, "");
          const thumbFile = `t_${base}.png`;
          return {
            id: idx,
            filename,
            originalPath: `/nails/all/${thumbFile}`,
            thumbPath: `/nails/all/${thumbFile}`,
            source: "nails-data",
            color: (val.colors || []).join(", "),
            complexity: val.complexity || "",
            tags: val.tags || [],
            verdict: val.verdict || "good",
            wow_factor: val.wow_factor ?? null,
            design_category: val.design_category || null,
            shape: val.shape || null,
            length: val.length || null,
            description: val.description || null,
          };
        });
        if (data.length === 0) throw new Error("Нет дизайнов для квиза");
      }
      if (data.length === 0) throw new Error("Нет дизайнов для квиза");
      setPool(data);
      const newDeck = pickQuizDeck(data.length >= 10 ? data : data);
      if (newDeck.length === 0) throw new Error("Нет дизайнов для квиза");
      setDeck(newDeck);
      setIndex(0); setLiked(new Set()); setStep("swipe");
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
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
    setDeck(newDeck); setIndex(0); setLiked(new Set()); setStep("swipe");
  };

  const current = deck[index];
  const progress = deck.length ? Math.round(((index) / deck.length) * 100) : 0;

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

          {step === "intro" && (
            <div className="p-6 md:p-10 text-center">
              <p className="font-serif text-gold text-xs tracking-[0.2em] uppercase mb-3">База маникюра</p>
              <h2 className="font-serif text-3xl md:text-4xl text-charcoal mb-4">Подобрать ногти за 30 свайпов</h2>
              <p className="text-charcoal/60 mb-8 leading-relaxed">
                Оцени 30 дизайнов — лайк ❤️ или пропустить ✕. ИИ-стилист найдёт паттерн в твоём вкусе и предложит топ-3 идеальных вариантов.
              </p>
              <button
                onClick={startQuiz}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold text-lg hover:bg-gold/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? "Загружаем базу…" : (<>Начать <ArrowRight className="w-5 h-5" /></>)}
              </button>
              {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
              <p className="text-xs text-charcoal/40 mt-6">Бесплатно • 30 дизайнов • топ-3 в HD</p>
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
                {deck.slice(index, index + 3).reverse().map((nail, i) => {
                  const isTop = i === 2;
                  const offset = (2 - i) * 8;
                  return (
                    <motion.div
                      key={nail.id}
                      className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl bg-charcoal/5"
                      style={{ y: offset, zIndex: i }}
                      drag={isTop ? "x" : false}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.6}
                      onDrag={(e, info) => { if (isTop) setDragX(info.offset.x); }}
                      onDragEnd={(e, info) => {
                        if (!isTop) return;
                        if (info.offset.x > QUIZ_SWIPE_THRESHOLD) handleVerdict(true);
                        else if (info.offset.x < -QUIZ_SWIPE_THRESHOLD) handleVerdict(false);
                        setDragX(0);
                      }}
                      animate={
                        isTop && exitDir
                          ? { x: exitDir === "right" ? 500 : -500, opacity: 0, rotate: exitDir === "right" ? 20 : -20 }
                          : { x: isTop ? dragX : 0, opacity: 1, rotate: isTop ? dragX * 0.05 : 0 }
                      }
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      {nail.thumbPath && (
                        <img src={nail.thumbPath} alt={nail.description || "Дизайн ногтей"} className="w-full h-full object-cover" draggable={false} />
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
              <p className="font-serif text-gold text-xs tracking-[0.2em] uppercase mb-2 text-center">Ваш топ-3</p>
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
                    <div key={nail.id} className="border border-charcoal/10 rounded-2xl overflow-hidden bg-white">
                      {nail.originalPath && (
                        <div className="relative aspect-[3/4] bg-charcoal/5">
                          <img src={nail.originalPath} alt={nail.description || "Дизайн ногтей"} className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute top-3 left-3 px-3 py-1 bg-charcoal/80 text-ivory rounded-full text-xs font-medium">#{i + 1}</div>
                        </div>
                      )}
                      <div className="p-4">
                        {nail.description && <p className="text-sm text-charcoal/80 mb-3 leading-relaxed">{nail.description}</p>}
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

              <div className="flex gap-3 mt-6">
                <button onClick={restart} className="flex-1 py-3 rounded-full border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors">
                  Пройти заново
                </button>
                <button onClick={onClose} className="flex-1 py-3 rounded-full bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors">
                  Готово
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- Group Stylize Modal ---
const MyLooksModal = ({ isOpen, onClose, onOpenOrder, onClearAll }: { isOpen: boolean; onClose: () => void; onOpenOrder: (paymentId: string, tier: Tier) => void; onClearAll: () => void }) => {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fresh = getMyOrders();
      setOrders(fresh);
      // Background-load thumbnails for orders that don't have one yet
      fresh.forEach(o => {
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
    }
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

  const handleClearAll = () => {
    if (confirm("Удалить все сохранённые образы из списка? Это не вернёт оплату — образы просто исчезнут из этого списка.")) {
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
            <h2 className="font-serif text-2xl text-charcoal mb-1">Мои образы</h2>
            <p className="text-sm text-charcoal/60 mb-6">Ваши оплаченные образы хранятся 5 часов после генерации.</p>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-charcoal/50 text-sm">У вас пока нет сохранённых образов.</p>
                <button onClick={onClose} className="mt-4 px-6 py-3 rounded-full bg-charcoal text-ivory text-sm font-medium">
                  Создать образ
                </button>
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
                          ) : (
                            <Shirt className="w-6 h-6 text-charcoal/30" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-charcoal">
                            {o.tier === "premium" ? "Премиум" : "Стандарт"}
                          </p>
                          <p className="text-xs text-charcoal/50 mt-0.5">{formatDate(o.createdAt)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpen(o)}
                        disabled={loadingId === o.paymentId}
                        className="px-5 py-2.5 rounded-full bg-charcoal text-ivory text-sm font-medium hover:bg-charcoal/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {loadingId === o.paymentId ? "Загрузка…" : "Открыть образы"}
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleClearAll}
                  className="mt-6 text-xs text-charcoal/40 hover:text-charcoal/70 transition-colors underline"
                >
                  Сбросить все мои образы
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const GroupModal = ({ isOpen, onClose, userName }: { isOpen: boolean; onClose: () => void; userName: string }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [wishes, setWishes] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!isOpen) { setFile(null); setPreview(null); setWishes(""); setResult(null); setError(""); setLoading(false); } }, [isOpen]);

  const handleFile = (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleGenerate = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResult(null); setLoadingStep(0);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (wishes) fd.append("wishes", wishes);
      if (userName) fd.append("userName", userName);
      const resp = await fetch("/api/group-stylize", { method: "POST", body: fd });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line);
            if (d.type === "progress") { setLoadingText(d.text); setLoadingStep(d.step); }
            else if (d.type === "result") { setResult(d); setLoadingStep(5); }
            else if (d.type === "error") { setError(d.error); }
          } catch {}
        }
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!isOpen) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-charcoal/80 backdrop-blur-md flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="bg-ivory w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-charcoal/5 rounded-full z-10"><X className="w-5 h-5" /></button>
        <div className="p-6">
          <h2 className="text-2xl font-serif text-charcoal mb-1">👥 Групповое преображение</h2>
          <p className="text-charcoal/60 text-sm mb-6">Загрузите групповое фото — стилист создаст 3 образа для всей компании</p>

          {!result && !loading && (
            <>
              <div
                className="border-2 border-dashed border-charcoal/20 rounded-2xl p-8 text-center cursor-pointer hover:border-gold transition-colors mb-4"
                onClick={() => document.getElementById("group-file-input")?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                {preview ? <img src={preview} className="max-h-64 mx-auto rounded-xl object-contain" /> : <><p className="text-charcoal/40 text-sm">Нажмите или перетащите групповое фото</p><p className="text-charcoal/30 text-xs mt-1">JPG, PNG до 20 МБ</p></>}
                <input id="group-file-input" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
              <textarea value={wishes} onChange={e => setWishes(e.target.value)} placeholder="Пожелания (необязательно): стиль, повод, предпочтения..." className="w-full border border-charcoal/20 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:border-gold mb-4" maxLength={300} />
              <button onClick={handleGenerate} disabled={!file} className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold text-lg hover:bg-gold/90 transition-colors disabled:opacity-40">
                Создать групповые образы — 150 ₽
              </button>
            </>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="w-full bg-charcoal/10 rounded-full h-2 mb-3 overflow-hidden">
                <div className="h-full bg-gold transition-all duration-500 rounded-full" style={{ width: `${(loadingStep / 5) * 100}%` }} />
              </div>
              <p className="text-charcoal/60 text-sm">{loadingText || "Анализируем группу..."}</p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm text-center py-4">{error}</p>}

          {result && (
            <div>
              <p className="text-charcoal/80 text-sm leading-relaxed mb-6 whitespace-pre-wrap">{result.greetingAndAnalysis}</p>
              {result.looks?.map((look: any, i: number) => (
                <div key={i} className="mb-8 border border-charcoal/10 rounded-2xl overflow-hidden">
                  {look.image && <img src={look.image} alt={look.lookName} className="w-full object-cover max-h-96" />}
                  <div className="p-4">
                    <h3 className="font-serif text-lg text-charcoal mb-2">Образ {i + 1}: {look.lookName}</h3>
                    <p className="text-charcoal/70 text-sm leading-relaxed whitespace-pre-wrap">{look.description}</p>
                  </div>
                </div>
              ))}
              <button onClick={() => { setResult(null); setFile(null); setPreview(null); }} className="w-full py-3 rounded-full border border-charcoal/20 text-charcoal text-sm font-medium hover:bg-charcoal/5 transition-colors">
                Создать новые образы
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- Stylize Modal Component ---
const StylizeModal = ({ isOpen, onClose, userName, tier, onToast, onNewLooks, recoveredResult, onRecoveredResultShown, onOpenLightbox }: { isOpen: boolean; onClose: () => void; userName: string; tier: Tier; onToast: (msg: string, type: 'success'|'error'|'info') => void; onNewLooks: () => void; recoveredResult?: any; onRecoveredResultShown?: () => void; onOpenLightbox?: (state: LightboxState) => void }) => {
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
  const [looksCount, setLooksCount] = useState(3);
  const [budget, setBudget] = useState("");
  const [loadingState, setLoadingState] = useState<{ step: number; text: string } | null>(null);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewSent, setReviewSent] = useState(false);
  const [viewMode, setViewMode] = useState<'form' | 'result'>('form');

  useEffect(() => { localStorage.setItem("you-stile-birth-day", birthDay); }, [birthDay]);
  useEffect(() => { localStorage.setItem("you-stile-birth-month", birthMonth); }, [birthMonth]);
  useEffect(() => { localStorage.setItem("you-stile-birth-year", birthYear); }, [birthYear]);

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
    await fetch(`https://api.telegram.org/bot8780162148:AAGHjZ_PNo0q9rTJ1TZQTkJdpdV7uo2hOSY/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: 8602635380, text: `💬 Отзыв от ${userName || "пользователя"}:\n${reviewText}` }),
    }).catch(() => {});
    setReviewSent(true);
    setTimeout(() => { setReviewOpen(false); setReviewText(""); setReviewSent(false); }, 2000);
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
      setResult(null);
      setErrorMsg(null);
      setLoadingState(null);
      // Если есть сохранённый результат (моложе 5 часов) — сразу показываем образы,
      // а не форму загрузки. Пользователь может запустить новую генерацию кнопкой "Создать новые образы".
      if (recoveredResult) {
        setResult({
          greetingAndAnalysis: recoveredResult.greetingAndAnalysis,
          bodyTypeSummary: recoveredResult.bodyTypeSummary,
          astroReading: recoveredResult.astroReading || null,
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
                const max = 800; // Shrink to save AI tokens
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
                }, 'image/jpeg', 0.8);
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

  const handleUpload = async () => {
    if (files.length === 0) { setErrorMsg("Пожалуйста, загрузите хотя бы одно фото."); return; }
    if (!height || !height.trim()) { setErrorMsg("Пожалуйста, укажите рост."); return; }
    if (!weight || !weight.trim()) { setErrorMsg("Пожалуйста, укажите вес."); return; }
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
            const max2 = 600;
            let w2 = img2.width, h2 = img2.height;
            if (w2 > h2) { if (w2 > max2) { h2 = Math.round(h2 * max2 / w2); w2 = max2; } } else { if (h2 > max2) { w2 = Math.round(w2 * max2 / h2); h2 = max2; } }
            canvas.width = w2; canvas.height = h2;
            canvas.getContext('2d')?.drawImage(img2, 0, 0, w2, h2);
            const blob2 = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('blob failed')), 'image/jpeg', 0.6));
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
      const effectiveLooksCount = totalOccasionLooks > 0 ? totalOccasionLooks : looksCount;
      const occasionText = selectedOccasions.length > 0
        ? `Создай образы по поводам: ${selectedOccasions.map(o => `${o} — ${occasionCounts[o] || 1} образ(а)`).join(", ")}`
        : "";
      const fullWishes = [occasionText, wishes].filter(Boolean).join(". ");
      formData.append("wishes", fullWishes);
      formData.append("looksCount", String(effectiveLooksCount));
      formData.append("userName", userName);
      formData.append("visitCount", String(incrementVisitCount()));
      if (budget) formData.append("budget", budget);
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

      const pendingId = localStorage.getItem("pending_payment_id");
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

          if (data.type === "progress") {
            setLoadingState({ step: data.step, text: data.text });
          } else if (data.type === "partial_result") {
            setLoadingState({ step: 4.5, text: "Образы готовы! Ищем товары..." });
            // Show greeting + looks with images immediately
            setResult({
              greetingAndAnalysis: data.greetingAndAnalysis,
              bodyTypeSummary: data.bodyTypeSummary,
              astroReading: data.astroReading || null,
              looks: data.looks
            });
            setViewMode('result');
            setTimeout(() => {
              document.getElementById('modal-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
          } else if (data.type === "result") {
            setLoadingState({ step: 5, text: "Готово!" });
            // Промокод успешно "сгорел" на сервере — очищаем, чтобы не передавать повторно.
            localStorage.removeItem("you-stile-promo-code");
            // Сбрасываем pending_payment_id — генерация по этой оплате завершена.
            // При следующей генерации пользователь оплатит заново и получит новый paymentId.
            // Сам order остаётся в MyOrders — образы доступны через «Мои образы» 5 часов.
            localStorage.removeItem("pending_payment_id");
            localStorage.removeItem("pending_payment_tier");
            // Save look names to history
            if (data.looks?.length) savePastLooks(data.looks.map((l: any) => l.lookName).filter(Boolean));
            // Update with enriched items (real products)
            setResult({
              greetingAndAnalysis: data.greetingAndAnalysis,
              bodyTypeSummary: data.bodyTypeSummary,
              astroReading: data.astroReading || null,
              looks: data.looks
            });
            setViewMode('result');
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }

    } catch (error: any) {
      console.error("Full error:", error);
      const msg = error?.message || "";
      if (msg.includes("No image data") || msg.includes("fetch failed") || msg.includes("Image generation failed")) {
        setErrorMsg("Сервис генерации изображений временно недоступен. Попробуйте ещё раз через 1-2 минуты.");
      } else {
        setErrorMsg("Произошла ошибка. Зайдите через 10 минут — ваш заказ будет готов.");
      }
    } finally {
      setLoadingState(null);
    }
  };

  if (!isOpen) return null;

  return (
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
            
            {/* Animated Loading Overlay */}
            <AnimatePresence>
              {loadingState && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-charcoal/95 backdrop-blur-xl flex flex-col items-center justify-center text-white z-50 rounded-3xl overflow-hidden"
                >
                  {/* Animated background elements */}
                  <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gold/20 rounded-full mix-blend-screen filter blur-[80px] animate-pulse"></div>
                  <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/20 rounded-full mix-blend-screen filter blur-[80px] animate-pulse" style={{ animationDelay: '1s' }}></div>

                  <motion.div
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="mb-12 relative"
                  >
                    <div className="absolute inset-0 bg-gold/40 blur-2xl rounded-full"></div>
                    <Sparkles className="w-20 h-20 text-gold relative z-10" />
                  </motion.div>
                  
                  <h3 className="text-3xl font-serif mb-3 text-center px-4 tracking-wide">Создаем магию...</h3>
                  <p className="text-sm text-white/50 mb-6 text-center px-6 max-w-[320px] leading-relaxed">
                    {tier === "premium"
                      ? "Генерация займёт 4–7 минут — наш стилист внимательно оценит вашу фактуру и лицо, подберёт лучшие образы под ваш повод и бюджет. Можно налить кофе или почитать новости — мы напишем, как только всё будет готово."
                      : "Генерация займёт 2–4 минуты — стилист анализирует ваше фото и создаёт образы. Можно немного отдохнуть — результат появится совсем скоро."}
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
                </motion.div>
              )}
            </AnimatePresence>

            <h2 className="text-3xl font-serif text-charcoal mb-2">Создать новый образ</h2>
            <p className="text-charcoal/60 mb-4">{tier === "standard" ? "Загрузите фото, укажите рост и вес — стилист создаст 3 образа специально для вас." : "Загрузите до 5 фото, укажите параметры, и наш ИИ подберет идеальный гардероб."}</p>

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
                  <div className="w-full max-w-md mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    ⚠️ Если у вас нестабильный интернет или включён VPN — отключите VPN перед загрузкой. При ошибке зайдите через 10 минут — ваш заказ будет готов.
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
                      <span className="text-sm text-charcoal/50 mt-2">{tier === "standard" ? "1 фото (JPEG, PNG)" : "До 5 фото (JPEG, PNG)"}</span>
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
                        <p>✓ Фото 2–5: в полный рост или по пояс в нейтральной одежде</p>
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
                                className="mt-4 px-4 py-2 bg-gold text-charcoal rounded-full text-sm font-medium hover:bg-gold/90 transition-colors"
                                onClick={async () => {
                                  if (!files.length || !look.editPrompt) return;
                                  const fd = new FormData();
                                  try { const b = await resizeImage(files[0]); fd.append("image", b, files[0].name); } catch { fd.append("image", files[0]); }
                                  fd.append("editPrompt", look.editPrompt);
                                  fd.append("wishes", wishes);
                                  fd.append("lookIdx", String(lookIdx));
                                  const pid = localStorage.getItem("pending_payment_id") || "";
                                  if (pid) fd.append("paymentId", pid);
                                  const btn = document.activeElement as HTMLButtonElement;
                                  if (btn) btn.textContent = "Генерирую...";
                                  try {
                                    const r = await fetch("/api/regenerate-image", { method: "POST", body: fd });
                                    const d = await r.json();
                                    if (d.image) {
                                      setResult(prev => prev ? { ...prev, looks: prev.looks.map((l, i) => i === lookIdx ? { ...l, image: d.image, imageError: null } : l) } : prev);
                                    } else {
                                      if (btn) btn.textContent = "Повторить";
                                      alert("Не удалось. Попробуйте ещё раз.");
                                    }
                                  } catch { if (btn) btn.textContent = "Повторить"; }
                                }}
                              >
                                🔄 Повторить генерацию
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
                            "концепци": "🎨", "одежд": "👕", "обув": "👞", "аксессуар": "💎",
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
                            const trimmed = line.trim();
                            const emojiMatch = trimmed.match(/^([🎨👕👞💎💇🌸✨🛍🧥👖👟👜💍🧣🧢👔👗🩱👢🩴👒🕶️⌚📿])\s*(.+)$/);
                            const titleMatch = !emojiMatch && trimmed.match(/^(.+?):\s*(.*)$/);
                            if (emojiMatch || titleMatch) {
                              if (current) blocks.push(current);
                              const title = (emojiMatch ? emojiMatch[2] : titleMatch![1]).trim();
                              const bodyLine = titleMatch ? titleMatch[2].trim() : "";
                              const emoji = emojiMatch ? emojiMatch[1] : getDetailSectionEmoji(title);
                              const key = getSectionKey(title);
                              current = {
                                emoji,
                                title,
                                body: bodyLine || "",
                                color: sectionColor[key] || { bg: "bg-charcoal", text: "text-ivory", border: "border-gold" },
                              };
                              if (bodyLine && !emojiMatch && current.body && bodyLine !== current.body) {
                                current.body = bodyLine;
                              }
                            } else if (current) {
                              current.body += (current.body ? "\n" : "") + line;
                            } else {
                              if (!blocks.length && trimmed) {
                                current = { emoji: "🎨", title: "Концепция образа", body: line, color: sectionColor["концепци"] };
                              } else if (current) {
                                current.body += (current.body ? "\n" : "") + line;
                              }
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
                          <textarea
                            value={reviewText}
                            onChange={e => setReviewText(e.target.value)}
                            placeholder="Напишите что понравилось или что улучшить..."
                            className="w-full border border-charcoal/20 rounded-xl p-3 text-sm resize-none h-28 focus:outline-none focus:border-gold"
                          />
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => setReviewOpen(false)} className="flex-1 py-2.5 rounded-xl border border-charcoal/20 text-charcoal text-sm">Отмена</button>
                            <button onClick={sendReview} disabled={!reviewText.trim()} className="flex-1 py-2.5 rounded-xl bg-gold text-charcoal text-sm font-medium disabled:opacity-40">Отправить</button>
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
  );
};

// --- Main Landing Page ---
export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [isTrialPaymentOpen, setIsTrialPaymentOpen] = useState(false);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isMyLooksOpen, setIsMyLooksOpen] = useState(false);
  const [isNailsQuizOpen, setIsNailsQuizOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [currentTier, setCurrentTier] = useState<Tier>("standard");
  const [userName, setUserName] = useState(getSavedName);
  const [showWelcome, setShowWelcome] = useState(() => !getSavedName());
  const [prices, setPrices] = useState({ standard: 100, premium: 200 });
  const [recoveredResult, setRecoveredResult] = useState<any>(null);
  const [showProcessing, setShowProcessing] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  // Telegram Mini App init
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      // Автозаполнение имени из Telegram если ещё не введено
      const tgName = tg.initDataUnsafe?.user?.first_name;
      if (tgName && !getSavedName()) {
        setUserName(tgName);
        setShowWelcome(false);
        localStorage.setItem("stilist_user_name", tgName);
      }
      // Обработка возврата после оплаты через Telegram start param
      const startParam = tg.initDataUnsafe?.start_param;
      if (startParam?.startsWith("paid_")) {
        const parts = startParam.split("_");
        const tier = parts[1] as Tier;
        const paymentId = parts.slice(2).join("_");
        if (tier && paymentId) {
          localStorage.setItem(`paid_${tier}_${paymentId}`, "true");
          localStorage.setItem("pending_payment_id", paymentId);
          localStorage.setItem("pending_payment_tier", tier);
          saveMyOrder({ paymentId, tier, createdAt: Date.now() });
          setCurrentTier(tier);
          setTimeout(() => setIsModalOpen(true), 500);
        }
      }
    }
  }, []);

  // Загружаем цены с сервера
  useEffect(() => {
    fetch("/api/admin-stats")
      .then(r => r.json())
      .then(d => {
        if (d.stats) {
          setPrices({ standard: d.stats.standardPrice, premium: d.stats.premiumPrice });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const pendingId = localStorage.getItem("pending_payment_id");
    if (!pendingId) return;
    fetch(`/api/result/${pendingId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ready && data.looks) {
          const tier = (localStorage.getItem("pending_payment_tier") as Tier) || "standard";
          setCurrentTier(tier);
          setRecoveredResult(data);
          setModalKey(k => k + 1);
          setIsModalOpen(true);
          // НЕ удаляем pending_payment_id — пользователь может вернуться ещё раз в течение 5 часов
        } else if (data.expired) {
          // Проверяем возраст заказа — если < 15 минут, генерация ещё идёт (папка ещё не создана)
          const order = getMyOrders().find(o => o.paymentId === pendingId);
          const ageMin = order ? (Date.now() - order.createdAt) / 60000 : Infinity;
          if (ageMin < 15) {
            // Генерация ещё не завершилась — оставляем ключ, не показываем ошибку
            return;
          }
          // Образы удалены сервером (старше 5 часов) — чистим всё
          removeMyOrder(pendingId);
          localStorage.removeItem("pending_payment_id");
          localStorage.removeItem("pending_payment_tier");
          localStorage.removeItem(`paid_standard_${pendingId}`);
          localStorage.removeItem(`paid_premium_${pendingId}`);
          setToast({ message: "Срок хранения ваших образов истёк (5 часов). Создайте новые образы.", type: "info" });
        }
        // если data.ready=false и не expired — генерация ещё идёт, ключ оставляем
      })
      .catch(() => {});
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{message: string; type: 'success'|'error'|'info'}|null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const [selectedPricingTier, setSelectedPricingTier] = useState<Tier>("standard");

  const openModal = (tier?: Tier) => {
    const t = tier || "standard";
    setSelectedPricingTier(t);
    setIsPricingOpen(true);
  };

  const openMyOrder = async (paymentId: string, tier: Tier) => {
    try {
      const res = await fetch(`/api/result/${paymentId}`);
      const data = await res.json();
      if (data.ready && data.looks) {
        setCurrentTier(tier);
        setRecoveredResult(data);
        setModalKey(k => k + 1);
        setIsMyLooksOpen(false);
        setIsModalOpen(true);
      } else if (data.expired) {
        const order = getMyOrders().find(o => o.paymentId === paymentId);
        const ageMin = order ? (Date.now() - order.createdAt) / 60000 : Infinity;
        if (ageMin < 15) {
          setToast({ message: "Образы ещё генерируются. Зайдите через 10 минут.", type: "info" });
        } else {
          removeMyOrder(paymentId);
          localStorage.removeItem("pending_payment_id");
          localStorage.removeItem("pending_payment_tier");
          localStorage.removeItem(`paid_standard_${paymentId}`);
          localStorage.removeItem(`paid_premium_${paymentId}`);
          setToast({ message: "Срок хранения этих образов истёк (5 часов). Создайте новые.", type: "info" });
        }
      } else {
        setToast({ message: "Образы ещё генерируются. Зайдите через 10 минут.", type: "info" });
      }
    } catch {
      setToast({ message: "Не удалось загрузить образы. Попробуйте позже.", type: "error" });
    }
  };

  const openTrialModal = () => {
    setIsTrialOpen(true);
  };

  const handlePaid = (tier: Tier) => {
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

    if (paymentSuccess === "true" && paymentId && tier) {
      // Оплата прошла успешно - открываем модальное окно загрузки
      localStorage.setItem(`paid_${tier}_${paymentId}`, "true");
      localStorage.setItem("pending_payment_id", paymentId);
      localStorage.setItem("pending_payment_tier", tier);
      saveMyOrder({ paymentId, tier: tier as Tier, createdAt: Date.now() });

      // Убираем параметры из URL
      window.history.replaceState({}, "", "/");

      // Если оплата из Telegram — редиректим обратно в бота
      const tg = (window as any).Telegram?.WebApp;
      if (!tg?.initData) {
        // Открыли в браузере после оплаты — просто открываем сайт с результатом
        // Параметры уже сохранены в localStorage выше, просто показываем модалку
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

  const handleNameSubmit = (name: string) => {
    saveName(name);
    setUserName(name);
    setShowWelcome(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AnimatePresence>
        {showWelcome && <WelcomeScreen key="welcome" onSubmit={handleNameSubmit} />}
      </AnimatePresence>
      {showProcessing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-charcoal/80 backdrop-blur-sm">
          <div className="bg-ivory rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <p className="text-lg font-serif text-charcoal mb-3">Ваш заказ обрабатывается</p>
            <p className="text-charcoal/60 text-sm mb-6">Пожалуйста, зайдите через 10 минут — результат будет готов.</p>
            <button onClick={() => setShowProcessing(false)} className="px-6 py-3 rounded-full bg-gold text-charcoal font-medium text-sm">
              Понятно
            </button>
          </div>
        </div>
      )}
      <PricingModal key={selectedPricingTier} isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} onPaid={handlePaid} userName={userName} initialTier={selectedPricingTier} prices={prices} />
      {isTrialOpen && <TrialModalContent isOpen={isTrialOpen} onClose={() => setIsTrialOpen(false)} userName={userName} onUnlock={() => setIsTrialPaymentOpen(true)} />}
      <TrialPaymentModal isOpen={isTrialPaymentOpen} onClose={() => setIsTrialPaymentOpen(false)} onPaid={() => {}} />
      <StylizeModal key={modalKey} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} userName={userName} tier={currentTier} onToast={(msg, type) => setToast({message: msg, type})} onNewLooks={() => { setIsModalOpen(false); setTimeout(() => openModal(), 100); }} recoveredResult={recoveredResult} onRecoveredResultShown={() => setRecoveredResult(null)} onOpenLightbox={setLightbox} />
      <GroupModal isOpen={isGroupOpen} onClose={() => setIsGroupOpen(false)} userName={userName} />
      <MyLooksModal isOpen={isMyLooksOpen} onClose={() => setIsMyLooksOpen(false)} onOpenOrder={openMyOrder} onClearAll={() => { /* список уже обновлён внутри */ }} />
      <NailsQuizModal isOpen={isNailsQuizOpen} onClose={() => setIsNailsQuizOpen(false)} />

      {/* Lightbox — fullscreen image viewer */}
      <Lightbox state={lightbox} onClose={() => setLightbox(null)} onNavigate={(index) => setLightbox(s => s ? { ...s, index } : s)} />

      {/* 1. Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-ivory/70 backdrop-blur-lg border-b border-charcoal/5 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-serif text-xl md:text-2xl font-medium tracking-tight text-charcoal">
              Твой личный стилист
            </div>
            {userName && (
              <span className="hidden md:block text-sm text-charcoal/40 font-light">
                С возвращением, {userName} ✨
              </span>
            )}
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <nav className="flex gap-6 text-sm font-medium text-charcoal/70">
              <a href="#how-it-works" className="hover:text-charcoal transition-colors">Как это работает</a>
              <a href="#lookbook" className="hover:text-charcoal transition-colors">Лукбук</a>
              <a href="#pricing" className="hover:text-charcoal transition-colors">Тарифы</a>
            </nav>
            {getMyOrders().length > 0 && (
              <button
                onClick={() => setIsMyLooksOpen(true)}
                className="text-sm font-medium text-charcoal/70 hover:text-charcoal transition-colors"
              >
                Мои образы
              </button>
            )}
            <button
              onClick={() => setIsGroupOpen(true)}
              className="hidden border border-charcoal/20 text-charcoal px-6 py-2.5 rounded-full text-sm font-medium hover:bg-charcoal/5 transition-colors"
            >
              👥 Групповое
            </button>
            <button
              onClick={() => openModal()}
              className="bg-charcoal text-ivory px-6 py-2.5 rounded-full text-sm font-medium hover:bg-charcoal/90 transition-colors"
            >
              Создать образ
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-charcoal"
            onClick={() => setMenuOpen(v => !v)}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="md:hidden bg-ivory/95 backdrop-blur-lg border-t border-charcoal/5 px-6 py-4 flex flex-col gap-4"
            >
              <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-charcoal/70 font-medium py-2 border-b border-charcoal/5">Как это работает</a>
              <a href="#lookbook" onClick={() => setMenuOpen(false)} className="text-charcoal/70 font-medium py-2 border-b border-charcoal/5">Лукбук</a>
              <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-charcoal/70 font-medium py-2 border-b border-charcoal/5">Тарифы</a>
              {getMyOrders().length > 0 && (
                <button
                  onClick={() => { setMenuOpen(false); setIsMyLooksOpen(true); }}
                  className="text-left text-charcoal/70 font-medium py-2 border-b border-charcoal/5"
                >
                  Мои образы
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); setIsGroupOpen(true); }}
              className="hidden border border-charcoal/20 text-charcoal px-6 py-3 rounded-full text-sm font-medium w-full mt-1"
              >
                👥 Групповое
              </button>
              <button
                onClick={() => { setMenuOpen(false); openModal(); }}
                className="bg-charcoal text-ivory px-6 py-3 rounded-full text-sm font-medium w-full mt-1"
              >
                Создать образ
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 2. Hero Section — full height, text centered, Gucci background */}
      <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/gucci.jpg')" }}
        />
        {/* Overlay — центр тёмнее для читаемости, края прозрачнее */}
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/60 via-charcoal/50 to-charcoal/70" />

        <div className="relative text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            <p className="font-serif text-gold text-xs tracking-[0.2em] md:tracking-[0.4em] uppercase mb-6">Ваш личный стилист</p>
            <h1 className="text-4xl md:text-7xl lg:text-8xl leading-[1.05] mb-8 text-ivory max-w-full">
              Увидь свою <br />
              <span className="italic text-gold">лучшую версию.</span> <br />
              За секунды.
            </h1>
            <p className="text-base md:text-xl text-ivory/70 mb-6 leading-relaxed font-light max-w-2xl mx-auto">
              Загрузи чёткое фото лица — стилист воссоздаст образ именно с вашей внешностью. Рост и вес вводятся вручную для идеальной посадки одежды.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => openModal()}
                className="bg-gold text-charcoal px-8 py-3 sm:py-4 rounded-full text-base font-semibold hover:bg-gold/90 transition-all flex items-center justify-center gap-2 group"
              >
                Начать преображение
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => openTrialModal()}
                className="border border-gold/40 text-gold px-8 py-3 sm:py-4 rounded-full text-base font-medium hover:bg-gold/10 transition-colors">
                Оцени свой стиль
              </button>
              <button
                onClick={() => setIsNailsQuizOpen(true)}
                className="bg-ivory text-charcoal px-8 py-3 sm:py-4 rounded-full text-base font-semibold hover:bg-white transition-all flex items-center justify-center gap-2 group shadow-lg shadow-charcoal/20"
              >
                <Heart className="w-4 h-4 text-gold fill-gold group-hover:scale-110 transition-transform" />
                Подобрать ногти
              </button>
            </div>
            <p className="text-sm text-ivory/60 mt-3 text-center font-medium">⚠️ Отключите VPN перед началом для стабильной работы</p>
          </motion.div>
        </div>
      </section>

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
              <h2 className="text-4xl md:text-5xl mb-3">Работы нашего стилиста</h2>
              <p className="text-charcoal/60 text-lg font-light">Примеры генераций нашего ИИ-стилиста.</p>
            </div>
          </motion.div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {GALLERY_IMAGES.map((src, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: idx * 0.05 }} className="overflow-hidden rounded-2xl aspect-[3/4]">
                <button type="button" onClick={() => setLightbox({ images: GALLERY_IMAGES.map(s => ({ src: s, alt: 'Образ стилиста' })), index: idx })} className="block w-full h-full touch-manipulation cursor-zoom-in">
                  <img src={src} alt={`Образ ${idx + 1}`} loading="lazy" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
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
            <h2 className="text-4xl md:text-5xl mb-4">Как это работает</h2>
            <p className="text-charcoal/60 text-lg max-w-2xl mx-auto font-light">
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
                <h3 className="text-xl font-serif font-medium mb-3">{step.title}</h3>
                <p className="text-charcoal/70 leading-relaxed font-light">{step.desc}</p>
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
            <h2 className="text-4xl md:text-5xl mb-4">Отзывы</h2>
            <p className="text-charcoal/60 text-lg max-w-2xl mx-auto font-light">
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
                <p className="text-charcoal/80 leading-relaxed mb-6">{review.text}</p>
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
            <h2 className="text-4xl md:text-5xl mb-4 text-white">Инвестируй в себя</h2>
            <p className="text-ivory/60 text-lg max-w-2xl mx-auto font-light">
              Выберите формат преображения, который подходит именно вам.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-16">
            {[
              {
                title: "Премиум",
                tier: "premium" as Tier,
                price: `${prices.premium} ₽`,
                desc: "Образы под ваш повод, бюджет и знак зодиака.",
                features: [
                  "Всё из тарифа Стандарт",
                  "До 5 образов на выбор",
                  "22 мероприятия (свадьба, романтик, вечеринка...)",
                  "Образ на указанную сумму (бюджет)",
                  "Астро-разбор вашего знака зодиака",
                ],
                highlighted: true,
                badge: "Популярный",
              },
              {
                title: "Стандарт",
                tier: "standard" as Tier,
                price: `${prices.standard} ₽`,
                desc: "Три готовых образа от стилиста с визуализацией.",
                features: [
                  "3 свободных образа от стилиста",
                  "ИИ-визуализация каждого образа",
                  "Подбор цвета и стиля",
                  "Список вещей со ссылками",
                  "Советы по грумингу и парфюму",
                ],
                highlighted: false,
                badge: null,
              },
            ].map((plan, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15 }}
                className={`p-8 rounded-3xl flex flex-col ${plan.highlighted ? 'bg-gold/10 border-2 border-gold relative transform md:-translate-y-4' : 'bg-white/5 border border-white/10'}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gold text-charcoal px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-2xl font-serif mb-2 text-white">{plan.title}</h3>
                <div className="text-3xl font-light mb-4 text-gold">{plan.price}</div>
                <p className="text-ivory/60 text-sm mb-8 flex-grow">{plan.desc}</p>
                
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-ivory/80">
                      <Check className="w-4 h-4 text-gold shrink-0" />
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
            <p className="text-sm text-ivory/60 mt-3 text-center font-medium">⚠️ Отключите VPN перед началом для стабильной работы</p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-charcoal/10 text-center text-sm text-charcoal/70">
        <p>© 2026 Твой личный стилист. Все права защищены.</p>
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
