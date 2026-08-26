/**
 * Hermes — auto-publisher для Telegram и MAX каналов.
 * Генерирует посты о моде, красоте и трендах 2026.
 * Модели:
 *  - Текст и шутки: anthropic/claude-haiku-4.5
 *  - Поиск:    perplexity/sonar-pro (живой веб-поиск)
 *  - Зрение фото: google/gemini-3.7-flash (да/нет по кадру)
 *  - Картинка: openai/gpt-5.4-image-2 (через Polza)
 *  - Видео:    bytedance/seedance-2-fast (через Polza)
 *
 * Конфиг через переменные окружения:
 *  - POLZA_API_KEY         — обязательный
 *  - HERMES_TG_TOKEN       — токен Hermes Stilist Bot (@hermes_stilist_bot), НЕ @Alex_tel_12bot
 *  - HERMES_TG_CHAT_ID     — chat_id канала https://t.me/stilist_ai_ru (@stilist_ai_ru), напр. -1003892047761
 *                            НЕ путать с @stilist_ai без _ru
 *  - HERMES_IMAGE_MODEL    — модель картинок (см. .env.example)
 *  - HERMES_MAX_TOKEN      — токен бота MAX (platform-api2.max.ru)
 *  - HERMES_MAX_CHAT_ID    — chat_id канала MAX (узнать: npx tsx hermes.ts --max-discover)
 *  - HERMES_MAX_API_BASE   — по умолчанию https://platform-api2.max.ru
 *  - DRY_RUN               — true/false (только логировать, не публиковать)
 *  - MODE                  — "auto" | "image" | "video" | "news"
 * Расписание (Europe/Moscow): 3 полноценных поста в день — 08:00 · 16:00 · 00:00.
 * Эталон: пост про Деми Ловато — одно фото человека/вещи В том наряде, о котором текст.
 * План дня: утро и день — три модные новости из известных журналов; ночь — маникюр / причёска / тренд одежды.
 * Звёздный пост: не короткая справка про ногти, а три сюжета (Вог, Эль, Базар и т.п.), которые сейчас читают.
 * Ссылки на статьи — внизу. Если нет годной новости — ещё раз Google, не старый уход/гардероб.
 * Ночной слот без новости — уход и гардероб; психолог в посте — про жизнь, не про моду. Текст не обрезаем.
 */
