/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, Smartphone, Sparkles, Shirt, ArrowRight, Check, ChevronLeft, ChevronRight, Upload, X, ShoppingBag, AlertCircle, Camera, Download, Lock } from 'lucide-react';

// --- localStorage helpers ---
function getSavedName(): string { return localStorage.getItem("you-stile-user-name") || ""; }
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
        src="/after.png" 
        alt="Before: Casual Home Clothes" 
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
      
      {/* After Image (Top, Clipped) */}
      <img 
        src="/before.png" 
        alt="After: Premium Styled Look" 
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
      .then(d => { setQrCode(d.qrCode); setPaymentId(d.paymentId); })
      .catch(() => {})
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
const TrialModal = ({ isOpen, onClose, onUpgrade }: {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}) => {
  const [trialFiles, setTrialFiles] = useState<File[]>([]);
  const [trialPreviewUrls, setTrialPreviewUrls] = useState<string[]>([]);
  const [trialHeight, setTrialHeight] = useState("");
  const [trialWeight, setTrialWeight] = useState("");
  const [trialResult, setTrialResult] = useState<{ greetingAndAnalysis: string } | null>(null);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialStep, setTrialStep] = useState(0);
  const [trialPreviewUrl, setTrialPreviewUrl] = useState<string | null>(null);
  const trialFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setTrialFiles([]);
      setTrialPreviewUrls([]);
      setTrialPreviewUrl(null);
      setTrialHeight("");
      setTrialWeight("");
      setTrialResult(null);
      setTrialError(null);
      setTrialStep(0);
    }
  }, [isOpen]);

  const handleTrialFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const files = newFiles.slice(0, 3);
      const urls = files.map(file => URL.createObjectURL(file));
      setTrialFiles(files);
      setTrialPreviewUrls(urls);
      setTrialPreviewUrl(urls[0] || null);
    }
  };

  const handleTrialSubmit = async () => {
    if (trialFiles.length === 0 || !trialHeight || !trialWeight) return;
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
                  className="w-32 h-24 border-2 border-dashed border-charcoal/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-gold hover:bg-gold/5 transition-all mb-6"
                >
                  <Camera className="w-5 h-5 text-charcoal/30 mb-1" />
                  <p className="text-[10px] text-charcoal/50">Загрузить фото</p>
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
                disabled={trialStep > 0 || trialFiles.length === 0 || !trialHeight || !trialWeight}
                className="w-full py-4 rounded-2xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors disabled:opacity-50"
              >
                {trialStep > 0 ? "Анализируем..." : "Получить бесплатный анализ"}
              </button>

              {trialStep > 0 && (
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
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-gold" />
                </div>
                <div>
                  <h3 className="text-xl font-serif text-charcoal">Анализ готов!</h3>
                  <p className="text-sm text-charcoal/60">Ваш персональный стиль</p>
                </div>
              </div>

              {/* Blurred Photo + Lock */}
              {trialPreviewUrl && (
                <div className="relative rounded-2xl overflow-hidden mb-6">
                  <img
                    src={trialPreviewUrl}
                    alt=""
                    className="w-full max-w-sm mx-auto h-80 object-cover filter blur-lg brightness-50"
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-charcoal/80 flex items-center justify-center mb-3">
                      <Lock className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-white/80 text-sm font-medium">Разблокируйте полный доступ</p>
                    <p className="text-white/60 text-xs mt-1">Получите 3 готовых образа</p>
                  </div>
                </div>
              )}

              {/* Analysis Text */}
              <div className="bg-white rounded-2xl p-6 mb-6">
                <h4 className="text-sm font-medium text-charcoal/60 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  Анализ вашего стиля
                </h4>
                <p className="text-sm text-charcoal/80 whitespace-pre-wrap leading-relaxed">
                  {typeof trialResult?.greetingAndAnalysis === 'string'
                    ? trialResult?.greetingAndAnalysis
                    : JSON.stringify(trialResult, null, 2)}
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors text-sm"
                >
                  Закрыть
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onUpgrade();
                  }}
                  className="flex-1 py-3 rounded-xl bg-gold text-charcoal font-semibold hover:bg-gold/90 transition-colors text-sm"
                >
                  Получить 3 образа
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const PricingModal = ({ isOpen, onClose, onPaid, initialTier }: {
  isOpen: boolean;
  onClose: () => void;
  onPaid: (tier: Tier) => void;
  initialTier?: Tier;
}) => {
  const [step, setStep] = useState<"choose" | "pay">("choose");
  const [selectedTier, setSelectedTier] = useState<Tier>(initialTier || "standard");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "used">("idle");
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPromoCode("");
      setPromoStatus("idle");
      setShowPayment(false);
      if (initialTier) {
        setSelectedTier(initialTier);
        setStep("pay");
      } else {
        setStep("choose");
      }
    }
  }, [isOpen, initialTier]);

  const price = selectedTier === "standard" ? 100 : 200;

  const handleSelectTier = (tier: Tier) => {
    setSelectedTier(tier);
    setPromoCode("");
    setPromoStatus("idle");
    setStep("pay");
  };

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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-charcoal/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) { setStep("choose"); onClose(); } }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          className="bg-ivory w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden relative"
        >
          <button onClick={() => { setStep("choose"); onClose(); }}
            className="absolute top-5 right-5 p-2 bg-charcoal/5 rounded-full hover:bg-charcoal/10 z-10">
            <X className="w-5 h-5 text-charcoal" />
          </button>

          {step === "choose" && (
            <div className="p-8 md:p-10">
              <p className="font-serif text-gold text-xs tracking-[0.3em] uppercase mb-2 text-center">Выберите тариф</p>
              <h2 className="text-2xl md:text-3xl font-serif text-charcoal text-center mb-8">Начните преображение</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Standard */}
                <button onClick={() => handleSelectTier("standard")}
                  className="group border-2 border-charcoal/10 hover:border-gold rounded-2xl p-6 text-left transition-all hover:shadow-lg">
                  <div className="text-2xl font-serif font-bold text-charcoal mb-1">100 ₽</div>
                  <div className="font-medium text-charcoal mb-3">Стандарт</div>
                  <ul className="text-sm text-charcoal/60 space-y-1">
                    <li>✓ Анализ внешности</li>
                    <li>✓ 3 образа от стилиста</li>
                    <li>✓ Список покупок</li>
                  </ul>
                  <div className="mt-4 text-xs font-medium text-charcoal/40 group-hover:text-gold transition-colors uppercase tracking-wider">Выбрать →</div>
                </button>
                {/* Premium */}
                <button onClick={() => handleSelectTier("premium")}
                  className="group border-2 border-gold bg-charcoal rounded-2xl p-6 text-left transition-all hover:shadow-lg relative overflow-hidden">
                  <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest font-bold text-charcoal bg-gold px-2 py-0.5 rounded-full">Популярный</div>
                  <div className="text-2xl font-serif font-bold text-gold mb-1">200 ₽</div>
                  <div className="font-medium text-ivory mb-3">Премиум</div>
                  <ul className="text-sm text-ivory/60 space-y-1">
                    <li>✓ Всё из Стандарт</li>
                    <li>✓ До 5 образов</li>
                    <li>✓ Пожелания стилисту</li>
                    <li>✓ Астро-разбор</li>
                  </ul>
                  <div className="mt-4 text-xs font-medium text-ivory/40 group-hover:text-gold transition-colors uppercase tracking-wider">Выбрать →</div>
                </button>
              </div>
            </div>
          )}

          {step === "pay" && (
            <div className="p-8 md:p-10">
              <button onClick={() => setStep("choose")} className="text-sm text-charcoal/50 hover:text-charcoal mb-6 flex items-center gap-1">
                ← Назад
              </button>
              <p className="font-serif text-gold text-xs tracking-[0.3em] uppercase mb-2">
                {selectedTier === "standard" ? "Стандарт" : "Премиум"}
              </p>
              <h2 className="text-2xl font-serif text-charcoal mb-8">Оплата — {price} ₽</h2>

              {/* Промокод */}
              <div className="mb-6">
                <label className="text-sm font-medium text-charcoal/70 block mb-2">Промокод</label>
                <div className="flex gap-2">
                  <input
                    value={promoCode}
                    onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoStatus("idle"); }}
                    onKeyDown={e => e.key === "Enter" && handlePromo()}
                    placeholder="Введите промокод"
                    className={`flex-1 px-4 py-3 rounded-xl border text-sm focus:outline-none transition-colors ${
                      promoStatus === "valid" ? "border-green-400 bg-green-50" :
                      promoStatus === "invalid" ? "border-red-300 bg-red-50" :
                      "border-charcoal/20 bg-white focus:border-gold"
                    }`}
                  />
                  <button onClick={handlePromo} disabled={!promoCode.trim() || promoStatus === "checking"}
                    className="px-4 py-3 rounded-xl bg-charcoal text-ivory text-sm font-medium hover:bg-charcoal/90 disabled:opacity-40 transition-colors">
                    {promoStatus === "checking" ? "..." : "Применить"}
                  </button>
                </div>
                {promoStatus === "valid" && <p className="text-green-600 text-xs mt-1">✓ Промокод принят — доступ открыт бесплатно!</p>}
                {promoStatus === "used" && <p className="text-red-500 text-xs mt-1">Промокод уже был использован</p>}
                {promoStatus === "invalid" && <p className="text-red-500 text-xs mt-1">Промокод не найден</p>}
              </div>

              <div className="border-t border-charcoal/10 pt-6">
                <p className="text-sm text-charcoal/50 text-center">Введите промокод для получения доступа</p>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
      <PaymentModal
        isOpen={showPayment}
        tier={selectedTier}
        onPaid={() => { onPaid(selectedTier); onClose(); }}
        onClose={() => setShowPayment(false)}
      />
    </AnimatePresence>
  );
};

