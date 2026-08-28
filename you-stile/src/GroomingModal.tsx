import { useState, useRef, useEffect, ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Camera, ArrowRight, Check, Share2, Download, Sparkles, RotateCcw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MasterHowTo, HomeHowTo } from "./grooming/MasterHowTo";

const FREE_KEY = "grooming_free_used";
const PAID_KEY = "grooming_payment_id";
const JOB_KEY = "grooming_job_id";
const LAST_JOB_KEY = "grooming_last_job_id";
const LAST_PAID_JOB_KEY = "grooming_last_paid_job_id";
const PAID_JOBS_KEY = "grooming_paid_jobs";
const GROOMING_MAX_MS = 30 * 60 * 1000; // 30 минут — запас на 6 кадров gpt-image

const GROOMING_STAGES = [
  { step: 0.5, label: "Анализ лица" },
  { step: 1.5, label: "Подбор причёски" },
  { step: 2.0, label: "Создание образа" },
  { step: 3.0, label: "Генерация фото" },
  { step: 4.0, label: "Финальные штрихи" },
  { step: 5.0, label: "Готово!" },
];

function getGroomingStageIndex(s: number): number {
  for (let i = GROOMING_STAGES.length - 1; i >= 0; i--) {
    if (s >= GROOMING_STAGES[i].step) return i;
  }
  return 0;
}

type GroomingLook = {
  name: string;
  hairColor: string;
  lipColor?: string;
  description: string;
  why: string;
  outfitNote?: string;
  afterNote?: string;
  masterHowTo?: string;
  imageClose?: string | null;
  imageAfter?: string | null;
  imageFull?: string | null;
  imageError?: string | null;
};