// Импортируем .env явно из текущей директории скрипта (Windows не любит import.meta.url для путей).
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";
// @ts-ignore — node-cron не имеет стабильных типов в этой версии
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function readEnvFileKey(filePath: string, key: string): string {
  try {
    if (!fs.existsSync(filePath)) return "";
    const m = fs.readFileSync(filePath, "utf-8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

// hermes/.env — канал; корневой .env — POLZA с балансом сайта (приоритет)
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
const rootPolza = readEnvFileKey(path.join(__dirname, "..", ".env"), "POLZA_API_KEY");
if (rootPolza) process.env.POLZA_API_KEY = rootPolza;

const PROJECT_ROOT = __dirname;
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const LOG_FILE = path.join(DATA_DIR, "hermes-log.json");
const TOPICS_FILE = path.join(PROJECT_ROOT, "topics.json");
const PUBLISHED_CACHE = path.join(DATA_DIR, "published-rss.json");
const PUBLIC_HERMES_DIR = path.join(PROJECT_ROOT, "..", "public", "hermes");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_HERMES_DIR)) fs.mkdirSync(PUBLIC_HERMES_DIR, { recursive: true });

const POLZA_API_KEY = (process.env.POLZA_API_KEY || "").trim();
function sanitizeTgToken(raw: string): string {
  const t = (raw || "").trim().replace(/^["']|["']$/g, "");
  // Placeholder / example values must not look like a real bot token
  if (!t) return "";
  if (/^REPLACE_/i.test(t) || /^your_/i.test(t) || t.includes("xxxxx") || t.includes("TOKEN_HERE")) return "";
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(t)) return "";
  return t;
}
const TG_TOKEN = sanitizeTgToken(process.env.HERMES_TG_TOKEN || "");
const TG_CHAT_ID = (process.env.HERMES_TG_CHAT_ID || "").trim();
const MAX_TOKEN = (process.env.HERMES_MAX_TOKEN || "").trim();
const MAX_CHAT_ID = (process.env.HERMES_MAX_CHAT_ID || "").trim();
const MAX_API_BASE = (process.env.HERMES_MAX_API_BASE || "https://platform-api2.max.ru").replace(/\/$/, "");
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
// MODE: auto | image | video | news
//   auto/news — 3 раза в сутки: полный пост как Деми (звезда/тренд/агентство/маникюр/уход)
//   image/video — старый формат (уход/гардероб/психология), только по --once
const MODE = (process.env.MODE || "news").toLowerCase();

function maxAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  // Official MAX docs: Authorization: {access_token} (без Bearer)
  return { Authorization: MAX_TOKEN, ...(extra || {}) };
}

/** Текст для MAX: Telegram-HTML → html format MAX (те же <b>). */
function captionForMax(caption: string): string {
  return String(caption || "")
    .replace(/&nbsp;/g, " ")
    .trim()
    .slice(0, 4000);
}

// Живые RSS (проверены: отдают item/entry). Мёртвые ленты не держим.
const RSS_FEEDS: { name: string; url: string }[] = (process.env.HERMES_RSS_FEEDS
  ? process.env.HERMES_RSS_FEEDS.split("|").map((s) => {
      const [name, url] = s.split(";", 2);
      return { name: (name || "").trim(), url: (url || "").trim() };
    }).filter((f) => f.name && f.url)
  : [
      { name: "WWD", url: "https://wwd.com/feed/" },
      { name: "Fashionista", url: "https://fashionista.com/.rss/full/" },
      { name: "BoF", url: "https://www.businessoffashion.com/feed/" },
      { name: "ELLE", url: "https://www.elle.com/rss/all.xml/" },
      { name: "Harper's Bazaar", url: "https://www.harpersbazaar.com/rss/all.xml/" },
      { name: "Who What Wear", url: "https://www.whowhatwear.com/rss" },
      { name: "Allure", url: "https://www.allure.com/feed/rss" },
      { name: "GQ", url: "https://www.gq.com/feed/rss" },
      { name: "Esquire", url: "https://www.esquire.com/rss/all.xml/" },
      { name: "Teen Vogue", url: "https://www.teenvogue.com/feed/rss" },
      { name: "Vogue UK", url: "https://www.vogue.co.uk/feed/rss" },
      { name: "Vogue Paris", url: "https://www.vogue.fr/feed/rss" },
      { name: "Vogue Italia", url: "https://www.vogue.it/feed/rss" },
      { name: "Vogue España", url: "https://www.vogue.es/feed/rss" },
      { name: "Vogue India", url: "https://www.vogue.in/feed/rss" },
      { name: "Vogue Germany", url: "https://www.vogue.de/feed/rss" },
      { name: "Vogue Japan", url: "https://www.vogue.co.jp/feed/rss" },
      { name: "Vogue Arabia", url: "https://en.vogue.me/feed/rss" },
      { name: "W Magazine", url: "https://www.wmagazine.com/rss" },
      { name: "Bazaar Fashion", url: "https://www.harpersbazaar.com/rss/fashion/" },
      { name: "Bazaar Beauty", url: "https://www.harpersbazaar.com/rss/beauty/" },
      { name: "Bazaar UK", url: "https://www.harpersbazaar.com/uk/rss/all.xml/" },
      { name: "ELLE UK", url: "https://www.elle.com/uk/rss/all.xml/" },
      { name: "ELLE Beauty", url: "https://www.elle.com/rss/beauty.xml/" },
      { name: "Grazia", url: "https://graziamagazine.com/feed" },
      { name: "Numéro", url: "https://www.numero.com/en/feed" },
      { name: "AnOther", url: "https://www.anothermag.com/feed" },
      { name: "i-D", url: "https://i-d.co/feed" },
      { name: "Interview", url: "https://www.interviewmagazine.com/feed" },
      { name: "CR Fashion Book", url: "https://www.crfashionbook.com/rss" },
      { name: "10 Magazine", url: "https://www.10magazine.com/feed/" },
      { name: "T Magazine", url: "https://rss.nytimes.com/services/xml/rss/nyt/tmagazine.xml" },
      { name: "WSJ Magazine", url: "https://feeds.a.dj.com/rss/RSSLifestyle.xml" },
      { name: "Wallpaper", url: "https://www.wallpaper.com/rss" },
      { name: "Town & Country", url: "https://www.townandcountrymag.com/rss/all.xml/" },
      { name: "Robb Report", url: "https://robbreport.com/feed/" },
      { name: "Stylist UK", url: "https://www.stylist.co.uk/feed" },
      { name: "Marie Claire UK", url: "https://www.marieclaire.co.uk/feed" },
      { name: "Coveteur", url: "https://coveteur.com/feed" },
      { name: "The Fashion Spot", url: "https://www.thefashionspot.com/feed/" },
      { name: "Culted", url: "https://culted.com/feed/" },
      { name: "Essence", url: "https://www.essence.com/feed/" },
      { name: "Vanity Fair", url: "https://www.vanityfair.com/feed/rss" },
      { name: "Refinery29", url: "https://www.refinery29.com/rss.xml" },
      { name: "Highsnobiety", url: "https://www.highsnobiety.com/feed" },
      { name: "Hypebeast", url: "https://hypebeast.com/feed" },
      { name: "Hypebeast Fashion", url: "https://hypebeast.com/fashion/feed" },
      { name: "Dazed", url: "https://www.dazeddigital.com/rss" },
      { name: "Footwear News", url: "https://footwearnews.com/feed/" },
      { name: "WWD Fashion", url: "https://wwd.com/fashion-news/feed/" },
      { name: "WWD Beauty", url: "https://wwd.com/beauty-industry-news/feed/" },
      { name: "GQ UK", url: "https://www.gq-magazine.co.uk/feed/rss" },
      { name: "GQ France", url: "https://www.gqmagazine.fr/feed/rss" },
      { name: "GQ Italia", url: "https://www.gqitalia.it/feed/rss" },
      { name: "Esquire UK", url: "https://www.esquire.com/uk/rss/all.xml/" },
      { name: "Men's Health", url: "https://www.menshealth.com/rss/all.xml/" },
      { name: "Permanent Style", url: "https://www.permanentstyle.com/feed" },
      { name: "FashionBeans", url: "https://www.fashionbeans.com/feed/" },
      { name: "Man of Many", url: "https://manofmany.com/feed" },
      { name: "THR Style", url: "https://www.hollywoodreporter.com/c/lifestyle/style/feed/" },
      { name: "Monocle", url: "https://monocle.com/rss/" },
      { name: "ELLE Fashion", url: "https://www.elle.com/rss/fashion.xml/" },
      { name: "ELLE Italia", url: "https://www.elle.com/it/rss/all.xml/" },
      { name: "ELLE España", url: "https://www.elle.com/es/rss/all.xml/" },
      { name: "ELLE Japan", url: "https://www.elle.com/jp/rss/all.xml/" },
      { name: "Teen Vogue Fashion", url: "https://www.teenvogue.com/feed/fashion/rss" },
      { name: "Teen Vogue Beauty", url: "https://www.teenvogue.com/feed/beauty/rss" },
      { name: "Vogue Korea", url: "https://www.vogue.co.kr/feed/" },
      { name: "Refinery29 Fashion", url: "https://www.refinery29.com/fashion/rss.xml" },
      { name: "Refinery29 Beauty", url: "https://www.refinery29.com/beauty/rss.xml" },
      { name: "Who What Wear UK", url: "https://www.whowhatwear.co.uk/rss" },
      { name: "Marie Claire Fashion", url: "https://www.marieclaire.co.uk/fashion/feed" },
      { name: "Marie Claire Beauty", url: "https://www.marieclaire.co.uk/beauty/feed" },
      { name: "Grazia Italia", url: "https://www.grazia.it/rss" },
      { name: "Grazia France", url: "https://www.grazia.fr/rss" },
      { name: "Guardian Fashion", url: "https://www.theguardian.com/fashion/rss" },
      { name: "NYT Fashion", url: "https://rss.nytimes.com/services/xml/rss/nyt/FashionandStyle.xml" },
      { name: "NYT Style", url: "https://rss.nytimes.com/services/xml/rss/nyt/Style.xml" },
      { name: "SCMP Style", url: "https://www.scmp.com/rss/91/feed" },
      { name: "PopSugar Fashion", url: "https://www.popsugar.com/fashion/feed" },
      { name: "PopSugar Beauty", url: "https://www.popsugar.com/beauty/feed" },
      { name: "Hypebae", url: "https://hypebae.com/feed" },
      { name: "Fashion Bomb Daily", url: "https://fashionbombdaily.com/feed/" },
      { name: "New Beauty", url: "https://www.newbeauty.com/feed/" },
      { name: "Women's Health", url: "https://www.womenshealthmag.com/rss/all.xml/" },
      { name: "Rolling Stone Style", url: "https://www.rollingstone.com/t/style/feed/" },
      { name: "WWD Accessories", url: "https://wwd.com/accessories-news/feed/" },
      { name: "GQ Germany", url: "https://www.gq-magazin.de/feed/rss" },
      { name: "GQ Japan", url: "https://www.gqjapan.jp/feed/rss" },
      { name: "Esquire Style", url: "https://www.esquire.com/style/rss" },
      { name: "DMARGE", url: "https://www.dmarge.com/feed" },
      { name: "Ape to Gentleman", url: "https://www.apetogentleman.com/feed/" },
      { name: "Put This On", url: "https://www.putthison.com/feed/" },
      { name: "Effortless Gent", url: "https://www.effortlessgent.com/feed/" },
      { name: "Real Men Real Style", url: "https://www.realmenrealstyle.com/feed/" },
      { name: "The Blueprint", url: "https://theblueprint.ru/rss" },
      { name: "Peopletalk", url: "https://www.peopletalk.ru/feed/" },
      { name: "Woman.ru", url: "https://www.woman.ru/rss/" },
      { name: "Afisha Daily", url: "https://daily.afisha.ru/rss/" },
    ]);

// Окно давности для MODE=news (дней). Полмесяца — чтобы всегда был запас тем.
const NEWS_MAX_AGE_DAYS = parseInt(process.env.HERMES_NEWS_MAX_AGE_DAYS || "14", 10);
const PREMIUM_PHOTO_RE = /vogue|bazaar|wwd|elle|who what wear|buro|fashionista|allure|byrdie|instyle|glamour|the cut|w magazine|highsnobiety|dazed|gq|esquire|wonderzine|blueprint|tatler|num[eé]ro|another|i-d|interview|cr fashion|t magazine|wallpaper|town & country|document|stylist|coveteur|grazia|robb report|guardian|nyt|new york times|scmp|hypebae|new beauty|models\.com|thevoicemag|the voice|peopletalk|woman\.ru/i;

if (!POLZA_API_KEY) {
  console.error("[Hermes] POLZA_API_KEY не задан");
  process.exit(1);
}

const polza = new OpenAI({
  apiKey: POLZA_API_KEY,
  baseURL: process.env.POLZA_BASE_URL || "https://polza.ai/api/v1",
});

// Посты с юмором: Haiku 4.5 дешевле Sonnet и Gemini 3.7, умеет шутить
const TEXT_MODEL = (process.env.HERMES_TEXT_MODEL || "anthropic/claude-haiku-4.5").trim();
const REVIEW_MODEL = (process.env.HERMES_REVIEW_MODEL || "anthropic/claude-haiku-4.5").trim();
const REVIEW_FALLBACK = (process.env.HERMES_REVIEW_FALLBACK || "google/gemini-3.5-flash-lite").trim();
// Поиск выходов звёзд — Perplexity Sonar Pro (живой веб, без Gemini-мышления)
const SEARCH_MODEL = (process.env.HERMES_SEARCH_MODEL || "perplexity/sonar-pro").trim();
const VISION_MODEL = (process.env.HERMES_VISION_MODEL || "google/gemini-3.7-flash").trim();
const NEWS_TEXT_MODEL = (process.env.HERMES_NEWS_TEXT_MODEL || "anthropic/claude-haiku-4.5").trim();
function searchCallExtras(size: "low" | "medium" | "high" = "medium"): Record<string, unknown> {
  // Sonar уже ищет сам. Плагин web на Gemini давал счёт 20–120 ₽ за запрос.
  if (/sonar|perplexity/i.test(SEARCH_MODEL)) {
    return {
      web_search_options: { search_context_size: size },
      search_recency_filter: "week",
    };
  }
  const max_results = size === "high" ? 8 : size === "low" ? 3 : 5;
  return {
    plugins: [
      {
        id: "web",
        max_results,
        search_prompt:
          "Google News most-read this week: Vogue, ELLE, Harper's Bazaar, WWD, Vanity Fair, GQ, People celebrity fashion. Red carpet, gown, collection, campaign. Skip short nail tips, salon how-to, gossip without an outfit.",
      },
    ],
  };
}
function searchCitations(r: unknown): string {
  const rec = r as {
    citations?: unknown;
    citations_urls?: unknown;
    choices?: Array<{ message?: { annotations?: unknown[] } }>;
  };
  const urls: string[] = [];
  const anns = rec?.choices?.[0]?.message?.annotations;
  if (Array.isArray(anns)) {
    for (const a of anns) {
      const u = (a as { url_citation?: { url?: string }; url?: string })?.url_citation?.url
        || (a as { url?: string })?.url;
      if (typeof u === "string" && /^https?:\/\//i.test(u)) urls.push(u);
    }
  }
  for (const extra of [rec?.citations, rec?.citations_urls]) {
    if (Array.isArray(extra)) {
      for (const u of extra) if (typeof u === "string" && /^https?:\/\//i.test(u)) urls.push(u);
    }
  }
  return [...new Set(urls)].slice(0, 6).join("\n");
}
// Картинки: openai/gpt-5.4-image-2 — пока топовая по качеству
const IMAGE_MODEL = (process.env.HERMES_IMAGE_MODEL || "openai/gpt-5.4-image-2").trim();
/** Одежда: пока топовая модель картинок. */
const WARDROBE_IMAGE_MODEL = (process.env.HERMES_WARDROBE_IMAGE_MODEL || "openai/gpt-5.4-image-2").trim();
const VIDEO_MODEL = "bytedance/seedance-2-fast";

type Audience = "women" | "men" | "celeb";
/** Угол крючка; в тексте поста всегда все 3 блока: уход / гардероб / психология. */
type WomenNiche = "face" | "body" | "hands" | "nails" | "wardrobe" | "mind";
type MenNiche = "skin" | "beard" | "hands" | "antiage" | "wardrobe" | "mind";
type DaySlotKind = Audience;

type HermesLog = {
  posts: Array<{
    id: string;
    ts: string;
    kind: "image" | "video";
    title: string;
    text: string;
    imagePath?: string;
    videoPath?: string;
    tgMessageId?: number;
    maxMessageId?: string;
    model: string;
    audience?: Audience;
    niche?: string;
  }>;
};

function loadLog(): HermesLog {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
      return raw && raw.posts ? raw : { posts: [] };
    }
  } catch {}
  return { posts: [] };
}

function saveLog(log: HermesLog): void {
  // Длинная память — чтобы не крутить темы через неделю
  log.posts = log.posts.slice(-400);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
}

function loadTopics(): string[] {
  try {
    if (fs.existsSync(TOPICS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(TOPICS_FILE, "utf-8"));
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {}
  return [];
}

const WOMEN_TOPICS: Record<WomenNiche, string[]> = {
  face: [
    "Лицо выдаёт недосып раньше морщин",
    "Плотный тон после 35 часто добавляет возраст",
    "3 минуты утром — и лицо выглядит свежее",
    "Шея и зона глаз выдают возраст раньше щёк",
    "Один крем утром лучше пяти слоёв «на всякий»",
    "SPF каждый день важнее нового тонального",
  ],
  body: [
    "Тело старит сухая кожа сильнее лишних складок",
    "Локти и колени выдают уход раньше лица",
    "Масло после душа работает лучше скраба каждый день",
    "Зона декольте просит крем не реже лица",
    "Шея — продолжение лица: один жест ухода",
  ],
  hands: [
    "Сухие руки старят сильнее мелких морщин",
    "Кутикула выдаёт уход сильнее цвета лака",
    "Крем для рук у сумки — мини-ритуал дня",
    "Руки на фото: что поправить за 2 минуты",
  ],
  nails: [
    "Короткий маникюр сейчас выглядит дороже длинного",
    "Молочный оттенок на коротких ногтях — тренд сезона",
    "Новый маникюр: форма мягкий квадрат без перегруза",
    "Френч 2026: тонкая линия вместо толстой «улыбки»",
    "Маникюр «чистое стекло»: как повторить дома",
    "Вишнёвый лак на короткой длине — вечерний акцент",
  ],
  wardrobe: [
    "Серый меланж у лица часто добавляет усталости",
    "3 вещи в шкафу, из-за которых образ выглядит дешевле",
    "Чистый цвет у лица работает лучше мелкого принта",
    "Блейзер поверх простой футболки — быстрый «собралась»",
    "Не та длина брюк старит сильнее усталости",
    "Чёрный «выцветший» рядом с лицом добавляет возраста",
    "Один акцент цвета у лица сильнее всего образа сразу",
    "Слишком много слоёв сверху делает силуэт тяжелее",
    "Светлый верх у лица молодит сильнее нового тона",
    "Узкий вырез «съедает» шею — откройте зону ключиц",
  ],
  mind: [
    "Человек нравится — что сделать сегодня, а не в голове",
    "Кажется, изменяют: первый шаг без сыска в телефоне",
    "Как растить дочку: что сказать вместо «будь умницей»",
    "Как растить сына: злость словами, не кулаком",
    "Мама орёт — что сделать после, не только стыдиться",
    "Папа дома, но как будто нет: как вернуть его к детям",
    "Родители звонят каждый день — любовь или контроль",
    "Бабушка не хочет брать внуков: как говорить без обиды",
    "Бабушка ломает ваши правила — что сказать спокойно",
    "Брат или сестра: «вас любили больше»",
    "Бывший написал — отвечать, молчать или блок",
    "Написать первым или ждать: одно ясное сообщение",
    "Свекровь критикует — как ответить без войны",
    "Подросток в телефоне: правило без крика",
    "Праздники: к маме или к свекрови",
    "Хочу уволиться, но страшно: один разговор на этой неделе",
    "Одна тяну дом — как попросить помощь без скандала",
  ],
};

const MEN_TOPICS: Record<MenNiche, string[]> = {
  skin: [
    "После бритья кожа выдаёт возраст быстрее бороды",
    "Сухое лицо у мужчины читается как усталость",
    "Одно средство утром сильнее полки из десяти",
    "Серая кожа после душа: что исправить за минуту",
    "Недосып у мужчин видно раньше, чем морщины",
    "SPF мужчинам нужен не меньше, чем крем после бритья",
  ],
  beard: [
    "Неухоженная борода старит сильнее короткой щетины",
    "Масло для бороды vs бальзам — что взять сегодня",
    "Линия щек решает аккуратность бороды",
    "Зуд под бородой — чаще сухость, а не «привыкнуть»",
    "Расчёска и капли масла — 60 секунд утром",
  ],
  hands: [
    "Руки мужчины на встрече читают раньше галстука",
    "Сухие кутикулы и обветренные ладони выдают усталость",
    "Крем для рук в машине/сумке — не «женская» вещь",
    "После спортзала руки нужно увлажнить сразу",
  ],
  antiage: [
    "Ретинол вечером — главный антиэйдж без чудес",
    "Увлажнение + SPF бьют дорогой «крем от морщин»",
    "Тёмные круги у мужчин: сон и лёгкий карандаш-консилер по делу",
    "Шея и зона бритья старят раньше лба",
    "Пептиды и ниацинамид — спокойный антиэйдж на каждый день",
  ],
  wardrobe: [
    "Серая футболка часто старит сильнее морщин",
    "Посадка брюк важнее бренда на бирке",
    "Выцветший чёрный рядом с лицом добавляет возраста",
    "Собранный вид без костюма: 1 приём на каждый день",
    "Плечо по шву — самый быстрый апгрейд образа",
  ],
  mind: [
    "Нравится человек — как дать знак, не давить",
    "Подозрение в измене: разговор, не проверка телефона",
    "Сын копирует вашу злость — покажите, как выходить",
    "Дочь закрылась: один вопрос вместо лекции",
    "Папа на диване: 20 минут только с ребёнком",
    "Мама устала — чем помочь сегодня, не «ну скажи»",
    "Свои родители болеют: один шаг, не всё сразу",
    "Бабушка не сидит с внуками — без упрёка, с планом",
    "Жена молчит вечером — слушать, не чинить сразу",
    "Просить прибавку: факты на бумаге, не обида",
    "Друг пропадает — написать конкретно, не обижаться молча",
    "Родители вмешиваются в семью — граница одним предложением",
    "Выгорел на работе: один выходной без «полезного»",
    "После ссоры: извиниться за факт, не «ну ты сама»",
  ],
};

const DEFAULT_TOPICS: string[] = Object.values(WOMEN_TOPICS).flat();

const WOMEN_NICHE_ORDER: WomenNiche[] = ["face", "body", "hands", "nails", "wardrobe", "mind"];
const MEN_NICHE_ORDER: MenNiche[] = ["skin", "beard", "hands", "antiage", "wardrobe", "mind"];

function normTitle(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[«»"'`.,!?;:—–\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Похожие заголовки: те же ключевые слова (меланж/витамин с/…) */
function titlesTooSimilar(a: string, b: string): boolean {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length >= 4));
  const wb = nb.split(" ").filter((w) => w.length >= 4);
  if (wa.size < 2 || wb.length < 2) return false;
  const overlap = wb.filter((w) => wa.has(w)).length;
  return overlap >= 2 && overlap / Math.min(wa.size, wb.length) >= 0.5;
}

/** Заголовки и темы, которые нельзя повторять (длинная память). */
function recentBannedTitles(limit = 90): string[] {
  try {
    const log = loadLog();
    return log.posts
      .slice(-limit)
      .map((p) => String(p.title || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isBannedTopic(topic: string, banned: string[]): boolean {
  return banned.some((b) => titlesTooSimilar(topic, b));
}

/** Похожий совет в блоке (например снова «витамин С / сыворотка»). */
function sectionTooSimilar(a: string, b: string, minOverlap = 3): boolean {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const stop = new Set(["это", "или", "для", "при", "после", "перед", "чтобы", "если", "как", "что", "ваш", "ваша", "лицо", "кожи", "кожа", "сегодня", "просто", "часто", "своей", "своего", "именно"]);
  const wa = new Set(na.split(" ").filter((w) => w.length >= 5 && !stop.has(w)));
  const wb = nb.split(" ").filter((w) => w.length >= 5 && !stop.has(w));
  if (wa.size < 2 || wb.length < 2) return false;
  const overlap = wb.filter((w) => wa.has(w)).length;
  return overlap >= minOverlap;
}

/**
 * Тематические кластеры психологии — ловим смысл, не только общие слова.
 * Иначе «отказать без объяснений» и «не всем нравиться» считаются разными.
 */
// Без \\b: в JS граница слова не работает с кириллицей.
// Широкая сетка сфер жизни — чтобы антиповтор ловил смысл, а не только «нет/нравиться».
const PSYCH_THEME_RULES: { id: string; re: RegExp }[] = [
  {
    id: "boundaries_peoplepleasing",
    re: /отказ|отказать|откаж|вежливост|чужие планы|чуж(ие|их|им) (ожидан|план|просьб)|всем понрав|не всем нрав|оправдан|оправдыв|просьб|границ|из вежливости|без объяснен|без лишних оправдан|предугадать чуж|people.?pleas/i,
  },
  { id: "compare_social", re: /сравнен|сравнива|с лент|чужим успех|инстаграм|соцсет|тиктоке|сторис|лайк/i },
  { id: "self_esteem", re: /зеркал|внутренн(ий|его) критик|самооценк|исправить всё|фраза.?стоп|сильной черт|достоинств/i },
  { id: "body_image", re: /тело|фигур|вес|живот|полный|худе|комплекс(ы|ов)?|внешност/i },
  // Клише «голос / темп / уверенная подача» — запрещаем крутить
  {
    id: "voice_pace_cliche",
    re: /голос|темп речи|медленн|говори(те)? медлен|без спешк|уверенн(ый|о|ая)\s+(голос|тон|речь|подач)|речь\s+уверен|продаёт надёж|харизм|присутств(ие|ия)|осанк|плеч[иа]|подбородок|жестах|сует[аы]|выдох перед|один выдох|пауза перед ответом|пауза в разговоре|спокойств(ие|ия) в паузе/i,
  },
  { id: "work_career", re: /на работе|коллег|начальник|карьер|дедлайн|задач|переработ|совещани|проект|зарплатн|повышен|увольн|офис|удалёнк|результат дня|занятост|почт|рабоч(ий|его) чат|делегир/i },
  { id: "money", re: /деньг|бюджет|трат|покупк|зарплат|финанс|копил|долг|кредит|накоп|подписк|платеж/i },
  { id: "relationships", re: /партн[её]р|муж|жена|отношени|свидан|романт|ссор|близост|упрёк|извиниться/i },
  { id: "crush_like", re: /симпат|человек нрав|он мне нрав|она мне нрав|нравится человек|написать первым|первый знак|стесняюсь сказать|crush|влюблённ/i },
  { id: "jealousy_affair", re: /измен|изменяет|ревность|ревну|проверять телефон|подозрен|переписк(у|и) партн|читает переписк/i },
  { id: "parenting_daughter", re: /дочк|дочер|девочк(у|е|и) воспит/i },
  { id: "parenting_son", re: /сын(а|у|ом|овей)|мальчик(а|у)|сынов/i },
  { id: "ex_breakup", re: /бывш(ий|ая|его)|расставан|развод|после разрыва|написал.?бывш/i },
  { id: "inlaws", re: /свекров|тёщ|тесть|свекр|родственник(и|ов) партн|вмешива(ет|ют)ся/i },
  { id: "teen_screen", re: /подростк|телефон ребёнк|экран ребён|играет до ночи|травля в школе/i },
  { id: "mother_child", re: /мама и (ребён|доч|сын)|материнств|я мама|мама устал|мама орёт|мама чувств|мамин стыд|мама винит себя/i },
  { id: "father_child", re: /папа и (ребён|доч|сын)|отец и дет|отцовств|я папа|папа молч|папа на диване|выходной папа|папа не играет/i },
  { id: "adult_parents", re: /взрослые родители|мама звонит каждый|родители винят|долг перед родител|уход за мам|уход за пап|родители болеют|родители одни/i },
  { id: "grandparents_babysit", re: /бабушк|дедушк|внучк|внуков|внука |не хотят сидеть|не берут внук|сиделк|оставить внук/i },
  { id: "grandparents_spoil", re: /бабушка балу|ломает правил|конфет(ы|ами) после отказа|у бабушки можно/i },
  { id: "siblings", re: /брат|сестр|сёстр|сиблинг|родители любят другого/i },
  { id: "blended_family", re: /сводн|приёмн|новые дети партнёра|его дети|её дети|чуж(ой|ие) ребён/i },
  { id: "coparenting", re: /двое домов|график с папой|бывший забирает|делить ребёнка|алимент/i },
  { id: "family_holidays", re: /праздник у родител|новый год у свекров|куда ехать на праздник|две семьи на праздник/i },
  { id: "family_money", re: /деньги родител|дают в долг мам|наследств|родители просят денег|кормить всю семью/i },
  { id: "family_home", re: /быт|только для себя|для всех|эгоизм|домашн|по дому|тяну дом|никто не моет/i },
  { id: "friendship", re: /друг|подруг|дружб|компания|окружен|встречу|друг пропад/i },
  { id: "fatigue_energy", re: /устал(ость|и)|восстанов|раздражен|после работы|энерг|выгоран|сил[ыа] нет|сброс после/i },
  { id: "anxiety_stress", re: /тревог|стресс|волнен|паник|напряжен|страх одним|накрыло/i },
  { id: "sleep_rest", re: /сон|спать|бессон|отдых|выходн|полежать|выспат|лечь на|серии/i },
  { id: "focus_decisions", re: /фокус|концентр|решени|выбор|прокрастин|отвлека|приоритет|список дел|достаточно хорошо|вкладки/i },
  { id: "conflict_anger", re: /злость|злост|конфликт|спор|критик[ауи]|обид|вспыл|пробке|черновик/i },
  { id: "loneliness", re: /одиноч|скучн|не с кем|изоляция|день Alone|Alone/i },
  { id: "change_age", re: /перемен|переезд|новый этап|возраст|после\s*30|после\s*40|старен|будущ|дедлайн «успеть/i },
  { id: "perfectionism", re: /идеальн|перфекц|ошибок|контроль всего|должно быть идеально|неидеальн|самобичеван/i },
  { id: "gratitude_joy", re: /благодар|радост|приятн|маленьк(ие|ая) побед|хорош(ий|ее) момент|победу дня/i },
  { id: "digital_detox", re: /телефон|экран|уведомлен|отлож(ить|ила)|без телефона|детокс|лент[аы] новост|сторис|отписать/i },
  { id: "asking_help", re: /просить помощи|не справля|делегир|помощь|сама всё|попросить помощь|попросить конкретн/i },
  { id: "self_compliment", re: /комплимент себе|без оговорок|мне можно|похвал(ить|а) себя|сильных качеств|критик в голове/i },
  { id: "habits_routine", re: /привычк|ритуал|утро|режим дня|распорядок|якорь привыч|первые 20 минут|на завтра/i },
  { id: "health_body_care_mind", re: /врач|анализ|спортзал|трениров|прогулк|вода и еда|движение|нагрузк|кофе «для бодрости»/i },
];

/** Сферы жизни для ротации психологии (не крутить одну). Список — не потолок, а очередь. */
const PSYCH_LIFE_DOMAINS = [
  "симпатия: человек нравится — первый шаг",
  "ревность и страх измены (без сыска в телефоне)",
  "воспитание дочери: слова, границы, тело",
  "воспитание сына: чувства можно, кулак нельзя",
  "мама и дети: усталость, вина, крик, нежность",
  "папа и дети: быть рядом, не только «добытчик»",
  "взрослые и свои родители: звонки, вина, уход",
  "бабушки и дедушки не хотят сидеть с внуками",
  "бабушки балуют / ломают правила родителей",
  "братья и сёстры: ревность, сравнение, наследство",
  "своя и чужие дети, сводная семья",
  "двое домов после расставания",
  "праздники: к кому ехать, две семьи",
  "деньги внутри семьи: долг родителям, «кормим всех»",
  "бывший / после расставания",
  "свекровь, тёща, родственники партнёра",
  "подросток, школа, телефон",
  "смысл дня и приоритеты",
  "работа и карьера без «голоса и пауз»",
  "деньги и спокойствие о финансах",
  "отношения с партнёром",
  "семья, быт, «я одна тяну дом»",
  "дружба и окружение",
  "здоровье: усталость и восстановление",
  "тревога и стресс (без советов про речь)",
  "сон и отдых",
  "фокус и важные решения",
  "конфликты и злость",
  "одиночество и потребность в близости",
  "перемены и страх будущего",
  "перфекционизм и право на ошибку",
  "радость, благодарность, маленькие победы",
  "телефон и цифровой шум",
  "умение просить о помощи",
  "самооценка без привязки к внешности и «уверенному голосу»",
  "границы (только если давно не было)",
  "сравнение с чужой жизнью в соцсетях",
  "привычки и утренний/вечерний якорь",
  "тело как здоровье: движение, еда, визит к врачу",
] as const;

const PSYCH_FAMILY_DOMAINS = new Set<string>([
  "воспитание дочери: слова, границы, тело",
  "воспитание сына: чувства можно, кулак нельзя",
  "мама и дети: усталость, вина, крик, нежность",
  "папа и дети: быть рядом, не только «добытчик»",
  "взрослые и свои родители: звонки, вина, уход",
  "бабушки и дедушки не хотят сидеть с внуками",
  "бабушки балуют / ломают правила родителей",
  "братья и сёстры: ревность, сравнение, наследство",
  "своя и чужие дети, сводная семья",
  "двое домов после расставания",
  "праздники: к кому ехать, две семьи",
  "деньги внутри семьи: долг родителям, «кормим всех»",
  "свекровь, тёща, родственники партнёра",
  "подросток, школа, телефон",
  "семья, быт, «я одна тяну дом»",
  "отношения с партнёром",
]);

const PSYCH_DOMAIN_TO_THEME: Record<string, string> = {
  "симпатия: человек нравится — первый шаг": "crush_like",
  "ревность и страх измены (без сыска в телефоне)": "jealousy_affair",
  "воспитание дочери: слова, границы, тело": "parenting_daughter",
  "воспитание сына: чувства можно, кулак нельзя": "parenting_son",
  "мама и дети: усталость, вина, крик, нежность": "mother_child",
  "папа и дети: быть рядом, не только «добытчик»": "father_child",
  "взрослые и свои родители: звонки, вина, уход": "adult_parents",
  "бабушки и дедушки не хотят сидеть с внуками": "grandparents_babysit",
  "бабушки балуют / ломают правила родителей": "grandparents_spoil",
  "братья и сёстры: ревность, сравнение, наследство": "siblings",
  "своя и чужие дети, сводная семья": "blended_family",
  "двое домов после расставания": "coparenting",
  "праздники: к кому ехать, две семьи": "family_holidays",
  "деньги внутри семьи: долг родителям, «кормим всех»": "family_money",
  "бывший / после расставания": "ex_breakup",
  "свекровь, тёща, родственники партнёра": "inlaws",
  "подросток, школа, телефон": "teen_screen",
  "смысл дня и приоритеты": "focus_decisions",
  "работа и карьера без «голоса и пауз»": "work_career",
  "деньги и спокойствие о финансах": "money",
  "отношения с партнёром": "relationships",
  "семья, быт, «я одна тяну дом»": "family_home",
  "дружба и окружение": "friendship",
  "здоровье: усталость и восстановление": "fatigue_energy",
  "тревога и стресс (без советов про речь)": "anxiety_stress",
  "сон и отдых": "sleep_rest",
  "фокус и важные решения": "focus_decisions",
  "конфликты и злость": "conflict_anger",
  "одиночество и потребность в близости": "loneliness",
  "перемены и страх будущего": "change_age",
  "перфекционизм и право на ошибку": "perfectionism",
  "радость, благодарность, маленькие победы": "gratitude_joy",
  "телефон и цифровой шум": "digital_detox",
  "умение просить о помощи": "asking_help",
  "самооценка без привязки к внешности и «уверенному голосу»": "self_esteem",
  "границы (только если давно не было)": "boundaries_peoplepleasing",
  "сравнение с чужой жизнью в соцсетях": "compare_social",
  "привычки и утренний/вечерний якорь": "habits_routine",
  "тело как здоровье: движение, еда, визит к врачу": "health_body_care_mind",
};

/** Клише, которые модель любит перефразировать — режем на выходе. */
function psychTextIsVoiceCliche(text: string): boolean {
  return /голос|темп речи|медленн|говори(те)? медлен|без спешк(и|и в речи)|уверенн(ый|ая|о)\s+(голос|тон|речь|подач)|харизм|осанк|пауза перед ответом|один выдох перед|спокойств(ие|ия) в паузе|продаёт надёж/i.test(
    String(text || ""),
  );
}

/** Психология не должна быть про «выглядеть дороже» и паузу как стиль. */
function psychTextIsFashionCliche(text: string): boolean {
  return /выгляд(ит|ят) дороже|пауза выглядит|границ[аы].*(туфел|плать|крем)|комплимент себе.*образ|читает(ся)? на лице сильнее|старит настроение|часть образа|дешевле спокойн/i.test(
    String(text || ""),
  );
}

function themesOf(text: string, rules: { id: string; re: RegExp }[]): string[] {
  const t = String(text || "");
  if (!t.trim()) return [];
  return rules.filter((r) => r.re.test(t)).map((r) => r.id);
}

function psychThemesOf(text: string): string[] {
  return themesOf(text, PSYCH_THEME_RULES);
}

/** Темы ухода — чтобы не крутить одно и то же. */
const CARE_THEME_RULES: { id: string; re: RegExp }[] = [
  { id: "vit_c_serum", re: /витамин\s*с|аскорбин/i },
  { id: "hyaluron_moist", re: /гиалурон|увлажн|крем сразу|после умыван/i },
  { id: "spf_sun", re: /spf|спф|солнцезащит|фильтр/i },
  { id: "retinol_antiage", re: /ретинол|ретинал|антиэйдж|пептид|ниацинамид/i },
  { id: "eyes_patches", re: /патч|зона глаз|от[её]чн|круги под/i },
  { id: "neck_decollete", re: /ше[яи]|декольт|ключниц/i },
  { id: "body_care", re: /тело|после душа|локт|колен|масло для тела|лосьон/i },
  { id: "hands_cream", re: /крем для рук|ладонь|заусен|сухие руки/i },
  { id: "manicure_trend", re: /маникюр|ногт|лак|френч|кутикул|гель|квадрат|миндал|овал/i },
  { id: "shave_men", re: /брить|после брить|щетин|бритва/i },
  { id: "beard_care", re: /бород|бальзам для бород|масло для бород|расчёск/i },
  { id: "massage_lymph", re: /массаж|лимфодренаж|массажн/i },
  { id: "exfoliate", re: /скраб|пилинг|шелушен|AHA|BHA|кислот/i },
  { id: "cleanser", re: /умывал|гель для умыван|пенк|очищен/i },
];

/** Два разных угла ухода на пост (женщины) — второй почти всегда про маникюр. */
const CARE_ANGLES_WOMEN_FACE_BODY = [
  "лицо: мягкое очищение + крем с гиалуроном (CeraVe / La Roche-Posay Toleriane)",
  "лицо: сыворотка с ниацинамидом утром (The Ordinary Niacinamide)",
  "лицо: витамин C утром под крем (The Ordinary Ascorbyl / SkinCeuticals-стиль аптечный аналог)",
  "лицо: ретинол вечером 2–3 раза в неделю (The Ordinary Retinol / CeraVe Resurfacing)",
  "лицо: SPF 30+ каждый день (La Roche-Posay Anthelios / Bioderma Photoderm)",
  "глаза: лёгкий крем-гель от отёков (The Inkey List / аптечный caffeine eye)",
  "шея и декольте: тот же крем, что для лица, вверх от груди",
  "тело: масло/лосьон после душа на влажную кожу (CeraVe SA / Neutrogena Body Oil)",
  "тело: сухие локти — плотный крем с мочевиной (CeraVe / Eucerin Urea)",
  "тело: лёгкий скраб 1–2 раза в неделю, не каждый день",
];

const CARE_ANGLES_WOMEN_NAILS = [
  "маникюр-тренд: короткий мягкий квадрат + молочный лак — как сделать дома",
  "маникюр-тренд: тонкий френч 2026 (волосяная линия) — шаги",
  "маникюр-тренд: «стеклянные» ногти / clear glossy — база+топ",
  "маникюр-тренд: вишнёвый или ягодный на короткой длине",
  "маникюр: уход за кутикулой маслом перед лаком (Essie / Sally Hansen cuticle)",
  "маникюр: укрепляющая база при ломкости (OPI Nail Envy / укрепляющая база)",
  "маникюр: снять сухость кутикулы без обрезания ножницами",
  "маникюр: форма мягкий овал — кому идёт и как опилить",
];

const CARE_ANGLES_MEN = [
  "лицо: гель для умывания без пересушивания (CeraVe Foaming / La Roche-Posay)",
  "после бритья: крем/бальзам без спирта (Nivea Men Sensitive / CeraVe)",
  "лицо: увлажняющий крем утром (CeraVe PM/AM / Neutrogena Hydro Boost Men)",
  "антиэйдж: ниацинамид утром (The Ordinary) + увлажнение",
  "антиэйдж: ретинол вечером редко и точечно (The Ordinary Retinol)",
  "антиэйдж: SPF каждый день (La Roche-Posay Anthelios / ISDIN)",
  "борода: масло для бороды 3–4 капли + расчёска (Proraso / Honest Amish-стиль / любой oil blend)",
  "борода: бальзам для формы и меньше зуда",
  "борода: линия щёк машинкой — аккуратность важнее длины",
  "руки: крем после мытья/зала (Nivea Men / CeraVe Therapeutic)",
  "руки: кутикула и сухие заусенцы — капля масла на ночь",
  "шея после бритья: тот же увлажняющий крем, что для лица",
];

function pickTwoCareAngles(isMen: boolean): { a: string; b: string; visualFocus: string } {
  const banned = new Set(recentSectionThemes("Уход", 16));
  const filterPool = (pool: string[]) =>
    pool.filter((x) => {
      const th = themesOf(x, CARE_THEME_RULES);
      return !th.some((t) => banned.has(t));
    });

  if (isMen) {
    const pool = filterPool(CARE_ANGLES_MEN);
    const src = pool.length >= 2 ? pool : CARE_ANGLES_MEN;
    const shuffled = [...src].sort(() => Math.random() - 0.5);
    const a = shuffled[0];
    const b = shuffled.find((x) => x !== a && themesOf(x, CARE_THEME_RULES)[0] !== themesOf(a, CARE_THEME_RULES)[0]) || shuffled[1] || a;
    return { a, b, visualFocus: "men skincare products bottles + beard or hands close-up, product labels readable" };
  }

  const facePool = filterPool(CARE_ANGLES_WOMEN_FACE_BODY);
  const nailPool = filterPool(CARE_ANGLES_WOMEN_NAILS);
  const faceSrc = facePool.length ? facePool : CARE_ANGLES_WOMEN_FACE_BODY;
  const nailSrc = nailPool.length ? nailPool : CARE_ANGLES_WOMEN_NAILS;
  const a = faceSrc[Math.floor(Math.random() * faceSrc.length)];
  const b = nailSrc[Math.floor(Math.random() * nailSrc.length)];
  return {
    a,
    b,
    visualFocus: "beauty flatlay: named skincare bottles + manicure close-up of hands/nails matching the trend, product packaging visible",
  };
}

/** Темы гардероба — цвет у лица, меланж, посадка и т.д. */
const WARDROBE_THEME_RULES: { id: string; re: RegExp }[] = [
  { id: "grey_melange", re: /меланж|серы[йе]|серого/i },
  { id: "color_near_face", re: /у лица|цвет у лица|акцент цвета|молочн(ых|ый) отт|светлый верх/i },
  { id: "black_faded", re: /выцветш|чёрный|черный рядом/i },
  { id: "neckline_cut", re: /вырез|водолазк|воротник|ключниц|V-образ/i },
  { id: "fit_length", re: /посадк|длин[аы] брюк|по шву|плечо по/i },
  { id: "layers_blazer", re: /блейзер|сло[её]|куртк|поверх/i },
  { id: "fabric_pills", re: /катыш|тонк(ие|ая) белые|вытерт|фактур/i },
  { id: "scarf_collar", re: /шарф|воротник тепл/i },
];

function careThemesOf(text: string): string[] {
  return themesOf(text, CARE_THEME_RULES);
}
function wardrobeThemesOf(text: string): string[] {
  return themesOf(text, WARDROBE_THEME_RULES);
}

function recentSectionThemes(
  section: "Уход" | "Гардероб" | "Психология",
  limit = 10,
): string[] {
  const rules =
    section === "Уход" ? CARE_THEME_RULES : section === "Гардероб" ? WARDROBE_THEME_RULES : PSYCH_THEME_RULES;
  const themes = new Set<string>();
  for (const tip of recentSectionSnippets(section, limit)) {
    for (const id of themesOf(tip, rules)) themes.add(id);
  }
  return [...themes];
}

function recentPsychThemes(limit = 8): string[] {
  return recentSectionThemes("Психология", limit);
}

function psychAngleTheme(angle: string): string | null {
  const hits = psychThemesOf(angle);
  return hits[0] || null;
}

/** Углы психологии без недавних тем и без клише про голос. */
function pickFreshPsychAngles(pool: string[], count = 5, preferTheme?: string | null): string[] {
  const bannedThemes = new Set(recentPsychThemes(22));
  const hardBan = new Set<string>(["voice_pace_cliche"]);
  if (bannedThemes.has("boundaries_peoplepleasing")) hardBan.add("boundaries_peoplepleasing");

  const ok = (a: string) => {
    if (psychTextIsVoiceCliche(a) || psychTextIsFashionCliche(a)) return false;
    const ths = psychThemesOf(a);
    if (ths.some((t) => hardBan.has(t))) return false;
    if (ths.some((t) => bannedThemes.has(t))) return false;
    return true;
  };

  let src = pool.filter(ok);
  if (preferTheme) {
    const themed = src.filter((a) => psychThemesOf(a).includes(preferTheme));
    if (themed.length) src = themed;
  }
  if (src.length < count) {
    src = pool.filter((a) => !psychTextIsVoiceCliche(a) && !psychTextIsFashionCliche(a) && !psychThemesOf(a).some((t) => hardBan.has(t)));
    if (preferTheme) {
      const themed = src.filter((a) => psychThemesOf(a).includes(preferTheme));
      if (themed.length) src = themed;
    }
  }
  const shuffled = [...(src.length ? src : pool.filter((a) => !psychTextIsVoiceCliche(a) && !psychTextIsFashionCliche(a)))].sort(
    () => Math.random() - 0.5,
  );
  return shuffled.slice(0, Math.max(1, count));
}

/** Случайная сфера жизни, которой не было в недавних темах. Семья — чаще, потому что жизнь шире моды. */
function pickFreshLifeDomain(): string {
  const banned = new Set(recentPsychThemes(22));
  banned.add("voice_pace_cliche"); // никогда не «выбираем» голос как сферу
  const fresh = PSYCH_LIFE_DOMAINS.filter((d) => {
    const th = PSYCH_DOMAIN_TO_THEME[d];
    return !th || !banned.has(th);
  });
  const pool = fresh.length
    ? fresh
    : PSYCH_LIFE_DOMAINS.filter((d) => !/границ|голос/i.test(d));
  const familyPool = pool.filter((d) => PSYCH_FAMILY_DOMAINS.has(d));
  if (familyPool.length && Math.random() < 0.58) {
    return familyPool[Math.floor(Math.random() * familyPool.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Одна сфера + один угол под неё — чтобы модель не уезжала в «голос/уверенность». */
function pickPsychBrief(isMen: boolean): { domain: string; angle: string; theme: string | null } {
  const domain = pickFreshLifeDomain();
  const theme = PSYCH_DOMAIN_TO_THEME[domain] || null;
  const pool = isMen ? PSYCH_ANGLES_MEN : PSYCH_ANGLES_WOMEN;
  const angles = pickFreshPsychAngles(pool, 3, theme);
  return { domain, angle: angles[0] || pool[0], theme };
}

function sectionThemeRepeats(
  text: string,
  recent: string[],
  themeFn: (t: string) => string[],
  minWordOverlap = 2,
): boolean {
  if (!text) return false;
  if (recent.some((x) => sectionTooSimilar(text, x, minWordOverlap))) return true;
  const themes = new Set(themeFn(text));
  if (!themes.size) return false;
  return recent.some((x) => themeFn(x).some((t) => themes.has(t)));
}

function postContentRepeats(body: string): boolean {
  const care = recentSectionSnippets("Уход", 20);
  const ward = recentSectionSnippets("Гардероб", 20);
  const psych = recentSectionSnippets("Психология", 20);
  const extract = (section: "Уход" | "Гардероб" | "Психология") => {
    const mark = section === "Уход" ? "①\\s*Уход" : section === "Гардероб" ? "②\\s*Гардероб" : "③\\s*Психология";
    const stop =
      section === "Уход"
        ? "(?=\\n\\s*②|\\n\\s*\\n|$)"
        : section === "Гардероб"
          ? "(?=\\n\\s*③|\\n\\s*\\n|$)"
          : "(?=\\n\\s*\\n|Что |Какой |CTA|$)";
    const m = body.match(new RegExp(`${mark}\\s*\\n+([\\s\\S]*?)${stop}`, "i"));
    return (m?.[1] || "").replace(/\s+/g, " ").trim();
  };
  const c = extract("Уход");
  const w = extract("Гардероб");
  const p = extract("Психология");
  // Все 3 блока: похожие слова + та же смысловая тема
  if (sectionThemeRepeats(c, care, careThemesOf, 2)) return true;
  if (sectionThemeRepeats(w, ward, wardrobeThemesOf, 2)) return true;
  if (sectionThemeRepeats(p, psych, psychThemesOf, 2)) return true;
  return false;
}

function pickUnused(pool: string[], banned: string[]): string[] {
  return pool.filter((t) => !isBannedTopic(t, banned));
}

function pickTopicWithNiche(_recentTitles: string[], audience: Audience = "women"): { topic: string; niche: string } {
  const banned = recentBannedTitles(90);

  if (audience === "celeb") {
    const pool = pickUnused(CELEB_BATCH_TOPICS, banned);
    const src = pool.length ? pool : CELEB_BATCH_TOPICS;
    return { topic: src[Math.floor(Math.random() * src.length)], niche: "celeb" };
  }

  if (audience === "men") {
    // Если ниша выжата — берём другую, а не возвращаем старую тему
    for (const niche of [pickMenNiche(), ...MEN_NICHE_ORDER]) {
      const pool = pickUnused(MEN_TOPICS[niche], banned);
      if (pool.length) {
        return { topic: pool[Math.floor(Math.random() * pool.length)], niche };
      }
    }
    const flat = pickUnused(Object.values(MEN_TOPICS).flat(), banned);
    const src = flat.length ? flat : Object.values(MEN_TOPICS).flat();
    return { topic: src[Math.floor(Math.random() * src.length)], niche: pickMenNiche() };
  }

  for (const niche of [pickWomenNiche(), ...WOMEN_NICHE_ORDER]) {
    const nichePool = pickUnused(WOMEN_TOPICS[niche], banned);
    if (nichePool.length) {
      return { topic: nichePool[Math.floor(Math.random() * nichePool.length)], niche };
    }
  }
  const fromFile = pickUnused(loadTopics(), banned);
  const all = pickUnused(DEFAULT_TOPICS, banned);
  const pool = fromFile.length ? fromFile : (all.length ? all : DEFAULT_TOPICS);
  return { topic: pool[Math.floor(Math.random() * pool.length)], niche: pickWomenNiche() };
}

function pickWomenNiche(): WomenNiche {
  const recent = recentAudienceNiches("women");
  return WOMEN_NICHE_ORDER.find((n) => !recent.slice(-2).includes(n)) || WOMEN_NICHE_ORDER[recent.length % WOMEN_NICHE_ORDER.length];
}

function pickMenNiche(): MenNiche {
  const recent = recentAudienceNiches("men");
  return MEN_NICHE_ORDER.find((n) => !recent.slice(-2).includes(n)) || MEN_NICHE_ORDER[recent.length % MEN_NICHE_ORDER.length];
}

function recentAudienceNiches(audience: Audience): string[] {
  try {
    const log = loadLog();
    return log.posts
      .filter((p) => (p as any).audience === audience || (!("audience" in p) && audience === "women"))
      .slice(-10)
      .map((p) => String((p as any).niche || ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function runCmd(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += String(d);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} ${code}: ${err.slice(0, 400)}`));
    });
  });
}

async function downloadFirst(urls: string[], dest: string, referer?: string): Promise<string> {
  let last = "no urls";
  const expanded = urls.flatMap((u) => imageUrlVariants(u));
  for (const url of expanded) {
    try {
      await downloadToFile(url, dest, referer);
      return dest;
    } catch (e) {
      last = (e as Error).message || String(e);
      console.warn("[Hermes] download failed:", last.slice(0, 140));
    }
  }
  throw new Error(last);
}

async function cropHeroPortrait(src: string, dest: string, mode: "face" | "center" | "body" = "face"): Promise<string> {
  if (mode === "body") {
    try {
      fs.copyFileSync(src, dest);
      if (fs.existsSync(dest)) return dest;
    } catch {
      /* fall through */
    }
    return src;
  }
  const script = path.join(__dirname, "crop-hero.py");
  const pyBins = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const bin of pyBins) {
    try {
      await runCmd(bin, [script, dest, src, mode]);
      if (fs.existsSync(dest)) return dest;
    } catch (e) {
      console.warn("[Hermes] crop-hero:", (e as Error).message.slice(0, 140));
    }
  }
  return src;
}

/** Сетка 3×2: портрет | деталь, три звезды. */
async function composeGrid(outPath: string, files: string[]): Promise<string> {
  if (files.length < 2) throw new Error("compose-grid: need at least 2 images");
  const script = path.join(__dirname, "compose-grid.py");
  const pyBins = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const bin of pyBins) {
    try {
      await runCmd(bin, [script, outPath, ...files]);
      if (fs.existsSync(outPath)) return outPath;
    } catch (e) {
      console.warn("[Hermes] python compose:", (e as Error).message.slice(0, 180));
    }
  }
  const n = Math.min(files.length, 6);
  const cols = 2;
  const cell = 800;
  try {
    await runCmd("magick", [
      "montage",
      ...files.slice(0, n),
      "-tile",
      `${cols}x`,
      "-geometry",
      `${cell}x${cell}+9+9`,
      "-background",
      "#f9f8f6",
      outPath,
    ]);
    if (fs.existsSync(outPath)) return outPath;
  } catch (e) {
    console.warn("[Hermes] magick compose:", (e as Error).message.slice(0, 180));
  }
  const inputs = files.slice(0, n).flatMap((f) => ["-i", f]);
  const scales = files
    .slice(0, n)
    .map(
      (_, i) =>
        `[${i}:v]scale=${cell}:${cell}:force_original_aspect_ratio=increase,crop=${cell}:${cell},setsar=1[v${i}]`,
    )
    .join(";");
  const layout = files
    .slice(0, n)
    .map((_, i) => `${(i % cols) * cell}_${Math.floor(i / cols) * cell}`)
    .join("|");
  const stack = `${files.slice(0, n).map((_, i) => `[v${i}]`).join("")}xstack=inputs=${n}:layout=${layout}[out]`;
  await runCmd("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex",
    `${scales};${stack}`,
    "-map",
    "[out]",
    "-q:v",
    "2",
    outPath,
  ]);
  if (!fs.existsSync(outPath)) throw new Error("compose-grid failed");
  return outPath;
}

async function downloadToFile(url: string, dest: string, referer?: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    let ref = referer || "";
    try {
      ref = referer || new URL(url).origin + "/";
    } catch {
      ref = referer || url;
    }
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
        referer: ref,
      },
    } as any);
    if (!r.ok) throw new Error(`download failed ${r.status} ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!isImageBuffer(buf)) throw new Error(`not an image ${url.slice(0, 80)}`);
    if (buf.length < 12000) throw new Error(`image too small ${buf.length}`);
    await materializeImage(buf, dest);
    return dest;
  } finally {
    clearTimeout(timer);
  }
}

/** Частые украинские/смешанные формы и кривые кальки — не пускать в канал. */
function hasNonRussianMix(text: string): boolean {
  const t = String(text || "");
  if (/[іїєґІЇЄҐ]/.test(t)) return true;
  if (/\b(середн|будь ласка|будь-ласка|тощо|більш|щоб|якщо|через те|виглядає|догляд|шкір|зачіск|макіяж|обличчя|середньої|середній)\b/i.test(t)) {
    return true;
  }
  // Неестественный русский / кальки
  if (/\bставит возраст\b/i.test(t)) return true;
  if (/\bдобавляет лет к возрасту\b/i.test(t) && /\bставит\b/i.test(t)) return true;
  return false;
}

function ensureTripleSections(body: string): boolean {
  return /①\s*Уход/i.test(body) && /②\s*Гардероб/i.test(body) && /③\s*Психология/i.test(body);
}

function ensureCtaTriple(body: string): boolean {
  if (/④\s*(?:Голос|От себя)/i.test(body) && /\?/.test(body)) return true;
  return /1\s*\/\s*2\s*\/\s*3|1,\s*2\s*или\s*3|1,\s*2\s*или\s*3|:\s*1,\s*2\s*или\s*3/i.test(body)
    || (/1/.test(body) && /2/.test(body) && /3/.test(body) && /Что|какой|Какой|что возьм|ближе/i.test(body));
}

/** Убрать опрос 1/2/3 из текста раздела — он живёт только в блоке «От себя». */
function stripSectionEngagementCta(text: string): string {
  return String(text || "")
    .replace(/\n*Давайте в комментариях[^\n]*/gi, "")
    .replace(/\n*Что\s+(?:возьмёте|возьмете|внедрите|внедришь|из этого|ближе|исправим|обновите|разберем)[^\n]*/gi, "")
    .replace(/\n*Какая часть требует внимания[^\n]*/gi, "")
    .replace(/\n*Что\s+(?:внедрили|исправим)[^\n]*/gi, "")
    .replace(/\n*[12]\s*\/\s*[23][^\n]*/g, "")
    .trim();
}

/** Вытащить блок раздела из прошлых постов. */
function recentSectionSnippets(section: "Уход" | "Гардероб" | "Психология", limit = 12): string[] {
  const mark =
    section === "Уход" ? "①\\s*Уход" : section === "Гардероб" ? "②\\s*Гардероб" : "③\\s*Психология";
  const stop =
    section === "Уход"
      ? "(?=\\n\\s*②|\\n\\s*\\n|Что |Какой |CTA|$)"
      : section === "Гардероб"
        ? "(?=\\n\\s*③|\\n\\s*\\n|Что |Какой |CTA|$)"
        : "(?=\\n\\s*\\n|Что |Какой |CTA|$)";
  try {
    const log = loadLog();
    const tips: string[] = [];
    const rx = new RegExp(`${mark}\\s*\\n+([\\s\\S]*?)${stop}`, "i");
    for (const p of [...log.posts].reverse()) {
      const text = String(p.text || "");
      const m = text.match(rx);
      if (!m) continue;
      const tip = m[1].replace(/\s+/g, " ").trim().slice(0, 200);
      if (tip.length > 20) tips.push(tip);
      if (tips.length >= limit) break;
    }
    return tips;
  } catch {
    return [];
  }
}

function recentPsychologySnippets(limit = 10): string[] {
  return recentSectionSnippets("Психология", limit);
}

/** Свежие заголовки с сайтов (RSS) — чтобы не крутить один и тот же набор тем. */
async function fetchRssInspiration(limit = 6): Promise<string[]> {
  try {
    const items = await fetchRssFeeds();
    const published = loadPublishedCache();
    const scored = items
      .filter((it) => !published.has(it.link))
      .map((it) => ({ title: it.title, score: fashionScore(it) }))
      .filter((x) => x.score >= 2 && x.title.length > 12)
      .sort((a, b) => b.score - a.score);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of scored) {
      const n = normTitle(x.title);
      if (seen.has(n) || isBannedTopic(x.title, recentBannedTitles(90))) continue;
      seen.add(n);
      out.push(x.title.slice(0, 90));
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.warn("[Hermes] RSS inspiration skip:", (e as Error).message);
    return [];
  }
}

const PSYCH_ANGLES_WOMEN = [
  // симпатия
  "человек нравится — один ясный знак интереса сегодня, не десять намёков в голове",
  "написать первым коротко и по делу, не роман в чате",
  "если не отвечает — не догонять третьим сообщением, дать пространство",
  "стесняюсь сказать: одна фраза вживую или голосом, не проверять «он точно понял»",
  // ревность / измена
  "кажется, изменяют — назвать себе чувство, не устраивать допрос сегодня",
  "не проверять телефон: один спокойный разговор про факты, которые видели",
  "ревность без доказательств: «мне тревожно, давай поговорим», не обвинять",
  "если опасно или есть угроза — к близким/помощи, не оставаться в сыске одной",
  // дочь
  "дочке про внешность: хвалить характер и дело, не «какая ты красивая» каждый раз",
  "дочь закрылась в комнате — постучать и спросить одно, не лекцию у двери",
  "дочь ошиблась — сначала «я с тобой», потом правило, не стыд перед гостями",
  "девочке можно злиться и говорить «нет» — вы покажите как, без крика",
  // мама и дети
  "мама орёт — после крика обнять и сказать «я злилась на дело, не на тебя»",
  "мама винит себя за день — один добрый факт: «я была рядом», не самобичевание до ночи",
  "мама устала: 15 минут тишины до «для всех», договориться с папой заранее",
  "мама сравнивает себя с «идеальными» в ленте — закрыть и назвать одно своё «достаточно»",
  // папа и дети
  "папа дома, но в телефоне — 20 минут только с ребёнком, телефон в другой комнате",
  "папа не знает, во что играть — спросить ребёнка «покажи мне» и присоединиться",
  "папа после работы молчит — сначала 10 минут с детьми, новости потом",
  // взрослые родители
  "мама звонит каждый день — договориться о времени звонка, не бросать трубку в злости",
  "родители винят «ты нам должна» — одно спокойное «я люблю вас, решать буду сама»",
  "родители болеют — один конкретный шаг на этой неделе (врач, продукты), не всё сразу",
  "папа молчит годами — короткий визит или звонок без разбора старых обид сегодня",
  // бабушки / внуки
  "бабушка не хочет сидеть с внуками — не обижаться: спросить «что реально можете», искать другой план",
  "дедушке тяжело с малышом — предложить короткую прогулку, не целый день",
  "бабушка говорит «вы сами родили» — ответить «нам нужна помощь, не упрёк», и искать няню/друга",
  "не берут внуков на выходные — договориться на 2 часа, не на двое суток",
  // бабушки ломают правила
  "бабушка балует конфетами после вашего «нет» — одно правило вслух при ребёнке, без войны",
  "у бабушки можно то, что дома нельзя — заранее список «у нас так», не скандал после",
  "бабушка подрывает авторитет мамы — спокойно: «правила дома решаем мы с папой»",
  // братья / сёстры
  "родители любят брата/сестру больше — не спорить с мамой, один разговор про свою жизнь",
  "сестра просит денег снова — «сейчас не могу» без лекции и без тайной злости",
  "наследство и обиды — не решать в переписке ночью, один разговор днём с фактами",
  // сводная семья
  "его/её дети приехали — одно тёплое правило дома, не «у нас не так» с порога",
  "ревность к сводному — отдельное время со своим ребёнком на этой неделе",
  // двое домов
  "ребёнок едет к папе — не допрашивать «что там ели», спросить «как ты»",
  "бывший срывает график — коротко в переписке про время, не через ребёнка",
  // праздники / деньги семьи
  "праздник: к маме или к свекрови — договориться вдвоём заранее, не в канун",
  "родители просят денег — пауза, сумма которую тянете, не стыд и не «всё отдам»",
  // сын
  "сыну можно плакать и злиться словами, не «будь мужиком»",
  "мальчик ударил — остановить тело, назвать чувство, не стыдить при всех",
  "сыну 15 минут без экрана вместе: игра/разговор, не допрос «как школа»",
  // бывший
  "бывший написал — не разбирать ночью: ответить днём коротко или не отвечать",
  "после расставания: один ритуал дня без проверки его сторис",
  // родственники партнёра
  "свекровь критикует готовку/детей — одно спокойное «мы решим сами»",
  "тёща/свекровь звонит каждый день — договориться о времени звонка с партнёром",
  // подросток
  "подросток в телефоне до ночи — правило света и зарядка в коридоре, не отбор силой",
  "травля в школе: выслушать дочь/сына, не звонить учителю в ярости в ту же минуту",
  // самооценка
  "внутренний критик в голове — одна фраза-стоп про поступок, не про внешность",
  "похвалить себя за одно реальное дело дня — без «но»",
  "записать 3 своих сильных качества, не связанных с внешностью",
  // здоровье / энергия
  "усталость как сигнал тела: лечь / поесть / выйти на воздух, а не «я слабая»",
  "день без самокритики за еду — одно доброе правило к себе",
  "10 минут прогулки вместо ещё одного круга тревожных мыслей",
  "записаться к врачу на то, что откладывала месяцами — один слот",
  // соцсети
  "сравнение жизни с лентой — закрыть приложение и назвать 1 своё дело",
  "отписать/заглушить аккаунт, после которого хуже 3 дня подряд",
  // границы (редко)
  "спокойное «нет» на просьбу, которая ломает ваш план дня",
  "не объяснять всем, почему выбрали отдых вместо «полезного»",
  // работа (без голоса/пауз в речи)
  "один приоритет на день вместо списка из 20 дел",
  "не читать рабочий чат первые 20 минут утра",
  "закрыть лишние вкладки на 45 минут глубокой работы",
  "вечером выписать «завтра первые 3 шага» — и отпустить день",
  "не брать чужую задачу «на минутку», если уже перегружены",
  "хочу уволиться — за неделю записать факты и один разговор, не увольняться в слезах сегодня",
  // деньги
  "пауза 24 часа перед импульсной покупкой «для настроения»",
  "траты из радости vs из тревоги — один честный вопрос себе",
  "посмотреть мелкие подписки за месяц — без стыда, с решением",
  "перевести фиксированную сумму в накопления в день зарплаты",
  // партнёр
  "сказать потребность прямо, без намёков и обиды",
  "не читать мысли партнёра — один уточняющий вопрос",
  "15 минут близости без телефона вечером",
  "договориться о теме ссоры: факты, не «ты всегда»",
  // семья / быт
  "5 минут только для себя до начала «для всех»",
  "попросить конкретную помощь по дому одним предложением",
  "не путать заботу о себе с эгоизмом — объяснить ребёнку/близким коротко",
  "я одна тяну дом — назвать одну задачу партнёру на сегодня, не «ты никогда»",
  // дружба
  "отменить встречу, которая только выматывает — без драмы",
  "написать подруге честно, а не «всё ок»",
  "назначить конкретную дату встречи вместо «надо увидеться»",
  "друг пропадает — одно сообщение «скучаю, когда удобно?», не молчаливая обида",
  // сон / энергия
  "лечь на 30 минут раньше вместо ещё одной серии",
  "вода и еда до кофе, если день «на нервах»",
  "короткий сброс после работы: душ / улица / музыка — не тащить раздражение домой",
  // тревога
  "назвать страх одним словом — и один маленький шаг на 5 минут",
  "записать тревогу на бумагу и отложить на вечер «разбор»",
  "дыхание 4–4–4 на кухне/в туалете, если накрыло на людях",
  // фокус / перфекционизм
  "выбрать одно «достаточно хорошо» вместо идеального",
  "разрешить себе «неидеальный» день без самобичевания",
  // конфликты
  "в переписке, где хочется вспылить — черновик и отправка через 20 минут",
  "говорить о факте и своей потребности, а не о личности человека",
  // одиночество / перемены
  "день Alone: чай + прогулка 10 минут как ритуал, не как наказание",
  "возраст как опыт, а не дедлайн «успеть всё»",
  "при перемене (работа/город) — один якорь привычки на неделю",
  // радость / телефон
  "заметить 1 приятный момент дня без фото в ленту",
  "час без телефона перед сном — книга/душ/тишина",
  "вечером назвать 1 дело, которое реально важно было сегодня",
];

const PSYCH_ANGLES_MEN = [
  // симпатия
  "нравится человек — один ясный знак, не давить сообщениями",
  "написать первым коротко: кто вы и зачем, не роман",
  "если молчит — не третье «ну что?», дать пространство",
  // ревность / измена
  "подозрение в измене — не лезть в телефон: спокойный разговор про факты",
  "ревность: назвать «мне тревожно», не устраивать допрос вечером",
  "если есть угроза или насилие — к помощи, не разбираться кулаками",
  // сын
  "сын копирует, как вы злитесь — покажите выход словами, не ор",
  "мальчик плачет — не «будь мужиком», а «я рядом, расскажи»",
  "сыну правило и тепло вместе: граница без унижения",
  // дочь
  "дочь закрылась — один вопрос у двери, не лекция",
  "дочке не оценивать тело — хвалить дело и характер",
  // мама / папа / свои родители
  "мама устала — сегодня взять на себя ужин или ванну, не «ну скажи если надо»",
  "папа на диване после работы — 20 минут только с ребёнком, телефон в другой комнате",
  "отец и дети: спросить «во что играем», не ждать что сами подойдут",
  "свои родители болеют — один шаг на неделе (врач, продукты), не всё сразу",
  "мама звонит каждый день — договориться о времени, не бросать трубку",
  "родители вмешиваются «мы лучше знаем» — одно предложение границы вместе с женой",
  // бабушки
  "бабушка не сидит с внуками — без упрёка: спросить что реально могут, искать другой план",
  "не берут внуков на выходные — предложить 2 часа прогулки, не двое суток",
  "бабушка балует и ломает правила — одно правило вслух при ребёнке, без войны с ней",
  // братья / праздники
  "брат или сестра: не решать наследство в переписке ночью",
  "праздник у двух семей — договориться с женой заранее, не в канун",
  // бывший / расставание
  "бывшая написала — ответить днём коротко или не отвечать, не ночью в эмоциях",
  // родственники
  "родители вмешиваются в семью — одно предложение границы вместе с партнёром",
  "тёща/свекровь: не спорить в переписке, договориться вдвоём дома",
  // работа — без голоса / темпа речи / «уверенной подачи»
  "один главный результат дня вместо вечной занятости",
  "не отвечать на рабочий чат с телефона за ужином",
  "закрыть уведомления на время сложной задачи на 45 минут",
  "вечером выписать 3 шага на завтра — и не открывать почту",
  "не доказывать ценность через переработки и «я ещё тут»",
  "делегировать кусок задачи коллеге — конкретная просьба",
  "просить прибавку: факты на бумаге и дата разговора, не обида в курилке",
  // границы
  "короткое «нет» на лишнюю нагрузку без длинных оправданий",
  "не объяснять своё решение всем подряд в чате",
  // сравнение / статус
  "чужой успех в ленте — свой следующий шаг на бумаге за 2 минуты",
  "не сравнивать доход/машину с чужими сторис — свой план на неделю",
  // деньги
  "покупка «чтобы уважали» vs по делу — пауза на сутки",
  "не спорить о деньгах на эмоциях — перенести разговор на утро",
  "автоперевод в накопления в день зарплаты — даже маленькая сумма",
  "проверить подписки и «забытые» платежи раз в месяц",
  // усталость / сон
  "короткий сброс после работы: улица/душ/спорт — не тащить раздражение домой",
  "сон важнее ещё одного эпизода — лечь вовремя",
  "если выгорел — один выходной без «полезных» дел",
  // самооценка
  "внутренний критик перед сложным делом — фраза-стоп про факты, не про «я слабый»",
  "отметить себе маленькую победу дня без понта в чат",
  // отношения
  "слушать до конца сильнее, чем сразу давать совет",
  "сказать прямо, что нужно, без упрёка",
  "телефон вниз во время разговора с близкими",
  "извиниться конкретно за факт, а не «ну ладно, сам виноват»",
  "жена молчит вечером — спросить «что случилось?», не чинить сразу",
  // семья / друзья
  "15 минут с ребёнком/близкими без экрана",
  "написать другу не «как дела», а конкретный план встречи",
  "помочь по дому без «меня попросили» — один видимый вклад",
  "друг пропадает — конкретное приглашение, не обида молча",
  // стресс / злость
  "злость в пробке — выйти из машины/остановиться / музыка, не переписка",
  "если накрыло злостью — 10 приседаний или холодная вода на запястья",
  // решения / фокус
  "решение «достаточно хорошее» вместо бесконечного анализа",
  "утром час без ленты новостей — сначала своё дело",
  "попросить помощь по задаче — сила, не слабость",
  // перемены / здоровье
  "новый этап (работа/переезд) — один якорь привычки на неделю",
  "не доказывать возраст нагрузкой до травмы — умная тренировка",
  "записать визит к врачу на то, что тянется месяцами",
  "прогулка 15 минут после обеда вместо ещё одного кофе «для бодрости»",
];

/** Лёгкая правка самых частых огрехов модели. */
function polishRussian(text: string): string {
  return String(text || "")
    .replace(/\bставит возраст\b/gi, "добавляет возраст")
    .replace(/\bПлотный тон ставит\b/gi, "Плотный тон добавляет")
    .replace(/\bвыдает\b/g, "выдаёт")
    .replace(/\bвыдаешь\b/g, "выдаёшь");
}

async function generateTextPost(
  topic: string,
  kind: "image" | "video",
  audience: Audience = "women",
  rssHints: string[] = [],
): Promise<{ title: string; body: string; visualPrompt: string; wardrobeVisualPrompt?: string; visualMotion?: string }> {
  const isMen = audience === "men";
  const audienceBlock = isMen
    ? `# Аудитория
Мужчины 25–45 (и всем, кому полезно выглядеть свежее).
Тон: взрослый, коротко, по делу, без панибратства и без снобизма.`
    : `# Аудитория
Женщины 25–45 — офис, мамы, elegant everyday.
Тон: тёплый, уверенный, взрослый. Без подросткового сленга.`;

  const psychBrief = pickPsychBrief(isMen);
  const lifeDomain = psychBrief.domain;
  const psychPick = [psychBrief.angle];
  const carePair = pickTwoCareAngles(isMen);
  const bannedTitles = recentBannedTitles(90);
  const recentCare = recentSectionSnippets("Уход", 14);
  const recentWardrobe = recentSectionSnippets("Гардероб", 12);
  const recentPsych = recentPsychologySnippets(16);
  const bannedPsychThemes = recentPsychThemes(22);
  const bannedCareThemes = recentSectionThemes("Уход", 16);
  const bannedWardThemes = recentSectionThemes("Гардероб", 10);
  const psychThemeBanHint = bannedPsychThemes.includes("boundaries_peoplepleasing")
    ? "СЕЙЧАС ЖЁСТКО ЗАПРЕЩЕНА тема границ/вежливости: НЕ писать про отказ, «нет», всем нравиться, чужие ожидания, оправдания, просьбы. Бери ДРУГУЮ сферу жизни."
    : bannedPsychThemes.length
      ? `Недавние темы психологии (НЕ повторять смысл): ${bannedPsychThemes.join(", ")}.`
      : "";
  const careThemeBanHint = bannedCareThemes.length
    ? `Недавние темы Ухода (НЕ повторять): ${bannedCareThemes.join(", ")}. Другое средство/жест.`
    : "";
  const wardThemeBanHint = bannedWardThemes.length
    ? `Недавние темы Гардероба (НЕ повторять): ${bannedWardThemes.join(", ")}. Другой приём.`
    : "";

  const memoryBlock = [
    bannedTitles.length
      ? `# УЖЕ БЫЛИ ЗАГОЛОВКИ (не повторяй и не перефразируй близко):\n${bannedTitles.slice(-24).map((t) => `- ${t}`).join("\n")}`
      : "",
    recentCare.length
      ? `# УЖЕ БЫЛ УХОД (другие средства/шаги, НЕ витамин С снова если уже было):\n${recentCare.map((t) => `- ${t}`).join("\n")}\n${careThemeBanHint}`
      : "",
    recentWardrobe.length
      ? `# УЖЕ БЫЛ ГАРДЕРОБ (другой приём):\n${recentWardrobe.map((t) => `- ${t}`).join("\n")}\n${wardThemeBanHint}`
      : "",
    recentPsych.length
      ? `# УЖЕ БЫЛА ПСИХОЛОГИЯ (другой угол и ДРУГАЯ тема жизни, не пересказ):\n${recentPsych.map((t) => `- ${t}`).join("\n")}\n${psychThemeBanHint}`
      : "",
    rssHints.length
      ? `# Свежие поводы с сайтов моды (можно опереться на идею, НЕ копировать заголовок 1-в-1, без ссылок):\n${rssHints.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const sys = `Ты — главный редактор Telegram-канала «Стилист AI» (https://t.me/stilist_ai_ru).
Цель: остановить скролл заголовком, дать 3 быстрые пользы, вызвать сохранить/ответить.

${audienceBlock}

# План дня (Москва): РОВНО 3 поста, каждые 8 часов
08:00 — женщины · 16:00 — мужчины · 00:00 — женщины.

# ЖЁСТКИЙ ЯЗЫК — только русский (ru-RU)
- Пиши ТОЛЬКО на литературном русском.
- ЗАПРЕЩЕНО: украинский, суржик, смесь языков, украинские буквы ї є і ґ.
- ЗАПРЕЩЕНЫ формы вроде: середньої, середній (укр.), будь ласка, тощо, більш, щоб, якщо, виглядає, догляд, шкіра, зачіска, макіяж, обличчя.
- Перед ответом мысленно проверь орфографию. Ни одной украинской формы.

# ПАМЯТЬ КАНАЛА — НЕ ХОДИ ПО КРУГУ
Каждый пост должен отличаться от недавних по заголовку И по содержанию всех трёх блоков.
Нельзя день за днём писать одно и то же («серый меланж», «сыворотка с витамином С», «говорите медленнее / уверенный голос / пауза перед ответом»).
Если тема-крючок пересекается с уже опубликованным — СМЕНИ угол: другие слова, другое средство ухода, другой приём в гардеробе, ДРУГАЯ сфера жизни в психологии.
${memoryBlock}

# Формат body — СТРОГО 3 раздела (люди читают 15 секунд)
Структура body без лишней воды:

① Уход
В блоке РОВНО ДВА разных мини-совета (А и Б), они НЕ должны повторять друг друга и недавние посты.
Формат строго:
А) ...
Б) ...
Каждый мини-совет: что делать + КОНКРЕТНОЕ эффективное средство (реальное, аптечное/массовое: CeraVe, La Roche-Posay, The Ordinary, Bioderma, Nivea Men, Essie и т.п. — не выдумывай несуществующие бренды).
${
  isMen
    ? `Мужчины: темы из бороды / кожи лица / рук / антиэйджа.
Сегодняшние углы (используй оба смысла):
А ← ${carePair.a}
Б ← ${carePair.b}`
    : `Женщины: А = лицо ИЛИ тело; Б = обязательно МАНИКЮР (новый тренд / форма / цвет / как сделать дома, 2–4 шага).
Сегодняшние углы:
А ← ${carePair.a}
Б ← ${carePair.b} (маникюр)`
}
Не повторяй недавние темы ухода: ${bannedCareThemes.join(", ") || "—"}.

② Гардероб
1–3 коротких предложения. ТОЛЬКО ОДЕЖДА и аксессуары у лица: цвет, посадка, слой, фактура, что убрать/добавить.
Назови конкретную вещь: кардиган / рубашка / шарф / жакет / вырез / цвет у лица.
ЖЁСТКИЙ ЗАПРЕТ в этом блоке (это ① Уход, не сюда):
макияж, тональный крем, BB-крем, тинт, помада, румяна,
уход за руками, кутикула, маникюр, лак, крем для рук, масло для ногтей.
Новый приём, не повтор.

③ Психология
Это блок ЖИЗНЕННОГО психолога. Рамки ШИРОКИЕ: вся жизнь, не только мода и не только «один тип семьи».
Можно (и нужно) брать злободневное: симпатия, ревность, работа, деньги, друзья, тревога, расставание —
и особенно семья во всех ролях: родители и взрослые дети, мама и дети, папа и дети, бабушки и дедушки
(в том числе не хотят сидеть с внуками или ломают правила), братья и сёстры, сводная семья, двое домов,
праздники «к кому ехать», деньги внутри семьи, уход за пожилыми.
Список сфер — не потолок, а очередь, чтобы не крутить одно. Жизнь бесконечна, совет каждый раз новый и конкретный.
СЕГОДНЯШНЯЯ СФЕРА (обязательно, не меняй): «${lifeDomain}».
Единственный угол (разверни именно его, не подменяй): «${psychPick[0]}».
4–7 коротких предложений (420–620 знаков). Структура:
1) назвать ситуацию простыми словами,
2) почему это важно сейчас,
3) что сделать сегодня — 1–3 конкретных шага (фраза, которую можно сказать; действие на 5 минут),
4) какой эффект заметите.
Мысль ОБЯЗАТЕЛЬНО завершена: ситуация → почему важно → 1–3 шага на сегодня → какой эффект. Не обрывай на полуслове и не копируй заголовок раздела вместо совета.
Тон: взрослый, тёплый, без морали «ты должна уйти» с порога и без диагнозов.
Если тема про измену: не советовать читать чужой телефон и не устраивать сыск; сначала чувства и спокойный разговор про факты; если опасно — к близким/помощи.
Если тема про детей или бабушек: один живой приём на сегодня. Не винить бабушку за то, что она не няня. Не читать лекцию «как правильно воспитывать».
Если тема про родителей взрослых: граница без жестокости — любовь и своя жизнь могут быть вместе.
ЖЁСТКИЙ ЗАПРЕТ (модель часто повторяет — НЕЛЬЗЯ даже другими словами):
- голос, темп речи, «говорите медленнее», «уверенный голос/тон», «без спешки в речи»
- пауза перед ответом / выдох перед звонком / «спокойствие в паузе» как главный совет
- осанка, харизма, «присутствие», «выглядеть уверенно», первые секунды впечатления
- макияж, одежда, бренд, стиль как психология, «выглядит дороже»
Совет должен быть про поведение/выбор/привычку в жизни — НЕ про то, КАК говорить и КАК выглядеть.
НЕ крути «отказать / не всем нравиться», если уже было недавно.
${psychThemeBanHint}
④ От себя
ОБЯЗАТЕЛЬНЫЙ финальный блок — мнение эксперта ОТДЕЛЬНО от трёх блоков выше.
Три короткие живые реплики: по уходу, по гардеробу и по психологии. Потом один вопрос людям.
Пиши как мужчина-стилист в чате: тепло, чуть иронично, стикеры-эмодзи (😉😅🔥❤️✨😏🙈).
Не пересказывай блоки ①②③. Запрещены: «девочки вы готовы», голосование 🔥/❤️, «что возьмёте 1/2/3», канцелярит «как эксперт отмечу».

# Правила
- title: НОВЫЙ естественный русский крючок до ~55 знаков. Не копируй старые заголовки канала.
- Весь body: 900–1400 знаков. Уход А/Б коротко, гардероб 1–2 фразы, психология — главный полезный кусок и ДОПИСАН до конца. Не ужимай совет, чтобы влезть в подпись: полный текст уйдёт отдельным сообщением, если не влез к фото.
- Между разделами — пустая строка.
- Опрос «1 / 2 / 3» в ③ Психология НЕ пиши — только в ④ От себя живой вопрос без нумерации.
- Без Markdown, без *, без #, без «Источник», без ссылок на чужие СМИ.
- Эмодзи: максимум 1 в CTA.
- Конкретика важнее красивых слов. Не повторяй клише «Забудьте…», «Главный секрет…», «благородный» каждый раз.

# Визуал (visualPrompt на английском) — ОБЯЗАТЕЛЬНО показать средства с поста
ЯРКАЯ сочная editorial-картинка:
- MUST show the actual product bottles/tubes mentioned in Уход (recognizable packaging, readable brand if possible)
- ${carePair.visualFocus}
- ${isMen ? "male grooming: skincare + beard oil/balm or hands cream on clean surface, healthy skin" : "female beauty: ULTRA photoreal salon manicure close-up — moisturized living hands, clean even cuticles, glossy even gel polish, Vogue 85mm, no CGI, no dry skin, no amateur snapshot"}
- rich saturated tasteful color, scroll-stopping, warm cinematic light
- NOT dull, NOT grey stock, NOT empty face without products
- photorealistic, premium
- clean LARGE Russian title-card, high contrast, phone-legible
- no watermark, no logo clutter, 1:1

# JSON без Markdown:
{
  "title": "крючок до 55 знаков",
  "body": "① Уход\\nА) ...\\nБ) ...\\n\\n② Гардероб\\n...\\n\\n③ Психология\\n...\\n\\n④ От себя\\n...",
  "visualPrompt": "EN: vivid product flatlay with skincare bottles + ${isMen ? "beard/hands grooming" : "ultra-photoreal salon manicure on perfectly groomed moisturized hands"}, scroll-stopping, warm light, Russian title card, 1:1",
  "wardrobeVisualPrompt": "EN: photoreal editorial full or 3/4 body outfit that EXACTLY matches the Гардероб block (same colors, silhouette, items). The clothes are the hero. No skincare bottles, no nail close-up, no title card, 1:1",
  "visualMotion": "EN: 4-5s slow cinematic"
}`;

  const user = `Тема-крючок (отправная точка, можно сместить угол): ${topic}.
Аудитория: ${isMen ? "мужчины 25–45" : "женщины 25–45"}.
Сделай ${kind === "video" ? "ВИДЕО" : "ФОТО"}-пост: ① Уход с А) и Б) + средства, ② Гардероб, ③ Психология — важный жизненный совет (не про моду).
${isMen ? "Уход: борода/кожа/руки/антиэйдж, назови средства." : "Уход: лицо или тело + обязательно маникюр-тренд с шагами; назови средства и лак/базу."}
visualPrompt обязан показывать эти средства на фото${isMen ? " и уход за бородой/руками" : " и маникюр крупным планом"}.
Заголовок и советы НЕ должны совпадать с уже вышедшими.`;

  const runOnce = async (extraUser = "") => {
    const r = await polza.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user + (extraUser ? `\n${extraUser}` : "") },
      ],
      temperature: 0.95,
      max_tokens: 2500,
      response_format: { type: "json_object" } as any,
    });
    const content = r.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    return {
      title: String(parsed.title || topic).slice(0, 200),
      body: String(parsed.body || "").trim(),
      visualPrompt: String(parsed.visualPrompt || "").trim(),
      wardrobeVisualPrompt: String(parsed.wardrobeVisualPrompt || "").trim() || undefined,
      visualMotion: parsed.visualMotion ? String(parsed.visualMotion).trim() : undefined,
    };
  };

  let post = await runOnce();
  post.title = polishRussian(post.title);
  post.body = polishRussian(post.body);
  for (let attempt = 0; attempt < 3; attempt++) {
    const badLang = hasNonRussianMix(post.title + "\n" + post.body);
    const badStruct = !ensureTripleSections(post.body);
    const badCta = !ensureCtaTriple(post.body);
    const badDup = isBannedTopic(post.title, bannedTitles);
    const badContent = postContentRepeats(post.body);
    const psychSec = (() => {
      const m = post.body.match(/(?:③|3[.)]|3:)\s*Психология[\s\S]*?(?=\n\s*\n|Что |CTA|$)/i);
      return m?.[0] || post.body;
    })();
    const badPsychCliche = psychTextIsVoiceCliche(psychSec) || psychTextIsFashionCliche(psychSec);
    if (!(badLang || badStruct || badCta || badDup || badContent || badPsychCliche)) break;
    console.warn(
      `[Hermes] regenerating text (lang=${badLang} struct=${badStruct} cta=${badCta} dup=${badDup} content=${badContent} psychCliche=${badPsychCliche}) try=${attempt + 1}`,
    );
    post = await runOnce(
      `Служебно: прошлый вариант плохой.` +
        (badDup ? ` Другой заголовок (не «${post.title}»).` : "") +
        ` Уход снова А/Б: А=${carePair.a}; Б=${carePair.b}.` +
        ` Психология СТРОГО про сферу «${lifeDomain}», угол «${psychPick[0]}». Это совет психолога по жизни, не по стилю.` +
        (badPsychCliche
          ? ` ЗАПРЕТ: не пиши про голос, темп речи, «медленнее», уверенную подачу, паузу перед ответом, выдох, «выглядит дороже». Дай ДРУГОЙ жизненный совет: что сделать сегодня в этой ситуации.`
          : "") +
        (badContent
          ? ` Не повторяй уход (${bannedCareThemes.join(", ") || "—"}); гардероб (${bannedWardThemes.join(", ") || "—"}); психо (${bannedPsychThemes.join(", ") || "—"}).`
          : ""),
    );
    post.title = polishRussian(post.title);
    post.body = polishRussian(post.body);
  }
  if (!ensureCtaTriple(post.body) && ensureTripleSections(post.body) && !/④\s*(?:Голос|От себя)/i.test(post.body)) {
    post.body =
      post.body.replace(/\s+$/, "") +
      "\n\n④ От себя\nЧестно: из этого поста мне ближе всего психология — а вам что зацепило? Напишите, не стесняйтесь ✨";
  }
  if (!post.visualPrompt) {
    post.visualPrompt =
      "vivid juicy saturated editorial beauty fashion photo, scroll-stopping magazine wow, warm golden cinematic light, glowing healthy skin, rich color contrast, photorealistic, not dull, not grey stock";
  } else if (!/juicy|vivid|saturated|scroll-stopping|wow/i.test(post.visualPrompt)) {
    post.visualPrompt =
      `vivid juicy saturated scroll-stopping editorial, rich color, warm cinematic light, glowing skin. ${post.visualPrompt}`;
  }
  if (!post.wardrobeVisualPrompt) {
    const wardrobeText = parseTripleSections(post.body)?.wardrobe || "";
    if (wardrobeText) post.wardrobeVisualPrompt = wardrobeLookPrompt(wardrobeText, isMen);
  }
  return post;
}

/** Короткий заголовок для title-card — чтобы буквы оставались крупными на телефоне. */
function shortCoverTitle(title: string): string {
  const clean = String(title || "")
    .replace(/["«»„""']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const beforeBreak = clean.split(/[—–:·|]/)[0].trim();
  const candidate = beforeBreak.length >= 10 ? beforeBreak : clean;
  const words = candidate.split(" ");
  if (words.length <= 8 && candidate.length <= 48) return candidate;
  return words.slice(0, 7).join(" ").slice(0, 48).trim();
}

/**
 * Title-card на обложке: сначала читаемость на мобильном Telegram,
 * затем «глобальный fashion media» polish (Vogue/Elle/Harper's digital).
 * Для звёзд — усиливаем identity / likeness лица.
 */
function withEditorialTitle(prompt: string, title: string, opts?: { celebIdentity?: boolean; celebName?: string }): string {
  const short = shortCoverTitle(title);
  let base = (prompt || "vivid juicy editorial fashion beauty photo, magazine wow, cinematic light")
    .replace(/\bNO text\b/gi, "with clear title typography")
    .replace(/\bno text\b/gi, "with clear title typography")
    .replace(/\bwithout text\b/gi, "with clear title typography")
    .replace(/\bthin\b/gi, "bold")
    .replace(/\bDidot\b/gi, "editorial sans")
    .replace(/\bBodoni\b/gi, "editorial sans");

  if (opts?.celebIdentity) {
    base = base
      .replace(/\bno real celebrity (face|likeness)\b/gi, "recognizable celebrity likeness")
      .replace(/\bwithout (a )?recognizable (face|likeness)\b/gi, "with recognizable likeness")
      .replace(/\bDo NOT depict a real celebrity likeness\b/gi, "depict a recognizable celebrity likeness")
      .replace(/\bstylized (anonymous )?model\b/gi, "recognizable celebrity");
    const who = (opts.celebName || "").trim();
    base +=
      ` CRITICAL FACE IDENTITY: photorealistic recognizable likeness` +
      (who ? ` of ${who}` : " of the celebrity named in the story") +
      ` — accurate facial features, bone structure, eye shape, nose, lips, skin tone, hairline and hairstyle; coherent identity, not a generic lookalike, not distorted/morphed face. Flattering fashion/beauty/red-carpet context only. FORBIDDEN: scandalous fake scenes, injuries, arrests, intimate situations.`;
  }

  const juice =
    ` VISUAL IMPACT: vivid juicy saturated colors, scroll-stopping magazine wow, rich warm cinematic light, glowing healthy skin, sharp fabric/nails detail, high contrast hero image — NOT dull, NOT grey, NOT flat stock, NOT washed-out, NOT muddy. `;
  if (!short) {
    return `${base}.${juice}Clean global fashion-media cover typography, high contrast, no watermark, no logo, 1:1.`;
  }
  return (
    `${base}.${juice}Cover typography: place ONE short Russian headline exactly «${short}» as a clean international fashion-media title card (Vogue / Elle / Harper's digital energy — premium but accessible). ` +
    `READABILITY FIRST for phone screens: LARGE bold refined modern sans-serif, thick clear letterforms, high contrast (white/near-white on dark soft gradient bar OR dark on light clean band), sharp Russian glyphs, comfortable tracking — must stay legible at Telegram thumbnail size. ` +
    `Classic magazine serif allowed ONLY if still bold and highly legible on mobile; never hairline/thin decorative. Title preferably one line (max two), ~12–18% of frame at top or bottom, generous padding, photo remains the hero. ` +
    `FORBIDDEN: thin script/calligraphy, bubble/teen fonts, comic, graffiti, neon cyber UI, dense paragraphs, tiny captions, English gibberish, misspelled Russian, Ukrainian letters, watermarks, logos, brand marks. Square 1:1.`
  );
}

/** Имя звезды из заголовка новости — для identity в visualPrompt. */
function extractCelebNameHint(item: FeedItem): string {
  const raw = `${item.title || ""}`.trim();
  if (!raw) return "";
  const eng = raw.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/);
  const ru = raw.match(/([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})/);
  const hit = (ru && ru[1]) || (eng && eng[1]) || "";
  if (hit.length < 3 || hit.length > 40) return "";
  if (/^(The|How|Why|What|New|Best|Мода|Стиль|Тренд)/i.test(hit)) return "";
  return hit;
}

const TG_CAPTION_LIMIT = 1024;
const TG_MESSAGE_LIMIT = 4096;

/**
 * Полный текст поста (без обрезки разделов).
 * Если длиннее 1024 — к фото уйдёт короткий тизер, полный текст — отдельным сообщением.
 */
function formatCaption(title: string, body: string): string {
  const footer =
    "\n\n————————————\n" +
    "🌐 https://stilist-ai.ru";

  const t = escapeHtml(String(title || "").trim());
  let raw = String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*(Источник:|Читать:)[^\n]*/gi, "")
    // убрать только финальный CTA модели — свой ниже (не трогать текст разделов)
    .replace(/\n*Что\s+(возьмёте|возьмете|внедрите|внедришь|из этого|ближе)[^\n]*$/i, "")
    .trim();

  const sections = parseTripleSections(raw);
  let middle: string;
  if (sections) {
    const blocks = [
      sections.care
        ? `✨ <b>УХОД</b>\n${escapeHtml(sections.care.trim())}`
        : "",
      sections.wardrobe
        ? `👗 <b>ГАРДЕРОБ</b>\n${escapeHtml(sections.wardrobe.trim())}`
        : "",
      sections.mind
        ? `💭 <b>ПСИХОЛОГИЯ</b>\n${escapeHtml(stripSectionEngagementCta(sections.mind))}`
        : "",
      sections.voice
        ? formatStylistNote(sections.voice)
        : "",
    ].filter(Boolean);
    middle = blocks.join("\n\n");
  } else {
    // запасной путь: заменить строки-заголовки ①/1 Уход → эмодзи-блоки
    middle = raw
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (/^(?:①|1[.)]|1:)\s*Уход/i.test(trimmed) || /^①\s*Уход/i.test(trimmed))
          return `✨ <b>УХОД</b>`;
        if (/^(?:②|2[.)]|2:)\s*Гардероб/i.test(trimmed) || /^②\s*Гардероб/i.test(trimmed))
          return `👗 <b>ГАРДЕРОБ</b>`;
        if (/^(?:③|3[.)]|3:)\s*Психолог/i.test(trimmed) || /^③\s*Психолог/i.test(trimmed))
          return `💭 <b>ПСИХОЛОГИЯ</b>`;
        return escapeHtml(line);
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  const caption = t ? `<b>${t}</b>\n\n${middle}` : middle;
  return `${caption}${footer}`;
}

function escapeHref(url: string): string {
  return escapeHtml(String(url || "").trim()).replace(/"/g, "&quot;");
}

const SOURCE_RU: Record<string, string> = {
  Vogue: "Вог",
  "Vogue Russia": "Вог",
  ELLE: "Эль",
  "Harper's Bazaar": "Базар",
  BURO: "Бюро",
  "Cosmo RU": "Космо",
  Allure: "Аллюр",
  Byrdie: "Бёрди",
  InStyle: "Инстайл",
  GQ: "Джи Кью",
  Esquire: "Эсквайр",
  BoF: "BoF",
  WWD: "WWD",
  "Who What Wear": "Who What Wear",
  Fashionista: "Fashionista",
  "The Voice": "Войс",
  "Voice Nails": "Войс",
  "Voice Beauty": "Войс",
  "Voice Fashion": "Войс",
  "Voice Stars": "Войс",
  Peopletalk: "Пиплток",
  "Woman.ru": "Woman.ru",
};

/** Топ люкс-домов: в пост попадает только дом из фактов, не весь список сразу. */
const LUXURY_HOUSES: Array<{ re: RegExp; name: string; note: string }> = [
  { re: /\bgucci\b|гуччи/i, name: "Gucci", note: "Флоренция. Узнают по GG, horsebit-лоферам, бамбуковой ручке сумки и театральной итальянской коже." },
  { re: /\bdolce\s*&\s*gabbana|\bdolce and gabbana|\bdolce\s+gabbana|\bd&g\b|дольче/i, name: "Dolce & Gabbana", note: "Сицилия. Чёрное кружево, корсеты, золото, леопард и средиземноморский гламур." },
  { re: /\bchanel\b|шанель/i, name: "Chanel", note: "Париж. Твид, камелия, жемчуг, 2.55 и маленькое чёрное платье." },
  { re: /\b(christian\s+)?dior\b|диор/i, name: "Dior", note: "Париж. New Look, жакет Bar, Lady Dior и кутюрные объёмы." },
  { re: /\blouis\s+vuitton|\blv\b|луи\s*виттон/i, name: "Louis Vuitton", note: "Париж. Монограмма, сундуки, Speedy и крупные кожаные сумки." },
  { re: /\bherm[eè]s\b|эрмес/i, name: "Hermès", note: "Париж. Birkin и Kelly, шёлковые платки, оранжевая коробка и кожа ручной работы." },
  { re: /\bprada\b|прада/i, name: "Prada", note: "Милан. Нейлон, треугольный логотип и умный «некрасивый» шик." },
  { re: /\bversace\b|версаче/i, name: "Versace", note: "Медуза, греческий ключ, обтягивающий крой и золотой блеск." },
  { re: /\bsaint\s+laurent|\bysl\b|ив\s*сен[\s-]*лоран/i, name: "Saint Laurent", note: "Париж. Смокинг le smoking, чёрный атлас и гламур 60-х." },
  { re: /\bbalenciaga\b|баленсиага/i, name: "Balenciaga", note: "Объём кутюра, гротескные пропорции и уличный люкс." },
  { re: /\bfendi\b|фенди/i, name: "Fendi", note: "Рим. FF, Baguette и римская меховая роскошь." },
  { re: /\bvalentino\b|валентино/i, name: "Valentino", note: "Рим. Valentino red, банты и романтический кутюр." },
  { re: /\bbottega\s+veneta|боттега/i, name: "Bottega Veneta", note: "Плетение intrecciato и роскошь без кричащего логотипа." },
  { re: /\bloewe\b|лоэве/i, name: "Loewe", note: "Мадрид. Puzzle, анаграмма и кожаная скульптура." },
  { re: /\bc[eé]line\b|селин/i, name: "Celine", note: "Париж. Triomphe, тихая роскошь и чистый крой." },
  { re: /\bgivenchy\b|живанши/i, name: "Givenchy", note: "Париж. Кутюрный чёрный силуэт и голливудская история маленького чёрного." },
  { re: /\bburberry\b|барберри/i, name: "Burberry", note: "Лондон. Тренч, клетка и британский дождь." },
  { re: /\b(alexander\s+)?mcqueen\b|маккуин/i, name: "Alexander McQueen", note: "Лондон. Драма, череп, британский крой и театральный подиум." },
  { re: /\btom\s+ford\b|том\s*форд/i, name: "Tom Ford", note: "Голливудский секс-гламур, бархат, чёрный смокинг и очки." },
  { re: /\b(giorgio\s+)?armani\b|армани/i, name: "Armani", note: "Милан. Серый жакет, мягкий крой и тихая власть." },
  { re: /\bmax\s*mara\b|макс\s*мара/i, name: "Max Mara", note: "Верблюжье пальто, чистая линия и итальянская сила без крика." },
  { re: /\b(salvatore\s+)?ferragamo\b|феррагамо/i, name: "Ferragamo", note: "Флоренция. Обувь, gancini и итальянская колодка." },
  { re: /\bmiu\s*miu\b|миу\s*миу/i, name: "Miu Miu", note: "Младшая линия Prada: мини, балет и игривая роскошь." },
  { re: /\bthe\s+row\b/i, name: "The Row", note: "Тихая американская роскошь, кашемир и цена без логотипа." },
  { re: /\bjacquemus\b|жакмюс/i, name: "Jacquemus", note: "Прованс. Мини-сумки, солнце и французская ирония кроя." },
  { re: /\bala[iï]a\b|алайя/i, name: "Alaïa", note: "Тело как скульптура, вязка и ботильоны на шнуровке." },
  { re: /\bmugler\b|мюглер/i, name: "Mugler", note: "Футуризм, корсет и супергеройский силуэт." },
  { re: /\bschiaparelli\b|скьяпарелли/i, name: "Schiaparelli", note: "Сюрреализм, золото и кутюрные жесты Elsa." },
  { re: /\boff-?white\b/i, name: "Off-White", note: "Кавычки, индустриальные ремни и люкс с улицы." },
  { re: /\bchlo[eé]\b|хло[еэ]/i, name: "Chloé", note: "Париж. Бохо, женственность и мягкая кожа." },
  { re: /\bralph\s+lauren\b|ралф\s*лорен/i, name: "Ralph Lauren", note: "Американский преппи, поло, твид и ранчо." },
  { re: /\bbulgari\b|bvlgari|булгари/i, name: "Bulgari", note: "Рим. Змея Serpenti, золото и ювелирный гламур." },
  { re: /\bcartier\b|картье/i, name: "Cartier", note: "Париж. Love, Trinity и ювелирный код статуса." },
  { re: /\btiffany\b|тиффани/i, name: "Tiffany & Co.", note: "Нью-Йорк. Голубая коробка, бриллиант и T-украшения." },
];

function matchingLuxuryHouses(blob: string): Array<{ name: string; note: string }> {
  const t = String(blob || "");
  return LUXURY_HOUSES.filter((h) => h.re.test(t)).map(({ name, note }) => ({ name, note }));
}

function luxuryHouseCard(blob: string): string {
  return matchingLuxuryHouses(blob)
    .slice(0, 4)
    .map((h) => `${h.name}: ${h.note}`)
    .join("\n");
}

function hasLuxuryHouse(blob: string): boolean {
  return matchingLuxuryHouses(blob).length > 0;
}

const CELEB_RU_NAMES: Array<[RegExp, string]> = [
  [/anne hathaway/i, "Энн Хэтэуэй"],
  [/jennifer lopez|\bjlo\b/i, "Дженнифер Лопес"],
  [/kristen stewart/i, "Кристен Стюарт"],
  [/hailey bieber|hailey baldwin/i, "Хейли Бибер"],
  [/zendaya/i, "Зендая"],
  [/rihanna/i, "Рианна"],
  [/beyonc/i, "Бейонсе"],
  [/blake lively/i, "Блейк Лайвли"],
  [/selena gomez/i, "Селена Гомес"],
  [/kylie jenner/i, "Кайли Дженнер"],
  [/taylor swift/i, "Тейлор Свифт"],
  [/gigi hadid/i, "Джиджи Хадид"],
  [/bella hadid/i, "Белла Хадид"],
  [/sydney sweeney/i, "Сидни Суини"],
  [/timoth[eé]e chalamet/i, "Тимоти Шаламе"],
  [/harry styles/i, "Гарри Стайлс"],
  [/austin butler/i, "Остин Батлер"],
  [/jacob elordi/i, "Джейкоб Элорди"],
  [/david beckham/i, "Дэвид Бекхэм"],
  [/ryan gosling/i, "Райан Гослинг"],
  [/brad pitt/i, "Брэд Питт"],
  [/ryan reynolds/i, "Райан Рейнольдс"],
  [/kim kardashian/i, "Ким Кардашьян"],
  [/dua lipa/i, "Дуа Липа"],
  [/sabrina carpenter/i, "Сабрина Карпентер"],
  [/irina shayk/i, "Ирина Шейк"],
  [/halle berry/i, "Холли Берри"],
  [/cara delevingne/i, "Кара Делевинь"],
  [/nicole kidman/i, "Николь Кидман"],
  [/margot robbie/i, "Марго Робби"],
  [/florence pugh/i, "Флоренс Пью"],
  [/lady gaga/i, "Леди Гага"],
  [/kendall jenner/i, "Кендалл Дженнер"],
];

function mostlyRussian(s: string, allowBrands = true): boolean {
  const t = String(s || "").trim();
  if (!t) return false;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  const cyr = (t.match(/[А-Яа-яЁё]/g) || []).length;
  if (cyr < 4) return false;
  // Русский текст с брендами (Dior, Gap) не выкидывать
  if (allowBrands && cyr >= 8 && cyr >= lat * 0.5) return true;
  if (lat <= (allowBrands ? 10 : 2) && cyr >= lat) return true;
  return cyr > lat;
}

function ruCelebName(raw: string, item?: FeedItem): string {
  const blob = `${raw} ${item?.title || ""} ${item?.description || ""}`;
  for (const [re, ru] of CELEB_RU_NAMES) if (re.test(blob)) return ru;
  const t = String(raw || "").trim();
  if (mostlyRussian(t, false)) return t.replace(/[A-Za-z]{3,}/g, "").replace(/\s+/g, " ").trim();
  return "";
}

function ruLine(raw: string, fallback: string): string {
  const t = String(raw || "").trim();
  if (!t) return fallback;
  if (mostlyRussian(t)) return t;
  const cyr = (t.match(/[А-Яа-яЁё]/g) || []).length;
  if (cyr >= 20) return t;
  return fallback;
}

function defaultHow(angle: DigestStory["angle"], kind: DigestStory["kind"] = "star"): string {
  if (kind === "product") return "Одно действие в уходе — и сразу видно, зачем оно в косметичке.";
  if (angle === "nails") return "Салонный маникюр: влажная кожа, ровная кутикула, идеально ровная пластина и глянцевый топ.";
  if (angle === "style") return "Чистая укладка, спокойный тон кожи, один акцент — и всё.";
  return "Повторить силуэт и цвет, остальное оставить спокойным фоном.";
}

function storyAngle(item: FeedItem): DigestStory["angle"] {
  const b = newsBucket(item);
  if (b === "nails") return "nails";
  if (b === "hair" || b === "beauty") return "style";
  return "wardrobe";
}

function storyKind(item: FeedItem): DigestStory["kind"] {
  const t = `${item.title} ${item.description}`.toLowerCase();
  const worn = /\b(wears|wore|seen in|arrived|red carpet|gown|outfit|надел|в плать|в костюм)\b/i.test(t);
  if (worn && (isStarStyleNews(item) || isModelAgencyNews(item) || isCoutureNews(item))) return "star";
  if (isBeautyIndustryNews(item) && !worn) return "product";
  if (isTrendNews(item) && /\b(serum|cream|lipstick|mascara|nail|skincare|сыворотк|крем|помад|маникюр)\b/i.test(t)) {
    return "product";
  }
  if (isMenStyleNews(item) && /\b(trimmer|serum|cologne|launch|product|средств|станок|крем|масло)\b/i.test(t)) {
    return "product";
  }
  return "star";
}

const GIRL_ASKS = [
  "Честно: это ваше — или образ из другой вселенной? 😅 Какие любите, я не телепат.",
  "Ну что, зашло — или я одна тут восхищаюсь? 😄 Напишите, какие выходы вам ближе.",
  "Если б такое мелькало каждый день — радовались или бежали? 🙈 Что любите смотреть?",
  "Какой кадр роднее — этот или вчерашний? 😉 Тут не экзамен, можно шутить.",
  "Вам ближе тихий шик или чтобы все обернулись? ✨ Напишите любимые образы.",
  "Что сохранить в ленте — это или совсем другое настроение? 😄 Я читаю.",
];
const MEN_ASKS = [
  "Парни, не притворяйтесь, что не смотрели 😏 🔥 этому, ❤️ если хотите другое.",
  "Мужчины, голосуйте как люди, не как статуи 😂 🔥 или ❤️ — я всё равно узнаю.",
  "Мужской взгляд без геройства 👀 🔥 если зашло, ❤️ если скучно и ждёте другое.",
  "Ну что, зашло или мимо? 🔥 / ❤️ — без вежливого молчания.",
];

const VOICE_MOVES = [
  "сухой минус одному образу вполголоса, без концерта",
  "выбрать один кадр и буднично сказать почему остальные мимо",
  "одна деталь (каблук, сумка, плечо) и тихая шутка про жизнь, не про стендап",
  "поспорить с собой коротко: сначала да, потом «хотя нет»",
  "обратиться к девушкам спокойно, как в личке, без голосования",
  "кинуть парням одну фразу, будто разговор в курилке",
  "сравнить с настроением из жизни намёком, мягко, без грубости",
  "сказать про свидание или метро так, будто это факт, не панчлайн",
  "признаться что тренд не зашёл — без самоуничижения на публику",
  "похвалить один выход и второму дать тихий минус",
];

function recentDigestVoices(): string[] {
  try {
    return loadLog()
      .posts.slice(-12)
      .map((p) => {
        const t = String(p.text || "");
        const cut = t.split("Читать в журналах")[0].split("————————————")[0];
        return cut.replace(/\s+/g, " ").trim().slice(-420);
      })
      .filter((t) => t.length > 40);
  } catch {
    return [];
  }
}

function isFlatVoice(t: string): boolean {
  return /что выберете|что возьмёте|голосуйте\s*[🔥❤❤️]|девочки,?\s*вы готовы|какой кадр роднее|🔥 если готовы|❤️ если предпочитаете|ахах|ржу не могу|😂{2,}|🤣|бля|сука|пизд|ебан|хер |пошл|сиськ|жоп/i.test(
    t,
  );
}

function pickVoiceMove(): string {
  return VOICE_MOVES[Math.floor(Math.random() * VOICE_MOVES.length)];
}

function recentEvergreenVoices(): string[] {
  try {
    return loadLog()
      .posts.slice(-15)
      .map((p) => parseTripleSections(p.text || "")?.voice || "")
      .filter((v) => v.length > 40);
  } catch {
    return [];
  }
}

/** Живой блок «Мнение эксперта» для evergreen — по каждой рубрике. */
async function writeEvergreenVoice(title: string, body: string): Promise<string> {
  const sec = parseTripleSections(body);
  if (!sec) return "";
  const summary = [
    `Уход: ${sec.care.slice(0, 320)}`,
    `Гардероб: ${sec.wardrobe.slice(0, 220)}`,
    `Психология: ${sec.mind.slice(0, 420)}`,
  ].join("\n");
  const recent = recentEvergreenVoices();
  const move = pickVoiceMove();
  const prompt =
    `Ты — мужчина-стилист канала «Стилист AI». Это блок «Мнение эксперта».\n` +
    `Заголовок: ${title}\n\nТри блока поста:\n${summary}\n\n` +
    `Напиши РОВНО три короткие реплики — по одной на каждую рубрику. Формат строго:\n` +
    `✨ Уход: ...\n👗 Гардероб: ...\n💭 Психология: ...\n` +
    `Каждая реплика: 1–2 живых предложения от себя, что зашло / что спорно, со стикером (😉😅🔥❤️✨😏🙈).\n` +
    `В конце одна живая фраза-вопрос людям, без нумерации 1/2/3.\n` +
    `Тон: тепло, чуть иронично, как умный друг в чате. Не пресс-релиз.\n` +
    `Ход общения: ${move}.\n` +
    `Не пересказывай блоки дословно. Не «как эксперт отмечу». Без голосования 🔥/❤️, без «девочки вы готовы».\n` +
    (recent.length ? `Не повторяй недавние концовки: ${recent.slice(-3).join(" | ").slice(0, 600)}\n` : "") +
    `Только текст блока, без заголовка «Мнение эксперта». Только русский. Сохрани переносы строк.`;
  try {
    const r = await polza.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 1.1,
      max_tokens: 700,
    });
    const raw = String(r.choices?.[0]?.message?.content || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    const text = ruLine(raw.replace(/\n{3,}/g, "\n\n"), "");
    if (text.length >= 80 && !isFlatVoice(text)) {
      console.log(`[Hermes] evergreen voice ok (${TEXT_MODEL}) len=${text.length}`);
      return text.slice(0, 1100);
    }
  } catch (e) {
    console.warn("[Hermes] evergreen voice failed:", (e as Error).message.slice(0, 140));
  }
  return "";
}

function injectEvergreenVoice(body: string, voice: string): string {
  if (!voice.trim()) return body;
  const cleaned = String(body || "")
    .replace(/\n*④\s*(?:Голос|От себя)[\s\S]*$/i, "")
    .replace(/\n*Что\s+(?:возьмёте|возьмете|внедрите|внедришь|обновите|разберем)[^\n]*/gi, "")
    .trim();
  return `${cleaned}\n\n④ От себя\n${voice.trim()}`;
}

function wardrobeHasMakeup(text: string): boolean {
  return wardrobeIsNotClothes(text);
}

/** Гардероб сломан, если в нём уход/макияж/руки или нет самой одежды. */
function wardrobeIsNotClothes(text: string): boolean {
  const t = String(text || "");
  const leakedCare =
    /\b(BB[- ]?крем|тинт|тональн|пудр[аы]|консилер|помад|румян|хайлайтер|макияж|тушь|бронзер|кутикул|маникюр|ногт|гель-лак|лак для|крем для рук|масло для (рук|ногт|кутикул)|палочк\w* для кутикул|Cuticle|Essie|OPI)\b/i.test(
      t,
    );
  const hasClothes =
    /(кардиган|свитер|джемпер|блуз|плать|брюк|джинс|пальто|жакет|блейзер|рубашк|юбк|футболк|водолазк|шарф|воротник|пиджак|тренч|платок|кашемир|хлопок|шёлк|шелк|лиоцелл|топ\b|вырез)/i.test(
      t,
    );
  return leakedCare || !hasClothes;
}

async function scrapeChannelMessageIds(limit = 24): Promise<number[]> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    const r = await fetch("https://t.me/s/stilist_ai_ru", { signal: ac.signal });
    clearTimeout(timer);
    const h = await r.text();
    return [...h.matchAll(/data-post="stilist_ai_ru\/(\d+)"/g)].map((m) => Number(m[1])).slice(-limit);
  } catch (e) {
    console.warn("[Hermes] scrape channel failed:", (e as Error).message);
    return [];
  }
}