// --- Stylize Modal Component ---
const StylizeModal = ({ isOpen, onClose, userName, tier }: { isOpen: boolean; onClose: () => void; userName: string; tier: Tier }) => {
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
      description: string;
      image: string | null;
      imageError?: string | null;
      items: { name: string; description?: string; price: string; url?: string; marketplace?: string; imageUrl?: string | null; productUrl?: string | null; wbUrl?: string | null; ozonUrl?: string | null; ymUrl?: string | null; similarity?: string | null; reason?: string | null }[];
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
                  
                  <div className="w-72 bg-white/10 rounded-full h-1.5 mb-8 overflow-hidden relative">
                    <motion.div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-gold/50 via-gold to-gold/50"
                      initial={{ width: "0%" }}
                      animate={{ width: `${(loadingState.step / 5) * 100}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                  
                  <div className="h-12 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      <motion.p 
                        key={loadingState.text}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                        className="text-white/90 text-center px-8 font-light tracking-wide text-lg"
                      >
                        {loadingState.text}
                      </motion.p>
                    </AnimatePresence>
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
                          <div className="absolute bottom-4 left-4 right-4">
                            <span className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-full text-charcoal text-sm font-medium tracking-wide shadow-lg">
                              Образ {lookIdx + 1}: {look.lookName}
                            </span>
                          </div>
                        </div>
                        {look.image && (
                          <button
                            onClick={async () => {
                              const safeName = (look.lookName || `look-${lookIdx + 1}`).replace(/[^а-яa-z0-9\-_ ]/gi, '').trim() || `look-${lookIdx + 1}`;
                              try {
                                const img = new window.Image();
                                img.crossOrigin = 'anonymous';
                                await new Promise<void>((resolve, reject) => {
                                  img.onload = () => resolve();
                                  img.onerror = () => reject(new Error('img load'));
                                  img.src = look.image as string;
                                });

                                // Layout: photo on left, text on right (side-by-side)
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
                                if (!mctx) return;

                                const titleSize = 56;
                                const bodySize = 28;
                                const itemNameSize = 28;
                                const itemDescSize = 22;
                                const lineGap = 1.4;

                                mctx.font = `700 ${titleSize}px serif`;
                                const titleLines = wrap(mctx, `Образ ${lookIdx + 1}: ${look.lookName}`, textW);

                                mctx.font = `400 ${bodySize}px sans-serif`;
                                const descLines = wrap(mctx, look.description || '', textW);

                                mctx.font = `700 ${titleSize - 12}px serif`;
                                const itemsHeaderLines = wrap(mctx, '🛍 Гардероб', textW);

                                const itemsBlocks: { name: string[]; desc: string[] }[] = look.items.map(it => {
                                  mctx.font = `600 ${itemNameSize}px sans-serif`;
                                  const nameLines = wrap(mctx, it.name + (it.price ? `   —   ${it.price}` : ''), textW);
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
                                textHeight += padding;

                                const totalH = Math.max(photoH + padding * 2, textHeight);

                                const canvas = document.createElement('canvas');
                                canvas.width = totalW;
                                canvas.height = totalH;
                                const ctx = canvas.getContext('2d');
                                if (!ctx) return;;

                                ctx.fillStyle = '#FAF7F2';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);

                                // Картинка слева
                                ctx.drawImage(img, padding, padding, photoW, photoH);

                                // Текст справа
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

                                canvas.toBlob((blob) => {
                                  if (!blob) throw new Error('blob');
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${safeName}.jpg`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                }, 'image/jpeg', 0.92);
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
                      </div>
                      
                      {/* Description & Shopping List */}
                      <div className="flex flex-col">
                        <h3 className="text-xl font-serif text-charcoal mb-3">
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
                                <h4 className="font-medium text-charcoal text-sm leading-tight">{item.name}</h4>
                                <span className="font-serif text-gold text-sm whitespace-nowrap">{item.price}</span>
                              </div>
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
                  onClick={() => { setResult(null); setFiles([]); setPreviewUrls([]); }}
                  className="mt-8 w-full max-w-md mx-auto py-4 rounded-full border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors"
                >
                  Создать новые образы
                </button>
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
  const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [currentTier, setCurrentTier] = useState<Tier>("standard");
  const [userName, setUserName] = useState(getSavedName);
  const [showWelcome, setShowWelcome] = useState(() => !getSavedName());
  const [menuOpen, setMenuOpen] = useState(false);

  const [selectedPricingTier, setSelectedPricingTier] = useState<Tier>("standard");

  const openModal = (tier?: Tier) => {
    const t = tier || "standard";
    setSelectedPricingTier(t);
    setTimeout(() => setIsPricingOpen(true), 0);
  };

  const openTrialModal = () => {
    setIsTrialModalOpen(true);
  };

  const handlePaid = (tier: Tier) => {
    setCurrentTier(tier);
    setModalKey(k => k + 1);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
      <PricingModal isOpen={isPricingOpen} onClose={() => setIsPricingOpen(false)} onPaid={handlePaid} initialTier={selectedPricingTier} />
      <TrialModal isOpen={isTrialModalOpen} onClose={() => setIsTrialModalOpen(false)} onUpgrade={() => setIsPricingOpen(true)} />
      <StylizeModal key={modalKey} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} userName={userName} tier={currentTier} />

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
          style={{ backgroundImage: "url('/gucci.png')" }}
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
            <p className="text-lg md:text-xl text-ivory/70 mb-12 leading-relaxed font-light max-w-2xl mx-auto">
              Загрузи чёткое фото лица — стилист воссоздаст образ именно с вашей внешностью. Рост и вес вводятся вручную для идеальной посадки одежды.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => openModal()}
                className="bg-gold text-charcoal px-10 py-4 rounded-full text-base font-semibold hover:bg-gold/90 transition-all flex items-center justify-center gap-2 group"
              >
                Начать преображение
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => document.getElementById('lookbook')?.scrollIntoView({ behavior: 'smooth' })}
                className="border border-ivory/40 text-ivory px-10 py-4 rounded-full text-base font-medium hover:bg-ivory/10 transition-colors">
                Смотреть примеры
              </button>
              <button
                onClick={() => openTrialModal()}
                className="border border-gold/40 text-gold px-10 py-4 rounded-full text-base font-medium hover:bg-gold/10 transition-colors">
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
              { icon: Sparkles, title: "Нейросеть анализирует", desc: "Nano Banana учитывает ваш рост, вес, цветотип и особенности фигуры." },
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
              { before: "/look3.jpg", after: "/Look3a.jpg", label: "Стильное Преображение" }
            ].map((item, idx) => {
              const [tapped, setTapped] = useState(false);
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="relative group overflow-hidden rounded-2xl aspect-[4/5] cursor-pointer"
                  onClick={() => setTapped(v => !v)}
                >
                  {/* Before Image */}
                  <img
                    src={item.before}
                    alt={`${item.label} До`}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${tapped ? "opacity-0" : "group-hover:opacity-0"}`}
                  />

                  {/* After Image */}
                  <img
                    src={item.after}
                    alt={`${item.label} После`}
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
                price: "100 ₽",
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
                price: "200 ₽",
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
      </footer>
    </div>
  );
}