function rememberPaidGroomingJob(jobId: string) {
  const id = String(jobId || "").trim();
  if (!id) return;
  try {
    localStorage.setItem(LAST_PAID_JOB_KEY, id);
    const raw = localStorage.getItem(PAID_JOBS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [id, ...list.filter((x) => x !== id)].slice(0, 50);
    localStorage.setItem(PAID_JOBS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function saveCabinetGroomingOrder(paymentId: string) {
  const id = String(paymentId || "").trim();
  if (!id) return;
  rememberPaidGroomingJob(id);
  try {
    const raw = localStorage.getItem("you-stile-my-orders");
    const all: Array<{ paymentId: string; tier: string; createdAt: number; thumbnail?: string }> = raw ? JSON.parse(raw) : [];
    const prev = all.find((o) => o.paymentId === id);
    const next = all.filter((o) => o.paymentId !== id);
    next.push({
      paymentId: id,
      tier: "grooming",
      createdAt: prev?.createdAt || Date.now(),
      thumbnail: prev?.thumbnail,
    });
    localStorage.setItem("you-stile-my-orders", JSON.stringify(next.slice(-50)));
    window.dispatchEvent(new Event("you-stile-orders-changed"));
  } catch { /* ignore */ }
}

function savePickupCodeFromGrooming(code: string) {
  const body = String(code || "").toUpperCase().replace(/СТИЛЬ/g, "").replace(/[^A-Z0-9]/g, "");
  if (body.length >= 6) localStorage.setItem("you-stile-pickup-code", body.slice(0, 8));
}

function lookHasAfterPhoto(look?: GroomingLook | null) {
  return !!(look?.imageAfter && String(look.imageAfter).trim());
}

function resultMissingAfter(data: Result | null) {
  if (!data) return true;
  if (data.mode === "free") return !lookHasAfterPhoto(data.bestLook);
  const looks = data.looks || [];
  if (looks.length < 3) return true;
  return looks.some((look) => !lookHasAfterPhoto(look));
}

function paidPackageIncomplete(data: Result | null) {
  if (!data || data.mode !== "paid") return false;
  const looks = data.looks || [];
  if (looks.length < 3) return true;
  const sc = data.skincare;
  const products = sc?.products || [];
  if (!String(sc?.summary || "").trim() || products.length < 4) return true;
  const withHow = products.filter((p) => String(p.howTo || p.dosage || "").trim().length > 8).length;
  return withHow < 4;
}

function groomingLooksSettled(data: Result | null) {
  if (!data) return false;
  if (data.mode === "free") return lookHasAfterPhoto(data.bestLook) || !!data.bestLook?.imageError;
  const looks = data.looks || [];
  if (looks.length < 3) return false;
  return looks.every((look) => lookHasAfterPhoto(look) || !!look.imageError);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text || "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (ctx.measureText(word).width > maxWidth) {
        if (line) {
          lines.push(line);
          line = "";
        }
        let chunk = "";
        for (const ch of word) {
          const test = chunk + ch;
          if (ctx.measureText(test).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = test;
          }
        }
        line = chunk;
        continue;
      }
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawCoverPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const targetRatio = w / h;
  const srcRatio = img.width / img.height;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function safeLoadGroomingImg(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return null;
  try {
    return await loadGroomingImg(src);
  } catch {
    return null;
  }
}

type SheetBlock = { kicker?: string; title?: string; body: string };

function lookToSheetBlocks(look: GroomingLook): SheetBlock[] {
  const blocks: SheetBlock[] = [];
  const meta = [
    look.hairColor ? `Цвет: ${look.hairColor}` : "",
    look.lipColor ? `Помада: ${look.lipColor}` : "",
  ].filter(Boolean).join("  ·  ");
  if (meta) blocks.push({ body: meta });
  if (look.description) blocks.push({ body: look.description });
  if (look.why) blocks.push({ kicker: "Почему вам", body: look.why });
  if (look.outfitNote) blocks.push({ kicker: "Образ", body: look.outfitNote });
  if (look.masterHowTo) blocks.push({ kicker: "Для мастера в салоне", body: look.masterHowTo });
  if (look.afterNote) blocks.push({ body: look.afterNote });
  return blocks;
}

function careToSheetBlocks(result: any): SheetBlock[] {
  if (!result || result.mode === "free") return [];
  const blocks: SheetBlock[] = [];
  if (result.coachNote) blocks.push({ title: "Заметка стилиста", body: result.coachNote });
  const fa = result.faceAnalysis;
  if (fa) {
    const bits = [fa.faceShape, fa.colorType, fa.skinType, fa.eyeShape, fa.hairStatus].filter(Boolean).join(" · ");
    const body = [fa.strengths && `Сильные стороны: ${fa.strengths}`, fa.weaknesses && `Зоны внимания: ${fa.weaknesses}`, bits]
      .filter(Boolean)
      .join("\n");
    if (body) blocks.push({ title: "Разбор лица", body });
  }
  const sc = result.skincare;
  if (sc) {
    const products = (sc.products || [])
      .map((p: any) => {
        const name = [p.brand, p.name].filter(Boolean).join(" ");
        const how = String(p.howTo || p.dosage || "").trim();
        if (!name) return "";
        return how ? `• ${name} — ${how}` : `• ${name}`;
      })
      .filter(Boolean)
      .join("\n");
    const body = [
      sc.summary,
      sc.amRoutine && `Утро: ${sc.amRoutine}`,
      sc.pmRoutine && `Вечер: ${sc.pmRoutine}`,
      sc.homeHowTo && `Дома: ${sc.homeHowTo}`,
      products,
    ].filter(Boolean).join("\n\n");
    if (body) blocks.push({ title: "Уход за лицом", body });
  }
  const mk = result.makeup;
  if (mk) {
    const body = [
      mk.summary,
      mk.dayLook && `День: ${mk.dayLook}`,
      mk.eveningLook && `Вечер: ${mk.eveningLook}`,
    ].filter(Boolean).join("\n\n");
    if (body) blocks.push({ title: "Макияж под вас", body });
  }
  return blocks;
}

/** JPEG «до | после» + описание — как «Сохранить образ с описанием» у образов. */
async function renderGroomingLookSheet(opts: {
  look: GroomingLook;
  beforeSrc?: string | null;
  heading?: string;
  blocks?: SheetBlock[];
  photos?: boolean;
}): Promise<HTMLCanvasElement> {
  const look = opts.look;
  const W = 1080;
  const PAD = 48;
  const GAP = 12;
  const PHOTO_W = Math.floor((W - PAD * 2 - GAP) / 2);
  const PHOTO_H = Math.round((PHOTO_W * 4) / 3);
  const textW = W - PAD * 2;
  const showPhotos = opts.photos !== false;
  const [beforeImg, afterImg] = showPhotos
    ? await Promise.all([
        safeLoadGroomingImg(opts.beforeSrc || look.imageClose),
        safeLoadGroomingImg(look.imageAfter),
      ])
    : [null, null];

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("canvas");
  const titleSize = 42;
  const kickerSize = 20;
  const bodySize = 26;
  const lineGap = 1.35;
  const heading = opts.heading || look.name || "Причёска";
  const blocks = opts.blocks || lookToSheetBlocks(look);

  measure.font = `700 ${titleSize}px serif`;
  const titleLines = wrapCanvasText(measure, heading, textW);

  type Drawn = { kind: "kicker" | "title" | "body" | "gap"; lines: string[]; size: number };
  const drawn: Drawn[] = [];
  for (const b of blocks) {
    if (b.title) {
      measure.font = `700 32px serif`;
      drawn.push({ kind: "title", lines: wrapCanvasText(measure, b.title, textW), size: 32 });
    }
    if (b.kicker) {
      measure.font = `600 ${kickerSize}px sans-serif`;
      drawn.push({ kind: "kicker", lines: wrapCanvasText(measure, b.kicker.toUpperCase(), textW), size: kickerSize });
    }
    measure.font = `400 ${bodySize}px sans-serif`;
    drawn.push({ kind: "body", lines: wrapCanvasText(measure, b.body, textW), size: bodySize });
    drawn.push({ kind: "gap", lines: [""], size: 18 });
  }

  let textH = titleLines.length * titleSize * lineGap + 28;
  for (const d of drawn) {
    if (d.kind === "gap") textH += d.size;
    else textH += d.lines.length * d.size * lineGap + 6;
  }

  const photosH = showPhotos ? PHOTO_H + 36 : 0;
  const H = Math.ceil(PAD + photosH + textH + 56);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas ctx");

  ctx.fillStyle = "#FAF7F2";
  ctx.fillRect(0, 0, W, H);

  let y = PAD;
  if (showPhotos) {
    const drawSlot = (img: HTMLImageElement | null, x: number, label: string, empty: string) => {
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(x, y, PHOTO_W, PHOTO_H);
      if (img) drawCoverPhoto(ctx, img, x, y, PHOTO_W, PHOTO_H);
      else {
        ctx.fillStyle = "#9a958c";
        ctx.font = "400 22px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(empty, x + PHOTO_W / 2, y + PHOTO_H / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      ctx.fillStyle = "rgba(26,26,26,0.72)";
      ctx.font = "600 18px sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x + 14, y + PHOTO_H - 42, tw + 24, 28);
      ctx.fillStyle = "#FAF7F2";
      ctx.textBaseline = "top";
      ctx.fillText(label, x + 26, y + PHOTO_H - 36);
      ctx.textBaseline = "alphabetic";
    };
    drawSlot(beforeImg, PAD, "ДО", "Нет фото «до»");
    drawSlot(afterImg, PAD + PHOTO_W + GAP, "ПОСЛЕ", "Нет фото «после»");
    y += PHOTO_H + 36;
  }

  ctx.textBaseline = "top";
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `700 ${titleSize}px serif`;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += titleSize * lineGap;
  }
  y += 16;

  for (const d of drawn) {
    if (d.kind === "gap") {
      y += d.size;
      continue;
    }
    if (d.kind === "kicker") {
      ctx.fillStyle = "#c9a84c";
      ctx.font = `600 ${d.size}px sans-serif`;
    } else if (d.kind === "title") {
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `700 ${d.size}px serif`;
    } else {
      ctx.fillStyle = "#3a3a3a";
      ctx.font = `400 ${d.size}px sans-serif`;
    }
    for (const line of d.lines) {
      ctx.fillText(line, PAD, y);
      y += d.size * lineGap;
    }
    y += 6;
  }

  ctx.fillStyle = "#c9a84c";
  ctx.font = "600 20px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.fillText("stilist-ai.ru · Причёска и уход", W - PAD, H - 22);
  ctx.textAlign = "left";
  return canvas;
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Не удалось сохранить картинку");
  return blob;
}

async function stitchCanvases(canvases: HTMLCanvasElement[]): Promise<HTMLCanvasElement> {
  const gap = 28;
  const w = Math.max(...canvases.map((c) => c.width));
  const h = canvases.reduce((sum, c) => sum + c.height, 0) + gap * Math.max(0, canvases.length - 1);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = Math.min(h, 16000);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#FAF7F2";
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of canvases) {
    if (y >= out.height) break;
    ctx.drawImage(c, 0, y);
    y += c.height + gap;
    if (y < out.height && y > c.height) {
      ctx.fillStyle = "#e8e2d6";
      ctx.fillRect(0, y - gap, w, gap);
    }
  }
  return out;
}

async function downloadGroomingLookSheet(look: GroomingLook, beforeSrc?: string | null) {
  const canvas = await renderGroomingLookSheet({ look, beforeSrc });
  const blob = await canvasToJpeg(canvas);
  const safeName = (look.name || "pricheska").replace(/[^\wа-яё\-]+/gi, "_").slice(0, 40);
  downloadBlob(blob, `${safeName}_do-posle.jpg`);
}

async function downloadGroomingAlbum(result: any, fallbackBefore?: string | null) {
  const looks: GroomingLook[] = result.mode === "free"
    ? [result.bestLook].filter(Boolean)
    : (result.looks || []).filter(Boolean);
  const sheets: HTMLCanvasElement[] = [];
  for (const look of looks) {
    sheets.push(await renderGroomingLookSheet({
      look,
      beforeSrc: look.imageClose || fallbackBefore,
    }));
  }
  const care = careToSheetBlocks(result);
  if (care.length) {
    sheets.push(await renderGroomingLookSheet({
      look: looks[0] || { name: "Уход", description: "", why: "", hairColor: "" },
      heading: "Уход и макияж",
      blocks: care,
      photos: false,
    }));
  }
  if (!sheets.length) throw new Error("Нечего сохранять");
  const totalH = sheets.reduce((sum, c) => sum + c.height, 0);
  if (sheets.length > 1 && totalH > 14000) {
    for (let i = 0; i < sheets.length; i++) {
      const name = i < looks.length
        ? `${(looks[i].name || "pricheska").replace(/[^\wа-яё\-]+/gi, "_").slice(0, 40)}_do-posle.jpg`
        : "uhod-i-makiyazh.jpg";
      downloadBlob(await canvasToJpeg(sheets[i]), name);
      if (i < sheets.length - 1) await new Promise((r) => setTimeout(r, 450));
    }
    return;
  }
  const album = sheets.length === 1 ? sheets[0] : await stitchCanvases(sheets);
  downloadBlob(await canvasToJpeg(album), "pricheska-do-posle.jpg");
}

async function downloadGroomingImage(src: string, filename: string) {
  const res = await fetch(src);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadGroomingImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить фото"));
    img.src = src;
  });
}

/** Картинка «до | после» для шаринга полного результата */
async function composeGroomingShareBlob(beforeSrc: string, afterSrc: string): Promise<Blob> {
  const [before, after] = await Promise.all([loadGroomingImg(beforeSrc), loadGroomingImg(afterSrc)]);
  const gap = 6;
  const footerH = 44;
  const cellW = 540;
  const cellH = Math.round((cellW * 4) / 3);
  const canvas = document.createElement("canvas");
  canvas.width = cellW * 2 + gap;
  canvas.height = cellH + footerH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось создать картинку");

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawCover = (img: HTMLImageElement, x: number) => {
    const targetRatio = cellW / cellH;
    const srcRatio = img.width / img.height;
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    if (srcRatio > targetRatio) {
      sw = img.height * targetRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / targetRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, 0, cellW, cellH);
  };

  drawCover(before, 0);
  drawCover(after, cellW + gap);

  const drawLabel = (text: string, x: number) => {
    ctx.font = "600 18px system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 12;
    const bx = x + 14;
    const by = cellH - 40;
    const bw = tw + padX * 2;
    const bh = 28;
    ctx.fillStyle = "rgba(26,26,26,0.72)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#FAF7F2";
    ctx.fillText(text, bx + padX, by + 20);
  };
  drawLabel("ДО", 0);
  drawLabel("ПОСЛЕ", cellW + gap);

  ctx.fillStyle = "#FAF7F2";
  ctx.font = "500 15px system-ui, sans-serif";
  ctx.fillText("stilist-ai.ru · Причёска и уход", 16, cellH + 28);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Не удалось собрать фото для шаринга");
  return blob;
}

function GroomingShareBar({
  imageUrl,
  beforeUrl,
  afterUrl,
  lookName,
  onToast,
}: {
  imageUrl: string;
  beforeUrl?: string | null;
  afterUrl?: string | null;
  lookName: string;
  onToast?: (msg: string, type: "success" | "error") => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const cachedImageUrl = useRef<string | null>(null);

  const ensureImageUrl = async (): Promise<string> => {
    if (cachedImageUrl.current) return cachedImageUrl.current;
    let blob: Blob;
    if (beforeUrl && afterUrl) {
      blob = await composeGroomingShareBlob(beforeUrl, afterUrl);
    } else {
      const resp = await fetch(imageUrl);
      blob = await resp.blob();
    }
    const fd = new FormData();
    fd.append("image", blob, "look.jpg");
    fd.append("lookName", lookName.slice(0, 200));
    const r = await fetch("/api/share-image", { method: "POST", body: fd });
    const data = await r.json() as { imageUrl?: string; error?: string };
    if (!r.ok || !data.imageUrl) throw new Error(data.error || "Не удалось подготовить ссылку");
    cachedImageUrl.current = data.imageUrl;
    return data.imageUrl;
  };

  const handleShareClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const hosted = await ensureImageUrl();
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator.share === "function") {
        try {
          await navigator.share({ url: hosted, title: lookName, text: "Моё преображение от AI-стилиста" });
          return;
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
      }
      setOpen(true);
      setTimeout(() => popupRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } catch (e: any) {
      onToast?.(e.message || "Не удалось поделиться", "error");
    } finally {
      setLoading(false);
    }
  };

  const openShareUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
    setOpen(false);
  };
  const getUrl = () => cachedImageUrl.current || "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleShareClick}
        disabled={loading}
        className="w-full py-2.5 rounded-full bg-gold text-charcoal text-sm font-medium flex items-center justify-center gap-2 hover:bg-gold/90 disabled:opacity-60"
      >
        {loading ? "Готовим…" : (<><Share2 className="w-4 h-4" /> Поделиться</>)}
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
              <button type="button" onClick={() => openShareUrl(`https://t.me/share/url?url=${encodeURIComponent(getUrl())}`)} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5">
                <span className="w-10 h-10 rounded-full bg-[#0088cc] text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">Telegram</span>
              </button>
              <button type="button" onClick={() => openShareUrl(`https://wa.me/?text=${encodeURIComponent(getUrl())}`)} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5">
                <span className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">WhatsApp</span>
              </button>
              <button type="button" onClick={() => openShareUrl(`https://vk.com/share.php?url=${encodeURIComponent(getUrl())}`)} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5">
                <span className="w-10 h-10 rounded-full bg-[#0077FF] text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.372 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">ВК</span>
              </button>
              <button type="button" onClick={() => openShareUrl(`https://connect.ok.ru/offer?url=${encodeURIComponent(getUrl())}`)} className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5">
                <span className="w-10 h-10 rounded-full bg-[#EE8208] text-white flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 6.5a2 2 0 110-4 2 2 0 010 4zm0 1.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-5.7 2.1c-.3.6-.1 1.4.6 1.8 1.1.7 2.4 1.2 3.7 1.4l-3.6 3.6c-.5.5-.5 1.4 0 1.9.5.5 1.4.5 1.9 0l3.1-3.1 3.1 3.1c.5.5 1.4.5 1.9 0 .5-.5.5-1.4 0-1.9l-3.6-3.6c1.3-.2 2.6-.7 3.7-1.4.7-.4.9-1.2.6-1.8-.4-.6-1.2-.8-1.9-.4-2.5 1.5-5.8 1.5-8.3 0-.7-.4-1.5-.2-1.9.4z"/></svg>
                </span>
                <span className="text-[10px] text-ivory/70">ОК</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(getUrl()); } catch { /* ignore */ }
                  setOpen(false);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }}
                className="flex flex-col items-center gap-1.5 flex-1 p-2 rounded-xl hover:bg-white/5"
              >
                <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#0088ff] to-[#0055cc] text-white flex items-center justify-center font-bold text-lg">M</span>
                <span className="text-[10px] text-ivory/70">MAX</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type SkincareProduct = {
  name: string;
  brand: string;
  dosage: string;
  why: string;
  howTo?: string;
  price?: string;
  searchQuery?: string;
  imageUrl?: string | null;
  wbUrl?: string;
  ozonUrl?: string;
  ymUrl?: string;
};