/** Удалить последний пост из Telegram (альбом + хвост текста). */
async function deleteLastPublishedPost(titleHint = ""): Promise<{ ok: boolean; reason?: string; deleted?: number[] }> {
  const log = loadLog();
  const hint = String(titleHint || "").trim().toLowerCase();
  let last = [...log.posts].reverse().find((p) => p.tgMessageId);
  if (hint) {
    const hit = [...log.posts]
      .reverse()
      .find((p) => p.title && p.title.toLowerCase().includes(hint));
    if (hit) last = hit;
  }

  const scraped = await scrapeChannelMessageIds();
  let mid = scraped.at(-1);
  if (!hint && last?.tgMessageId) {
    const ageMs = Date.now() - Date.parse(String(last.ts || ""));
    if (Number.isFinite(ageMs) && ageMs < 14 * 24 * 3600 * 1000) mid = last.tgMessageId;
  }
  if (!mid && last?.tgMessageId) mid = last.tgMessageId;
  if (!mid) return { ok: false, reason: "no-message-id" };
  console.log(`[Hermes] delete target message_id=${mid} (hint=${hint || "—"})`);

  if (DRY_RUN) {
    console.log(`[Hermes] DRY_RUN delete messages ${mid}, ${mid + 1}, ${mid + 2}`);
    return { ok: true, reason: "dry-run", deleted: [mid, mid + 1, mid + 2] };
  }

  const deleted: number[] = [];
  for (const id of [mid, mid + 1, mid + 2]) {
    await deleteTelegramMessage(id);
    deleted.push(id);
  }
  if (last) {
    log.posts = log.posts.filter((p) => p.id !== last!.id);
    saveLog(log);
  }
  console.log(`[Hermes] deleted tg messages: ${deleted.join(", ")} | log=${last ? "trimmed" : "unchanged"}`);
  return { ok: true, deleted };
}

