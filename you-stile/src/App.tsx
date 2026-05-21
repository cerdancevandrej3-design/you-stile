/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Smartphone, Sparkles, Shirt, ArrowRight, Check, ChevronLeft, ChevronRight, Upload, X, ShoppingBag, AlertCircle, Camera, Download, Star, Share2 } from 'lucide-react';

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
function getActiveStageIndex(s: number): number {
  for (let i = PROGRESS_STAGES.length - 1; i >= 0; i--) {
    if (s >= PROGRESS_STAGES[i].step) return i;
  }
  return 0;
}

// --- localStorage helpers ---
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
type Tier = "standard" | "premium";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Сброс при закрытии
  useEffect(() => {
    if (!isOpen) {
      setStep('form');
      setPreview(null);
      setFile(null);
      setResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Проверяем, использовал ли уже пользователь trial
  if (localStorage.getItem("trial_used")) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm">
        <div className="bg-ivory w-full max-w-md rounded-3xl shadow-2xl p-8 text-center">
          <p className="font-serif text-gold text-xs tracking-widest uppercase mb-2">Бесплатный анализ</p>
          <h2 className="text-2xl font-serif text-charcoal mb-4">Вы уже использовали бесплатный анализ</h2>
          <p className="text-sm text-charcoal/60 mb-6">Для продолжения необходимо оплатить полный пакет</p>
          <button
            onClick={onUnlock}
            className="w-full py-3 rounded-full bg-gold text-charcoal font-medium hover:bg-gold/90 transition-colors"
          >
            Выбрать тариф
          </button>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e?: MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!file || !height || !weight) return;
    setStep('loading');

    const formData = new FormData();
    formData.append("photos", file);
    formData.append("height", height);
    formData.append("weight", weight);
    formData.append("trial", "true");

    try {
      const res = await fetch("/api/trial", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Ошибка сервера");
      const data = await res.json();
      setResult(data);
      localStorage.setItem("trial_used", "true");
      setStep('result');
    } catch (err: any) {
      console.error("Trial error:", err);
      alert("Ошибка: " + (err?.message || "Попробуйте ещё раз"));
      setStep('form');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16 bg-charcoal/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-ivory w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden p-6 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 bg-charcoal/5 rounded-full">
          <X className="w-5 h-5 text-charcoal" />
        </button>

        {step === 'form' && (
          <>
            <p className="font-serif text-gold text-xs tracking-widest uppercase mb-1">Бесплатный анализ</p>
            <h2 className="text-2xl font-serif text-charcoal mb-4">Узнайте свой стиль</h2>
            <p className="text-sm text-charcoal/60 mb-4">Чёткое портретное фото при хорошем освещении — для максимального сходства в генерациях</p>

            <div className="flex gap-3 mb-3">
              <input type="number" value={height} onChange={e => setHeight(e.target.value)} placeholder="Рост (см)"
                className="flex-1 px-3 py-2 rounded-lg border border-charcoal/20 text-sm" />
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Вес (кг)"
                className="flex-1 px-3 py-2 rounded-lg border border-charcoal/20 text-sm" />
            </div>

            {preview ? (
              <div className="relative mb-3 rounded-xl overflow-hidden aspect-[3/4] max-h-48">
                <img src={preview} alt="" className="w-full h-full object-cover" />
                <button onClick={() => { setPreview(null); setFile(null); }} className="absolute top-2 right-2 p-1 bg-black/50 rounded-full">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <>
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-charcoal/20 rounded-xl p-6 text-center cursor-pointer hover:border-gold mb-2">
                  <Upload className="w-8 h-8 text-charcoal/40 mx-auto mb-2" />
                  <p className="text-sm text-charcoal">Загрузить фото</p>
                </div>
                <p className="text-xs text-charcoal/50 text-center mb-3">Чёткое фото лица, взгляд в камеру, хорошее освещение</p>
              </>
            )}

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <button type="button" onClick={(e) => { e.preventDefault(); handleSubmit(); }} disabled={!file || !height || !weight}
              className="w-full py-3 rounded-full bg-charcoal text-ivory text-sm font-medium disabled:opacity-50">
              Получить бесплатный анализ
            </button>
          </>
        )}

        {step === 'loading' && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-charcoal/60">Анализируем ваш стиль...</p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            {/* Анализ стиля */}
            <div className="bg-gold/5 rounded-2xl p-4 border-l-2 border-gold">
              <h3 className="font-serif text-gold text-xs tracking-widest uppercase mb-2">Ваш персональный анализ</h3>
              <p className="text-sm text-charcoal/85 whitespace-pre-wrap leading-relaxed">{result.greetingAndAnalysis || ""}</p>
            </div>

            {/* Рекомендуемые вещи */}
            <div className="border-t border-charcoal/10 pt-4">
              <p className="text-xs font-medium text-gold uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-[10px]">✦</span>
                Подобранные вещи для вас
              </p>
              <div className="space-y-2">
                {[
                  { name: "Бежевый тренч из хлопка", price: "от 4 500 ₽", hint: "верхняя одежда", emoji: "🧥" },
                  { name: "Кожаные лоферы на низком каблуке", price: "от 3 200 ₽", hint: "обувь", emoji: "👞" },
                  { name: "Шёлковый шарф с принтом", price: "от 1 800 ₽", hint: "аксессуары", emoji: "🧣" },
                  { name: "Брюки чинос бежевого оттенка", price: "от 2 100 ₽", hint: "низ", emoji: "👖" },
                  { name: "Сумка-тоут из замши", price: "от 5 900 ₽", hint: "аксессуары", emoji: "👜" },
                ].map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-charcoal/5 hover:border-gold/30 transition-colors">
                    <span className="text-2xl">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-charcoal font-medium">{item.name}</p>
                      <p className="text-xs text-charcoal/50">{item.hint}</p>
                    </div>
                    <p className="text-xs text-gold font-medium whitespace-nowrap">{item.price}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <button className="px-2 py-1 bg-[#CB11AB] text-white text-[10px] font-medium rounded hover:opacity-80 transition-opacity">
                        WB
                      </button>
                      <button className="px-2 py-1 bg-[#005BFF] text-white text-[10px] font-medium rounded hover:opacity-80 transition-opacity">
                        Ozon
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-charcoal/50 text-center">
                  + ещё 8 вещей в полной версии
                </p>
              </div>
            </div>

            {/* Заблюренное фото с замком */}
            <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden mb-3">
              {preview ? (
                <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover blur-xl scale-105" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-300 via-gray-200 to-gray-400" />
              )}
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-md shadow-xl flex items-center justify-center mb-3">
                  <span className="text-2xl">🔒</span>
                </div>
                <p className="text-xs text-white font-medium">Визуализация готова!</p>
              </div>
            </div>

            {/* Предложение 99₽ */}
            <div className="bg-gradient-to-r from-gold/10 via-gold/20 to-gold/10 rounded-xl p-3 mb-3 border border-gold/30">
              <p className="text-center text-sm text-charcoal font-medium">
                ✨ Только сейчас — полный пакет за 99 ₽
              </p>
              <p className="text-center text-xs text-charcoal/60 mt-1">
                3 фото-визуализации вас + описания + ссылки
              </p>
            </div>
            <div className="flex flex-col gap-1.5 text-sm text-charcoal/80">
              <div className="flex items-center gap-2">
                <span>🎨</span>
                <span>3 фото-визуализации вас в разных образах</span>
              </div>
              <div className="flex items-center gap-2">
                <span>📝</span>
                <span>3 подробных описания стиля</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🛒</span>
                <span>Все вещи со ссылками на покупку</span>
              </div>
            </div>

            {/* Кнопки */}
            <div className="border-t border-charcoal/10 pt-4 mt-4">
              <button onClick={onUnlock} className="w-full py-3 rounded-2xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors">
                Получить 3 образа за 99 ₽
              </button>
              <button onClick={onClose} className="w-full py-2 text-sm text-charcoal/50 mt-2">
                Попробовать позже
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
      if (data.valid) {
        setPromoStatus("valid");
        if (data.tier) setSelectedTier(data.tier);
        setTimeout(() => { onPaid(data.tier || selectedTier); onClose(); }, 800);
      } else if (data.reason === "used") {
        setPromoStatus("used");
      } else {
        setPromoStatus("invalid");
      }
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
          <button onClick={onClose} className="absolute top-5 right-5 p-2 bg-charcoal/5 rounded-full hover:bg-charcoal/10 z-10">
            <X className="w-5 h-5 text-charcoal" />
          </button>

          <div className="p-8 md:p-10">
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
                <ul className="text-sm text-charcoal/60 space-y-1">
                  <li>✓ Анализ внешности</li>
                  <li>✓ 3 образа от стилиста</li>
                  <li>✓ Список покупок</li>
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
                <ul className={`text-sm space-y-1 ${selectedTier === "premium" ? "text-ivory/70" : "text-charcoal/60"}`}>
                  <li>✓ Всё из Стандарт</li>
                  <li>✓ До 5 образов</li>
                  <li>✓ Пожелания стилисту</li>
                  <li>✓ Астро-разбор</li>
                </ul>
              </button>
            </div>

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

// --- Group Stylize Modal ---
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
const StylizeModal = ({ isOpen, onClose, userName, tier, onToast, onNewLooks }: { isOpen: boolean; onClose: () => void; userName: string; tier: Tier; onToast: (msg: string, type: 'success'|'error'|'info') => void; onNewLooks: () => void }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [wishes, setWishes] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [birthRegion, setBirthRegion] = useState(""); // для гороскопа
  const [birthCity, setBirthCity] = useState(""); // для гороскопа
  const [birthTime, setBirthTime] = useState(""); // для гороскопа
  const [looksCount, setLooksCount] = useState(3);
  const [loadingState, setLoadingState] = useState<{ step: number; text: string } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewSent, setReviewSent] = useState(false);

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
      setBirthDay("");
      setBirthMonth("");
      setBirthYear("");
      setBirthRegion("");
      setBirthCity("");
      setBirthTime("");
      setResult(null);
      setErrorMsg(null);
      setLoadingState(null);
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.src = e.target?.result as string;
        img.onload = () => {
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
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob); else reject(new Error('Resize failed'));
          }, 'image/jpeg', 0.8);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoadingState({ step: 0.5, text: "Оптимизация фотографий для нейросети..." });
    setErrorMsg(null);
    
    try {
      const formData = new FormData();
      for (const file of files) {
        try {
          const resizedBlob = await resizeImage(file);
          formData.append("images", resizedBlob, file.name);
        } catch (e) {
          // fallback if resize fails
          formData.append("images", file);
        }
      }
      
      setLoadingState({ step: 1, text: "Анализ телосложения и параметров..." });
      
      formData.append("height", height);
      formData.append("weight", weight);
      formData.append("wishes", wishes);
      formData.append("looksCount", String(looksCount));
      formData.append("userName", userName);
      formData.append("visitCount", String(incrementVisitCount()));
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
            setTimeout(() => {
              document.getElementById('modal-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
          } else if (data.type === "result") {
            setLoadingState({ step: 5, text: "Готово!" });
            // Save look names to history
            if (data.looks?.length) savePastLooks(data.looks.map((l: any) => l.lookName).filter(Boolean));
            // Update with enriched items (real products)
            setResult({
              greetingAndAnalysis: data.greetingAndAnalysis,
              bodyTypeSummary: data.bodyTypeSummary,
              astroReading: data.astroReading || null,
              looks: data.looks
            });
          } else if (data.type === "error") {
            throw new Error(data.error);
          }
        }
      }

    } catch (error: any) {
      console.error("Full error:", error);
      setErrorMsg(`Упс, произошла ошибка: ${error?.message || JSON.stringify(error)}`);
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
          className="bg-ivory w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden relative mb-20"
        >
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-charcoal/5 rounded-full hover:bg-charcoal/10 transition-colors z-10"
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
                  
                  <h3 className="text-3xl font-serif mb-6 text-center px-4 tracking-wide">Создаем магию...</h3>
                  
                  <div className="w-72 bg-white/10 rounded-full h-2.5 mb-4 overflow-hidden relative">
                    <motion.div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-gold/50 via-gold to-gold/50"
                      initial={{ width: "0%" }}
                      animate={{ width: `${(loadingState.step / 5) * 100}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                  <div className="text-gold text-sm font-medium mb-6">
                    {Math.round((loadingState.step / 5) * 100)}%
                  </div>

                  <div className="w-72 space-y-2 mt-2">
                    {PROGRESS_STAGES.map((stage, i) => {
                      const activeIndex = getActiveStageIndex(loadingState.step);
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
            <p className="text-charcoal/60 mb-8">Загрузите до 3-х фото, укажите параметры, и наш ИИ подберет идеальный гардероб.</p>

            {errorMsg && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 flex items-start gap-3 border border-red-100">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {!result ? (
              <div className="flex flex-col items-center">
                
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

                {/* Wishes — premium only */}
                {tier === "premium" ? (
                <div className="w-full max-w-md mb-6">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-charcoal/70">
                      Пожелания стилисту
                    </label>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                      Premium
                    </span>
                  </div>
                  <textarea
                    value={wishes}
                    onChange={(e) => setWishes(e.target.value.slice(0, 500))}
                    placeholder="Например: «Хочу три ярких образа для отдыха на Бали», «Посоветуй макияж и причёску для свидания», «Нужен капсульный гардероб для бизнес-поездки»…"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors resize-none text-sm leading-relaxed"
                  />
                  <div className="text-[11px] text-charcoal/40 mt-1 text-right">
                    {wishes.length}/500
                  </div>
                </div>
                ) : null}

                {/* Looks count slider — premium only */}
                {tier === "premium" && (
                <div className="w-full max-w-md mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-charcoal/70">
                        Количество образов
                      </label>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                        Premium
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1} max={5}
                        value={looksCount}
                        onChange={(e) => setLooksCount(Number(e.target.value))}
                        className="flex-1 accent-gold"
                      />
                      <span className="text-charcoal font-medium w-6 text-center">{looksCount}</span>
                    </div>
                    <p className="text-[11px] text-charcoal/40 mt-1">От 1 до 5 образов</p>
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

                {/* Birth place and time — premium astro feature */}
                {tier === "premium" && (
                <div className="w-full max-w-md mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-charcoal/70">
                        Место и время рождения
                      </label>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-gold bg-gold/10 px-2 py-0.5 rounded-full">
                        Астро
                      </span>
                    </div>
                    <p className="text-[11px] text-charcoal/40 mb-2">
                      Для точного астрологического разбора укажите город и время рождения
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={birthRegion}
                        onChange={(e) => setBirthRegion(e.target.value)}
                        placeholder="Область"
                        className="w-32 px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm"
                      />
                      <input
                        type="text"
                        value={birthCity}
                        onChange={(e) => setBirthCity(e.target.value)}
                        placeholder="Город"
                        className="w-32 px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm"
                      />
                      <input
                        type="time"
                        value={birthTime}
                        onChange={(e) => setBirthTime(e.target.value)}
                        placeholder="Время"
                        className="w-28 px-3 py-2 rounded-xl border border-charcoal/20 bg-white focus:outline-none focus:border-gold transition-colors text-sm"
                      />
                    </div>
                  </div>
                )}

                {previewUrls.length === 0 ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full max-w-md aspect-[3/4] border-2 border-dashed border-charcoal/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-gold/5 transition-all group"
                  >
                    <div className="w-16 h-16 bg-charcoal/5 rounded-full flex items-center justify-center mb-4 group-hover:bg-gold/20 transition-colors">
                      <Upload className="w-8 h-8 text-charcoal/50 group-hover:text-gold transition-colors" />
                    </div>
                    <span className="font-medium text-charcoal">Нажмите, чтобы загрузить фото</span>
                    <span className="text-sm text-charcoal/50 mt-2">До 3 фото (JPEG, PNG)</span>
                  </div>
                ) : (
                  <div className="w-full max-w-md relative rounded-2xl overflow-hidden shadow-lg bg-charcoal/5 p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {previewUrls.map((url, idx) => (
                        <div key={idx} className="aspect-[3/4] rounded-xl overflow-hidden relative">
                           <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {previewUrls.length < 3 && (
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
                  multiple
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
                            <img src={look.image} alt={look.lookName} className="w-full h-auto" />
                          ) : (
                            <div className="w-full aspect-[3/4] bg-charcoal/5 flex flex-col p-6 items-center justify-center text-center text-charcoal/50">
                              <Camera className="w-12 h-12 mb-4 opacity-50 text-charcoal/40" />
                              <span className="font-medium text-lg text-charcoal mb-2">Не удалось сгенерировать фото</span>
                              {look.imageError && (
                                  <span className="text-sm font-mono text-red-500/80 mt-4 max-w-full truncate whitespace-normal leading-relaxed">Ошибка API: {look.imageError}</span>
                              )}
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
                        <p className="text-sm text-charcoal/75 leading-relaxed mb-8 whitespace-pre-wrap">
                          {look.description}
                        </p>

                        <h4 className="text-lg font-serif text-charcoal mb-5 flex items-center gap-3">
                          <ShoppingBag className="w-4 h-4 text-gold" />
                          Гардероб
                        </h4>

                        <div className="space-y-3">
                          {look.items.map((item, idx) => (
                            <div key={idx} className="p-3 bg-white rounded-2xl border border-charcoal/5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2">
                              {/* Product Image */}
                              {item.imageUrl && (
                                <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-charcoal/5">
                                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
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
  const [modalKey, setModalKey] = useState(0);
  const [currentTier, setCurrentTier] = useState<Tier>("standard");
  const [userName, setUserName] = useState(getSavedName);
  const [showWelcome, setShowWelcome] = useState(() => !getSavedName());
  const [prices, setPrices] = useState({ standard: 100, premium: 200 });

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
    setTimeout(() => setIsPricingOpen(true), 0);
  };

  const openTrialModal = () => {
    if (localStorage.getItem("trial_used")) {
      // Trial already used - redirect to payment
      setSelectedPricingTier("standard");
      setIsPricingOpen(true);
    } else {
      setIsTrialOpen(true);
    }
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
      <PricingModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} onPaid={handlePaid} userName={userName} initialTier={selectedPricingTier} prices={prices} />
      {isTrialOpen && <TrialModalContent isOpen={isTrialOpen} onClose={() => setIsTrialOpen(false)} userName={userName} onUnlock={() => setIsTrialPaymentOpen(true)} />}
      <TrialPaymentModal isOpen={isTrialPaymentOpen} onClose={() => setIsTrialPaymentOpen(false)} onPaid={() => {}} />
      <StylizeModal key={modalKey} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} userName={userName} tier={currentTier} onToast={(msg, type) => setToast({message: msg, type})} onNewLooks={() => { setIsModalOpen(false); setTimeout(() => openModal(), 100); }} />
      <GroupModal isOpen={isGroupOpen} onClose={() => setIsGroupOpen(false)} userName={userName} />

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
            <p className="text-base md:text-xl text-ivory/70 mb-10 leading-relaxed font-light max-w-2xl mx-auto">
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
                onClick={() => document.getElementById('lookbook')?.scrollIntoView({ behavior: 'smooth' })}
                className="border border-ivory/40 text-ivory px-8 py-3 sm:py-4 rounded-full text-base font-medium hover:bg-ivory/10 transition-colors">
                Смотреть примеры
              </button>
              <button
                onClick={() => openTrialModal()}
                className="border border-gold/40 text-gold px-8 py-3 sm:py-4 rounded-full text-base font-medium hover:bg-gold/10 transition-colors">
                Попробовать бесплатно
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 3. How it works — с Magic Mirror как иллюстрацией */}
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
              { icon: Smartphone, title: "Загрузите фото", desc: "Сделайте селфи в полный рост в простой, облегающей одежде." },
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

      {/* 4. Lookbook */}
      <section id="lookbook" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6"
          >
            <div>
              <h2 className="text-4xl md:text-5xl mb-4">Lookbook</h2>
              <p className="text-charcoal/60 text-lg font-light">Примеры генераций нашего ИИ-стилиста.</p>
            </div>
            <button className="text-sm font-medium uppercase tracking-widest hover:text-gold transition-colors flex items-center gap-2">
              Смотреть все <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { before: "/look1.jpg", after: "/look1a.png", label: "Мужской Casual" },
              { before: "/look2.jpg", after: "/look2a.png", label: "Яркий Летний" },
              { before: "/look3.jpg", after: "/look3a.jpg", label: "Стильное Преображение" }
            ].map((item, idx) => {
              const [tapped, setTapped] = useState(false);
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="relative group overflow-hidden rounded-2xl aspect-[3/4] md:aspect-[4/5] cursor-pointer"
                  onClick={() => setTapped(v => !v)}
                >
                  {/* Before Image */}
                  <img
                    src={item.before}
                    alt={`${item.label} До`}
                    loading="lazy"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${tapped ? "opacity-0" : "group-hover:opacity-0"}`}
                  />

                  {/* After Image */}
                  <img
                    src={item.after}
                    alt={`${item.label} После`}
                    loading="lazy"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${tapped ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/20 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-90"></div>

                  <div className="absolute bottom-6 left-6 right-6 flex flex-col items-start gap-3">
                    <span className="px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium tracking-wide border border-white/10">
                      {item.label}
                    </span>

                    {/* Interactive Hint */}
                    <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${tapped ? "text-gold" : "text-white/70 group-hover:text-gold"}`}>
                      <Sparkles className={`w-4 h-4 transition-opacity duration-300 ${tapped ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
                      <span>{tapped ? "Результат работы ИИ" : "Нажмите, чтобы увидеть магию"}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
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
                title: "Стандарт",
                tier: "standard" as Tier,
                price: `${prices.standard} ₽`,
                desc: "Один запрос — три готовых образа с визуализацией.",
                features: [
                  "3 полных образа под вашу фигуру",
                  "ИИ-визуализация каждого образа",
                  "Подбор цвета и стиля",
                  "Список вещей со ссылками",
                  "Советы по грумингу и парфюму",
                ],
                highlighted: false,
                badge: null,
              },
              {
                title: "Премиум",
                tier: "premium" as Tier,
                price: `${prices.premium} ₽`,
                desc: "Персональный разбор: внешность × знак зодиака × этот месяц.",
                features: [
                  "Всё из тарифа Стандарт",
                  "Произвольный запрос стилисту",
                  "Образы под конкретный повод",
                  "Астро-разбор вашего знака зодиака",
                  "Силовые цвета и стиль этого месяца",
                ],
                highlighted: true,
                badge: "Популярный",
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
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-charcoal/10 text-center text-sm text-charcoal/50">
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