type MakeupProduct = {
  name: string;
  brand: string;
  howTo?: string;
  why?: string;
  searchQuery?: string;
  price?: string;
  imageUrl?: string | null;
  wbUrl?: string;
  ozonUrl?: string;
  ymUrl?: string;
};

function MarketplaceLinks({
  wbUrl,
  ozonUrl,
  ymUrl,
}: {
  wbUrl?: string;
  ozonUrl?: string;
  ymUrl?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {wbUrl && (
        <a
          href={wbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-full bg-[#CB11AB] text-white text-xs font-medium hover:opacity-90 transition-opacity"
        >
          WB
        </a>
      )}
      {ozonUrl && (
        <a
          href={ozonUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-full bg-[#005BFF] text-white text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Ozon
        </a>
      )}
      {ymUrl && (
        <a
          href={ymUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-full bg-[#FFCC00] text-charcoal text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Яндекс
        </a>
      )}
    </div>
  );
}

function ProductShopCard({
  brand,
  name,
  detail,
  why,
  price,
  searchQuery,
  imageUrl: imageUrlProp,
  wbUrl,
  ozonUrl,
  ymUrl,
}: {
  brand: string;
  name: string;
  detail?: string;
  why?: string;
  price?: string;
  searchQuery?: string;
  imageUrl?: string | null;
  wbUrl?: string;
  ozonUrl?: string;
  ymUrl?: string;
}) {
  const [thumb, setThumb] = useState<string | null>(imageUrlProp || null);
  const [thumbBroken, setThumbBroken] = useState(false);
  const q = (searchQuery || `${brand} ${name}`).trim();

  useEffect(() => {
    let cancelled = false;
    setThumbBroken(false);
    // Сначала показываем то, что пришло с сервера (если есть), затем всегда
    // перепроверяем умным поиском — чтобы не оставалась футболка вместо сыворотки
    if (imageUrlProp) setThumb(imageUrlProp);
    else setThumb(null);
    if (!q && !brand) return;
    const delay = 150 + Math.floor(Math.random() * 600);
    const t = setTimeout(() => {
      const url =
        `/api/product-thumb?q=${encodeURIComponent(q || `${brand} ${name}`)}` +
        (brand ? `&brand=${encodeURIComponent(brand)}` : "");
      fetch(url)
        .then((r) => r.json())
        .then((d: { imageUrl?: string | null }) => {
          if (cancelled) return;
          if (d.imageUrl) setThumb(d.imageUrl);
          else if (!imageUrlProp) setThumb(null);
        })
        .catch(() => {});
    }, delay);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, brand, name, imageUrlProp]);

  const showImg = thumb && !thumbBroken;

  return (
    <div className="rounded-xl border border-charcoal/10 p-3 sm:p-4 bg-white shadow-sm">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-medium text-charcoal leading-snug">{brand} — {name}</p>
          {detail && <p className="text-xs text-charcoal/60">{detail}</p>}
          {why && <p className="text-sm text-charcoal/70 leading-relaxed">{why}</p>}
          {price && <p className="text-xs text-charcoal/50">{price}</p>}
          <MarketplaceLinks wbUrl={wbUrl} ozonUrl={ozonUrl} ymUrl={ymUrl} />
        </div>
        <a
          href={wbUrl || ozonUrl || ymUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="w-[88px] sm:w-[104px] h-[112px] sm:h-[128px] flex-shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-gold/15 via-ivory to-charcoal/5 border border-charcoal/10 flex items-center justify-center"
          title="Открыть товар"
        >
          {showImg ? (
            <img
              src={thumb!}
              alt={`${brand} ${name}`}
              className="w-full h-full object-contain bg-white p-1"
              loading="lazy"
              onError={() => setThumbBroken(true)}
            />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-charcoal/35 px-2 text-center leading-tight">
              {(brand || name || "?").slice(0, 18)}
            </span>
          )}
        </a>
      </div>
    </div>
  );
}

type FreeResult = {
  mode: "free";
  faceShape?: string;
  colorType?: string;
  hairStatus?: string;
  coachNote?: string;
  bestLook: GroomingLook;
  upsellTeaser?: string;
  groomingPrice?: number;
};

type PaidResult = {
  mode: "paid";
  coachNote?: string;
  faceAnalysis?: {
    strengths?: string;
    weaknesses?: string;
    faceShape?: string;
    colorType?: string;
    skinType?: string;
    hairStatus?: string;
    eyeShape?: string;
  };
  looks: GroomingLook[];
  skincare?: {
    summary?: string;
    amRoutine?: string;
    pmRoutine?: string;
    homeHowTo?: string;
    products?: SkincareProduct[];
  };
  makeup?: {
    summary?: string;
    dayLook?: string;
    eveningLook?: string;
    placement?: string;
    products?: MakeupProduct[];
  };
  groomingPrice?: number;
};

type Result = FreeResult | PaidResult;

function LookCard({
  look,
  onOpen,
  onToast,
  fallbackBefore,
  onRetryAfter,
}: {
  look: GroomingLook;
  onOpen?: (src: string) => void;
  onToast?: (msg: string, type: "success" | "error") => void;
  fallbackBefore?: string | null;
  onRetryAfter?: () => Promise<void>;
}) {
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const beforeSrc = look.imageClose || fallbackBefore || "";
  const shareSrc = look.imageAfter || beforeSrc || "";
  const safeName = (look.name || "pricheska").replace(/[^\wа-яё\-]+/gi, "_").slice(0, 40);
  const hasAny = !!(beforeSrc || look.imageAfter);

  useEffect(() => {
    setBroken({});
  }, [look.imageAfter, look.imageClose, beforeSrc]);

  const slots = [
    { key: "close", src: beforeSrc, label: "До", sub: "ваше фото" },
    { key: "after", src: look.imageAfter, label: "После", sub: "причёска · помада · одежда" },
  ];

  return (
    <div className="rounded-2xl border border-charcoal/10 bg-white overflow-hidden shadow-sm">
      <div className="grid grid-cols-2 gap-1 bg-charcoal/5">
        {slots.map((slot) => {
          return (
            <div
              key={slot.key}
              className="relative aspect-[3/4] bg-charcoal/10 overflow-hidden"
            >
              {slot.src && !broken[slot.key] ? (
                <button
                  type="button"
                  onClick={() => onOpen?.(slot.src as string)}
                  className="absolute inset-0"
                >
                  <img
                    src={slot.src}
                    alt={`${look.name} — ${slot.label}`}
                    className="w-full h-full object-cover"
                    loading="eager"
                    onError={() => setBroken((b) => ({ ...b, [slot.key]: true }))}
                  />
                </button>
              ) : (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-[11px] text-charcoal/40 p-3 text-center gap-2">
                  <span>
                    {slot.key === "close"
                      ? "Исходное фото не открылось — скачайте «После» или обновите страницу"
                      : (look.imageError || "Фото «после» ещё рисуется — подождите или нажмите «Повторить»")}
                  </span>
                  {slot.key === "after" && onRetryAfter && (
                    <button
                      type="button"
                      disabled={retrying}
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRetrying(true);
                        try {
                          await onRetryAfter();
                          setBroken((b) => ({ ...b, after: false }));
                        } finally {
                          setRetrying(false);
                        }
                      }}
                      className="relative z-20 pointer-events-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gold text-charcoal text-[11px] font-medium disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {retrying ? "Рисуем…" : "Повторить фото"}
                    </button>
                  )}
                </div>
              )}
              <span className="absolute bottom-2 left-2 right-2 text-left pointer-events-none">
                <span className="inline-block text-[10px] uppercase tracking-wide bg-charcoal/75 text-ivory px-2 py-0.5 rounded-full">
                  {slot.label}
                </span>
                <span className="block text-[10px] text-ivory/90 mt-1 drop-shadow">{slot.sub}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="p-4 space-y-2">
        <h4 className="font-serif text-lg text-charcoal">{look.name}</h4>
        {look.hairColor && (
          <p className="text-sm text-gold font-medium">Цвет: {look.hairColor}</p>
        )}
        {look.lipColor && (
          <p className="text-sm text-charcoal/70">Помада: {look.lipColor}</p>
        )}
        {look.description && (
          <p className="text-sm text-charcoal/75 leading-relaxed whitespace-pre-wrap">{look.description}</p>
        )}
        {look.why && (
          <p className="text-sm text-charcoal/60 leading-relaxed"><span className="font-medium text-charcoal">Почему вам:</span> {look.why}</p>
        )}
        {look.outfitNote && (
          <p className="text-sm text-charcoal/60 leading-relaxed"><span className="font-medium text-charcoal">Образ:</span> {look.outfitNote}</p>
        )}
        {look.afterNote && (
          <p className="text-xs text-charcoal/55 leading-relaxed bg-charcoal/[0.04] rounded-xl px-3 py-2">
            {look.afterNote}
          </p>
        )}
        <MasterHowTo text={look.masterHowTo} />
        <p className="text-[11px] text-charcoal/40 leading-relaxed">
          «После» — ориентир: новая причёска, помада под этот образ, взгляд и улыбка как на вашем фото, кожа как после визажиста. Не гарантия и не медзаключение. Решение — за вами и специалистом.
        </p>
        {(hasAny || look.description) && (
          <div className="pt-2 space-y-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await downloadGroomingLookSheet(look, beforeSrc);
                  onToast?.("Сохранено: фото до и после с описанием", "success");
                } catch {
                  onToast?.("Не удалось собрать картинку. Попробуйте ещё раз.", "error");
                } finally {
                  setSaving(false);
                }
              }}
              className="w-full py-3 rounded-full bg-charcoal text-ivory text-sm font-medium flex items-center justify-center gap-2 hover:bg-gold hover:text-charcoal transition-colors disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              {saving ? "Собираем фото…" : "Сохранить фото и описание"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              {beforeSrc && !broken.close && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await downloadGroomingImage(beforeSrc, `${safeName}_do.jpg`);
                      onToast?.("Сохранено: до", "success");
                    } catch {
                      onToast?.("Не удалось скачать", "error");
                    }
                  }}
                  className="py-2.5 rounded-full border border-charcoal/15 text-charcoal text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-charcoal/5"
                >
                  <Download className="w-3.5 h-3.5" /> Только «до»
                </button>
              )}
              {look.imageAfter && !broken.after && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await downloadGroomingImage(look.imageAfter!, `${safeName}_posle.jpg`);
                      onToast?.("Сохранено: после", "success");
                    } catch {
                      onToast?.("Не удалось скачать", "error");
                    }
                  }}
                  className="py-2.5 rounded-full border border-charcoal/15 text-charcoal text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-charcoal/5"
                >
                  <Download className="w-3.5 h-3.5" /> Только «после»
                </button>
              )}
            </div>
            {shareSrc && (
              <GroomingShareBar
                imageUrl={shareSrc}
                beforeUrl={beforeSrc || look.imageClose}
                afterUrl={look.imageAfter}
                lookName={look.name}
                onToast={onToast}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function GroomingModal({
  isOpen,
  onClose,
  price = 100,
  paymentId: paymentIdProp,
  ownerFree = false,
  onToast,
  onOpenLightbox,
}: {
  isOpen: boolean;
  onClose: () => void;
  price?: number;
  paymentId?: string;
  ownerFree?: boolean;
  onToast?: (msg: string, type: "success" | "error") => void;
  onOpenLightbox?: (payload: { images: { src: string; alt: string }[]; index: number }) => void;
}) {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<{ step: number; text: string } | null>(null);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [freeUsed, setFreeUsed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [paidId, setPaidId] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<"idle" | "checking" | "valid" | "invalid" | "used" | "wrong">("idle");
  const [promoApplied, setPromoApplied] = useState(false);
  const [formError, setFormError] = useState("");
  /** offer = описание/оплата; upload = экран загрузки фото (после промо или оплаты) */
  const [screen, setScreen] = useState<"offer" | "upload">("offer");
  const inputRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const openGenRef = useRef(0);
  const userDismissedRef = useRef(false);

  const applyGroomingResult = (data: Result, mode: "free" | "paid") => {
    setResult(data);
    const jobId = (data as any)?.jobId;
    if (jobId) localStorage.setItem(LAST_JOB_KEY, String(jobId));
    if (jobId && mode === "paid") rememberPaidGroomingJob(String(jobId));
    if (mode === "paid") saveCabinetGroomingOrder(String(jobId || paidId || paymentIdProp || ""));
    if (jobId && (resultMissingAfter(data) || paidPackageIncomplete(data))) localStorage.setItem(JOB_KEY, String(jobId));
    else localStorage.removeItem(JOB_KEY);
    setLoading(false);
    setLoadingState(null);
    setDisplayPercent(100);
    if (mode === "free") {
      const bl = (data as FreeResult).bestLook || ({} as GroomingLook);
      if (lookHasAfterPhoto(bl)) {
        localStorage.setItem(FREE_KEY, "1");
        setFreeUsed(true);
        onToast?.("Готово: сравните «до» и «после»", "success");
      } else if (bl.imageClose) {
        onToast?.("Текст готов. Фото «после» ещё дорисовывается — сейчас появится.", "success");
      } else {
        onToast?.(bl.imageError || "Фото не создалось — нажмите «Повторить фото»", "error");
      }
    } else {
      localStorage.removeItem(PAID_KEY);
      setPaidId("");
      setPromoCode("");
      setPromoStatus("idle");
      setPromoApplied(false);
      onToast?.(
        resultMissingAfter(data)
          ? "Текст готов. Фото «после» ещё дорисовываются — сейчас появятся."
          : "Готово: 3 причёски и уход",
        "success"
      );
    }
  };

  /** Выход: убрать старые рекомендации с экрана, чтобы при повторном открытии была чистая форма */
  const handleClose = () => {
    userDismissedRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    openGenRef.current += 1;
    setResult(null);
    setLoading(false);
    setLoadingState(null);
    setDisplayPercent(0);
    setPromoCode("");
    setPromoStatus("idle");
    setPromoApplied(false);
    setScreen("offer");
    onClose();
  };

  /** Как в «Начать преображение»: проверить код → зелёный → сразу экран загрузки фото */
  const applyGroomingPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoStatus("checking");
    try {
      const res = await fetch("/api/check-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, purpose: "grooming" }),
      });
      const data = await res.json();
      if (!data.valid) {
        setPromoApplied(false);
        if (data.reason === "used") setPromoStatus("used");
        else if (data.reason === "outfits_only") setPromoStatus("wrong");
        else setPromoStatus("invalid");
        return;
      }
      setPromoCode(code);
      setPromoStatus("valid");
      setPromoApplied(true);
      setResult(null);
      setScreen("upload");
      onToast?.("Промокод принят — загрузите фото", "success");
      setTimeout(() => {
        formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch {
      setPromoApplied(false);
      setPromoStatus("invalid");
    }
  };

  const startWithPromo = () => {
    if (!promoApplied || !promoCode.trim()) {
      onToast?.("Сначала нажмите «Применить» у промокода", "error");
      return;
    }
    if (!photo) {
      onToast?.("Загрузите фото лица", "error");
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!height.trim() || !weight.trim()) {
      onToast?.("Укажите рост и вес", "error");
      return;
    }
    runGrooming("paid", { promo: promoCode });
  };

  useEffect(() => {
    if (!isOpen) return;
    userDismissedRef.current = false;
    setFreeUsed(!!localStorage.getItem(FREE_KEY));
    const stored = localStorage.getItem(PAID_KEY) || paymentIdProp || "";
    setPaidId(stored);
    if (paymentIdProp) {
      localStorage.setItem(PAID_KEY, paymentIdProp);
      setPaidId(paymentIdProp);
      setScreen("upload");
    } else if (stored || ownerFree) {
      setScreen("upload");
    } else {
      setScreen("offer");
    }
    // Если генерация шла и окно/вкладка сбросились — продолжаем ждать результат, не показываем пустую форму
    const pendingJob = localStorage.getItem(JOB_KEY);
    const lastPaidJob = localStorage.getItem(LAST_PAID_JOB_KEY);
    if (pendingJob && !result && !loading) {
    const gen = ++openGenRef.current;
    setLoading(true);
    setLoadingState({
      step: 3,
      text: "Генерация продолжается — ждём готовый результат…",
    });
    setDisplayPercent((p) => (p < 40 ? 40 : p));
    (async () => {
      for (let i = 0; i < 90; i++) {
        if (userDismissedRef.current || gen !== openGenRef.current) return;
        try {
          const r = await fetch(`/api/grooming-result/${encodeURIComponent(pendingJob)}`);
          if (r.status === 202) {
            const j = await r.json().catch(() => ({}));
            setLoadingState({
              step: 3.5,
              text: j.progressText || `Ещё рисуем… (${j.looksDone || 0}/${j.looksTotal || "?"} готово)`,
            });
            await new Promise((res) => setTimeout(res, 4000));
            continue;
          }
          if (!r.ok) {
            await new Promise((res) => setTimeout(res, 4000));
            continue;
          }
          const json = await r.json();
          if (json?.status === "ready" && json.result) {
            if (userDismissedRef.current || gen !== openGenRef.current) return;
            const rec = json.result as Result;
            if (!groomingLooksSettled(rec) || paidPackageIncomplete(rec)) {
              await new Promise((res) => setTimeout(res, 4000));
              continue;
            }
            const mode = (rec.mode === "paid" ? "paid" : "free") as "free" | "paid";
            applyGroomingResult(rec, mode);
            return;
          }
        } catch {}
        await new Promise((res) => setTimeout(res, 4000));
      }
      if (userDismissedRef.current || gen !== openGenRef.current) return;
      setLoading(false);
      setLoadingState(null);
      onToast?.("Результат ещё не готов. Нажмите генерацию ещё раз — если фото уже есть, они подтянутся.", "error");
    })();
      return;
    }
    const lastJob = lastPaidJob || localStorage.getItem(LAST_JOB_KEY);
    if (result) return;
    const genLast = ++openGenRef.current;
    (async () => {
      let recoverId = lastJob;
      if ((ownerFree || stored) && !lastPaidJob) {
        try {
          const lr = await fetch("/api/grooming-latest");
          if (lr.ok) {
            const lj = await lr.json();
            if (lj?.jobId) {
              recoverId = lj.jobId;
              rememberPaidGroomingJob(String(lj.jobId));
              if (lj.result && !paidPackageIncomplete(lj.result) && groomingLooksSettled(lj.result)) {
                if (userDismissedRef.current || genLast !== openGenRef.current) return;
                applyGroomingResult(lj.result as Result, "paid");
                return;
              }
            }
          }
        } catch { /* ignore */ }
      }
      if (!recoverId) return;
      for (let i = 0; i < 90; i++) {
        if (userDismissedRef.current || genLast !== openGenRef.current) return;
        try {
          const r = await fetch(`/api/grooming-result/${encodeURIComponent(recoverId)}`);
          if (r.status === 202) {
            const j = await r.json().catch(() => ({}));
            setLoading(true);
            setLoadingState({
              step: 3.5,
              text: j.progressText || "Фото ещё рисуется — не закрывайте окно…",
            });
            await new Promise((res) => setTimeout(res, 4000));
            continue;
          }
          if (!r.ok) return;
          const json = await r.json();
          if (json?.status === "ready" && json.result && genLast === openGenRef.current && !userDismissedRef.current) {
            const rec = json.result as Result;
            if (!groomingLooksSettled(rec) || paidPackageIncomplete(rec)) {
              await new Promise((res) => setTimeout(res, 4000));
              continue;
            }
            applyGroomingResult(rec, rec.mode === "paid" ? "paid" : "free");
          }
          return;
        } catch {
          await new Promise((res) => setTimeout(res, 4000));
        }
      }
    })();
  }, [isOpen, paymentIdProp]);

  useEffect(() => {
    if (!isOpen || !result || (!resultMissingAfter(result) && !paidPackageIncomplete(result))) return;
    const jobId = (result as any)?.jobId || localStorage.getItem(LAST_JOB_KEY) || localStorage.getItem(JOB_KEY);
    if (!jobId) return;
    localStorage.setItem(JOB_KEY, String(jobId));
    let stop = false;
    const gen = openGenRef.current;
    (async () => {
      for (let i = 0; i < 90 && !stop; i++) {
        await new Promise((res) => setTimeout(res, 4000));
        if (stop || gen !== openGenRef.current || userDismissedRef.current) return;
        try {
          const r = await fetch(`/api/grooming-result/${encodeURIComponent(jobId)}`);
          if (r.status === 202) continue;
          if (!r.ok) continue;
          const json = await r.json();
          if (json?.result) {
            setResult(json.result as Result);
            if (!resultMissingAfter(json.result as Result) && !paidPackageIncomplete(json.result as Result)) {
              localStorage.removeItem(JOB_KEY);
              return;
            }
          }
        } catch {}
      }
    })();
    return () => { stop = true; };
  }, [isOpen, result]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!loadingState) { setDisplayPercent(0); return; }
    const s = loadingState.step;
    // Честная шкала по шагам сервера (не залипаем на 95% фейковой анимацией)
    const mapped =
      s >= 5 ? 100 :
      s >= 4.8 ? 92 :
      s >= 4.5 ? 88 :
      s >= 4 ? 78 :
      s >= 3.4 ? 68 :
      s >= 3 ? 58 :
      s >= 2.4 ? 48 :
      s >= 2 ? 38 :
      s >= 1 ? 22 :
      Math.max(8, Math.round((s / 5) * 100));
    setDisplayPercent((prev) => (prev < mapped ? mapped : prev));
  }, [loadingState?.step]);

  useEffect(() => {
    if (!loadingState) return;
    const timer = setInterval(() => {
      setDisplayPercent((prev) => {
        // Ползём медленно, но не выше 90, пока нет финала
        if (prev >= 90) return prev;
        const speed = prev < 35 ? 0.55 : prev < 60 ? 0.22 : 0.08;
        return Math.min(90, prev + speed);
      });
    }, 250);
    return () => clearInterval(timer);
  }, [!!loadingState]);

  const retryLookAfter = async (lookIndex: number) => {
    const jobId = (result as any)?.jobId || localStorage.getItem(LAST_JOB_KEY) || localStorage.getItem(JOB_KEY);
    if (!jobId) {
      onToast?.("Нет сохранённого заказа — запустите подбор ещё раз", "error");
      return;
    }
    onToast?.("Рисуем фото «после» ещё раз…", "success");
    const r = await fetch("/api/grooming-retry-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, lookIndex }),
    });
    const d = await r.json();
    if (!r.ok || !d.imageAfter) {
      onToast?.(d.error || "Не удалось создать фото", "error");
      return;
    }
    setResult((prev) => {
      if (!prev) return prev;
      if (prev.mode === "free") {
        return { ...prev, bestLook: { ...prev.bestLook, imageAfter: d.imageAfter, imageError: null } };
      }
      const looks = (prev.looks || []).map((look, i) =>
        i === lookIndex ? { ...look, imageAfter: d.imageAfter, imageError: null } : look
      );
      return { ...prev, looks };
    });
    onToast?.("Фото «после» готово", "success");
  };

  if (!isOpen) return null;

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };

  const runGrooming = async (mode: "free" | "paid", opts?: { payId?: string; promo?: string }) => {
    if (!photo) {
      onToast?.("Загрузите фото лица", "error");
      return;
    }
    if (!height.trim() || !weight.trim()) {
      onToast?.("Укажите рост и вес", "error");
      return;
    }
    const payId = opts?.payId;
    const promo = (opts?.promo || "").trim().toUpperCase();
    if (mode === "free" && freeUsed && !payId && !promo) {
      onToast?.("Бесплатная генерация уже использована. Откройте полный пакет за 100 ₽ или введите промокод.", "error");
      return;
    }
    if (mode === "paid" && !payId && !promo && !ownerFree) {
      onToast?.("Нужна оплата или промокод «Причёска и уход»", "error");
      return;
    }
    setLoading(true);
    setLoadingState({
      step: 0.5,
        text: mode === "paid"
          ? "Обычно 2–5 минут: три причёски рисуем сразу, текст сохраняем сразу."
        : "Обычно 1–2 минуты: рисуем преображение «после».",
    });
    setDisplayPercent(2);
    setResult(null);
    setFormError("");
    userDismissedRef.current = false;

    const jobId =
      (mode === "paid" && payId ? payId : "")
      || `groom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(JOB_KEY, jobId);
    if (mode === "paid") saveCabinetGroomingOrder(payId || jobId);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const gen = ++openGenRef.current;
    const hardTimer = setTimeout(() => controller.abort(), GROOMING_MAX_MS);

    const tryRecover = async (): Promise<Result | null> => {
      try {
        const r = await fetch(`/api/grooming-result/${encodeURIComponent(jobId)}`);
        if (r.status === 202) return null;
        if (!r.ok) return null;
        const json = await r.json();
        if (json?.status === "ready" && json.result) {
          const rec = json.result as Result;
          if (!groomingLooksSettled(rec) || paidPackageIncomplete(rec)) return null;
          return rec;
        }
      } catch {}
      return null;
    };

    const pollRecover = async (attempts = 60): Promise<Result | null> => {
      for (let i = 0; i < attempts; i++) {
        if (userDismissedRef.current || gen !== openGenRef.current) return null;
        const got = await tryRecover();
        if (got) return got;
        setLoadingState({
          step: 4.5,
          text: `Связь нестабильна — ждём результат на сервере… (${i + 1}/${attempts})`,
        });
        await new Promise((r) => setTimeout(r, 5000));
      }
      return null;
    };

    try {
      const fd = new FormData();
      fd.append("photos", photo);
      fd.append("height", height.trim());
      fd.append("weight", weight.trim());
      fd.append("mode", mode);
      fd.append("jobId", jobId);
      try {
        let vid = localStorage.getItem("you-stile-user-id");
        if (!vid) {
          vid = crypto.randomUUID();
          localStorage.setItem("you-stile-user-id", vid);
        }
        fd.append("visitorId", vid);
        const uname = localStorage.getItem("you-stile-user-name") || "";
        if (uname) fd.append("userName", uname);
      } catch { /* ignore */ }
      if (mode === "paid" && promo) fd.append("promoCode", promo);
      else if (mode === "paid" && payId) fd.append("paymentId", payId);

      const res = await fetch("/api/grooming", { method: "POST", body: fd, signal: controller.signal });
      if (!res.ok && !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).error || "Не удалось подобрать причёску");
      }
      const reader = res.body?.getReader();
      let data: Result | null = null;

      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          let chunkRead: ReadableStreamReadResult<Uint8Array>;
          try {
            chunkRead = await reader.read();
          } catch (readErr: any) {
            if (userDismissedRef.current || gen !== openGenRef.current) return;
            // Обрыв потока — не сбрасываем форму, ждём результат с сервера
            setLoadingState({ step: 4.5, text: "Связь прервалась — продолжаем ждать готовый результат…" });
            data = await pollRecover(60);
            break;
          }
          const { done, value } = chunkRead;
          if (userDismissedRef.current || gen !== openGenRef.current) return;
          if (value) buffer += decoder.decode(value, { stream: true });
          if (done) buffer += decoder.decode();
          const lines = buffer.split("\n");
          if (!done) buffer = lines.pop() || "";
          else buffer = "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let chunk: any;
            try { chunk = JSON.parse(trimmed); } catch { continue; }
            if (chunk.jobId) localStorage.setItem(JOB_KEY, chunk.jobId);
            if (chunk.type === "progress") {
              setLoadingState({ step: chunk.step, text: chunk.text });
            } else if (chunk.type === "partial_result") {
              const doneLooks = Number(chunk.looksDone);
              const total = Number(chunk.looksTotal);
              setLoadingState({
                step: Number(chunk.step) || 3.5,
                text: chunk.text
                  || (doneLooks && total ? `Готово ${doneLooks} из ${total} фото…` : "Ещё рисуем фото «после»…"),
              });
            } else if (chunk.type === "result") {
              const rec = chunk as Result;
              if (!groomingLooksSettled(rec) || paidPackageIncomplete(rec)) {
                setLoadingState({
                  step: 4.5,
                  text: rec.mode === "paid"
                    ? "Дособираем уход и недостающие фото…"
                    : "Фото «после» ещё рисуется…",
                });
                continue;
              }
              data = rec;
              setLoadingState({ step: 5, text: "Готово!" });
              setDisplayPercent(100);
            } else if (chunk.type === "error") {
              throw new Error(chunk.error || "Ошибка");
            }
          }
          if (done) break;
        }
      } else {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as any).error || "Не удалось подобрать причёску");
        data = json as Result;
      }

      if (userDismissedRef.current || gen !== openGenRef.current) return;

      if (!data || !groomingLooksSettled(data) || paidPackageIncomplete(data)) {
        setLoadingState({ step: 4.5, text: "Связь прервалась — ищем готовый результат…" });
        data = await pollRecover(60);
      }
      if (userDismissedRef.current || gen !== openGenRef.current) return;
      if (!data) throw new Error("Результат ещё не готов. Откройте «Мои образы» и нажмите «Продолжить» — оплата уже есть.");
      applyGroomingResult(data, mode);
    } catch (e: any) {
      if (userDismissedRef.current || gen !== openGenRef.current) return;
      const errMsg = String(e?.message || "");
      if (mode === "free" && /уже использован/i.test(errMsg)) {
        setFreeUsed(true);
        try { localStorage.setItem(FREE_KEY, "1"); } catch { /* ignore */ }
      }
      if (e?.name === "AbortError") {
        if (userDismissedRef.current || !localStorage.getItem(JOB_KEY)) return;
        setLoadingState({ step: 4.5, text: "Долго ждём ответ — проверяем, готов ли результат…" });
        const recovered = await pollRecover(36);
        if (userDismissedRef.current || gen !== openGenRef.current) return;
        if (recovered) {
          applyGroomingResult(recovered, mode);
          return;
        }
        onToast?.("Генерация ещё идёт. Откройте «Мои образы» — заказ там, нажмите «Продолжить». Платить снова не нужно.", "error");
      } else {
        const recoverable = /aborted|Failed to fetch|сеть|прерв|timeout|ожидания|нестабильн/i.test(errMsg);
        if (recoverable) {
          setLoadingState({ step: 4.5, text: "Сбой связи — ищем уже готовый результат…" });
          const recovered = await pollRecover(36);
          if (userDismissedRef.current || gen !== openGenRef.current) return;
          if (recovered) {
            applyGroomingResult(recovered, mode);
            return;
          }
        }
        const shown = errMsg.includes("Polza") || errMsg.includes("503")
          ? "Стилист временно не ответил. Нажмите генерацию ещё раз — фото уже на месте."
          : (e.message || "Ошибка. Фото, рост и вес сохранены — нажмите генерацию ещё раз.");
        setFormError(shown);
        onToast?.(shown, "error");
      }
    } finally {
      clearTimeout(hardTimer);
      if (!userDismissedRef.current && gen === openGenRef.current) {
        setLoading(false);
        setLoadingState(null);
      }
    }
  };  const startPayment = async () => {
    if (ownerFree) {
      setResult(null);
      setScreen("upload");
      onToast?.("С этого компьютера полный пакет без оплаты", "success");
      return;
    }
    setPaying(true);
    try {
      let visitorId = "";
      try {
        visitorId = localStorage.getItem("you-stile-user-id") || "";
        if (!visitorId) {
          visitorId = crypto.randomUUID();
          localStorage.setItem("you-stile-user-id", visitorId);
        }
      } catch { /* ignore */ }
      const res = await fetch("/api/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "grooming",
          visitorId,
          userName: localStorage.getItem("you-stile-user-name") || "",
        }),
      });
      const data = await res.json();
      if (data.pickupCode) {
        savePickupCodeFromGrooming(data.pickupCode);
        localStorage.setItem("pending_pickup_code", data.pickupCode);
      }
      if (data.paymentId) {
        localStorage.setItem(PAID_KEY, data.paymentId);
        localStorage.setItem("pending_payment_id", data.paymentId);
        localStorage.setItem("pending_payment_tier", "grooming");
        saveCabinetGroomingOrder(data.paymentId);
      }
      if (data.ownerFree && data.paymentId) {
        setPaidId(data.paymentId);
        setScreen("upload");
        onToast?.(
          data.pickupCode
            ? `Пакет открыт. Код ${data.pickupCode} — заказ в «Мои образы».`
            : "Пакет открыт без оплаты. Если окно закроется — заказ будет в «Мои образы».",
          "success",
        );
        setPaying(false);
        return;
      }
      if (!res.ok || !data.confirmationUrl) throw new Error(data.error || "Не удалось создать оплату");
      window.location.href = data.confirmationUrl;
    } catch (e: any) {
      onToast?.(e.message || "Ошибка оплаты", "error");
      setPaying(false);
    }
  };

  const openImg = (src: string, alt: string) => {
    onOpenLightbox?.({ images: [{ src, alt }], index: 0 });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-charcoal/60 backdrop-blur-sm overflow-y-auto">
      {createPortal(
      <AnimatePresence>
        {loadingState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 w-screen h-[100dvh] bg-charcoal/95 backdrop-blur-xl flex flex-col items-center text-white z-[400] overflow-y-auto py-10"
          >
            <div className="pointer-events-none absolute top-1/4 left-1/4 w-64 h-64 md:w-[28rem] md:h-[28rem] bg-gold/20 rounded-full mix-blend-screen filter blur-[80px] animate-pulse" />
            <div className="pointer-events-none absolute bottom-1/4 right-1/4 w-64 h-64 md:w-[28rem] md:h-[28rem] bg-blue-500/20 rounded-full mix-blend-screen filter blur-[80px] animate-pulse" style={{ animationDelay: "1s" }} />

            <div className="flex flex-col items-center m-auto relative z-10 px-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="mb-8 relative"
              >
                <div className="absolute inset-0 bg-gold/40 blur-2xl rounded-full" />
                <Sparkles className="w-16 h-16 text-gold relative z-10" />
              </motion.div>

              <h3 className="text-3xl font-serif mb-3 text-center tracking-wide">Создаём магию...</h3>
              <p className="text-sm text-white/50 mb-6 text-center max-w-[320px] leading-relaxed">
                {paidId || promoCode
                  ? "Подбираем причёски. Если окно закроется — «Мои образы», код СТИЛЬ-…, «Продолжить»."
                  : "Ищем лучшую причёску и рисуем крупный план. Не закрывайте окно."}
              </p>

              <div className="w-full max-w-[288px] bg-white/10 rounded-full h-2.5 mb-4 overflow-hidden relative">
                <motion.div
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-gold/50 via-gold to-gold/50"
                  initial={{ width: "0%" }}
                  animate={{ width: `${displayPercent}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="text-gold text-sm font-medium mb-6">{Math.round(displayPercent)}%</div>

              <div className="w-full max-w-[288px] space-y-2 mt-2">
                {GROOMING_STAGES.map((stage, i) => {
                  const activeIndex = getGroomingStageIndex(loadingState.step);
                  const isCompleted = i < activeIndex;
                  const isActive = i === activeIndex;
                  return (
                    <div
                      key={stage.label}
                      className={`flex items-center gap-3 transition-all duration-300 ${
                        isActive ? "text-white" : isCompleted ? "text-white/60" : "text-white/30"
                      }`}
                    >
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
                        <span className={`text-sm ${isActive ? "font-medium" : "font-light"}`}>{stage.label}</span>
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
      </AnimatePresence>,
      document.body)}

      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="w-full max-w-3xl bg-ivory rounded-3xl shadow-2xl relative">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-charcoal/5 flex items-center justify-center hover:bg-charcoal/10"
          >
            <X className="w-5 h-5 text-charcoal" />
          </button>

          <div className="p-6 md:p-8">
            {!result && screen === "offer" && (
              <>
            <p className="text-gold text-xs tracking-[0.2em] uppercase mb-2">Причёска · цвет · уход · макияж</p>
            <h2 className="font-serif text-3xl text-charcoal mb-3">Выглядеть моложе. Уже сегодня.</h2>
            <p className="text-charcoal/75 text-sm leading-relaxed mb-4">
              Смотрите в зеркало и ловите знакомое: морщины, тусклый цвет, «та же» причёска годами.
              Вам не нужен отчёт — вам нужно лицо, от которого хочется не отворачиваться.
            </p>
            <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 to-charcoal/[0.03] p-4 mb-4 text-sm text-charcoal/85 space-y-2.5">
              <p className="font-semibold text-charcoal text-base">Полный пакет — {price} ₽. Не «функции» — новый вы.</p>
              <p className="leading-relaxed">
                Три преображения с сравнением «до / после»: слева — ваше фото сейчас (в вашей одежде),
                справа — новая причёска, лучшая одежда и лицо после предложенных процедур (ориентир).
                Лицо крупным планом, чтобы было похоже на вас.
              </p>
              <p className="leading-relaxed">
                Разбор лица: что старит взгляд, а что возвращает свежесть. Уход с брендами —
                утро и вечер, чтобы кожа ответила через 2–4 недели.
              </p>
              <p className="leading-relaxed">
                Плюс свежий образ лица: для женщин — макияж под черты и возраст;
                для мужчин — лёгкий freshen-up без «косметики напоказ». Со ссылками на магазины.
              </p>
              <p className="text-charcoal font-medium pt-1 border-t border-gold/25">
                Салон и шопинг — тысячи. Здесь — {price} ₽ и три готовых «хочу так».
              </p>
            </div>
            <p className="text-charcoal/55 text-xs mb-4">
              Бесплатно — одно сравнение: слева ваше фото сейчас, справа — причёска, лучшая одежда и свежее лицо.
              Попробуете — и захотите ещё два в полном пакете.
              Оплаченный пакет, если окно закрылось: «Мои образы», код СТИЛЬ-…, «Продолжить».
            </p>

            <div className="rounded-2xl bg-charcoal/5 border border-charcoal/10 p-4 mb-6 text-sm text-charcoal/80 space-y-1">
              <p className="font-medium text-charcoal flex items-center gap-2"><Camera className="w-4 h-4 text-gold" /> Требования к фото</p>
              <p>• лицо анфас, взгляд прямо в камеру</p>
              <p>• без очков и тёмных линз</p>
              <p>• волосы открыты (не под шапкой)</p>
              <p>• ровный свет, без сильных фильтров</p>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <button
                type="button"
                disabled={freeUsed || loading}
                onClick={() => { setScreen("upload"); }}
                className="w-full py-3.5 rounded-full bg-charcoal text-ivory font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {freeUsed ? "Бесплатно уже использовано — откройте полный пакет" : "Бесплатно: сравнение «до / после»"}
                {!freeUsed && <Check className="w-4 h-4 text-gold" />}
              </button>
              {!freeUsed && (
                <p className="text-[11px] text-charcoal/45 text-center -mt-1">Дальше откроется экран загрузки фото</p>
              )}
              <button
                type="button"
                disabled={paying}
                onClick={startPayment}
                className="w-full py-3.5 rounded-full bg-gold text-charcoal font-semibold disabled:opacity-60"
              >
                {paying ? "Переход к оплате…" : ownerFree ? "Полный пакет с этого ПК — бесплатно" : `Хочу выглядеть моложе — ${price} ₽`}
              </button>
            </div>

            <div className="rounded-2xl border border-charcoal/10 bg-white p-4 space-y-2">
              <p className="text-sm font-medium text-charcoal text-center">У меня есть промокод</p>
              <p className="text-[11px] text-charcoal/45 text-center leading-relaxed">
                Код «Причёска и уход». После «Применить» сразу откроется загрузка фото.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoStatus("idle");
                    setPromoApplied(false);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && applyGroomingPromo()}
                  className={`flex-1 rounded-xl border px-3 py-2.5 font-mono text-sm tracking-wider uppercase text-center transition-colors ${
                    promoStatus === "valid"
                      ? "border-green-400 bg-green-50 text-charcoal"
                      : promoStatus === "invalid" || promoStatus === "used" || promoStatus === "wrong"
                        ? "border-red-300 bg-red-50 text-charcoal"
                        : "border-charcoal/15 bg-ivory text-charcoal focus:border-gold focus:outline-none"
                  }`}
                  placeholder="Введите промокод"
                  autoComplete="off"
                />
                <button
                  type="button"
                  disabled={!promoCode.trim() || promoStatus === "checking"}
                  onClick={applyGroomingPromo}
                  className="sm:w-auto px-5 py-2.5 rounded-full bg-charcoal text-ivory text-sm font-semibold disabled:opacity-40"
                >
                  {promoStatus === "checking" ? "…" : "Применить"}
                </button>
              </div>
              {promoStatus === "invalid" && <p className="text-red-500 text-xs text-center">Промокод не найден</p>}
              {promoStatus === "used" && <p className="text-red-500 text-xs text-center">Промокод уже использован</p>}
              {promoStatus === "wrong" && (
                <p className="text-red-500 text-xs text-center">Это код для образов — откройте «Начать преображение»</p>
              )}
            </div>
              </>
            )}

            {!result && screen === "upload" && (
              <div className="space-y-4" ref={formTopRef}>
                <button
                  type="button"
                  onClick={() => { if (!paidId && !promoApplied) setScreen("offer"); }}
                  className="text-xs text-charcoal/50 hover:text-charcoal underline"
                >
                  ← Назад
                </button>
                <p className="text-gold text-xs tracking-[0.2em] uppercase mb-1">Загрузка</p>
                <h2 className="font-serif text-3xl text-charcoal mb-2">
                {promoApplied ? "Промокод принят" : paidId ? "Оплата прошла" : ownerFree ? "С этого компьютера — без оплаты" : "Загрузите фото"}
                </h2>
                {promoApplied && (
                  <p className="text-green-700 text-sm font-medium mb-2">✓ {promoCode} — загрузите фото, укажите рост и вес</p>
                )}
                <div className="rounded-2xl bg-charcoal/5 border border-charcoal/10 p-4 mb-2 text-sm text-charcoal/80 space-y-1">
                  <p className="font-medium text-charcoal flex items-center gap-2"><Camera className="w-4 h-4 text-gold" /> Требования к фото</p>
                  <p>• лицо анфас, взгляд прямо в камеру</p>
                  <p>• без очков и тёмных линз · волосы открыты · ровный свет</p>
                </div>

                <div
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                    !preview ? "border-gold bg-gold/5" : "border-charcoal/20 hover:border-gold/50"
                  }`}
                >
                  {preview ? (
                    <img src={preview} alt="Превью" className="mx-auto max-h-56 rounded-xl object-cover" />
                  ) : (
                    <div className="py-8 text-charcoal/50">
                      <Upload className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm font-medium text-charcoal">Нажмите, чтобы загрузить фото</p>
                    </div>
                  )}
                  <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
                </div>

                {formError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>{formError}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm text-charcoal/70">
                    Рост (см)
                    <input
                      value={height}
                      onChange={(e) => setHeight(e.target.value.replace(/[^\d.,]/g, ""))}
                      className="mt-1 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2.5 text-charcoal"
                      placeholder="170"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="text-sm text-charcoal/70">
                    Вес (кг)
                    <input
                      value={weight}
                      onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ""))}
                      className="mt-1 w-full rounded-xl border border-charcoal/15 bg-white px-3 py-2.5 text-charcoal"
                      placeholder="65"
                      inputMode="decimal"
                    />
                  </label>
                </div>

                {loading ? (
                  <div className="rounded-2xl bg-charcoal text-ivory p-5 text-center">
                    <p className="text-sm animate-pulse">Готовим ваш образ…</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (paidId) runGrooming("paid", { payId: paidId });
                      else if (promoApplied) startWithPromo();
                      else if (ownerFree) runGrooming("paid");
                      else runGrooming("free");
                    }}
                    className="w-full py-3.5 rounded-full bg-gold text-charcoal font-semibold flex items-center justify-center gap-2 shadow-md"
                  >
                    {paidId || promoApplied || ownerFree
                      ? "Получить 3 причёски + уход"
                      : "Бесплатно: сравнение «до / после»"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {result?.mode === "free" && (
              <div className="space-y-5 mt-2">
                {result.coachNote && (
                  <div className="rounded-2xl bg-white border border-gold/30 p-4 text-sm text-charcoal/80 leading-relaxed whitespace-pre-wrap">
                    {result.coachNote}
                  </div>
                )}
                {(result.faceShape || result.colorType || result.hairStatus) && (
                  <p className="text-sm text-charcoal/60">
                    {result.faceShape && <>Форма лица: <span className="text-charcoal font-medium">{result.faceShape}</span>. </>}
                    {result.colorType && <>Цветотип: <span className="text-charcoal font-medium">{result.colorType}</span>. </>}
                    {result.hairStatus && <>Волосы: <span className="text-charcoal font-medium">{result.hairStatus}</span>.</>}
                  </p>
                )}
                <LookCard
                  look={result.bestLook}
                  fallbackBefore={preview}
                  onOpen={(src) => openImg(src, result.bestLook.name)}
                  onToast={onToast}
                  onRetryAfter={() => retryLookAfter(0)}
                />
                {!(result.bestLook?.imageClose || result.bestLook?.imageAfter) && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      localStorage.removeItem(FREE_KEY);
                      setFreeUsed(false);
                      setResult(null);
                      runGrooming("free");
                    }}
                    className="w-full py-3 rounded-full bg-charcoal text-ivory font-semibold"
                  >
                    Попробовать снова — бесплатно
                  </button>
                )}
                <div className="rounded-2xl border-2 border-gold/40 bg-gold/10 p-5 space-y-3">
                  <p className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap">
                    {result.upsellTeaser
                      || `Вы уже видите, насколько свежее можно выглядеть. Если захотите пойти дальше — за ${price} ₽ ещё варианты причёсок, уход и макияж под ваши черты. Без спешки: это просто самый сильный следующий шаг.`}
                  </p>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={startPayment}
                    className="w-full py-3 rounded-full bg-gold text-charcoal font-semibold"
                  >
                    Хочу выглядеть моложе — {price} ₽
                  </button>
                  <div className="pt-1 space-y-2">
                    <p className="text-xs text-charcoal/50 text-center">или промокод «Причёска и уход»</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={promoCode}
                        onChange={(e) => {
                          setPromoCode(e.target.value.toUpperCase());
                          setPromoStatus("idle");
                          setPromoApplied(false);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && applyGroomingPromo()}
                        className={`flex-1 rounded-xl border px-3 py-2.5 font-mono text-sm tracking-wider uppercase text-center ${
                          promoStatus === "valid"
                            ? "border-green-400 bg-green-50"
                            : promoStatus === "invalid" || promoStatus === "used" || promoStatus === "wrong"
                              ? "border-red-300 bg-red-50"
                              : "border-charcoal/15 bg-white"
                        }`}
                        placeholder="Введите промокод"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        disabled={!promoCode.trim() || loading || promoStatus === "checking"}
                        onClick={applyGroomingPromo}
                        className="sm:w-auto px-5 py-2.5 rounded-full bg-charcoal text-ivory text-sm font-semibold disabled:opacity-40"
                      >
                        {promoStatus === "checking" ? "…" : "Применить"}
                      </button>
                    </div>
                    {promoStatus === "invalid" && <p className="text-red-500 text-xs text-center">Промокод не найден</p>}
                    {promoStatus === "used" && <p className="text-red-500 text-xs text-center">Промокод уже использован</p>}
                    {promoStatus === "wrong" && (
                      <p className="text-red-500 text-xs text-center">Это код для образов — откройте «Начать преображение»</p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => { setResult(null); setScreen("upload"); }} className="text-sm text-charcoal/50 underline">
                  Загрузить другое фото
                </button>
              </div>
            )}

            {result?.mode === "paid" && (
              <div className="space-y-6 mt-2">
                {result.coachNote && (
                  <div className="rounded-2xl bg-white border border-gold/30 p-4 text-sm text-charcoal/80 leading-relaxed whitespace-pre-wrap">
                    {result.coachNote}
                  </div>
                )}
                {result.faceAnalysis && (
                  <div className="rounded-2xl bg-white border border-charcoal/10 p-5 space-y-3">
                    <h3 className="font-serif text-xl text-charcoal">Разбор лица</h3>
                    {result.faceAnalysis.strengths && (
                      <p className="text-sm text-charcoal/80"><span className="font-medium text-emerald-800">Сильные стороны:</span> {result.faceAnalysis.strengths}</p>
                    )}
                    {result.faceAnalysis.weaknesses && (
                      <p className="text-sm text-charcoal/80"><span className="font-medium text-rose-800">Зоны внимания:</span> {result.faceAnalysis.weaknesses}</p>
                    )}
                    <p className="text-xs text-charcoal/50">
                      {[result.faceAnalysis.faceShape, result.faceAnalysis.colorType, result.faceAnalysis.skinType, result.faceAnalysis.eyeShape, result.faceAnalysis.hairStatus].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="font-serif text-xl text-charcoal">3 причёски — сравнение кадров</h3>
                    <button
                      type="button"
                      disabled={savingAll}
                      onClick={async () => {
                        setSavingAll(true);
                        try {
                          await downloadGroomingAlbum(result, preview);
                          onToast?.("Сохранено: все фото до и после с описанием", "success");
                        } catch {
                          onToast?.("Не удалось собрать картинку. Попробуйте ещё раз.", "error");
                        } finally {
                          setSavingAll(false);
                        }
                      }}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-charcoal text-ivory inline-flex items-center gap-1.5 hover:bg-gold hover:text-charcoal disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {savingAll ? "Собираем…" : "Сохранить всё с фото"}
                    </button>
                  </div>
                  {result.looks?.map((look, i) => (
                    <LookCard
                      key={i}
                      look={look}
                      fallbackBefore={preview}
                      onOpen={(src) => openImg(src, look.name)}
                      onToast={onToast}
                      onRetryAfter={() => retryLookAfter(i)}
                    />
                  ))}
                </div>

                {result.skincare && (
                  <div className="rounded-2xl bg-white border border-charcoal/10 p-5 space-y-4">
                    <h3 className="font-serif text-xl text-charcoal">Уход за лицом</h3>
                    {result.skincare.summary && (
                      <p className="text-sm text-charcoal/75 leading-relaxed">{result.skincare.summary}</p>
                    )}
                    {result.skincare.amRoutine && (
                      <p className="text-sm text-charcoal/75"><span className="font-medium">Утро:</span> {result.skincare.amRoutine}</p>
                    )}
                    {result.skincare.pmRoutine && (
                      <p className="text-sm text-charcoal/75"><span className="font-medium">Вечер:</span> {result.skincare.pmRoutine}</p>
                    )}
                    <HomeHowTo text={result.skincare.homeHowTo} />
                    <div className="space-y-3 pt-2">
                      {result.skincare.products?.map((p, i) => (
                        <ProductShopCard
                          key={i}
                          brand={p.brand}
                          name={p.name}
                          detail={[p.dosage && `Дозировка: ${p.dosage}`, p.howTo && `Как нанести: ${p.howTo}`].filter(Boolean).join(" · ") || undefined}
                          why={p.why}
                          price={p.price}
                          searchQuery={p.searchQuery || `${p.brand} ${p.name}`}
                          imageUrl={p.imageUrl}
                          wbUrl={p.wbUrl}
                          ozonUrl={p.ozonUrl}
                          ymUrl={p.ymUrl}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {result.makeup && (
                  <div className="rounded-2xl bg-white border border-charcoal/10 p-5 space-y-4">
                    <h3 className="font-serif text-xl text-charcoal">Макияж под вас</h3>
                    {result.makeup.summary && (
                      <p className="text-sm text-charcoal/75 leading-relaxed">{result.makeup.summary}</p>
                    )}
                    {result.makeup.dayLook && (
                      <p className="text-sm text-charcoal/75 leading-relaxed whitespace-pre-wrap">
                        <span className="font-medium text-charcoal">День:</span> {result.makeup.dayLook}
                      </p>
                    )}
                    {result.makeup.eveningLook && (
                      <p className="text-sm text-charcoal/75 leading-relaxed whitespace-pre-wrap">
                        <span className="font-medium text-charcoal">Вечер:</span> {result.makeup.eveningLook}
                      </p>
                    )}
                    <div className="space-y-3 pt-2">
                      {result.makeup.products?.map((p, i) => (
                        <ProductShopCard
                          key={i}
                          brand={p.brand}
                          name={p.name}
                          detail={p.howTo ? `Как нанести: ${p.howTo}` : undefined}
                          why={p.why}
                          price={p.price}
                          searchQuery={p.searchQuery || `${p.brand} ${p.name}`}
                          imageUrl={p.imageUrl}
                          wbUrl={p.wbUrl}
                          ozonUrl={p.ozonUrl}
                          ymUrl={p.ymUrl}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 pt-5 border-t border-charcoal/10 space-y-2">
              {result && (
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setPromoCode("");
                    localStorage.removeItem(JOB_KEY);
                  }}
                  className="w-full py-3 rounded-full bg-charcoal text-ivory font-semibold hover:bg-charcoal/90 transition-colors"
                >
                  Начать заново
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-3.5 rounded-full border border-charcoal/20 text-charcoal font-medium hover:bg-charcoal/5 transition-colors"
              >
                Выйти
              </button>
              <p className="text-[11px] text-charcoal/40 text-center mt-2 leading-relaxed">
                Если связь оборвалась или генерации нет — не платите снова. Откройте «Мои образы», введите код СТИЛЬ-… и нажмите «Продолжить».
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