/** Опубликовать последний черновик из лога (если TG не принял с первого раза). */
async function republishLastLogEntry(): Promise<{ ok: boolean; title?: string; tgMessageId?: number; reason?: string }> {
  const log = loadLog();
  const last = [...log.posts].reverse().find((p) => p.kind === "image" && p.text && p.imagePath && fs.existsSync(p.imagePath));
  if (!last) return { ok: false, reason: "no-draft" };
  const wardrobePath = path.join(PUBLIC_HERMES_DIR, `${last.id}-wardrobe.jpg`);
  const caption = formatCaption(last.title, last.text);
  let tgMessageId: number | null = null;
  if (!DRY_RUN) {
    try {
      if (fs.existsSync(wardrobePath)) {
        tgMessageId = await sendTelegramAlbumWithCaption([last.imagePath!, wardrobePath], caption, last.title);
      } else {
        tgMessageId = await sendTelegramMediaWithCaption("image", last.imagePath!, caption, last.title);
      }
    } catch (e) {
      return { ok: false, reason: `tg-failed: ${(e as Error).message}`, title: last.title };
    }
    if (tgMessageId) {
      last.tgMessageId = tgMessageId;
      saveLog(log);
    }
  }
  if (!tgMessageId && !DRY_RUN) return { ok: false, reason: "tg-failed", title: last.title };
  return { ok: true, title: last.title, tgMessageId: tgMessageId ?? undefined, reason: DRY_RUN ? "dry-run" : undefined };
}

function pickAsk(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

/** Если модель забыла стикеры — дописываем НОВЫМИ словами, не одним скриптом. */
function ensureVoteAsk(how: string): string {
  let t = String(how || "").trim();
  t = t
    .replace(/Девочки,\s*вы готовы к такому наряду\s*[—–-]?\s*или пока только смотреть\??/gi, "")
    .replace(/Дорогие мужчины,\s*а вам нравится\?/gi, "")
    .replace(/\s+\n/g, "\n")
    .trim();
  if (!/любим|заход|цепля|ближ|телепат|шут|а вам|честно|какие выход|какие образ/i.test(t)) {
    t += (t ? "\n" : "") + pickAsk(GIRL_ASKS);
  }
  if (!/[🔥❤❤️]/.test(t)) {
    t += (t ? "\n" : "") + pickAsk(MEN_ASKS);
  }
  return t;
}

/** Подборка: три модные новости. Ссылки на журналы — только внизу. */
function magazineLabel(s: DigestStory): string {
  const raw = String(s.source || "").replace(/^Поиск · |^Google News[^·]* · /g, "").trim();
  return escapeHtml(SOURCE_RU[raw] || raw || "журнал");
}

function formatStoryNews(s: DigestStory, i: number): string {
  const name = escapeHtml(String(s.name || "").trim());
  const kicker = escapeHtml(String(s.kicker || "").trim());
  const line = escapeHtml(String(s.line || "").replace(/\s+/g, " ").trim());
  const how = escapeHtml(String(s.how || "").replace(/\s+/g, " ").trim());
  const head = kicker ? `<b>${name}</b> — ${kicker}` : `<b>${name}</b>`;
  const tip = how ? `На неделю: ${how}` : "";
  return [`${i + 1}. ${head}`, line, tip].filter(Boolean).join("\n");
}

function formatStoryOpinion(s: DigestStory): string {
  const op = String(s.opinion || "").trim();
  if (!op) return "";
  return formatExpertNote(op);
}

function formatExpertCloser(voice: string): string {
  return formatExpertNote(voice);
}

/** Мнение эксперта — отдельная цветная плашка (blockquote в Telegram). */
function formatExpertNote(voice: string): string {
  const t = String(voice || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return "";
  return `💬 <b>Мнение эксперта</b>\n<blockquote>${escapeHtml(t)}</blockquote>`;
}

function formatStylistNote(voice: string): string {
  return formatExpertNote(voice);
}

function formatDigestCaption(stories: DigestStory[], voice = ""): string {
  const list = stories.filter(Boolean).slice(0, 3);
  if (!list.length) return "";
  const blocks: string[] = [];
  list.forEach((s, i) => {
    blocks.push(formatStoryNews(s, i));
  });
  const links = list
    .map((s, i) => {
      const href = s.link || s.photoLink;
      const label = magazineLabel(s);
      const src = href ? `<a href="${escapeHref(href)}">${label}</a>` : label;
      return `${i + 1}. ${src}`;
    })
    .join("\n");
  const title = "<b>Мода, о которой сейчас говорят</b>";
  return [title, ...blocks, formatExpertCloser(voice), "————————————\nЧитать в журналах:\n" + links].filter(Boolean).join("\n\n");
}

function formatDigestShotCaption(story: DigestStory, index: number, total: number): string {
  const name = escapeHtml(String(story.name || "").trim());
  const kicker = escapeHtml(String(story.kicker || "").trim());
  const fact = escapeHtml(String(story.line || "").replace(/\s+/g, " ").trim()).slice(0, 220);
  const head = kicker ? `<b>${index}/${total} ${name}</b> — ${kicker}` : `<b>${index}/${total} ${name}</b>`;
  return [head, fact].filter(Boolean).join("\n").slice(0, TG_CAPTION_LIMIT);
}

function formatDigestAlbumTeaser(stories: DigestStory[]): string {
  const list = stories.filter(Boolean).slice(0, 3);
  const lines = list.map((s, i) => {
    const name = escapeHtml(String(s.name || "").trim());
    const kicker = escapeHtml(String(s.kicker || "").trim());
    return kicker ? `${i + 1}. <b>${name}</b> — ${kicker}` : `${i + 1}. <b>${name}</b>`;
  });
  return ["<b>Мода, о которой сейчас говорят</b>", ...lines].join("\n").slice(0, TG_CAPTION_LIMIT);
}

function formatDigestFollowup(stories: DigestStory[], voice = ""): string {
  const list = stories.filter(Boolean).slice(0, 3);
  const blocks: string[] = [];
  list.forEach((s, i) => {
    blocks.push(formatStoryNews(s, i));
  });
  const links = list
    .map((s, i) => {
      const href = s.link || s.photoLink;
      const label = magazineLabel(s);
      const src = href ? `<a href="${escapeHref(href)}">${label}</a>` : label;
      return `${i + 1}. ${src}`;
    })
    .join("\n");
  return [...blocks, formatExpertCloser(voice), links ? "————————————\nЧитать в журналах:\n" + links : ""].filter(Boolean).join("\n\n");
}

/** Пустой «новинка / по ссылке ниже» в канал не пускаем. */
function thinReason(s: DigestStory): string {
  const name = String(s.name || "").trim();
  const kicker = String(s.kicker || "").trim();
  const line = String(s.line || "").trim();
  const how = String(s.how || "").trim();
  if (!name) return "no-name";
  if (!kicker) return "no-kicker";
  if (!line) return "no-line";
  if (!how) return "no-how";
  if (/новинка/i.test(name) && /новый продукт|свежий образ/i.test(kicker)) return "generic-novinka";
  if (/по ссылке ниже/i.test(`${line} ${how}`)) return "link-below";
  if (kicker.length < 8) return `kicker-short:${kicker.length}`;
  if (line.length < 180) return `line-short:${line.length}`;
  if (how.length < 40) return `how-short:${how.length}`;
  if (!mostlyRussian(`${kicker} ${line} ${how}`)) return "not-russian";
  const concrete =
    /(плать|костюм|пиджак|юбк|брюк|рубашк|пальто|куртк|маникюр|ногт|френч|сумк|клатч|кроссов|кед|балетк|лофер|сыворотк|крем|флакон|помад|тушь|аромат|духи|каблук|шёлк|шелк|атлас|кружев|корсет|вырез|халтер|смокинг|подиум|кутюр|коллекц|тренд|кампани|модел|наряд|образ|силуэт|макияж|укладк|коллаб)/i.test(
      `${kicker} ${line}`,
    );
  const namedCeleb = /\p{Script=Cyrillic}{3,}/u.test(name) && name.length <= 48;
  if (!concrete && !namedCeleb) return "no-concrete";
  if (/эволюц|известна своими|эффектн(ые|ое) плать|яркими выходами|обзор новой|лаконичн(ый|ый выход)/i.test(`${kicker} ${line} ${how}`)) {
    return "cliche";
  }
  if (/^вау[.!]/i.test(line) || /девочки,\s*вы готовы к такому наряду/i.test(how)) return "cliche-wow";
  if (/надели бы/i.test(how) && !/любим|заход|ближ|выкладыв|какие|какой кадр/i.test(how)) return "cliche-wear";
  return "";
}

function isThinStory(s: DigestStory): boolean {
  return !!thinReason(s);
}

/** Короткий тизер к фото, когда полный текст уходит отдельным сообщением. */
function formatPhotoTeaser(title: string): string {
  const t = escapeHtml(String(title || "").trim());
  const teaser = t
    ? `<b>${t}</b>\n\n👇 полный текст ниже`
    : `👇 полный текст ниже`;
  return teaser.slice(0, TG_CAPTION_LIMIT);
}

/**
 * Разобрать body на 3 раздела (①/1 Уход …).
 * Важно: не использовать \\b после кириллицы — в JS это не работает.
 */
function parseTripleSections(
  body: string,
): { care: string; wardrobe: string; mind: string; voice: string } | null {
  const text = String(body || "").trim();
  if (!text) return null;

  // Только маркеры разделов в начале строки / после перевода строки (не «1 / Уход» из CTA)
  const reCare = /(?:^|\n)\s*(?:①|1[.)]|1:)\s*Уход(?=\s|$|[.:—-])/i;
  const reWard = /(?:^|\n)\s*(?:②|2[.)]|2:)\s*Гардероб(?=\s|$|[.:—-])/i;
  const reMind = /(?:^|\n)\s*(?:③|3[.)]|3:)\s*Психология(?=\s|$|[.:—-])/i;
  const reVoice = /(?:^|\n)\s*(?:④|4[.)]|4:)\s*(?:Голос|От себя)(?=\s|$|[.:—-])/i;

  const mCare = text.match(reCare);
  const mWard = text.match(reWard);
  const mMind = text.match(reMind);
  if (!mCare || !mWard || !mMind) return null;

  const iCare = mCare.index ?? -1;
  const iWard = mWard.index ?? -1;
  const iMind = mMind.index ?? -1;
  if (iCare < 0 || iWard < 0 || iMind < 0) return null;

  const headerLen = (m: RegExpMatchArray) => m[0].replace(/^\n/, "").length;
  // индекс начала текста заголовка внутри match (без ведущего \n)
  const headerStart = (m: RegExpMatchArray) => {
    const i = m.index ?? 0;
    return m[0].startsWith("\n") ? i + 1 : i;
  };

  const mVoice = text.match(reVoice);
  const points = [
    { key: "care" as const, i: headerStart(mCare), skip: headerLen(mCare) },
    { key: "wardrobe" as const, i: headerStart(mWard), skip: headerLen(mWard) },
    { key: "mind" as const, i: headerStart(mMind), skip: headerLen(mMind) },
    ...(mVoice ? [{ key: "voice" as const, i: headerStart(mVoice), skip: headerLen(mVoice) }] : []),
  ].sort((a, b) => a.i - b.i);

  const out = { care: "", wardrobe: "", mind: "", voice: "" };
  for (let n = 0; n < points.length; n++) {
    const cur = points[n];
    const end = n + 1 < points.length ? points[n + 1].i : text.length;
    out[cur.key] = text
      .slice(cur.i + cur.skip, end)
      .replace(/^\s*[:.\-—]\s*/, "")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }
  if (!out.care && !out.wardrobe && !out.mind) return null;
  return out;
}

