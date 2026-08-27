import { useEffect, useRef, useState, ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircle, Paperclip, Send, X, Shirt } from "lucide-react";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  previews?: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onOpenTariffs?: () => void;
  onToast?: (msg: string, type: "success" | "error" | "info") => void;
};

const WELCOME =
  "Привет! Я ваш стилист в чате. Спросите про гардероб, аксессуары, причёску или маникюр — или прикрепите фото вещей из шкафа. Отвечаю текстом; образы с вашим лицом — в тарифах на сайте.";

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function StylistChatModal({ isOpen, onClose, onOpenTariffs, onToast }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen, sending]);

  useEffect(() => {
    return () => {
      previews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previews]);

  const clearAttachments = () => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]);
    setPreviews([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []).slice(0, 4);
    if (!list.length) return;
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles(list);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && files.length === 0) || sending) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: text || "Посмотрите мой гардероб и дайте совет, что с чем сочетать.",
      previews: previews.length ? [...previews] : undefined,
    };

    const historyForApi = messages
      .filter((m) => m.id !== "welcome")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const attachFiles = [...files];
    clearAttachments();
    setSending(true);

    try {
      const fd = new FormData();
      fd.append("message", userMsg.text);
      fd.append("history", JSON.stringify(historyForApi));
      attachFiles.forEach((f) => fd.append("photos", f));

      const res = await fetch("/api/stylist-chat", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Не удалось получить ответ");
      }
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: String(data.reply || "").trim() || "Попробуйте переформулировать вопрос." },
      ]);
    } catch (e: any) {
      const msg = e?.message || "Ошибка связи. Попробуйте ещё раз.";
      onToast?.(msg, "error");
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", text: `Не получилось ответить: ${msg}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-charcoal/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="bg-ivory w-full sm:max-w-lg sm:rounded-3xl shadow-2xl flex flex-col h-[92vh] sm:h-[min(86vh,720px)] relative overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-charcoal/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-gold" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-lg text-charcoal truncate">Чат со стилистом</h2>
                <p className="text-xs text-charcoal/50 truncate">Гардероб · аксессуары · причёска · маникюр</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-charcoal/5 hover:bg-charcoal/10" aria-label="Закрыть">
              <X className="w-5 h-5 text-charcoal" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-charcoal text-ivory rounded-br-md"
                      : "bg-white border border-charcoal/10 text-charcoal rounded-bl-md"
                  }`}
                >
                  {m.previews && m.previews.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {m.previews.map((src, i) => (
                        <img key={i} src={src} alt="" className="w-14 h-14 object-cover rounded-lg" />
                      ))}
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-charcoal/10 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-charcoal/50">
                  Стилист думает…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-charcoal/10 px-4 py-3 bg-ivory">
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => onOpenTariffs?.()}
                className="text-[11px] px-3 py-1.5 rounded-full bg-gold/15 text-charcoal font-medium hover:bg-gold/25"
              >
                Тарифы с картинками
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-[11px] px-3 py-1.5 rounded-full bg-charcoal/5 text-charcoal/70 font-medium hover:bg-charcoal/10 inline-flex items-center gap-1"
              >
                <Shirt className="w-3 h-3" />
                Фото гардероба
              </button>
            </div>

            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {previews.map((src, i) => (
                  <img key={i} src={src} alt="" className="w-12 h-12 object-cover rounded-lg border border-charcoal/10" />
                ))}
                <button type="button" onClick={clearAttachments} className="text-xs text-charcoal/50 underline self-center">
                  Убрать фото
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={onPickFiles}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="p-3 rounded-xl bg-charcoal/5 hover:bg-charcoal/10 flex-shrink-0"
                aria-label="Прикрепить фото"
                disabled={sending}
              >
                <Paperclip className="w-5 h-5 text-charcoal/70" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, 800))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Спросите про гардероб, маникюр, причёску…"
                className="flex-1 resize-none rounded-xl border border-charcoal/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-gold"
                disabled={sending}
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || (!input.trim() && files.length === 0)}
                className="p-3 rounded-xl bg-gold text-charcoal hover:bg-gold/90 disabled:opacity-40 flex-shrink-0"
                aria-label="Отправить"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[10px] text-charcoal/40 mt-2 text-center">
              Только текст. Уход за лицом и другие темы — вне чата.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