/** Картинка одежды — строго по тексту блока Гардероб, без ухода и без маникюра. */
function wardrobeLookPrompt(wardrobeText: string, isMen: boolean): string {
  const who = isMen
    ? "handsome well-groomed man 30-42, editorial menswear"
    : "elegant woman 30-42, editorial womenswear";
  const look = String(wardrobeText || "").replace(/\s+/g, " ").trim().slice(0, 420);
  return (
    `Photorealistic luxury fashion editorial, ${who}, full body or 3/4 body, ` +
    `wearing EXACTLY this outfit: ${look}. Show the clothes clearly: colors, silhouette, fit. ` +
    `Warm cinematic light, juicy saturated but tasteful, Vogue/Esquire, sharp fabric detail. ` +
    `The HERO is the outfit. FORBIDDEN: skincare bottles, manicure close-up, product flatlay, ` +
    `watermarks, logos, title card, tiny unreadable clothes. Square 1:1.`
  );
}

function extractMediaUrl(d: any): string | null {
  const st = String(d?.status || "").toLowerCase();
  const done = !st || ["completed", "succeeded", "success", "ready", "done", "complete"].includes(st);
  if (!done && !(d?.output?.url || d?.url)) return null;
  if (d?.output?.url) return String(d.output.url);
  if (typeof d?.output?.data === "string" && (d.output.data.startsWith("http") || d.output.data.startsWith("data:"))) {
    return d.output.data;
  }
  if (typeof d?.url === "string" && d.url.startsWith("http")) return d.url;
  if (Array.isArray(d?.data) && d.data[0]) {
    if (d.data[0].b64_json) return `data:image/png;base64,${d.data[0].b64_json}`;
    if (d.data[0].url) return String(d.data[0].url);
  }
  if (typeof d?.image === "string") return d.image;
  return null;
}

function isTransientImageError(msg: string, status?: number): boolean {
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  return /busy|queue|async|rate|fetch failed|ECONNRESET|ETIMEDOUT|INTERNAL_ERROR|internal|попробуйте|try later|job failed|poll timeout|upstream|503|502|500/i.test(msg);
}

async function generateImage(
  prompt: string,
  model = IMAGE_MODEL,
  aspectRatio = "1:1",
  isFallback = false,
): Promise<string> {
  const base = process.env.POLZA_BASE_URL || "https://polza.ai/api/v1";
  const fallbackModel = (process.env.HERMES_IMAGE_FALLBACK || "seedream/5-pro-text-to-image").trim();
  let ratio = aspectRatio;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const body = {
        model,
        input: {
          prompt,
          aspect_ratio: ratio,
          quality: model.includes("seedream") || model.includes("5-pro") ? "medium" : "basic",
          n: 1,
        },
      };
      const response = await fetch(`${base}/media`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${POLZA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!response.ok) {
        const msg = data?.error?.message || data?.message || text.slice(0, 200);
        if (isTransientImageError(msg, response.status) && attempt < 3) {
          console.warn(`[Hermes] ${model} busy/error, wait 20s (try ${attempt + 1}):`, String(msg).slice(0, 120));
          await sleep(20000);
          continue;
        }
        if (/aspect|BAD_REQUEST|недопустим/i.test(msg) && ratio !== "1:1" && attempt < 3) {
          console.warn(`[Hermes] ${model} aspect ${ratio} rejected, fallback 1:1`);
          ratio = "1:1";
          continue;
        }
        throw new Error(`${model} failed: ${response.status} ${msg}`);
      }

      let url = extractMediaUrl(data);
      if (url) return url;
      const jobId = data.id || data.requestId;
      if (!jobId) {
        throw new Error(`${model}: no url/jobId ${JSON.stringify(data).slice(0, 300)}`);
      }

      const start = Date.now();
      while (Date.now() - start < 240000) {
        await sleep(3000);
        const poll = await fetch(`${base}/media/${jobId}`, {
          headers: { Authorization: `Bearer ${POLZA_API_KEY}` },
        });
        const pollData = await poll.json();
        url = extractMediaUrl(pollData);
        if (url) return url;
        const st = String(pollData.status || "").toLowerCase();
        if (["failed", "error", "cancelled"].includes(st)) {
          throw new Error(`${model} job failed: ${JSON.stringify(pollData.error || pollData).slice(0, 200)}`);
        }
      }
      throw new Error(`${model} poll timeout`);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (attempt < 3 && isTransientImageError(msg)) {
        console.warn(`[Hermes] ${model} retry after:`, msg.slice(0, 160));
        await sleep(15000);
        continue;
      }
      if (!isFallback && fallbackModel && fallbackModel !== model) {
        console.warn(`[Hermes] ${model} exhausted, fallback ${fallbackModel}:`, msg.slice(0, 140));
        return generateImage(prompt, fallbackModel, aspectRatio, true);
      }
      throw e;
    }
  }
  if (!isFallback && fallbackModel && fallbackModel !== model) {
    console.warn(`[Hermes] ${model} attempts done, fallback ${fallbackModel}`);
    return generateImage(prompt, fallbackModel, aspectRatio, true);
  }
  throw new Error(`image generation failed: ${model}`);
}

type FeedItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  image?: string;
  /** Сколько лент принесли ту же ссылку — грубый «это сейчас читают». */
  buzz?: number;
};

type DigestStory = {
  name: string;
  kicker: string;
  line: string;
  how: string;
  /** Живое мнение эксперта — отдельно от новости */
  opinion?: string;
  kind: "star" | "product";
  angle: "nails" | "wardrobe" | "style";
  link: string;
  source: string;
  photoLink?: string;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function between(s: string, start: string, end: string): string | null {
  const i = s.indexOf(start);
  if (i < 0) return null;
  const j = s.indexOf(end, i + start.length);
  if (j < 0) return null;
  return s.slice(i + start.length, j);
}

function feedLink(block: string): string {
  const tagged = between(block, "<link>", "</link>");
  const fromTag = tagged ? decodeXmlEntities(tagged).trim() : "";
  if (/^https?:\/\//i.test(fromTag)) return fromTag;
  const href = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
  return decodeXmlEntities(href).trim();
}

function parseRss(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const rawTitle = between(block, "<title>", "</title>") || "";
    const rawLink = feedLink(block);
    const rawDesc = between(block, "<description>", "</description>") || "";
    const rawDate = between(block, "<pubDate>", "</pubDate>") || "";
    if (!rawTitle || !rawLink) continue;
    const title = stripHtml(decodeXmlEntities(rawTitle)).slice(0, 300);
    const link = rawLink;
    const description = stripHtml(decodeXmlEntities(rawDesc)).slice(0, 1200);
    const d = new Date(rawDate);
    const pubDate = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    const enc = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1]
      || block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1]
      || block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1]
      || "";
    const descImg = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    const image = decodeXmlEntities(enc || descImg).trim() || undefined;
    const origin = stripHtml(decodeXmlEntities(block.match(/<source[^>]*>([^<]+)<\/source>/i)?.[1] || "")).trim();
    items.push({ title, link, description, pubDate, source: origin ? `${source} · ${origin}` : source, image });
  }
  return items;
}

function parseAtom(xml: string, source: string): FeedItem[] {
  const items: FeedItem[] = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const rawTitle = between(block, "<title>", "</title>") || "";
    const link = feedLink(block);
    const rawDesc = between(block, "<summary>", "</summary>") || between(block, "<content>", "</content>") || "";
    const rawDate = between(block, "<updated>", "</updated>") || between(block, "<published>", "</published>") || "";
    if (!rawTitle || !link) continue;
    const title = stripHtml(decodeXmlEntities(rawTitle)).slice(0, 300);
    const description = stripHtml(decodeXmlEntities(rawDesc)).slice(0, 1200);
    const d = new Date(rawDate);
    items.push({
      title,
      link,
      description,
      pubDate: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
      source,
    });
  }
  return items;
}

function parseFeed(xml: string, source: string): FeedItem[] {
  const rss = parseRss(xml, source);
  return rss.length ? rss : parseAtom(xml, source);
}

async function fetchOneRss(feed: { name: string; url: string }): Promise<FeedItem[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 18000);
    const r = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    } as any);
    clearTimeout(t);
    if (!r.ok) {
      console.warn(`[Hermes] RSS ${feed.name} HTTP ${r.status}`);
      return [];
    }
    const xml = await r.text();
    const items = parseFeed(xml, feed.name);
    console.log(`[Hermes] RSS ${feed.name}: ${items.length} items`);
    return items;
  } catch (e) {
    console.warn(`[Hermes] RSS ${feed.name} failed:`, (e as Error).message);
    return [];
  }
}

async function fetchRssFeeds(): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  const size = 8;
  for (let i = 0; i < RSS_FEEDS.length; i += size) {
    const chunk = RSS_FEEDS.slice(i, i + size);
    const batches = await Promise.all(chunk.map((feed) => fetchOneRss(feed)));
    out.push(...batches.flat());
  }
  console.log(`[Hermes] RSS total: ${out.length} items from ${RSS_FEEDS.length} live feeds`);
  return out;
}

function mergeNewsItems(...lists: FeedItem[][]): FeedItem[] {
  const seen = new Map<string, FeedItem>();
  const out: FeedItem[] = [];
  for (const list of lists) {
    for (const it of list) {
      const key = String(it.link || "").replace(/[?#].*$/, "").toLowerCase();
      if (!key) continue;
      const prev = seen.get(key);
      if (prev) {
        prev.buzz = (prev.buzz || 1) + 1;
        continue;
      }
      const copy = { ...it, buzz: 1 };
      seen.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

/** Известные журналы — людям это интереснее случайного блога. */
function magazinePrestige(item: FeedItem): number {
  const s = `${item.source} ${item.link}`.toLowerCase();
  if (/vogue\.(com|co|fr|it|de|es|in)|\/vogue\b/.test(s) || /\bvogue\b/.test(s)) return 14;
  if (/elle\.com|harpersbazaar|harper.?s bazaar|\belle\b/.test(s)) return 12;
  if (/wwd\.com|vanityfair|\bgq\b/.test(s)) return 11;
  if (/people\.com|variety\.com|hollywoodreporter/.test(s)) return 10;
  if (/instyle|glamour|allure|grazia|thevoicemag|the voice|buro|peopletalk/.test(s)) return 8;
  if (/who what wear|fashionista|w magazine|town & country/.test(s)) return 6;
  return 0;
}

/** Звёздный слот: наряд и журнал, не короткая заметка про лак. */
function starInterestBoost(item: FeedItem): number {
  let s = magazinePrestige(item);
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (isStarStyleNews(item) && /\b(wears|wore|gown|dress|red carpet|плать|наряд|костюм|кампани|подиум|collection)\b/i.test(t)) s += 12;
  if ((item.buzz || 1) > 1) s += Math.min(16, ((item.buzz || 1) - 1) * 4);
  if (newsBucket(item) === "nails" && !isStarStyleNews(item)) s -= 22;
  if (/\b(how to|что сказать мастеру|gel polish|jelly nails|микро.?френч)\b/i.test(t) && !isStarStyleNews(item)) s -= 18;
  return s;
}

function loadPublishedCache(): Set<string> {
  try {
    if (fs.existsSync(PUBLISHED_CACHE)) {
      const arr = JSON.parse(fs.readFileSync(PUBLISHED_CACHE, "utf-8"));
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

function savePublishedCache(set: Set<string>): void {
  const arr = Array.from(set).slice(-2000);
  fs.writeFileSync(PUBLISHED_CACHE, JSON.stringify(arr, null, 2), "utf-8");
}

type NewsBucket = "celeb" | "fashion" | "nails" | "hair" | "beauty" | "trend" | "models" | "other";
type CelebRegion = "ru" | "intl" | "none";

const RU_CELEB_RE = /\b(собчак|лобода|бузова|гагарина|ходченкова|пересильд|тодоренко|бонд(арчук)?|киркоров|пугач[её]ва|орбакайте|аксен(тьева|тьев)|харламов|ивлеева|моргенштерн|instasamka|валя\s*карнавал|дава|тимати|баста|землянухин|хрусталев|агутин|вариум|борщ|седокова|брежнева|галич|шарапова|загитова|туктамышева|немцова|хаматова|мир(онова)?|литьвинова|виторган|яглыч|петров|хабенск|машков|друзь|ургант|муцениеце|бойко|климова|лазарева|подольская|кудрявц|апина|манюк|иванова|куценко|харламова|бордова|картункова|гаттас|дробязко|волч(ок|кова)|самойлова|темникова|сер(ябкин|ябкина)|ёлка|елка|нюша|манижа|zivert|зиверт)\b/i;
const INTL_CELEB_RE = /\b(zendaya|rihanna|beyonc|jennifer|blake lively|hailey|selena|taylor swift|gigi hadid|bella hadid|margot|anne hathaway|emma roberts|tracee|kim kardashian|kylie|kendall|dua lipa|adelaide|ana de armas|sydney sweeney|florence pugh|timoth[eé]e|brad pitt|angelina|kate middleton|meghan|lady gaga|madonna|scarlett|emma stone|charlize|nicole kidman|halle berry|cara delevingne|emily ratajkowski|irina shayk|natalia vodyanova|sabrina carpenter|chappell|ariana grande|billie eilish|olivia rodrigo|rosal[ií]a|anya taylor|hunter schafer|jada pinkett|zoe kravitz|lizzo|doja cat|camila cabello|shaileene|jessica alba|kerry washington|lupita|viola davis|helen mirren|cate blanchett|saoirse|dakota johnson|jenna ortega|millie bobby|austin butler|harry styles|chris evans|ryan reynolds|jacob elordi|david beckham|ryan gosling|blake|amandla|maitreyi|ramakrishnan|madelyn cline|gillian anderson)\b/i;

const MALE_CELEB_RE = /\b(timoth[eé]e|harry styles|austin butler|jacob elordi|david beckham|ryan gosling|brad pitt|ryan reynolds|chris evans|киркоров|тимати|баста|харламов|ургант|хабенск|петров|машков|агутин|дава)\b/i;

function celebRegion(item: FeedItem): CelebRegion {
  const t = `${item.title} ${item.description} ${item.source}`.toLowerCase();
  const ruSource = /vogue russia|buro|cosmo ru|the voice|thevoicemag|hello\.ru|elle\.ru|glamour\.ru|forbes woman|peopletalk|blueprint|woman\.ru|afisha/i.test(item.source)
    || /\.ru\b/i.test(item.link);
  const hasRu = RU_CELEB_RE.test(t) || (/\b(российск|русск(ая|ие)|наших зв[её]зд|отечественн)\b/i.test(t) && /\b(звезд|знаменит|актрис|певиц)\b/i.test(t));
  const hasIntl = INTL_CELEB_RE.test(t)
    || /\b(hollywood|hollywoodвуд|red carpet|met gala|oscar|grammy|cannes|venice film|бафта)\b/i.test(t);
  if (hasRu && !hasIntl) return "ru";
  if (hasIntl && !hasRu) return "intl";
  if (hasRu && hasIntl) return ruSource ? "ru" : "intl";
  if (ruSource && /\b(звезд|знаменит|актрис|певиц|премьер|ковров)\b/i.test(t)) return "ru";
  if (/\b(celebrity|actress|actor|singer|a-list|red carpet)\b/i.test(t)) return "intl";
  return "none";
}

function newsBucket(item: FeedItem): NewsBucket {
  const t = `${item.title} ${item.description}`.toLowerCase();
  const hasCeleb = /\b(celebrity|celebrities|red carpet|met gala|awards|oscar|grammy|звезд|знаменит|актрис|актор|певиц|певец|singer|actress|actor|a-list|ковров(ой|ая)|премьер[аы])\b/i.test(t)
    || RU_CELEB_RE.test(t) || INTL_CELEB_RE.test(t);
  if (hasCeleb && /\b(fashion|style|outfit|look|gown|dress|red carpet|beauty|hair|nail|маникюр|образ|плать|стиль|макияж|причёск|прическ|наряд|выход|makeup|skincare|manicure|hairstyle|balayage|стрижк|окраш|укладк|педикюр|гель-лак|gown|suit|tuxedo)\b/i.test(t)) {
    return "celeb";
  }
  if (/\b(nail|manicure|pedicure|ногт|маникюр|педикюр|гель-лак)\b/i.test(t)) return "nails";
  if (/\b(img models|elite model|ford models|women management|next management|dna models|the society|storm model|wilhelmina|the lions|viva model|marilyn agency|supreme management|premier model|models\.com|new face|signed with|model agency)\b/i.test(t)) {
    return "models";
  }
  if (/\b(trend|тренды?|it bag|quiet luxury|balletcore|coastal granddaughter|clean girl|chrome nails|butter yellow|what's in|must-have)\b/i.test(t)) {
    return "trend";
  }
  if (/\b(hair|hairstyle|blowout|balayage|colorist|стрижк|окрашив|причёск|прическ|балаяж|укладк)\b/i.test(t)) return "hair";
  if (/\b(beauty|skincare|makeup|макияж|уход за кож|космети)\b/i.test(t) && !/\b(fashion week|runway|couture)\b/i.test(t)) return "beauty";
  if (/\b(fashion|runway|wardrobe|outfit|street style|мода|гардероб|подиум|коллекц)\b/i.test(t)) return "fashion";
  if (hasCeleb) return "other";
  return "other";
}

function isOffTopicNews(item: FeedItem): boolean {
  const t = `${item.title} ${item.description}`.toLowerCase();
  const hasRealLook =
    /\b(gown|dress|outfit|red carpet|manicure|nails|couture|runway|плать|маникюр|ногт|наряд|подиум|коллекц)\b/i.test(t);
  if (/\b(american horror|horror story|season \d+|episode \d+|trailer|box office|first frame|первый кадр|трейлер|сериал|сезон\s*\d+)\b/i.test(t) && !hasRealLook) {
    return true;
  }
  if (/\bfirst look\b/i.test(t) && !hasRealLook) return true;
  if (/\b(морск(ие|ой|ий)\s+мотив|marine motif)/i.test(t) && !/\b(runway|collection|подиум|коллекц|celebrity|звезд|red carpet)\b/i.test(t)) {
    return true;
  }
  if (/\b(fever has|brides? (are|rush)|wedding-dress fever)\b/i.test(t) && !/\b(wears|wore|seen in|arrived|red carpet)\b/i.test(t)) {
    return true;
  }
  if (/\bbest (red carpet |celebrity )?looks?\b/i.test(t) && !/\b(wears|wore|seen in|arrived)\b/i.test(t)) return true;
  if (/\b(all the fashion news|beauty launches to be across|this july|this june|round-?up|week in fashion)\b/i.test(t)) {
    return true;
  }
  if (/\b(tumbler|stanley x |the traitors|10 best|best skincare brands|teaming up with|that's hot|surf association|lululemon)\b/i.test(t) && !hasRealLook) {
    return true;
  }
  return false;
}

function isStarStyleNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  const hasStar =
    RU_CELEB_RE.test(t) ||
    INTL_CELEB_RE.test(t) ||
    /\b(звезд|знаменит|актрис|актор|певиц|певец|celebrity|celebrities|actress|actor|singer|a-list|red carpet|ковров)\b/i.test(t);
  const hasStyle =
    /\b(fashion|outfit|gown|dress|manicure|nails|red carpet|runway|couture|wardrobe|street style|мода|стиль|образ|плать|наряд|маникюр|ногт|макияж|причёск|прическ|укладк|стрижк|окраш|гардероб|подиум)\b/i.test(t);
  return hasStar && hasStyle;
}

/** Новинки индустрии: запуск, коллекция, тренд макияжа/ухода — не только выход звезды. */
function isBeautyIndustryNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (/\b(dating|divorce|pregnant|box office|election|beauty box|subscribe|giveaway|coupon)\b/i.test(t)) return false;
  return /\b(launch|launches|new collection|new drop|serum|lipstick|mascara|fragrance|perfume|skincare|bronzer|retinol|peptide|blush|foundation|manicure|nail art|gel polish|новинк|сыворотк|помад|тушь|аромат|духи|уход за кож|бронзер|коллекц|маникюр|гель-лак|френч)\b/i.test(t);
}

function isMenStyleNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (MALE_CELEB_RE.test(t) && /\b(fashion|suit|tuxedo|grooming|style|outfit|hair|beard|cologne| menswear|костюм|стиль|образ|бород|укладк)\b/i.test(t)) {
    return true;
  }
  return /\b(menswear|men's wear|mens fashion|for men|male grooming|beard oil|cologne|aftershave|tuxedo|suiting|barber|мужск(ой|ая|ие)|для мужчин|бород|смокинг|одеколон|барбер)\b/i.test(t);
}

function isCoutureNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  return (/\b(couture|haute couture|runway|fw26|ss26|aw26|fashion week|lookbook|кутюр|подиум|неделя моды|коллекц(ия|ии))\b/i.test(t)
    && (hasLuxuryHouse(t) || /\b(designer|дом моды|galliano)\b/i.test(t)))
    || (hasLuxuryHouse(t) && /\b(collection|campaign|show|bag|gown|wears|wore|lookbook|it bag|кампани|сумк|плать|показ)\b/i.test(t));
}

function isTrendNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (/\b(dating|divorce|coupon|sale|giveaway)\b/i.test(t)) return false;
  return /\b(trend|тренды?|it bag|quiet luxury|balletcore|coastal|clean girl|glazed|chrome nails|butter yellow|ss26|fw26|aw26|must-have|what's in|что носят|тренд сезона)\b/i.test(t)
    && /\b(fashion|beauty|nail|makeup|skincare|runway|wardrobe|мода|маникюр|уход|макияж|подиум|гардероб)\b/i.test(t);
}

function isModelAgencyNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description} ${item.source}`.toLowerCase();
  return /\b(img models|elite model|ford models|women management|next management|dna models|the society management|storm models|wilhelmina|the lions|viva model|marilyn agency|supreme management|premier model|models 1|why not model|success models|oui management|models\.com|new face|signed to|signed with|exclusive with)\b/i.test(t)
    && /\b(model|campaign|campaigns|runway|lookbook|cover|campaign look|кампани|подиум|обложк|модел)\b/i.test(t);
}

function isHairStyleNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (/\b(dating|divorce|pregnant|box office|сериал|трейлер)\b/i.test(t)) return false;
  return /\b(hair|hairstyle|blowout|balayage|стрижк|окрашив|причёск|прическ|балаяж|укладк|каре|боб|каскад|чёлк|челк)\b/i.test(t)
    && /\b(cut|color|trend|style|beauty|мода|стиль|тренд|идеи|молодит|старит|осен|весен)\b/i.test(t);
}

function isWardrobeTrendNews(item: FeedItem): boolean {
  if (isOffTopicNews(item)) return false;
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (/\b(coupon|sale|giveaway|dating|divorce)\b/i.test(t)) return false;
  return /\b(wardrobe|outfit|street style|it bag|quiet luxury|loafers?|tights|ballet flats|гардероб|уличн(ый|ая) стиль|сумк|лофер|колгот|балетк|тренч|блейзер|тихая роскошь|что носить|идеи образ)\b/i.test(t)
    || (/\b(тренд|trend|осень|весна|ss26|fw26)\b/i.test(t)
      && /\b(одежд|плать|юбк|брюк|пальто|куртк|обув|аксессуар|fashion|wardrobe)\b/i.test(t));
}

function isLookbookNews(item: FeedItem): boolean {
  return newsBucket(item) === "nails" || isHairStyleNews(item) || isWardrobeTrendNews(item)
    || isBeautyIndustryNews(item) || (isTrendNews(item) && /\b(nail|hair|wardrobe|маникюр|стрижк|причёск|гардероб|плать)\b/i.test(`${item.title} ${item.description}`));
}

function isChannelNews(item: FeedItem): boolean {
  return isStarStyleNews(item) || isBeautyIndustryNews(item) || isMenStyleNews(item) || isCoutureNews(item)
    || isTrendNews(item) || isModelAgencyNews(item) || isHairStyleNews(item) || isWardrobeTrendNews(item)
    || newsBucket(item) === "nails" || newsBucket(item) === "hair" || newsBucket(item) === "fashion";
}

/** План дня: 08 и 16 — звезда; 00 — маникюр / причёска / тренд одежды. */
type ContentLane = "star" | "men" | "beauty";
function contentLane(slot: DaySlotKind): ContentLane {
  if (slot === "men") return "men";
  const { hour } = moscowNowParts();
  if (hour === 0) return "beauty";
  return "star";
}

function matchesLane(it: FeedItem, lane: ContentLane): boolean {
  if (lane === "men") return isMenStyleNews(it) || (isModelAgencyNews(it) && /\b(male|men's|man |him |his )\b/i.test(`${it.title} ${it.description}`));
  if (lane === "beauty") return isLookbookNews(it);
  return isStarStyleNews(it) || isCoutureNews(it) || isTrendNews(it) || isModelAgencyNews(it)
    || newsBucket(it) === "fashion" || newsBucket(it) === "celeb" || newsBucket(it) === "trend" || newsBucket(it) === "models";
}

function demandScore(item: FeedItem): number {
  const t = `${item.title} ${item.description}`.toLowerCase();
  let s = 0;
  // Люди кликают: звезда + конкретный повтор (маникюр / стрижка / наряд)
  if (isStarStyleNews(item) && /\b(manicure|nails|haircut|hairstyle|wears|wore|маникюр|ногт|стрижк|причёск|надел|в плать)\b/i.test(t)) s += 14;
  // Имена трендов, которые ищут в салоне
  if (/\b(coconut jelly|coconut water|mother-?of-?pearl|micro.?french|glazed|jelly gloss|cat.?eye|кошач(ий|ьего) глаз|микро.?френч|перламутр|желе|хром|шоколадн|оливков|винн(ый|ая)|марсала)\b/i.test(t)) s += 12;
  if (/\b(italian bob|bixie|cowboy copper|медн(ый|ая)|каре|лонг.?боб|wet look|mermaid wave)\b/i.test(t)) s += 10;
  if (/\b(how to|easy to copy|what to ask|повтори|как сделать|что сказать мастеру|на эту неделю)\b/i.test(t)) s += 8;
  if (/\b(осень|autumn|fall 2026|fw26|на осень)\b/i.test(t) && /\b(nail|hair|wardrobe|маникюр|стрижк|гардероб|пальто)\b/i.test(t)) s += 6;
  if (/\b(quiet luxury|тихая роскошь|short square|короткие ногти)\b/i.test(t)) s += 5;
  if (hasLuxuryHouse(t)) s += 12;
  // Слабый спрос: агентства, кроссовки, пустые подборки
  if (isModelAgencyNews(item) && !isStarStyleNews(item)) s -= 6;
  if (/\b(collab|collaboration|drop|sneakers?|gel-kayano|supreme|коллабор)\b/i.test(t) && !/\b(wears|wore|маникюр|плать)\b/i.test(t)) s -= 8;
  if (/\b(best of|week in fashion|drops you don.t|8 drops|20 best)\b/i.test(t)) s -= 7;
  return s;
}

function fashionScore(item: FeedItem): number {
  const star = isStarStyleNews(item);
  const beauty = isBeautyIndustryNews(item);
  const men = isMenStyleNews(item);
  const couture = isCoutureNews(item);
  const trend = isTrendNews(item);
  const agency = isModelAgencyNews(item);
  const hair = isHairStyleNews(item);
  const wardrobe = isWardrobeTrendNews(item);
  const nailsOnly = newsBucket(item) === "nails";
  if (!star && !beauty && !men && !couture && !trend && !agency && !hair && !wardrobe && !nailsOnly) return -20;
  const t = `${item.title} ${item.description}`.toLowerCase();
  if (/\b(dating|married|husband|wife|divorce|relationship timeline|pregnant|baby|cheating|split|engaged|romance rumor|gossip|affair|breakup)\b/i.test(t)
    && !/\b(wedding dress|bridal|gown|red carpet|outfit|fashion|плать|образ|стиль)\b/i.test(t)) return -10;
  if (/\b(кто встречается|развод|беременн|роман с|измен)\b/i.test(t) && !/\b(плать|образ|red carpet|look|gown|стиль|fashion|outfit|макияж|причёск)\b/i.test(t)) return -10;
  if (/\b(election|stock market|crypto|war|sports score|box office)\b/i.test(t) && !/\b(fashion|style|designer|runway|beauty|мода|стиль)\b/i.test(t)) return -6;
  let s = 0;
  const strong = [
    "fashion", "runway", "couture", "ready-to-wear", "ss26", "fw26", "collection", "lookbook",
    "street style", "trend report", "wardrobe", "silhouette", "мода", "подиум", "коллекц", "тренд",
    "red carpet", "met gala",
  ];
  const boost = [
    "style", "designer", "beauty", "skincare", "makeup", "hair", "nails", "manicure", "hairstyle",
    "colorist", "blowout", "streetwear", "luxury", "outfit", "fabric", "accessories",
    "gown", "tailoring", "стиль", "красот", "макияж", "уход", "гардероб", "образ",
    "маникюр", "ногт", "стрижк", "окрашив", "причёск", "прическ", "celebrity", "звезд",
  ];
  for (const w of strong) if (t.includes(w)) s += 3;
  for (const w of boost) if (t.includes(w)) s += 2;
  const bucket = newsBucket(item);
  const region = celebRegion(item);
  if (/\b(wears|wore|seen in|arrived in|minidress|red carpet)\b/i.test(t)) s += 10;
  if (/\b(anniversary sale|nordstrom|team up for \d+|x yale|tumbler)\b/i.test(t)) s -= 10;
  if (/\b(fever has|brides|inspired by her look)\b/i.test(t) && !/\b(wears|wore)\b/i.test(t)) s -= 8;
  if (beauty && !star) s += 6;
  if (men) s += 5;
  if (couture) s += 7;
  if (trend) s += 7;
  if (agency) s += 8;
  if (bucket === "nails") s += 12;
  if (hair || bucket === "hair") s += 11;
  if (wardrobe || bucket === "fashion") s += 9;
  if (bucket === "celeb") s += 8;
  if (region === "ru") s += 2;
  if (bucket === "nails" || bucket === "hair" || bucket === "fashion" || bucket === "beauty") s += 3;
  const ageMs = Date.now() - new Date(item.pubDate).getTime();
  if (!isNaN(ageMs) && ageMs >= 0) {
    if (ageMs < 12 * 3600_000) s += 6;
    else if (ageMs < 24 * 3600_000) s += 5;
    else if (ageMs < 48 * 3600_000) s += 3;
    else if (ageMs < 3 * 86400_000) s += 1;
  }
  if (PREMIUM_PHOTO_RE.test(item.source)) s += 3;
  if (hasLuxuryHouse(t)) s += 10;
  s += magazinePrestige(item);
  if ((item.buzz || 1) > 1) s += Math.min(16, ((item.buzz || 1) - 1) * 4);
  if (/\b(celebrity|звезд|знаменит|actor|actress|singer)\b/i.test(t) && bucket !== "celeb" && s < 4) s -= 4;
  if (agency && !star) s -= 4;
  return s + demandScore(item);
}

function recentBucketsFromLog(): NewsBucket[] {
  try {
    const log = loadLog();
    return log.posts.slice(-12).map((p) => {
      const t = `${p.title} ${p.text || ""}`.toLowerCase();
      if (/\b(звезд|знаменит|red carpet|ковров|актрис|а-лист|celebrity|голливуд|премьер)\b/i.test(t)
        || RU_CELEB_RE.test(t) || INTL_CELEB_RE.test(t)) return "celeb" as NewsBucket;
      if (/\b(img models|elite model|ford models|models\.com|dna models|the lions|wilhelmina)\b/i.test(t)) return "models" as NewsBucket;
      if (/\b(тренд|trend|it bag|chrome nails)\b/i.test(t)) return "trend" as NewsBucket;
      if (/\b(маникюр|ногт|френч|гель-лак)\b/i.test(t)) return "nails" as NewsBucket;
      if (/\b(стрижк|волос|балаяж|окраш|укладк|причёск|прическ)\b/i.test(t)) return "hair" as NewsBucket;
      if (/\b(макияж|уход|кожа|космети)\b/i.test(t)) return "beauty" as NewsBucket;
      return "fashion" as NewsBucket;
    });
  } catch {
    return [];
  }
}

/** Слот дня: 2 women + 1 men (Москва). */

function moscowNowParts(): { hour: number; ymd: string } {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "numeric", hour12: false }).format(new Date()),
    10,
  );
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { hour, ymd };
}

/** Фиксированный план: 08 и 16 — звёзды; 00 — маникюр/волосы/одежда. */
function slotKindForCronHour(_hour: number): DaySlotKind {
  return "women";
}

function todayAudienceCounts(): { women: number; men: number; celeb: number } {
  const { ymd } = moscowNowParts();
  try {
    const log = loadLog();
    let women = 0;
    let men = 0;
    let celeb = 0;
    for (const p of log.posts) {
      const ts = p.ts ? new Date(p.ts) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      const postYmd = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(ts);
      if (postYmd !== ymd) continue;
      if (p.audience === "men") men++;
      else if (p.audience === "celeb" || p.niche === "celeb") celeb++;
      else women++;
    }
    return { women, men, celeb };
  } catch {
    return { women: 0, men: 0, celeb: 0 };
  }
}

/** Для --once: добрать до 2 women + 1 men за московский день. */
function resolveDaySlot(forced?: DaySlotKind): DaySlotKind {
  if (forced) return forced;
  const { hour } = moscowNowParts();
  if ([0, 8, 16].includes(hour)) return slotKindForCronHour(hour);
  const { women, men } = todayAudienceCounts();
  if (women < 2) return "women";
  if (men < 1) return "men";
  return "women";
}

function pickPreferredBucket(_recent: NewsBucket[], _slot: DaySlotKind): NewsBucket {
  return "celeb";
}

function recentCelebRegionsFromLog(): CelebRegion[] {
  try {
    const log = loadLog();
    return log.posts.slice(-8).map((p) => {
      const t = `${p.title} ${p.text || ""}`.toLowerCase();
      if (RU_CELEB_RE.test(t) || /\b(российск|отечественн|наших зв)\b/i.test(t)) return "ru" as CelebRegion;
      if (INTL_CELEB_RE.test(t) || /\b(голливуд|red carpet|met gala|oscar|зарубежн)\b/i.test(t)) return "intl" as CelebRegion;
      return "none" as CelebRegion;
    }).filter((r) => r !== "none");
  } catch {
    return [];
  }
}

function newsTitleOverlap(a: FeedItem, b: FeedItem): boolean {
  const na = extractCelebNameHint(a).toLowerCase();
  const nb = extractCelebNameHint(b).toLowerCase();
  if (na && nb && (na.includes(nb) || nb.includes(na))) return true;
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4);
  const wa = new Set(words(a.title));
  let hit = 0;
  for (const w of words(b.title)) if (wa.has(w)) hit++;
  return hit >= 2;
}

type ScoredNews = {
  it: FeedItem;
  score: number;
  ts: number;
  bucket: NewsBucket;
  region: CelebRegion;
};

function scoreFreshCandidates(
  items: FeedItem[],
  maxAgeDays: number,
  published: Set<string>,
): ScoredNews[] {
  const cutoff = Date.now() - maxAgeDays * 86400_000;
  return items
    .filter((it) => !published.has(it.link))
    .filter((it) => isChannelNews(it))
    .filter((it) => {
      const t = new Date(it.pubDate).getTime();
      return !isNaN(t) && t >= cutoff;
    })
    .map((it) => ({
      it,
      score: fashionScore(it),
      ts: new Date(it.pubDate).getTime(),
      bucket: newsBucket(it),
      region: celebRegion(it),
    }))
    .filter((c) => c.score >= 4)
    .sort((a, b) => (b.score - a.score) || (b.ts - a.ts));
}

function pickLeadFromPreferred(preferred: ScoredNews[]): FeedItem {
  const photoFirst = [...preferred].sort((a, b) => {
    const pa = PREMIUM_PHOTO_RE.test(a.it.source) ? 1 : 0;
    const pb = PREMIUM_PHOTO_RE.test(b.it.source) ? 1 : 0;
    return pb - pa || b.score - a.score || b.ts - a.ts;
  });
  return photoFirst[0].it;
}

function pickFreshNews(
  items: FeedItem[],
  maxAgeDays: number,
  published: Set<string>,
  slot: DaySlotKind = "women",
): FeedItem | null {
  return pickFreshNewsPack(items, maxAgeDays, published, slot)?.stories[0] ?? null;
}

/** Три разные модные новости — не «главная + случайные ссылки». */
function pickFreshNewsPack(
  items: FeedItem[],
  maxAgeDays: number,
  published: Set<string>,
  slot: DaySlotKind = "women",
): { stories: FeedItem[] } | null {
  const lane = contentLane(slot);
  const all = scoreFreshCandidates(items, maxAgeDays, published).filter((c) => c.score >= 4);
  const laneHits = all.filter((c) => matchesLane(c.it, lane));
  let candidates = laneHits.length ? laneHits : all;
  if (lane === "star" || lane === "men") {
    candidates = [...candidates].sort(
      (a, b) => (b.score + starInterestBoost(b.it)) - (a.score + starInterestBoost(a.it)) || (b.ts - a.ts),
    );
  }
  if (candidates.length < 3) {
    candidates = scoreFreshCandidates(items, Math.max(maxAgeDays, 5), published).filter((c) => c.score >= 3);
    if (lane === "star" || lane === "men") {
      candidates = [...candidates].sort(
        (a, b) => (b.score + starInterestBoost(b.it)) - (a.score + starInterestBoost(a.it)) || (b.ts - a.ts),
      );
    }
  }
  if (!candidates.length) return null;

  const picked: ScoredNews[] = [];
  const usedNames = new Set<string>();
  const usedBuckets = new Set<string>();

  const tryTake = (c: ScoredNews, wantMix: boolean) => {
    if (picked.length >= 6) return;
    if (picked.some((p) => p.it.link === c.it.link)) return;
    const name = extractCelebNameHint(c.it).toLowerCase();
    if (name && usedNames.has(name)) return;
    if (wantMix && picked.length > 0 && usedBuckets.has(c.bucket)) {
      const leftover = candidates.some((x) => {
        if (picked.some((p) => p.it.link === x.it.link)) return false;
        const xn = extractCelebNameHint(x.it).toLowerCase();
        if (xn && usedNames.has(xn)) return false;
        return !usedBuckets.has(x.bucket);
      });
      if (leftover) return;
    }
    picked.push(c);
    if (name) usedNames.add(name);
    usedBuckets.add(c.bucket);
  };

  if (lane === "beauty") {
    for (const c of candidates.filter((x) => newsBucket(x.it) === "nails" || isLookbookNews(x.it) && /маникюр|ногт|nail/i.test(`${x.it.title} ${x.it.description}`))) tryTake(c, true);
    for (const c of candidates.filter((x) => isHairStyleNews(x.it) || newsBucket(x.it) === "hair")) tryTake(c, true);
    for (const c of candidates.filter((x) => isWardrobeTrendNews(x.it) || newsBucket(x.it) === "fashion")) tryTake(c, true);
  } else {
    for (const c of candidates.filter((x) => isStarStyleNews(x.it))) tryTake(c, true);
  }
  for (const c of candidates.filter((x) => matchesLane(x.it, lane))) tryTake(c, true);
  for (const c of candidates) tryTake(c, false);
  const need = 3;
  if (picked.length < need) return null;
  return { stories: picked.slice(0, 6).map((c) => c.it) };
}

function topicPhotoHints(item: FeedItem): string[] {
  const t = `${item.title} ${item.description}`.toLowerCase();
  const hints: string[] = [];
  if (/\b(nail|manicure|ногт|маникюр|педикюр)\b/i.test(t)) {
    hints.push("nail", "manicure", "hand", "finger", "polish", "ногт", "маникюр", "close-up", "closeup");
  }
  if (/\b(hair|причёск|прическ|стрижк|укладк)\b/i.test(t)) hints.push("hair", "hairstyle", "blowout");
  if (/\b(dress|gown|outfit|carpet|плать|образ|suit|tuxedo)\b/i.test(t)) {
    hints.push("dress", "gown", "carpet", "outfit", "look", "red-carpet");
  }
  if (/\b(serum|lipstick|mascara|skincare|makeup|fragrance|bronzer|помад|сыворотк|тушь|аромат)\b/i.test(t)) {
    hints.push("product", "beauty", "makeup", "campaign", "bottle");
  }
  return hints;
}

function upgradeImageUrl(url: string): string {
  let u = String(url || "").trim().replace(/&amp;/g, "&");
  if (/\.(jpe?g|png|webp)\?crop$/i.test(u)) u = u.split("?")[0];
  if (/hearstapps\.com\/hmg-prod\/images\/[a-z0-9-]+$/i.test(u)) u += ".jpg";
  return u
    .replace(/([?&]width=)\d+/i, "$11600")
    .replace(/([?&]w=)\d+/i, "$11600")
    .replace(/w_\d+/i, "w_1600")
    .replace(/\/\d{2,3}x\d{2,3}\//, "/1600x2400/");
}

function imageUrlVariants(url: string): string[] {
  const u = upgradeImageUrl(url);
  const out = [u];
  if (/hearstapps\.com/i.test(u) && !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) {
    out.push(`${u}.jpg`, `${u}?resize=1600:*`);
  }
  if (/\.jpg$/i.test(u)) out.push(`${u}?resize=1600:*`);
  return [...new Set(out)];
}

function scoreCandidateImage(
  url: string,
  alt: string,
  hints: string[],
  mode: "portrait" | "detail" | "look" = "portrait",
  celebName = "",
): number {
  const u = `${url} ${alt}`.toLowerCase();
  if (!url || !/^https?:\/\//i.test(url)) return -20;
  if (/\b(logo|sprite|icon|avatar|1x1|pixel|share-button|placeholder|default-og|favicon)\b/i.test(u)) return -10;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return -8;
  if (/storefront|shop-window|mannequin|boutique|window-display|store-window|retail/.test(u)) return -12;
  let s = 1;
  for (const h of hints) if (u.includes(h)) s += 4;
  if (/vader-prod|product-images|amazonaws\.com\/product/i.test(u)) s -= 22;
  const bits = String(celebName || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((n) => n.length > 3);
  for (const n of bits) if (u.includes(n)) s += 12;
  if (mode === "look") {
    if (/full.?body|full.?length|full-length|3-?4|red.?carpet|street.?style|standing|outfit|gown|skirt/.test(u)) s += 12;
    if (/headshot|close-?up|portrait|face-only|mugshot|crop|bust|waist/.test(u)) s -= 14;
  } else if (mode === "portrait") {
    if (/portrait|red.?carpet|getty|headshot|face|celeb|star/.test(u)) s += 8;
    if (alt === "og" || alt === "twitter" || alt === "rss" || alt === "research") s += 6;
    if (/nail|manicure|hand|finger|polish|product/.test(u)) s -= 10;
  } else {
    if (/nail|manicure|hand|finger|polish|ногт|dress|gown|outfit|fabric|look/.test(u)) s += 10;
    if (alt === "og" && !/nail|manicure|hand|dress|gown|outfit/.test(u)) s -= 5;
  }
  const dim = url.match(/(\d{3,4})x(\d{3,4})/) || url.match(/width[=_](\d{3,4})/i);
  if (dim) {
    const n = parseInt(dim[1], 10);
    if (n >= 1000) s += 3;
    else if (n < 240) s -= 6;
  }
  return s;
}

function looksLikeImageUrl(url: string): boolean {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(u)) return true;
  if (/\/photos\/|assets\.|cloudinary|imgix|\/image\/upload\/|media\.hearst|hearstapps|hmg-prod|static\./i.test(u)) return true;
  if (/\.(html?|php|aspx?)(\?|$)/i.test(u)) return false;
  if (/harpersbazaar\.com\/.+\/a\d+\//i.test(u)) return false;
  if (/vogue\.com\/article\//i.test(u)) return false;
  if (/elle\.com\/.+\/a\d+\//i.test(u)) return false;
  return false;
}

function extractLabeledUrl(text: string, label: string): string {
  const re = new RegExp(`${label}:\\s*(https?:\\/\\/\\S+)`, "i");
  const u = String(text || "").match(re)?.[1]?.replace(/[),.;]+$/, "") || "";
  return looksLikeImageUrl(u) ? u : "";
}

function extractPhotoUrlFromText(text: string): string {
  const lines = String(text || "").split(/\s+/);
  const labeled = String(text || "").match(/PHOTO_URL:\s*(https?:\/\/\S+)/i)?.[1]?.replace(/[),.;]+$/, "") || "";
  if (labeled && looksLikeImageUrl(labeled)) return labeled;
  for (const tok of lines) {
    const u = tok.replace(/[),.;]+$/, "");
    if (looksLikeImageUrl(u)) return u;
  }
  return labeled && /^https?:\/\//i.test(labeled) ? labeled : "";
}

function isImageBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 24) return false;
  const head = buf.slice(0, 80).toString("utf8").toLowerCase();
  if (head.includes("<html") || head.includes("<!doctype") || head.includes("<?xml")) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return true;
  if (buf.slice(4, 8).toString("ascii") === "ftyp") return true;
  return false;
}

async function materializeImage(buf: Buffer, dest: string): Promise<string> {
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.slice(0, 4).toString("ascii") === "RIFF";
  if (jpeg || png || webp) {
    fs.writeFileSync(dest, buf);
    return dest;
  }
  const tmp = `${dest}.bin`;
  fs.writeFileSync(tmp, buf);
  try {
    await runCmd("ffmpeg", ["-y", "-i", tmp, "-q:v", "2", dest]);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
  if (!fs.existsSync(dest)) throw new Error("ffmpeg could not convert image");
  return dest;
}

/** Кадр должен совпадать с текстом: звезда в ЭТОМ наряде / эта новинка. Иначе пост не выходит. */
async function photoMatchesStory(filePath: string, story: DigestStory): Promise<boolean> {
  const preview = `${filePath}.v.jpg`;
  try {
    await runCmd("ffmpeg", ["-y", "-i", filePath, "-vf", "scale=480:-1", "-q:v", "6", preview]);
  } catch {
    return false;
  }
  let b64 = "";
  try {
    b64 = fs.readFileSync(preview).toString("base64");
  } finally {
    try {
      fs.unlinkSync(preview);
    } catch {
      /* ignore */
    }
  }
  if (!b64) return false;
  const lookBits = `${story.kicker} ${String(story.line || "").slice(0, 220)}`.replace(/\s+/g, " ").trim();
  const expect =
    story.angle === "nails"
      ? `ультрареалистичный крупный план ЖИВЫХ ухоженных женских рук с ИДЕАЛЬНЫМ салонным маникюром «${story.kicker}»: влажная кожа, чистая ровная кутикула, гладкие пластины, ровный глянцевый лак, без заусенцев и сухости. YES только если ногти — главное на кадре и руки выглядят как Vogue beauty. NO если сухая/шелушащаяся кожа, грязь, обгрызенные ногти, деформированные пальцы, пластик/CGI-кукла, телефонный любительский кадр, флакон вместо рук, лицо, группа, бумага, Amazon`
      : story.kind === "product"
      ? `крупно виден сам предмет новости «${story.kicker}» / ${story.name}: флакон, тюбик. YES только если это ГЛАВНОЕ на кадре. NO если бумага, папка, стол, пресс-кит, скриншот, витрина, лицо без средства`
      : storyNeedsFullLook(story)
      ? `это ${story.name} в полном наряде «${lookBits}»: полный рост или 3/4, видно лицо И весь костюм, включая низ (юбка, брюки, ремни, обувь), если они названы в тексте. YES только если по фото можно проверить каждую вещь из описания. NO если кадр по пояс, только топ, низ обрезан, юбки/брюк/обуви не видно, только лицо, группа, витрина, манекен, другой человек, бумага, скриншот`
      : `человек ${story.name} НАДЕЛ этот наряд «${story.kicker}»: видно и лицо, и одежду/кампанию. YES как в эталоне Деми Ловато — она в том платье, о котором текст. NO если только лицо, только ноги, группа где наряд не читается, витрина, манекен, другой человек, логотип агентства без образа, бумага, скриншот`;
  try {
    const r = await polza.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Ответь одним словом YES или NO. На фото ${expect}? NO — если витрина, манекен, магазин, другой человек, дети, бумага, папка, документ, стол, пресс-кит, скриншот, логотип, пустой интерьер.`,
            },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
      max_tokens: 8,
      temperature: 0,
    } as any);
    const ans = String(r.choices?.[0]?.message?.content || "").trim();
    console.log(`[Hermes] vision ${story.name}: ${ans}`);
    return /^yes\b/i.test(ans);
  } catch (e) {
    console.warn("[Hermes] vision failed:", (e as Error).message.slice(0, 140));
    return false;
  }
}

/** Перед отзывом эксперт смотрит в сети дом моды, крой и тренды сезона. */
async function researchHouseAndTrends(story: DigestStory): Promise<string> {
  const house = matchingLuxuryHouses(`${story.name} ${story.kicker} ${story.line}`)[0];
  const q = house
    ? `Дом моды ${house.name}. Образ: ${story.name} — ${story.kicker}. ${String(story.line || "").slice(0, 280)}`
    : `Образ: ${story.name} — ${story.kicker}. ${String(story.line || "").slice(0, 280)}`;
  try {
    const r = await polza.chat.completions.create({
      model: SEARCH_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Ты fashion-исследователь с живым поиском. Смотришь дом моды, силуэт, ткань, актуальные тренды одежды и стритстайл. Только свежие факты на русском. Не выдумывай.",
        },
        {
          role: "user",
          content:
            `Посмотри в интернете СЕЙЧАС всё по этому выходу, дому моды и стилю одежды.\n` +
            `${q}\n\n` +
            `Нужно коротко:\n` +
            `1) чем дом узнают и что у него сейчас в коллекциях / кампаниях;\n` +
            `2) как этот крой, ткань и силуэт стоят в трендах сезона;\n` +
            `3) что похожее носят звёзды и в стритстайле;\n` +
            `4) что уже приелось или спорно.\n` +
            `Только то, что есть в источниках. На русском.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 900,
      ...searchCallExtras("medium"),
    } as any);
    const content = String(r.choices?.[0]?.message?.content || "").trim();
    const cites = searchCitations(r);
    const packed = [content, cites ? `Цитаты: ${cites}` : ""].filter(Boolean).join("\n\n").slice(0, 2500);
    if (packed.length >= 80) {
      console.log(`[Hermes] trend research ${story.name}: ${packed.length} chars`);
      return packed;
    }
  } catch (e) {
    console.warn("[Hermes] trend research failed:", (e as Error).message.slice(0, 140));
  }
  return "";
}

/** Журналист смотрит на кадр и пишет живое мнение — отдельно от новости. */
async function writeLookReview(filePath: string, story: DigestStory, trendResearch = ""): Promise<DigestStory> {
  const preview = `${filePath}.r.jpg`;
  try {
    await runCmd("ffmpeg", ["-y", "-i", filePath, "-vf", "scale=720:-1", "-q:v", "4", preview]);
  } catch {
    return story;
  }
  let b64 = "";
  try {
    b64 = fs.readFileSync(preview).toString("base64");
  } finally {
    try {
      fs.unlinkSync(preview);
    } catch {
      /* ignore */
    }
  }
  if (!b64) return story;
  const facts = [story.name, story.kicker, story.line].filter(Boolean).join(" · ");
  const prompt =
    `Ты мужчина-стилист. Пишешь ТОЛЬКО личное мнение, не новость. Новость уже написана отдельно.\n` +
    `СНАЧАЛА СМОТРИ ФОТО. Потом опирайся на тренды из поиска. Журнал врёт — верь глазам.\n` +
    `Якорь фактов (не повторяй их как сводку): ${facts}\n` +
    (trendResearch
      ? `Что сейчас в интернете про этот дом, крой и тренды:\n${trendResearch.slice(0, 1600)}\n`
      : "") +
    `opinion — 3–5 живых предложений от первого лица: зашло / спорно / холодно и ПОЧЕМУ, глядя на кадр и на тренд. Можно тихий юмор, 2–4 стикера-эмодзи (😉😅🔥❤️✨😏), как человек в чате, не как пресс-релиз.\n` +
    `Не пересказывай новость. Не пиши «как эксперт отмечу». Просто говори.\n` +
    `ЗАПРЕЩЕНО: «Вау», «Девочки, вы готовы», «лаконичный выход», «эффектные платья», «по ссылке ниже», голосование «что выберете», 😂😂, мат, пошлость.\n` +
    `kicker оставь близким к исходному. how — короткий совет на неделю, не опрос.\n` +
    `Только русский. Не выдумывай бренды.\n` +
    `JSON: {"kicker":"4-8 слов","opinion":"живое мнение со стикерами","how":"что взять на неделю"}`;
  const models = [REVIEW_MODEL, TEXT_MODEL].filter((m, i, a) => m && a.indexOf(m) === i);
  for (const model of models) {
    try {
      const r = await polza.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
            ],
          },
        ],
        temperature: 1.0,
        max_tokens: 900,
        response_format: { type: "json_object" } as any,
      } as any);
      const hit = parseStoryJson(r.choices?.[0]?.message?.content || "{}");
      const opinion = ruLine(String(hit?.opinion || hit?.line || ""), "");
      const next: DigestStory = {
        ...story,
        kicker: ruLine(String(hit?.kicker || ""), story.kicker),
        line: story.line,
        how: ruLine(String(hit?.how || ""), story.how),
        opinion,
      };
      if (opinion.length >= 60 && !/мне зашло \/ спорно|как эксперт отмечу/i.test(opinion)) {
        console.log(`[Hermes] look review ${model}: ${next.kicker}`);
        return next;
      }
    } catch (e) {
      console.warn(`[Hermes] look review ${model}:`, (e as Error).message.slice(0, 140));
    }
  }
  return story;
}

/** Живой итог под постом: человек увидел кадры и спрашивает людей. */
async function writeDigestVoice(stories: DigestStory[], photoPath: string): Promise<string> {
  const names = stories.map((s) => `${s.name}: ${s.kicker}`).filter((x) => x.length > 2).join(" · ");
  const preview = `${photoPath}.v2.jpg`;
  let b64 = "";
  try {
    await runCmd("ffmpeg", ["-y", "-i", photoPath, "-vf", "scale=720:-1", "-q:v", "4", preview]);
    b64 = fs.readFileSync(preview).toString("base64");
  } catch {
    b64 = "";
  } finally {
    try {
      fs.unlinkSync(preview);
    } catch {
      /* ignore */
    }
  }
  const recent = recentDigestVoices();
  const move = pickVoiceMove();
  const prompt =
    `Ты мужчина-стилист в чате, только что посмотрел эти три выхода: ${names}.\n` +
    `Это блок «Мнение эксперта» внизу поста «Мода, о которой сейчас говорят». Не новость — личное мнение по всем трём историям.\n` +
    `Пиши как живой человек: тепло, чуть иронично, со стикерами-эмодзи (2–5 штук: 😉😅🔥❤️✨😏🙈).\n` +
    `4–6 предложений по-русски. Пройдись по каждому из трёх: что зашло и что мимо.\n` +
    `Сегодня ход общения: ${move}.\n` +
    `Можно спросить людей как знакомых, без конкурса и без «что выберете».\n` +
    `Настроение (не копируй): «этот силуэт мне не очень зашёл — слишком театрально; если вам тоже мимо, напишите, я не обижусь 😉».\n` +
    `Запрещено: мат, пошлость, шутки про тело, оскорбления, голосование «что выберете», 😂😂, ха-ха, анекдот, «девочки вы готовы», канцелярит «как эксперт отмечу».\n` +
    (recent.length ? `Не повторяй эти недавние концовки: ${recent.slice(-4).join(" | ").slice(0, 900)}\n` : "") +
    `Только текст, без JSON и без заголовка.`;
  const content: any[] = [{ type: "text", text: prompt }];
  if (b64) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await polza.chat.completions.create({
        model: REVIEW_MODEL || TEXT_MODEL,
        messages: [{ role: "user", content }],
        temperature: 1.15,
        max_tokens: 450,
      } as any);
      const text = ruLine(String(r.choices?.[0]?.message?.content || "").replace(/\s+/g, " ").trim(), "");
      if (text.length >= 60 && !isFlatVoice(text)) return text.slice(0, 900);
    }
  } catch (e) {
    console.warn("[Hermes] digest voice failed:", (e as Error).message.slice(0, 140));
  }
  return "";
}

async function extractArticleImages(link: string): Promise<Array<{ url: string; alt: string }>> {
  const out: Array<{ url: string; alt: string }> = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(link, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    } as any);
    clearTimeout(timer);
    if (!r.ok) return out;
    const html = await r.text();
    const push = (raw: string, alt = "") => {
      try {
        const url = new URL(decodeXmlEntities(raw).replace(/&amp;/g, "&").trim(), link).href;
        if (url.startsWith("http")) out.push({ url, alt });
      } catch {
        /* skip */
      }
    };
    const og =
      html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1] ||
      html.match(/property=["']og:image:url["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (og) push(og, "og");
    const tw = html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (tw) push(tw, "twitter");
    const imgRe = /<img\b([^>]+)>/gi;
    let m: RegExpExecArray | null;
    while ((m = imgRe.exec(html)) !== null) {
      const tag = m[1];
      const src = tag.match(/\b(?:src|data-src|data-original)=["']([^"']+)["']/i)?.[1] || "";
      const alt = tag.match(/\balt=["']([^"']*)["']/i)?.[1] || "";
      if (src && !src.startsWith("data:")) push(src, alt);
      if (out.length > 10) break;
    }
  } catch (e) {
    console.warn("[Hermes] article images failed:", (e as Error).message);
  }
  return out;
}

async function rankStoryPhotos(
  item: FeedItem,
  research = "",
  mode: "portrait" | "detail" | "look" = "portrait",
): Promise<string[]> {
  const hints = topicPhotoHints(item);
  const fromResearch =
    (mode === "detail"
      ? extractLabeledUrl(research, "DETAIL_URL")
      : extractLabeledUrl(research, "PORTRAIT_URL")) || extractPhotoUrlFromText(research);
  const extraPages = [item.link];
  if (fromResearch && !looksLikeImageUrl(fromResearch)) extraPages.push(fromResearch);
  const scraped: Array<{ url: string; alt: string }> = [];
  for (const page of extraPages) {
    scraped.push(...(await extractArticleImages(page)));
  }
  const name = extractCelebNameHint(item);
  const nameBits = name
    .toLowerCase()
    .split(/\s+/)
    .filter((n) => n.length > 3);
  const pool = [
    ...(fromResearch && looksLikeImageUrl(fromResearch) ? [{ url: fromResearch, alt: "research" }] : []),
    ...(item.image && looksLikeImageUrl(item.image) ? [{ url: item.image, alt: "rss" }] : []),
    ...scraped,
  ]
    .map((x) => ({ ...x, url: upgradeImageUrl(x.url) }))
    .filter((x) => {
      if (mode !== "portrait") return true;
      if (["og", "twitter", "rss", "research"].includes(x.alt)) return true;
      const blob = `${x.url} ${x.alt}`.toLowerCase();
      return nameBits.some((n) => blob.includes(n));
    });
  const seen = new Set<string>();
  const min = mode === "portrait" ? 4 : 0;
  return pool
    .sort(
      (a, b) =>
        scoreCandidateImage(b.url, b.alt, hints, mode, name) - scoreCandidateImage(a.url, a.alt, hints, mode, name),
    )
    .filter((x) => {
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return scoreCandidateImage(x.url, x.alt, hints, mode, name) >= min;
    })
    .map((x) => x.url)
    .slice(0, 8);
}

/** Фото звезды можно взять из другого журнала — внизу будет ссылка. */
async function findStarPhotosElsewhere(story: DigestStory, item: FeedItem): Promise<{ urls: string[]; source?: string }> {
  const hint = extractCelebNameHint(item) || story.name;
  if (!hint || /новинка бьюти/i.test(story.name)) return { urls: [] };
  try {
    const r = await polza.chat.completions.create({
      model: SEARCH_MODEL,
      messages: [
        {
          role: "user",
          content:
            `Найди 3 прямые ссылки на фото (jpg/png/webp), где ВИДНА звезда или модель ${story.name} / ${hint} в образе: ${story.kicker}.\n` +
            `Новость: ${item.title}\n` +
            `Нужен полный рост или 3/4: лицо и ВЕСЬ наряд, включая юбку/брюки/обувь, если они в описании. Не кадр по пояс.\n` +
            `Можно Getty, Vogue, ELLE, Bazaar, People, GQ — не обязательно та же статья.\n` +
            `Не витрина, не манекен, не Amazon, не другой человек.\n` +
            `Ответ только:\nPHOTO_1: https://...\nPHOTO_2: https://...\nPHOTO_3: https://...\nPHOTO_SOURCE: https://страница источника кадра`,
        },
      ],
      temperature: 0.1,
      max_tokens: 800,
      ...searchCallExtras("medium"),
    } as any);
    const text = String(r.choices?.[0]?.message?.content || "");
    const urls = ["PHOTO_1", "PHOTO_2", "PHOTO_3"]
      .map((lab) => extractLabeledUrl(text, lab))
      .filter(Boolean);
    for (const tok of text.split(/\s+/)) {
      const u = tok.replace(/[),.;]+$/, "");
      if (looksLikeImageUrl(u) && !urls.includes(u)) urls.push(u);
    }
    const source = String(text.match(/PHOTO_SOURCE:\s*(https?:\/\/\S+)/i)?.[1] || "").replace(/[),.;]+$/, "");
    return { urls: urls.slice(0, 5), source: source || undefined };
  } catch (e) {
    console.warn("[Hermes] extra star photo search failed:", (e as Error).message.slice(0, 140));
    return { urls: [] };
  }
}

async function findProductPhotos(story: DigestStory, item: FeedItem): Promise<{ urls: string[]; source?: string }> {
  try {
    const r = await polza.chat.completions.create({
      model: SEARCH_MODEL,
      messages: [
        {
          role: "user",
          content:
            `Найди 3 прямые ссылки на фото продукта (jpg/png/webp): ${story.name} — ${story.kicker}.\n` +
            `Новость: ${item.title}\nСтатья: ${item.link}\n` +
            `Нужна упаковка / флакон / станок крупно, не человек и не витрина одежды.\n` +
            `Ответ только:\nPHOTO_1: https://...\nPHOTO_2: https://...\nPHOTO_SOURCE: https://...`,
        },
      ],
      temperature: 0.1,
      max_tokens: 700,
      ...searchCallExtras("low"),
    } as any);
    const text = String(r.choices?.[0]?.message?.content || "");
    const urls = ["PHOTO_1", "PHOTO_2", "PHOTO_3"]
      .map((lab) => extractLabeledUrl(text, lab))
      .filter(Boolean);
    for (const tok of text.split(/\s+/)) {
      const u = tok.replace(/[),.;]+$/, "");
      if (looksLikeImageUrl(u) && !urls.includes(u)) urls.push(u);
    }
    const source = String(text.match(/PHOTO_SOURCE:\s*(https?:\/\/\S+)/i)?.[1] || "").replace(/[),.;]+$/, "");
    return { urls: urls.slice(0, 5), source: source || undefined };
  } catch (e) {
    console.warn("[Hermes] product photo search failed:", (e as Error).message.slice(0, 140));
    return { urls: [] };
  }
}

function rssResearchFallback(item: FeedItem): string {
  return [`Заголовок: ${item.title}`, `Издание: ${item.source}`, `Ссылка: ${item.link}`, String(item.description || "").trim()]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2500);
}

async function researchStarLook(item: FeedItem): Promise<string> {
  const angle = storyAngle(item);
  const detailNeed =
    angle === "nails"
      ? "DETAIL_URL: журнальный крупный план ИДЕАЛЬНОГО салонного маникюра (влажная кожа, чистая кутикула, ровные глянцевые ногти). Неухоженные руки, сухость, грязь, Amazon, товарные кадры — нельзя."
      : angle === "style"
        ? "DETAIL_URL: крупный план причёски или макияжа из ЭТОГО выхода."
        : "DETAIL_URL: платье / костюм / образ крупно, ткань и силуэт видны.";
  const user =
    `Найди в интернете факты за последние ${NEWS_MAX_AGE_DAYS} дней про этот выход / тренд / кампанию агентства / маникюр / средство.\n` +
    `Заголовок: ${item.title}\n` +
    `Статья: ${item.link}\n` +
    `Издание: ${item.source}\n` +
    `Кратко в RSS: ${item.description || "нет"}\n\n` +
    `Нужно только то, что есть в источниках: что надето (силуэт, цвет, ткань, бренд латиницей), волосы, макияж, ногти, уход.\n` +
    `Если в образе дом моды (Gucci, Dolce & Gabbana, Chanel, Dior, Louis Vuitton, Prada, Versace и другие топы) — напиши дом, линейку (кутюр / ready-to-wear / сумка) и чем этот дом узнают. Не подставляй Gucci, если его нет в источниках.\n` +
    `Не пиши сплетни, романы, разводы. Не выдумывай кремы и бренды.\n` +
    `Если исходник на английском — факты на русском, без английских фраз.\n` +
    `Если новость старше ${NEWS_MAX_AGE_DAYS} дней — первой строкой STALE.\n` +
    `PORTRAIT_URL: фото ИМЕННО этого выхода: полный рост или 3/4, видно лицо и весь наряд (юбка, брюки, обувь — если они в новости). Не кадр по пояс, не логотип, не витрина, не Amazon.\n` +
    `${detailNeed}\n` +
    `Ответ: короткий список фактов на русском. Затем две строки:\nPORTRAIT_URL: https://...\nDETAIL_URL: https://...`;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await polza.chat.completions.create({
        model: SEARCH_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Ты fashion-исследователь с живым поиском. Берёшь только свежее за 14 дней: образ звезды, тренд, маникюр, уход. Факты на русском. Всегда даёшь прямую ссылку на фото ИМЕННО этого объекта.",
          },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 1400,
        ...searchCallExtras("medium"),
      } as any);
      const content = String(r.choices?.[0]?.message?.content || "").trim();
      const cites = searchCitations(r);
      if (cites) console.log(`[Hermes] Google/web cites: ${cites.split("\n").length}`);
      else console.warn("[Hermes] search without citations — модель могла ответить без живого поиска");
      const packed = [content, cites ? `Цитаты: ${cites}` : ""].filter(Boolean).join("\n\n").slice(0, 4000);
      if (packed.length >= 60) return packed;
      lastErr = "short-answer";
    } catch (e) {
      lastErr = (e as Error).message;
      console.warn(`[Hermes] search try ${attempt + 1}: ${lastErr.slice(0, 120)}`);
      await sleep(1200);
    }
  }
  console.warn(`[Hermes] search fallback to RSS: ${lastErr.slice(0, 80)}`);
  return rssResearchFallback(item);
}

/** Дополнительный поиск свежих тем, если ленты журналов тонкие. */
async function discoverNewsViaSearch(): Promise<FeedItem[]> {
  try {
    const r = await polza.chat.completions.create({
      model: SEARCH_MODEL,
      messages: [
        {
          role: "system",
            content: "Ты fashion-исследователь. Ищи самое читаемое из Вог, Эль, Базар, WWD, Vanity Fair, GQ, People: звезда в наряде, показ, кампания. Без коротких заметок про маникюр, без сплетен и кроссовок.",
        },
        {
          role: "user",
          content:
            `Собери 10 самых читаемых модных новостей за ${NEWS_MAX_AGE_DAYS} дней — то, что люди открывают в журналах, а не первый попавшийся сайт.\n` +
            `Только известные журналы: Vogue, ELLE, Harper's Bazaar, WWD, Vanity Fair, GQ, People, InStyle, Grazia, The Voice.\n` +
            `Приоритет:\n` +
            `• звезда в наряде топ-дома: Gucci, Dolce & Gabbana, Chanel, Dior, Louis Vuitton, Hermès, Prada, Versace, Saint Laurent, Balenciaga, Fendi, Valentino, Bottega Veneta, Loewe, Celine, Givenchy, Burberry, Alexander McQueen, Tom Ford, Armani, Miu Miu;\n` +
            `• показ или новая коллекция этих домов;\n` +
            `• сумка / кампания / кутюр, о котором сейчас говорят.\n` +
            `Не бери: короткие советы про ногти, «что сказать мастеру», сплетни без образа, сериалы, распродажи, кроссовки, подборки «10 лучших».\n` +
            `У каждой — факт и прямая ссылка на статью журнала.\n` +
            `Для каждой новости строго:\n` +
            `ITEM\nTITLE: ...\nURL: https://...\nSOURCE: название журнала или агентства\nDATE: YYYY-MM-DD\nSUMMARY: одно предложение на русском с фактом\n`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1800,
      ...searchCallExtras("high"),
    } as any);
    const text = String(r.choices?.[0]?.message?.content || "");
    const labeled = (block: string, lab: string) => {
      const m = block.match(new RegExp(`${lab}:\\s*(.+)`, "i"));
      return m ? m[1].trim().replace(/[),.;]+$/, "") : "";
    };
    const chunks = text.split(/\bITEM\b/i).slice(1);
    const blocks = chunks.length ? chunks : text.split(/\n(?=TITLE:)/i);
    const items: FeedItem[] = [];
    for (const block of blocks) {
      const title = labeled(block, "TITLE");
      const link = labeled(block, "URL");
      const source = labeled(block, "SOURCE") || "поиск";
      const date = labeled(block, "DATE");
      const summary = labeled(block, "SUMMARY");
      if (!title || !/^https?:\/\//i.test(link) || summary.length < 20) continue;
      const d = date ? new Date(date) : new Date();
      items.push({
        title,
        link,
        description: summary,
        pubDate: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
        source: `Поиск · ${source}`,
      });
    }
    const cites = searchCitations(r);
    console.log(`[Hermes] search discover: ${items.length} items | cites=${cites ? cites.split("\n").length : 0}`);
    return items.slice(0, 10);
  } catch (e) {
    console.warn("[Hermes] search discover failed:", (e as Error).message.slice(0, 140));
    return [];
  }
}

function urlLooksLikeDetail(url: string, angle: DigestStory["angle"]): boolean {
  const u = String(url || "").toLowerCase();
  if (angle === "nails") return /nail|manicure|hand|finger|polish|ногт/.test(u);
  if (angle === "style") return /hair|makeup|beauty|skin|blowout|уклад/.test(u);
  return /dress|gown|outfit|look|carpet|suit|fashion|fabric|runway/.test(u);
}

const DETAIL_IMAGE_MODEL = process.env.HERMES_DETAIL_IMAGE_MODEL || "openai/gpt-5.4-image-2";

function isNailStory(story: DigestStory): boolean {
  if (story.angle === "nails") return true;
  const t = `${story.name} ${story.kicker} ${story.line} ${story.how}`;
  return /\b(маникюр|ногт|френч|гель-лак|nail|manicure)\b/i.test(t);
}

/** Юбка, брюки, ковер, полный образ — кадр по пояс нельзя: в тексте вещь, которой нет на фото. */
function storyNeedsFullLook(story: DigestStory): boolean {
  if (story.kind === "product" || isNailStory(story)) return false;
  const t = `${story.kicker} ${story.line} ${story.how}`;
  return /(юбк|мини-юбк|плать|брюк|джинц|костюм|комбинезон|шорт|каблук|сапог|ботильон|ботфорт|лофер|балетк|обув|полный рост|ковров|наряд|гардероб|ремн|жакет|блейзер|пальто|силуэт|топом|GUIZIO|red carpet)/i.test(
    t,
  );
}

function heroCropMode(story: DigestStory): "face" | "center" | "body" {
  if (isNailStory(story) || story.kind === "product") return "center";
  if (storyNeedsFullLook(story)) return "body";
  return story.kind === "star" ? "face" : "center";
}

async function saveGeneratedUrl(url: string, dest: string): Promise<string> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const b64 = comma >= 0 ? url.slice(comma + 1) : url;
    const buf = Buffer.from(b64, "base64");
    if (!isImageBuffer(buf)) throw new Error("generated data not image");
    if (buf.length < 12000) throw new Error(`generated image too small ${buf.length}`);
    await materializeImage(buf, dest);
    return dest;
  }
  return downloadToFile(url, dest);
}

async function generateGroomedDetail(story: DigestStory): Promise<string> {
  const look = `${story.kicker} ${story.line} ${story.how}`.replace(/\s+/g, " ").slice(0, 280);
  const name = story.name;
  if (story.angle === "nails") {
    return generateImage(
      `Ultra-photorealistic real photograph, Canon 100mm macro, not CGI. ` +
        `Nails STRAIGHT-ON: back of the hand to camera, 4–5 nail plates fully readable from the front, never from the side. ` +
        `No rings, no jewelry. Living skin with pores and real cuticles, not a generated doll hand. ` +
        `Salon manicure: ${look}. Celebrity inspiration only for polish/shape: ${name}. ` +
        `FORBIDDEN: side profile, nail sidewall, dry cuticles, extra fingers, plastic CGI, bottles, face. ` +
        `Portrait 3:4, only the hand and nails.`,
      DETAIL_IMAGE_MODEL,
      "3:4",
    );
  }
  if (story.angle === "style") {
    return generateImage(
      `Ultra-photorealistic beauty editorial close-up of hair and makeup: ${look}. Inspired by ${name}. ` +
        `Luxury magazine, real skin texture, no deformed hands, no logos. Square crop.`,
      DETAIL_IMAGE_MODEL,
    );
  }
  return generateImage(
    `Ultra-photorealistic fashion editorial of the outfit: ${look}. Inspired by ${name}'s recent look. ` +
      `Garment and silhouette clearly visible, luxury magazine lighting, photoreal fabric, no deformed hands, no logos. Square crop.`,
    DETAIL_IMAGE_MODEL,
  );
}

async function makeSalonManicurePhoto(story: DigestStory, dest: string): Promise<string> {
  let lastErr = "salon nails failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = await generateGroomedDetail({ ...story, angle: "nails" });
      await saveGeneratedUrl(url, dest);
      if (await photoMatchesStory(dest, { ...story, angle: "nails" })) {
        console.log(`[Hermes] salon nails generated try ${attempt + 1}`);
        return dest;
      }
      lastErr = "vision reject generated nails";
      console.warn(`[Hermes] generated nails vision reject try ${attempt + 1}`);
    } catch (e) {
      lastErr = (e as Error).message;
      console.warn(`[Hermes] generate nails failed: ${lastErr.slice(0, 140)}`);
    }
  }
  throw new Error(lastErr);
}

function parseStoryJson(content: string): any {
  try {
    return JSON.parse(content || "{}");
  } catch {
    const m = String(content || "").match(/\{[\s\S]*\}/);
    if (!m) return {};
    try {
      return JSON.parse(m[0]);
    } catch {
      return {};
    }
  }
}

function storyFromHit(hit: any, it: FeedItem): DigestStory {
  const angleRaw = String(hit?.angle || "").toLowerCase();
  const angle: DigestStory["angle"] =
    angleRaw === "nails" || angleRaw === "wardrobe" || angleRaw === "style" ? angleRaw : storyAngle(it);
  const kind: DigestStory["kind"] = hit?.kind === "product" || hit?.kind === "star" ? hit.kind : storyKind(it);
  const rawName = String(hit?.name || "").trim();
  const name =
    ruCelebName(rawName, it) ||
    ruCelebName("", it) ||
    ruLine(rawName, "") ||
    (kind === "product" && rawName && rawName.length <= 40 ? rawName : "");
  return {
    name,
    kicker: ruLine(String(hit?.kicker || ""), ""),
    line: ruLine(String(hit?.line || ""), ""),
    how: ruLine(String(hit?.how || ""), ""),
    opinion: ruLine(String(hit?.opinion || ""), ""),
    kind,
    angle,
    link: it.link,
    source: (() => {
      const srcKey = String(it.source || "").replace(/^Поиск · |^Google News[^·]* · /g, "").trim();
      return SOURCE_RU[it.source] || SOURCE_RU[srcKey] || srcKey || "журнал";
    })(),
  };
}

async function writeOneStory(it: FeedItem, research: string): Promise<DigestStory> {
  const empty = storyFromHit({}, it);
  if (!research || research.length < 60) return empty;
  const mustWrite = isStarStyleNews(it) || !!ruCelebName("", it) || isLookbookNews(it);
  const houseCard = luxuryHouseCard(`${it.title}\n${it.description || ""}\n${research}`);
  try {
    const r = await polza.chat.completions.create({
      model: NEWS_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Ты fashion-редактор колонки. Пишешь полный живой сюжет по статье журнала, не короткую справку и не заметку про ногти. Только русский. Дома моды и бренды — латиницей (Gucci, Dolce & Gabbana, Chanel, Dior). Не выдумывай дом, если его нет в фактах. skip: true если нет моды: нет человека/наряда/коллекции/кампании.",
        },
        {
          role: "user",
          content:
            `Заголовок: ${it.title}\nИсточник: ${it.source}\nСсылка: ${it.link}\nФАКТЫ:\n${research}\n\n` +
            (houseCard ? `ДОМ МОДЫ ИЗ ФАКТОВ (это шпаргалка, не реклама; не добавляй другие дома):\n${houseCard}\n\n` : "") +
            `Нужен ПОЛНЫЙ сюжет-НОВОСТЬ, без личного мнения. name — имя по-русски (звезда, дом моды или показ). kicker — 4–8 слов. line — только факты, 3–5 предложений: кто, где, что надето, какой дом латиницей, чем этот дом узнают, почему это сейчас читают, одна живая деталь образа. Не пиши «мне зашло», «спорно», «я думаю» — это будет отдельным блоком эксперта.\n` +
            `how — одно короткое «что взять на эту неделю» в духе этого дома, без салонной инструкции.\n` +
            `Если в фактах нет люкс-дома — не пришивай Gucci. Запрещены: короткие справки, «эффектные платья», «эволюция стиля», «лаконичный выход», «по ссылке ниже».\n` +
            `{"name":"...","kicker":"...","line":"...","how":"...","kind":"star или product","angle":"wardrobe или style или nails","skip":false}`,
        },
      ],
      temperature: 0.35,
      max_tokens: 1800,
      response_format: { type: "json_object" } as any,
    });
    const hit = parseStoryJson(r.choices?.[0]?.message?.content || "{}");
    if (hit?.skip && !mustWrite) return empty;
    const story = storyFromHit({ ...hit, skip: false }, it);
    if (!story.how && story.angle !== "nails") story.how = defaultHow(story.angle, story.kind);
    if (!story.kicker && story.line) story.kicker = story.line.replace(/\s+/g, " ").slice(0, 48).trim();
    return story;
  } catch (e) {
    console.warn("[Hermes] writeOneStory failed:", (e as Error).message.slice(0, 120));
    return empty;
  }
}

async function generateDigestPost(
  items: FeedItem[],
  researches: string[],
  _slot: DaySlotKind = "women",
): Promise<DigestStory[]> {
  const stories: DigestStory[] = [];
  for (let i = 0; i < items.length; i++) {
    const story = await writeOneStory(items[i], researches[i] || "");
    if (isThinStory(story)) {
      console.warn(
        `[Hermes] thin after write: ${items[i].title.slice(0, 60)} | ${thinReason(story)} | k=${String(story.kicker || "").length} l=${String(story.line || "").length} h=${String(story.how || "").length}`,
      );
    }
    stories.push(story);
  }
  return stories;
}

async function publishNewsOnce(slot: DaySlotKind = "women"): Promise<{ ok: boolean; reason?: string; title?: string }> {
  const published = loadPublishedCache();
  const [rssItems, searchItems] = await Promise.all([fetchRssFeeds(), discoverNewsViaSearch()]);
  const items = mergeNewsItems(rssItems, searchItems);
  if (!items.length) return { ok: false, reason: "rss-empty" };
  const pack = pickFreshNewsPack(items, NEWS_MAX_AGE_DAYS, published, slot);
  if (!pack?.stories.length) return { ok: false, reason: "no-fresh-news" };
  const lane = contentLane(slot);
  const storiesIn = pack.stories.slice(0, 6);
  console.log(`[Hermes] digest ${storiesIn.length}: ${storiesIn.map((s) => s.source + " / " + s.title.slice(0, 40)).join(" | ")}`);

  const researches: string[] = [];
  for (const it of storiesIn) {
    let research = "";
    try {
      research = await researchStarLook(it);
      console.log(`[Hermes] search ${SEARCH_MODEL}: ${it.source} ${research.length} chars`);
    } catch (e) {
      console.warn("[Hermes] search failed:", (e as Error).message);
    }
    if (!research || research.length < 60) research = rssResearchFallback(it);
    researches.push(research);
  }

  let stories: DigestStory[];
  try {
    stories = await generateDigestPost(storiesIn, researches, slot);
  } catch (e) {
    console.error("[Hermes] digest text failed:", (e as Error).message);
    return { ok: false, reason: "text-failed" };
  }
  const pairs = stories
    .map((story, i) => ({ story, item: storiesIn[i], research: researches[i] || "" }))
    .filter((p) => p.item && p.story);
  const informative = pairs.filter((p) => {
    if (isThinStory(p.story)) return false;
    if (lane !== "beauty" && p.story.angle === "nails" && p.story.kind !== "star") return false;
    return true;
  });
  for (const p of pairs) {
    if (isThinStory(p.story)) console.warn(`[Hermes] skip thin copy: ${p.story.name || p.item.title} | ${thinReason(p.story)}`);
    else if (lane !== "beauty" && p.story.angle === "nails" && p.story.kind !== "star") {
      console.warn(`[Hermes] skip nail blurb in fashion digest: ${p.story.name || p.item.title}`);
    }
  }
  if (informative.length < 3) {
    console.error(`[Hermes] news NOT published: need 3 fashion stories, got ${informative.length}`);
    return { ok: false, reason: "need-3-news", title: stories[0]?.name || storiesIn[0]?.title };
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const kept: DigestStory[] = [];
  const cells: string[][] = [];
  for (let i = 0; i < informative.length; i++) {
    const it = informative[i].item;
    const story = informative[i].story;
    const research = informative[i].research;
    const shots: string[] = [];
    const needStarPhoto = story.kind === "star";
    const takeShot = async (dest: string, source?: string) => {
      if (shots.length >= 1) return;
      if (shots.includes(dest)) return;
      if (!(await photoMatchesStory(dest, story))) {
        console.warn(`[Hermes] vision reject ${story.name} ${path.basename(dest)}`);
        return;
      }
      shots.push(dest);
      if (source) story.photoLink = source;
    };

    if (!needStarPhoto && isNailStory(story)) {
      try {
        const dest = path.join(PUBLIC_HERMES_DIR, `${id}-p${i}.jpg`);
        await makeSalonManicurePhoto(story, dest);
        await takeShot(dest);
      } catch (e) {
        console.warn("[Hermes] salon generate miss, try magazine:", (e as Error).message.slice(0, 140));
      }
    }
    try {
      const ranked = await rankStoryPhotos(
        it,
        research,
        story.kind === "product" ? "detail" : storyNeedsFullLook(story) ? "look" : "portrait",
      );
      console.log(`[Hermes] photo ${story.kind} ${story.name}: ${ranked[0] ? ranked[0].slice(0, 80) : "none"} (${ranked.length})`);
      for (let u = 0; u < Math.min(8, ranked.length) && shots.length < 1; u++) {
        const dest = path.join(PUBLIC_HERMES_DIR, `${id}-p${i}-${u}.jpg`);
        try {
          await downloadFirst([ranked[u]], dest, it.link);
          await takeShot(dest);
        } catch (e) {
          console.warn("[Hermes] portrait try failed:", (e as Error).message.slice(0, 120));
        }
      }
    } catch (e) {
      console.warn("[Hermes] portrait failed:", (e as Error).message.slice(0, 140));
    }
    if (shots.length < 1) {
      const extra = story.kind === "product" ? await findProductPhotos(story, it) : await findStarPhotosElsewhere(story, it);
      console.log(`[Hermes] extra photos ${story.name}: ${extra.urls.length}`);
      for (let u = 0; u < extra.urls.length && shots.length < 1; u++) {
        const dest = path.join(PUBLIC_HERMES_DIR, `${id}-px${i}-${u}.jpg`);
        try {
          await downloadFirst([extra.urls[u]], dest, extra.source || it.link);
          await takeShot(dest, extra.source);
        } catch (e) {
          console.warn("[Hermes] extra photo failed:", (e as Error).message.slice(0, 120));
        }
      }
    }
    if (!shots.length && !needStarPhoto && isNailStory(story)) {
      try {
        const dest = path.join(PUBLIC_HERMES_DIR, `${id}-p${i}-salon.jpg`);
        await makeSalonManicurePhoto(story, dest);
        await takeShot(dest);
      } catch (e) {
        console.warn("[Hermes] salon generate miss:", (e as Error).message.slice(0, 140));
      }
    }
    if (!shots.length) {
      const house = matchingLuxuryHouses(`${story.name} ${story.kicker} ${story.line} ${it.title} ${research}`)[0];
      if (house) {
        try {
          const imgUrl = await generateImage(
            withEditorialTitle(
              `photoreal magazine editorial of a new ${house.name} look: ${story.kicker}. ${String(story.line || "").slice(0, 220)}. Full outfit, luxury lighting, no celebrity likeness, no fake famous face.`,
              house.name,
              { celebIdentity: false },
            ),
          );
          const dest = path.join(PUBLIC_HERMES_DIR, `${id}-p${i}-house.jpg`);
          await downloadToFile(imgUrl, dest);
          shots.push(dest);
          console.log(`[Hermes] house generate ${house.name}: ${story.name}`);
        } catch (e) {
          console.warn("[Hermes] house generate miss:", (e as Error).message.slice(0, 140));
        }
      }
    }
    if (!shots.length) {
      console.warn(`[Hermes] skip without matching photo: ${story.name}`);
      continue;
    }
    kept.push(story);
    cells.push(shots);
  }

  if (!kept.length || !cells.length) {
    console.error("[Hermes] news NOT published: no matching photo");
    return { ok: false, reason: "no-matching-photo", title: stories[0]?.name };
  }
  const order: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const it = informative.find((p) => p.story === kept[i])?.item;
    if (it && matchesLane(it, lane)) order.push(i);
  }
  for (let i = 0; i < kept.length; i++) if (!order.includes(i)) order.push(i);

  const picked: { story: DigestStory; photos: string[] }[] = [];
  for (const i of order) {
    if (picked.length >= 3) break;
    const photos: string[] = [];
    for (let p = 0; p < cells[i].length; p++) {
      const cropped = await cropHeroPortrait(
        cells[i][p],
        path.join(PUBLIC_HERMES_DIR, `${id}-hero-${i}-${p}.jpg`),
        heroCropMode(kept[i]),
      );
      photos.push(cropped);
    }
    picked.push({ story: kept[i], photos });
  }
  if (!picked.length) {
    console.error("[Hermes] news NOT published: no matching photo");
    return { ok: false, reason: "no-matching-photo", title: stories[0]?.name };
  }
  let padN = 0;
  while (picked.length < 3 && padN < 5) {
    padN += 1;
    const unused = informative.find((p) => p.item && !picked.some((x) => x.story === p.story));
    const s = unused?.story || picked[0].story;
    const it = unused?.item || informative.find((p) => p.story === s)?.item;
    let extraPhoto = "";
    if (it) {
      try {
        const extra = s.kind === "product" ? await findProductPhotos(s, it) : await findStarPhotosElsewhere(s, it);
        for (let u = 0; u < extra.urls.length; u++) {
          const dest = path.join(PUBLIC_HERMES_DIR, `${id}-hero-extra-${padN}-${u}.jpg`);
          try {
            await downloadToFile(extra.urls[u], dest, extra.source || it.link);
            if (await photoMatchesStory(dest, s)) {
              extraPhoto = dest;
              if (extra.source) s.photoLink = extra.source;
              break;
            }
          } catch {
            /* next url */
          }
        }
      } catch (e) {
        console.warn("[Hermes] extra star photo pad failed:", (e as Error).message.slice(0, 120));
      }
    }
    if (!extraPhoto) {
      try {
        const imgUrl = await generateImage(
          withEditorialTitle(
            `photoreal fashion close-up matching this look: ${s.kicker} ${s.line}`.slice(0, 400),
            s.name,
            { celebIdentity: false },
          ),
        );
        const extraDest = path.join(PUBLIC_HERMES_DIR, `${id}-hero-extra-gen-${padN}.jpg`);
        await downloadToFile(imgUrl, extraDest);
        extraPhoto = extraDest;
      } catch (e) {
        console.warn("[Hermes] extra generate pad failed:", (e as Error).message.slice(0, 120));
      }
    }
    if (!extraPhoto) {
      console.warn(`[Hermes] pad ${padN} empty, try next slot`);
      continue;
    }
    const cropped = await cropHeroPortrait(
      extraPhoto,
      path.join(PUBLIC_HERMES_DIR, `${id}-hero-extra-c-${padN}.jpg`),
      heroCropMode(s),
    );
    const slot = picked.find((p) => p.story === s);
    if (slot && !slot.photos.length) slot.photos.push(cropped);
    else if (!slot) picked.push({ story: s, photos: [cropped] });
    else if (picked.length < 3) picked.push({ story: s, photos: [cropped] });
    if (picked.length > 3) picked.length = 3;
  }
  const shown = picked.slice(0, 3);
  const media: string[] = [];
  const seenPhoto = new Set<string>();
  for (const pack of shown) {
    const photo = pack.photos[0];
    if (!photo || seenPhoto.has(photo)) continue;
    seenPhoto.add(photo);
    media.push(photo);
    if (media.length >= 3) break;
  }
  if (media.length < 3) {
    console.error("[Hermes] news NOT published: need three photos");
    return { ok: false, reason: "need-3-photos", title: stories[0]?.name };
  }
  for (let i = 0; i < shown.length; i++) {
    try {
      const trend = await researchHouseAndTrends(shown[i].story);
      shown[i].story = await writeLookReview(media[Math.min(i, media.length - 1)], shown[i].story, trend);
    } catch (e) {
      console.warn("[Hermes] expert review skip:", (e as Error).message.slice(0, 120));
    }
  }
  const shownStories = shown.map((p) => p.story);
  let voice = "";
  try {
    voice = await writeDigestVoice(shownStories, media[0]);
  } catch (e) {
    console.warn("[Hermes] digest voice skip:", (e as Error).message.slice(0, 120));
    voice = "";
  }
  const follow = formatDigestFollowup(shownStories, voice);
  const albumTitle = formatDigestAlbumTeaser(shownStories);

  let tgMessageId: number | null = null;
  let maxMessageId: string | undefined;

  if (!DRY_RUN) {
    if (TG_TOKEN && TG_CHAT_ID) {
      try {
        tgMessageId = await sendTelegramAlbum(media, albumTitle);
        if (tgMessageId && follow) {
          try {
            await sendTelegramMessage(follow, tgMessageId);
          } catch (e) {
            console.warn("[Hermes] digest followup failed:", (e as Error).message.slice(0, 120));
            await sendTelegramMessage(follow);
          }
        }
      } catch (e) {
        console.error("[Hermes] news tg send failed:", (e as Error).message);
      }
    }
    if (MAX_TOKEN && MAX_CHAT_ID) {
      try {
        maxMessageId = (await sendMAXMessage([albumTitle, follow].filter(Boolean).join("\n\n"))) || undefined;
      } catch (e) {
        console.error("[Hermes] news MAX send failed:", (e as Error).message);
      }
    }
  } else {
    console.log("[Hermes] DRY_RUN news:\n", albumTitle, "\n", follow);
  }

  const log = loadLog();
  log.posts.push({
    id,
    ts: new Date().toISOString(),
    kind: "image",
    title: shownStories.map((s) => s.name).join(" · "),
    text: [albumTitle, follow].filter(Boolean).join("\n\n"),
    imagePath: media[0],
    tgMessageId: tgMessageId ?? undefined,
    maxMessageId,
    model: TEXT_MODEL,
    audience: slot === "men" ? "men" : "celeb",
  });
  saveLog(log);

  if (DRY_RUN) {
    return { ok: true, title: shownStories[0]?.name, reason: "dry-run" };
  }
  if (!tgMessageId) {
    console.error("[Hermes] news NOT marked published: Telegram failed or missing");
    return { ok: false, reason: "tg-failed", title: shownStories[0]?.name };
  }
  for (const p of informative.slice(0, 3)) published.add(p.item.link);
  savePublishedCache(published);
  return { ok: true, title: shownStories.map((s) => s.name).join(" · ") };
}

async function generateVideo(prompt: string, imageUrl?: string): Promise<string> {
  const r = await (polza as any).post("/videos/generations", {
    model: VIDEO_MODEL,
    prompt,
    image: imageUrl,
    duration: 5,
    resolution: "720p",
  });
  const url = (r as any)?.data?.[0]?.url || (r as any)?.url || (r as any)?.output?.[0];
  if (!url) {
    console.warn("[Hermes] video response:", JSON.stringify(r).slice(0, 500));
    throw new Error("video generation: no url in response");
  }
  return url;
}

function telegramPreviewOptions(opts?: { preview?: boolean; previewUrl?: string }): Record<string, unknown> {
  const previewOn = Boolean(opts?.preview);
  if (!previewOn) return { link_preview_options: { is_disabled: true } };
  const previewUrl = String(opts?.previewUrl || "").trim();
  return {
    link_preview_options: {
      is_disabled: false,
      ...(previewUrl ? { url: previewUrl } : {}),
      prefer_large_media: true,
      show_above_text: true,
    },
  };
}

async function sendTelegramMessage(
  text: string,
  replyToMessageId?: number | null,
  opts?: { preview?: boolean; previewUrl?: string },
): Promise<number | null> {
  if (!TG_TOKEN || !TG_CHAT_ID) return null;
  const preview = telegramPreviewOptions(opts);
  const payload: Record<string, unknown> = {
    chat_id: TG_CHAT_ID,
    text: text.slice(0, TG_MESSAGE_LIMIT),
    parse_mode: "HTML",
    ...preview,
  };
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok && /parse|entities|html/i.test(String(j.description || ""))) {
    const r2 = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: text.slice(0, TG_MESSAGE_LIMIT),
        ...preview,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
    });
    const j2 = await r2.json();
    if (!j2.ok) throw new Error(`tg sendMessage: ${j2.description}`);
    return j2.result?.message_id ?? null;
  }
  if (!j.ok) throw new Error(`tg sendMessage: ${j.description}`);
  return j.result?.message_id ?? null;
}

/**
 * Фото/видео: если полный текст > 1024 — тизер в подписи + полный пост отдельным сообщением
 * (чтобы психология и остальные блоки не обрезались).
 */
async function sendTelegramMediaWithCaption(
  kind: "image" | "video",
  filePath: string,
  fullCaption: string,
  title: string,
): Promise<number | null> {
  const fits = fullCaption.length <= TG_CAPTION_LIMIT;
  const mediaCaption = fits ? fullCaption : formatPhotoTeaser(title);
  const mid =
    kind === "image"
      ? await sendTelegramPhoto(filePath, mediaCaption)
      : await sendTelegramVideo(filePath, mediaCaption);
  if (!fits && mid) {
    try {
      await sendTelegramMessage(fullCaption, mid);
      console.log(`[Hermes] tg full text sent as reply to message_id=${mid} (len=${fullCaption.length})`);
    } catch (e) {
      console.error("[Hermes] tg full text follow-up failed:", (e as Error).message);
      // fallback: попробовать без reply
      try {
        await sendTelegramMessage(fullCaption);
      } catch (e2) {
        console.error("[Hermes] tg full text fallback failed:", (e2 as Error).message);
      }
    }
  }
  return mid;
}

async function sendTelegramPhoto(filePath: string, caption: string, replyTo?: number | null): Promise<number | null> {
  if (!TG_TOKEN || !TG_CHAT_ID) return null;
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`;
  const isRemote = /^https?:\/\//i.test(filePath);
  const trySend = async (parseMode?: "HTML") => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120000);
    try {
      if (isRemote) {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TG_CHAT_ID,
            photo: filePath,
            caption: caption.slice(0, TG_CAPTION_LIMIT),
            show_caption_above_media: false,
            ...(parseMode ? { parse_mode: parseMode } : {}),
            ...(replyTo ? { reply_to_message_id: replyTo } : {}),
          }),
          signal: ac.signal,
        });
        return await r.json();
      }
      const form = new FormData();
      const buf = fs.readFileSync(filePath);
      form.append("chat_id", TG_CHAT_ID);
      form.append("caption", caption.slice(0, TG_CAPTION_LIMIT));
      form.append("show_caption_above_media", "false");
      if (parseMode) form.append("parse_mode", parseMode);
      if (replyTo) form.append("reply_to_message_id", String(replyTo));
      form.append("photo", new Blob([buf]), path.basename(filePath));
      const r = await fetch(url, { method: "POST", body: form, signal: ac.signal });
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  };
  let j = await trySend("HTML");
  if (!j.ok && /parse|entities|html/i.test(String(j.description || ""))) {
    console.warn("[Hermes] sendPhoto HTML failed, retry without parse_mode:", j.description);
    j = await trySend();
  }
  if (!j.ok) throw new Error(`tg sendPhoto: ${j.description}`);
  const mid = j.result?.message_id ?? null;
  console.log(`[Hermes] tg photo ok message_id=${mid}`);
  return mid;
}

async function sendTelegramAlbum(filePaths: string[], caption: string, itemCaptions?: string[]): Promise<number | null> {
  if (!TG_TOKEN || !TG_CHAT_ID || filePaths.length < 2) return null;
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMediaGroup`;
  const trySend = async (parseMode?: "HTML") => {
    const form = new FormData();
    form.append("chat_id", TG_CHAT_ID);
    const media = filePaths.slice(0, 10).map((fp, i) => {
      const isRemote = /^https?:\/\//i.test(fp);
      const cap = String(itemCaptions?.[i] || (i === 0 ? caption : "") || "").slice(0, TG_CAPTION_LIMIT);
      return {
        type: "photo",
        media: isRemote ? fp : `attach://photo${i}`,
        ...(cap
          ? {
              caption: cap,
              ...(parseMode ? { parse_mode: parseMode } : {}),
            }
          : {}),
      };
    });
    form.append("media", JSON.stringify(media));
    for (let i = 0; i < filePaths.length && i < 10; i++) {
      if (/^https?:\/\//i.test(filePaths[i])) continue;
      const buf = fs.readFileSync(filePaths[i]);
      form.append(`photo${i}`, new Blob([buf]), path.basename(filePaths[i]));
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
      const r = await fetch(url, { method: "POST", body: form, signal: ac.signal });
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  };
  let j = await trySend("HTML");
  if (!j.ok && /parse|entities|html/i.test(String(j.description || ""))) {
    console.warn("[Hermes] sendMediaGroup HTML failed, retry without parse_mode:", j.description);
    j = await trySend();
  }
  if (!j.ok) throw new Error(`tg sendMediaGroup: ${j.description}`);
  const mid = Array.isArray(j.result) ? j.result[0]?.message_id ?? null : j.result?.message_id ?? null;
  console.log(`[Hermes] tg album ok n=${filePaths.length} message_id=${mid}`);
  return mid;
}

/** Альбом: два фото. Если текст длиннее 1024 — тизер к фото, полный пост отдельным сообщением (психолог не обрезается). */
async function sendTelegramAlbumWithCaption(
  filePaths: string[],
  fullCaption: string,
  title: string,
): Promise<number | null> {
  const paths = filePaths.filter(Boolean);
  const full = String(fullCaption || title || "").trim();
  if (paths.length < 2) {
    return paths[0] ? sendTelegramMediaWithCaption("image", paths[0], full, title) : null;
  }
  const fits = full.length <= TG_CAPTION_LIMIT;
  const albumCap = fits ? full : formatPhotoTeaser(title);
  const mid = await sendTelegramAlbum(paths, albumCap);
  if (!fits && mid) {
    try {
      await sendTelegramMessage(full, mid);
      console.log(`[Hermes] tg full text after album id=${mid} len=${full.length}`);
    } catch (e) {
      console.error("[Hermes] tg full text after album failed:", (e as Error).message);
      try {
        await sendTelegramMessage(full);
      } catch (e2) {
        console.error("[Hermes] tg full text fallback failed:", (e2 as Error).message);
      }
    }
  }
  return mid;
}

async function sendTelegramVideo(filePath: string, caption: string): Promise<number | null> {
  if (!TG_TOKEN || !TG_CHAT_ID) return null;
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendVideo`;
  const trySend = async (parseMode?: "HTML") => {
    const form = new FormData();
    const buf = fs.readFileSync(filePath);
    form.append("chat_id", TG_CHAT_ID);
    form.append("caption", caption.slice(0, TG_CAPTION_LIMIT));
    if (parseMode) form.append("parse_mode", parseMode);
    form.append("video", new Blob([buf]), path.basename(filePath));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 180000);
    try {
      const r = await fetch(url, { method: "POST", body: form, signal: ac.signal });
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  };
  let j = await trySend("HTML");
  if (!j.ok && /parse|entities|html/i.test(String(j.description || ""))) {
    console.warn("[Hermes] sendVideo HTML failed, retry without parse_mode:", j.description);
    j = await trySend();
  }
  if (!j.ok) throw new Error(`tg sendVideo: ${j.description}`);
  const mid = j.result?.message_id ?? null;
  console.log(`[Hermes] tg video ok message_id=${mid}`);
  return mid;
}

/**
 * Загрузка файла в MAX → token вложения.
 * Docs: POST /uploads?type=image|video → url → multipart upload → token.
 */
async function uploadMaxMedia(
  filePath: string,
  type: "image" | "video",
): Promise<string | null> {
  if (!MAX_TOKEN) return null;
  const initR = await fetch(`${MAX_API_BASE}/uploads?type=${type}`, {
    method: "POST",
    headers: maxAuthHeaders(),
  });
  const initJ = (await initR.json().catch(() => ({}))) as { url?: string; token?: string; message?: string };
  if (!initR.ok || !initJ.url) {
    console.warn(`[Hermes] MAX uploads init failed: ${initR.status}`, initJ);
    return null;
  }

  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("data", new Blob([buf]), path.basename(filePath));
  const upR = await fetch(initJ.url, { method: "POST", body: form });
  const upJ = (await upR.json().catch(() => ({}))) as {
    token?: string;
    photos?: Record<string, { token?: string }>;
    message?: string;
  };
  if (!upR.ok) {
    console.warn(`[Hermes] MAX upload body failed: ${upR.status}`, upJ);
    return null;
  }

  // image: token в ответе или в photos.*.token; video: token часто уже в init
  let token = upJ.token || initJ.token || "";
  if (!token && upJ.photos && typeof upJ.photos === "object") {
    const first = Object.values(upJ.photos)[0];
    token = first?.token || "";
  }
  if (!token) {
    console.warn("[Hermes] MAX upload: no token in response", upJ);
    return null;
  }
  return token;
}

async function sendMAXMessage(
  caption: string,
  attachment?: { type: "image" | "video"; token: string },
): Promise<string | null> {
  if (!MAX_TOKEN || !MAX_CHAT_ID) return null;
  const text = captionForMax(caption);
  const body: Record<string, unknown> = {
    text,
    format: "html",
    notify: true,
  };
  if (attachment) {
    body.attachments = [{ type: attachment.type, payload: { token: attachment.token } }];
  }

  const url = `${MAX_API_BASE}/messages?chat_id=${encodeURIComponent(MAX_CHAT_ID)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    const r = await fetch(url, {
      method: "POST",
      headers: maxAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const j: any = await r.json().catch(() => ({}));
    // attachment.not.ready — подождать и повторить
    const code = String(j.code || "");
    const errText = String(j.message || j.error || "");
    if (!r.ok && (/attachment\.not\.ready/i.test(code) || /not\.processed|not ready/i.test(errText))) {
      console.warn(`[Hermes] MAX attachment not ready, retry ${attempt + 1}`);
      continue;
    }
    if (!r.ok) {
      console.warn(`[Hermes] MAX send failed: ${r.status}`, j);
      return null;
    }
    const mid = j.message?.body?.mid || j.message?.mid || j.message_id || "ok";
    console.log(`[Hermes] MAX ok message_id=${mid}`);
    return String(mid);
  }
  return null;
}

async function sendMAXPhoto(filePath: string, caption: string): Promise<string | null> {
  if (!MAX_TOKEN || !MAX_CHAT_ID) return null;
  const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(filePath);
  const type: "image" | "video" = isVideo ? "video" : "image";
  const token = await uploadMaxMedia(filePath, type);
  if (!token) return null;
  await sleep(800);
  return sendMAXMessage(caption, { type, token });
}

/**
 * Узнать chat_id канала MAX: long-poll событий, пока бота добавят админом.
 * Запуск: npx tsx hermes.ts --max-discover
 */
async function discoverMaxChatId(timeoutSec = 180): Promise<void> {
  if (!MAX_TOKEN) {
    console.error("[Hermes] Нужен HERMES_MAX_TOKEN в hermes/.env");
    return;
  }
  console.log(
    `[Hermes] MAX discover: жду до ${timeoutSec}с событие bot_added / message_created.\n` +
      `1) Создайте канал в MAX\n` +
      `2) Добавьте бота администратором с правом писать посты\n` +
      `3) chat_id появится здесь — впишите в HERMES_MAX_CHAT_ID`,
  );
  const meR = await fetch(`${MAX_API_BASE}/me`, { headers: maxAuthHeaders() });
  const me = await meR.json().catch(() => ({}));
  console.log("[Hermes] MAX /me:", meR.ok ? me : { status: meR.status, me });

  const deadline = Date.now() + timeoutSec * 1000;
  let marker: number | null = null;
  const seen = new Set<string>();

  while (Date.now() < deadline) {
    const qs = new URLSearchParams({
      timeout: "30",
      limit: "100",
      types: "bot_added,bot_started,message_created,user_added",
    });
    if (marker != null) qs.set("marker", String(marker));
    const r = await fetch(`${MAX_API_BASE}/updates?${qs}`, { headers: maxAuthHeaders() });
    const j = (await r.json().catch(() => ({}))) as {
      updates?: any[];
      marker?: number | null;
      message?: string;
      code?: string;
    };
    if (!r.ok) {
      console.warn(`[Hermes] MAX /updates ${r.status}`, j);
      await sleep(5000);
      continue;
    }
    if (j.marker != null) marker = j.marker;
    for (const u of j.updates || []) {
      const chatId = u.chat_id ?? u.chat?.chat_id ?? u.message?.recipient?.chat_id;
      const key = `${u.update_type}:${chatId}`;
      if (chatId == null || seen.has(key)) continue;
      seen.add(key);
      console.log(
        `[Hermes] MAX event ${u.update_type} → chat_id=${chatId}` +
          (u.chat?.title ? ` title="${u.chat.title}"` : "") +
          `\n  >>> В hermes/.env: HERMES_MAX_CHAT_ID=${chatId}`,
      );
    }
  }
  if (!seen.size) {
    console.warn("[Hermes] MAX discover: событий не было. Проверьте: бот добавлен админом канала, токен верный.");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BATCH_TOPIC_CYCLE: string[] = [
  "Лицо выдаёт недосып раньше морщин",
  "Сухие руки старят сильнее мелких морщин",
  "Светлый верх у лица молодит сильнее нового тона",
  "Границы в просьбах выглядят дороже новых туфель",
  "После бритья кожа выдаёт возраст быстрее бороды",
  "Посадка брюк важнее бренда на бирке",
  "Спокойствие в паузе выглядит дороже лишних слов",
  "Один акцент цвета у лица сильнее всего образа сразу",
  "Кутикула выдаёт уход сильнее цвета лака",
  "Короткое «нет» без оправданий звучит статуснее",
];

const CELEB_BATCH_TOPICS: string[] = [
  "Образы российских актрис на премьерах: силуэт и цвет, которые повторить на ужин",
  "Red carpet зарубежных звёзд: платья и костюмы, которые работают после 30",
  "Маникюр российских знаменитостей vs ковровые дорожки Запада: короткие ногти",
  "Укладки Hollywood и европейских премьер: что попросить у мастера на весь день",
  "Стиль российских певиц на сцене и в зале: блеск без «новогоднего костюма»",
  "Макияж зарубежных актрис на премьерах: мягкий glow без тяжёлого контуринга",
  "Причёски российских звёзд на красной дорожке: объём и гладкость для взрослых",
  "Аксессуары A-list на выходах: сумка, серьги, обувь — что взять в обычную жизнь",
];

async function publishOnce(
  kind: "image" | "video",
  forcedTopic?: string,
  forcedAudience?: Audience,
): Promise<{ ok: boolean; title?: string; tgMessageId?: number; reason?: string }> {
  const log = loadLog();
  const recentTitles = recentBannedTitles(90);
  const audience = forcedAudience || resolveDaySlot();
  let picked = forcedTopic
    ? {
        topic: forcedTopic,
        niche: audience === "men" ? pickMenNiche() : audience === "celeb" ? "celeb" : pickWomenNiche(),
      }
    : pickTopicWithNiche(recentTitles, audience);

  // Если принудительная тема уже была — заменить на свежую
  if (forcedTopic && isBannedTopic(forcedTopic, recentTitles)) {
    console.warn(`[Hermes] forced topic banned, picking another`);
    picked = pickTopicWithNiche(recentTitles, audience);
  }

  const topic = picked.topic;
  const niche = picked.niche;
  const rssHints = await fetchRssInspiration(6);
  console.log(
    `[Hermes] topic: ${topic} | kind: ${kind} | audience: ${audience} | niche: ${niche} | banned=${recentTitles.length} | rssHints=${rssHints.length}`,
  );

  let post: { title: string; body: string; visualPrompt: string; wardrobeVisualPrompt?: string; visualMotion?: string };
  try {
    post = await generateTextPost(topic, kind, audience, rssHints);
    if (!(await komandosReviewEvergreen(post.title, post.body))) {
      console.warn("[Hermes] Командос: переписываем пост");
      post = await generateTextPost(topic, kind, audience, rssHints);
    }
    const voice = await writeEvergreenVoice(post.title, post.body);
    if (voice) post.body = injectEvergreenVoice(post.body, voice);
    const ward = parseTripleSections(post.body)?.wardrobe || "";
    if (wardrobeIsNotClothes(ward)) {
      console.warn("[Hermes] гардероб не про одежду — переписываем");
      post = await generateTextPost(topic + " (гардероб: только одежда у лица, без макияжа и без ухода за руками)", kind, audience, rssHints);
      const voice2 = await writeEvergreenVoice(post.title, post.body);
      if (voice2) post.body = injectEvergreenVoice(post.body, voice2);
    }
  } catch (e) {
    console.error("[Hermes] text failed:", (e as Error).message);
    return { ok: false, reason: "text-failed" };
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let mediaPath: string | undefined;
  let wardrobePath: string | undefined;

  try {
    if (kind === "image") {
      const imgUrl = await generateImage(withEditorialTitle(post.visualPrompt, post.title));
      mediaPath = path.join(PUBLIC_HERMES_DIR, `${id}.jpg`);
      await downloadToFile(imgUrl, mediaPath);
      console.log(`[Hermes] image saved: ${mediaPath}`);
      const wardrobePrompt =
        post.wardrobeVisualPrompt ||
        wardrobeLookPrompt(parseTripleSections(post.body)?.wardrobe || "", audience === "men");
      if (parseTripleSections(post.body)?.wardrobe) {
        try {
          const wUrl = await generateImage(wardrobePrompt, WARDROBE_IMAGE_MODEL);
          wardrobePath = path.join(PUBLIC_HERMES_DIR, `${id}-wardrobe.jpg`);
          await downloadToFile(wUrl, wardrobePath);
          console.log(`[Hermes] wardrobe image saved: ${wardrobePath}`);
        } catch (e) {
          console.warn("[Hermes] wardrobe image failed:", (e as Error).message);
        }
      }
    } else {
      const videoUrl = await generateVideo(post.visualPrompt + (post.visualMotion ? ` Motion: ${post.visualMotion}.` : ""));
      mediaPath = path.join(PUBLIC_HERMES_DIR, `${id}.mp4`);
      await downloadToFile(videoUrl, mediaPath);
      console.log(`[Hermes] video saved: ${mediaPath}`);
    }
  } catch (e) {
    console.error(`[Hermes] media generation failed:`, (e as Error).message);
  }

  const caption = formatCaption(post.title, post.body);

  let tgMessageId: number | null = null;
  let maxMessageId: string | null = null;

  if (!DRY_RUN) {
    if (mediaPath) {
      try {
        if (kind === "image" && wardrobePath) {
          tgMessageId = await sendTelegramAlbumWithCaption(
            [mediaPath, wardrobePath].filter(Boolean) as string[],
            caption,
            post.title,
          );
        } else {
          tgMessageId = await sendTelegramMediaWithCaption(kind, mediaPath, caption, post.title);
        }
      } catch (e) {
        console.error("[Hermes] tg send failed:", (e as Error).message);
        if (kind === "image" && wardrobePath) {
          try {
            tgMessageId = await sendTelegramMediaWithCaption("image", mediaPath, caption, post.title);
          } catch (e2) {
            console.error("[Hermes] tg fallback photo failed:", (e2 as Error).message);
          }
        }
      }
      try {
        maxMessageId = await sendMAXPhoto(mediaPath, caption);
      } catch (e) {
        console.error("[Hermes] max send failed:", (e as Error).message);
      }
    } else if (TG_TOKEN && TG_CHAT_ID) {
      try {
        tgMessageId = await sendTelegramMessage(caption);
      } catch (e) {
        console.error("[Hermes] tg text send failed:", (e as Error).message);
      }
    }
  } else {
    console.log("[Hermes] DRY_RUN: post:\n", caption);
  }

  log.posts.push({
    id,
    ts: new Date().toISOString(),
    kind,
    title: post.title,
    text: post.body,
    imagePath: kind === "image" ? mediaPath : undefined,
    videoPath: kind === "video" ? mediaPath : undefined,
    tgMessageId: tgMessageId ?? undefined,
    maxMessageId: maxMessageId ?? undefined,
    model: kind === "image" ? IMAGE_MODEL : VIDEO_MODEL,
    audience,
    niche,
  });
  saveLog(log);

  if (DRY_RUN) return { ok: true, title: post.title, reason: "dry-run" };
  if (!tgMessageId) return { ok: false, title: post.title, reason: "tg-failed" };
  return { ok: true, title: post.title, tgMessageId };
}

async function runTopicBatch(limit: number, topics: string[] = BATCH_TOPIC_CYCLE): Promise<number> {
  let okCount = 0;
  for (let i = 0; i < limit; i++) {
    const topic = topics[i % topics.length];
    const isMen = /мужск|для мужчин|борода|барбер|smart-casual|чинос/i.test(topic);
    const isCeleb = CELEB_BATCH_TOPICS.includes(topic)
      || /звезд|знаменит|актрис|red carpet|hollywoodlywood|ковров|a-list|премьер/i.test(topic);
    const aud: Audience = isMen ? "men" : isCeleb ? "celeb" : "women";
    const r = await publishOnce("image", topic, aud);
    if (r.ok) {
      okCount++;
      console.log(`[Hermes] batch ${i + 1}/${limit} OK msg=${r.tgMessageId}: ${r.title}`);
    } else {
      console.warn(`[Hermes] batch ${i + 1}/${limit} FAIL: ${r.reason} | ${r.title || topic}`);
    }
    if (i + 1 < limit) await sleep(25000);
  }
  return okCount;
}

async function runNewsBatch(limit: number): Promise<number> {
  let okCount = 0;
  for (let i = 0; i < limit; i++) {
    const r = await publishNewsOnce();
    if (r.ok) {
      okCount++;
      console.log(`[Hermes] news ${i + 1}/${limit} OK: ${r.title}`);
    } else {
      console.warn(`[Hermes] news ${i + 1}/${limit} skip: ${r.reason}`);
      break;
    }
    if (i + 1 < limit) await sleep(20000);
  }
  return okCount;
}

async function deleteTelegramMessage(messageId?: number | null): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID || !messageId) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, message_id: messageId }),
    });
    const j = await r.json();
    if (!j.ok) console.warn(`[Hermes] deleteMessage ${messageId}: ${j.description || "fail"}`);
  } catch (e) {
    console.warn("[Hermes] deleteMessage", messageId, (e as Error).message);
  }
}

/** Командос проверяет пост до публикации: язык, 3 блока, гардероб не пустой. */
async function komandosReviewEvergreen(title: string, body: string): Promise<boolean> {
  try {
    const r = await polza.chat.completions.create({
      model: REVIEW_FALLBACK || TEXT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Ты Командос. Проверяешь пост канала до публикации. Ответ только JSON {\"ok\":true} или {\"ok\":false,\"reason\":\"кратко\"}. ok=false если не русский, нет блоков Уход/Гардероб/Психология, гардероб пустой, в гардеробе макияж/BB-крем/уход за руками/маникюр/кутикула, нет блока ④ От себя, или текст оборван.",
        },
        { role: "user", content: `${title}\n\n${body}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" } as any,
    });
    const j = JSON.parse(r.choices?.[0]?.message?.content || "{}");
    if (j.ok === false) {
      console.warn(`[Hermes] Командос отклонил: ${j.reason || "quality"}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[Hermes] Командос review skip:", (e as Error).message);
    return true;
  }
}

/** Последний пост — одним альбомом: уход + гардероб + весь текст. Старые отдельные сообщения удаляем. */
async function attachWardrobeToLastPost(): Promise<{ ok: boolean; reason?: string; title?: string }> {
  const log = loadLog();
  const last = [...log.posts].reverse().find((p) => p.kind === "image" && p.text);
  if (!last) return { ok: false, reason: "no-last-post" };
  const wardrobe = parseTripleSections(last.text)?.wardrobe || "";
  if (!wardrobe) return { ok: false, reason: "no-wardrobe", title: last.title };
  const cover =
    (last.imagePath && fs.existsSync(last.imagePath) && last.imagePath) ||
    path.join(PUBLIC_HERMES_DIR, `${last.id}.jpg`);
  if (!fs.existsSync(cover)) return { ok: false, reason: "no-cover", title: last.title };
  const dest = path.join(PUBLIC_HERMES_DIR, `${last.id}-wardrobe.jpg`);
  if (!fs.existsSync(dest)) {
    try {
      const imgUrl = await generateImage(wardrobeLookPrompt(wardrobe, last.audience === "men"), WARDROBE_IMAGE_MODEL);
      await downloadToFile(imgUrl, dest);
    } catch (e) {
      console.error("[Hermes] wardrobe image failed:", (e as Error).message);
      return { ok: false, reason: "image-failed", title: last.title };
    }
  }
  const caption = formatCaption(last.title, last.text);
  if (DRY_RUN) {
    console.log("[Hermes] DRY_RUN one album:", last.title);
    return { ok: true, title: last.title, reason: "dry-run" };
  }
  if (last.tgMessageId) {
    await deleteTelegramMessage(last.tgMessageId);
    await deleteTelegramMessage(last.tgMessageId + 1);
    await deleteTelegramMessage(last.tgMessageId + 2);
  }
  const mid = await sendTelegramAlbumWithCaption([cover, dest], caption, last.title);
  if (!mid) return { ok: false, reason: "tg-failed", title: last.title };
  last.tgMessageId = mid;
  saveLog(log);
  console.log(`[Hermes] last post republished as one album «${last.title}» tg=${mid}`);
  return { ok: true, title: last.title };
}

/** Нет годной новости про звёзд — ещё раз Google, не старый уход/гардероб. */
async function publishNewsOrEvergreen(slot: DaySlotKind): Promise<{ ok: boolean; reason?: string; title?: string }> {
  const lane = contentLane(slot);
  const news = await publishNewsOnce(slot);
  if (news.ok) return news;
  if (lane === "star") {
    console.warn(`[Hermes] нет звёзд (${news.reason}) → ещё раз Google, не старый уход/гардероб`);
    const retry = await publishNewsOnce(slot);
    if (retry.ok) return retry;
    return { ok: false, reason: retry.reason || news.reason, title: retry.title || news.title };
  }
  console.warn(`[Hermes] нет новости (${news.reason}) → ещё раз «Мода, о которой сейчас говорят», не уход/гардероб`);
  const retryNews = await publishNewsOnce(slot);
  if (retryNews.ok) return retryNews;
  console.warn(`[Hermes] новость снова не вышла (${retryNews.reason}) → запасной уход/гардероб`);
  const evergreen = await publishOnce("image", undefined, "women");
  if (evergreen.ok) {
    return { ok: true, title: evergreen.title, reason: `evergreen-after-${news.reason}` };
  }
  return { ok: false, reason: evergreen.reason || news.reason, title: evergreen.title || news.title };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const once = argv.includes("--once");
  const deleteLast = argv.includes("--delete-last");
  const replaceEvergreen = argv.includes("--replace-evergreen");
  const republishLast = argv.includes("--republish-last");
  const wardrobeLast = argv.includes("--wardrobe-last");
  const titleHintArg = argv.find((a) => a.startsWith("--title-hint="));
  const titleHint = titleHintArg?.split("=").slice(1).join("=") || "";
  const maxDiscover = argv.includes("--max-discover");
  const backfillArg = argv.find((a) => a.startsWith("--backfill="));
  const backfillN = backfillArg ? parseInt(backfillArg.split("=")[1], 10) || 0 : 0;
  const batchArg = argv.find((a) => a.startsWith("--batch="));
  const batchN = batchArg ? parseInt(batchArg.split("=")[1], 10) || 0 : 0;
  const batchCelebArg = argv.find((a) => a.startsWith("--batch-celeb="));
  const batchCelebN = batchCelebArg ? parseInt(batchCelebArg.split("=")[1], 10) || 0 : 0;
  const audienceArg = argv.find((a) => a.startsWith("--audience="));
  const audienceForced = (() => {
    const v = audienceArg?.split("=")[1];
    if (v === "men") return "men" as Audience;
    if (v === "celeb") return "celeb" as Audience;
    if (v === "women") return "women" as Audience;
    return undefined;
  })();
  const rawTok = (process.env.HERMES_TG_TOKEN || "").trim();
  if (rawTok && !TG_TOKEN) {
    console.error("[Hermes] HERMES_TG_TOKEN невалиден (placeholder?). Нужен токен Hermes Stilist Bot (@hermes_stilist_bot) из BotFather — НЕ @Alex_tel_12bot");
  }
  console.log(
    `[Hermes] start | MODE=${MODE} | SEARCH=${SEARCH_MODEL} | DRY_RUN=${DRY_RUN} | TG=${TG_TOKEN ? "yes" : "no"} | MAX=${MAX_TOKEN ? "yes" : "no"} | MAX_CHAT=${MAX_CHAT_ID || "—"} | RSS=${RSS_FEEDS.length} | chat=${TG_CHAT_ID || "?"}`,
  );

  if (maxDiscover) {
    await discoverMaxChatId(180);
    return;
  }
  if (wardrobeLast) {
    const r = await attachWardrobeToLastPost();
    console.log(`[Hermes] wardrobe-last | ok=${r.ok} | ${r.title || r.reason}`);
    return;
  }
  if (deleteLast || replaceEvergreen) {
    const dr = await deleteLastPublishedPost(titleHint);
    console.log(`[Hermes] delete-last | ok=${dr.ok} | ${dr.reason || dr.deleted?.join(",")}`);
    if (!dr.ok && replaceEvergreen) {
      console.warn("[Hermes] старый пост не удалился — всё равно публикуем «Мода, о которой сейчас говорят»");
    }
    if (deleteLast && !replaceEvergreen) return;
  }
  if (replaceEvergreen) {
    const slot = audienceForced === "men" ? "men" : resolveDaySlot();
    const r = await publishNewsOrEvergreen(slot);
    console.log(`[Hermes] replace-news | ok=${r.ok} | ${r.title || r.reason}`);
    return;
  }
  if (republishLast) {
    const r = await republishLastLogEntry();
    console.log(`[Hermes] republish-last | ok=${r.ok} | ${r.title || r.reason} | msg=${r.tgMessageId ?? "—"}`);
    return;
  }

  if (batchCelebN > 0) {
    const okCount = await runTopicBatch(batchCelebN, CELEB_BATCH_TOPICS);
    console.log(`[Hermes] batch-celeb done: ${okCount}/${batchCelebN} published`);
    return;
  }
  if (batchN > 0) {
    const okCount = await runTopicBatch(batchN);
    console.log(`[Hermes] batch done: ${okCount}/${batchN} published`);
    return;
  }
  if (backfillN > 0) {
    const okCount = await runNewsBatch(backfillN);
    console.log(`[Hermes] backfill done: ${okCount}/${backfillN} published`);
    return;
  }
  if (once) {
    if (MODE === "image" || MODE === "video") {
      const kind: "image" | "video" = MODE === "video" ? "video" : "image";
      const aud = audienceForced || resolveDaySlot();
      await publishOnce(kind, undefined, aud);
      console.log(`[Hermes] once done | audience=${aud}`);
      return;
    }
    const slot = audienceForced === "men" ? "men" : resolveDaySlot();
    const r = await publishNewsOrEvergreen(slot);
    console.log(`[Hermes] once news done | ok=${r.ok} | ${r.title || r.reason}`);
    return;
  }

  // 3 поста/день: 2 звезды + 1 маникюр/причёска/одежда
  const cronOpts = { timezone: "Europe/Moscow" };
  const publishStar = (slot: DaySlotKind) =>
    publishNewsOrEvergreen(slot).catch((e) => console.error(e));
  cron.schedule("0 8 * * *", () => publishStar("women"), cronOpts);
  cron.schedule("0 16 * * *", () => publishStar("women"), cronOpts);
  cron.schedule("0 0 * * *", () => publishStar("women"), cronOpts);
  console.log("[Hermes] cron: 08:00 и 16:00 звёзды · 00:00 маникюр/причёска/одежда");

  setInterval(() => {}, 60_000);
}

main().catch((e) => {
  console.error("[Hermes] fatal:", e);
  process.exit(1);
});
