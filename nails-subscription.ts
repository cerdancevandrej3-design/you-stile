/**
 * Nails base subscription: access tokens, promos (once / month), lite catalog API.
 */
import type { Express, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const NAILS_MONTH_PRICE = 500;
export const NAILS_MONTH_DAYS = 30;
/** Промокод «один раз» / разовый доступ — действует ровно 24 часа */
export const NAILS_ONCE_DAYS = 1;

export type NailsAccessKind = "once" | "month";

type NailsPromoEntry = {
  used: boolean;
  kind: NailsAccessKind;
  createdAt: string;
  redeemedAt?: string;
};

type NailsAccessEntry = {
  token: string;
  kind: NailsAccessKind;
  createdAt: string;
  expiresAt: string | null;
  paymentId?: string;
  promoCode?: string;
  /** once: consumed after first guide/catalog unlock session mark */
  onceUsed?: boolean;
};

type NailsPromoStore = Record<string, NailsPromoEntry>;
type NailsAccessStore = Record<string, NailsAccessEntry>;

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {}
  return fallback;
}

function saveJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function newToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function createNailsSubscription(projectRoot: string) {
  const PROMO_FILE = path.join(projectRoot, "data", "nails-promo-codes.json");
  const ACCESS_FILE = path.join(projectRoot, "data", "nails-access.json");
  const CATALOG_FILE = path.join(projectRoot, "public", "nails", "catalog.json");
  const ADMIN_KEY = "stilist-admin-key-913260";

  let promos: NailsPromoStore = loadJson(PROMO_FILE, {});
  let access: NailsAccessStore = loadJson(ACCESS_FILE, {});

  const persistPromos = () => saveJson(PROMO_FILE, promos);
  const persistAccess = () => saveJson(ACCESS_FILE, access);

  function reload() {
    promos = loadJson(PROMO_FILE, {});
    access = loadJson(ACCESS_FILE, {});
  }

  function resolveAccess(tokenRaw: unknown): NailsAccessEntry | null {
    const token = String(tokenRaw || "").trim();
    if (!token) return null;
    const entry = access[token];
    if (!entry) return null;
    // Срок истёк (месяц или разовый доступ на сутки)
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    // Старые once-токены без expiresAt: fallback — сутки от createdAt
    if (entry.kind === "once" && !entry.expiresAt && entry.createdAt) {
      const created = new Date(entry.createdAt).getTime();
      if (Number.isFinite(created) && Date.now() - created > NAILS_ONCE_DAYS * 24 * 60 * 60 * 1000) {
        return null;
      }
    }
    if (entry.kind === "once" && entry.onceUsed) return null;
    return entry;
  }

  function grantAccess(opts: {
    kind: NailsAccessKind;
    paymentId?: string;
    promoCode?: string;
  }): NailsAccessEntry {
    const token = newToken();
    const now = new Date();
    const entry: NailsAccessEntry = {
      token,
      kind: opts.kind,
      createdAt: now.toISOString(),
      expiresAt:
        opts.kind === "month"
          ? new Date(now.getTime() + NAILS_MONTH_DAYS * 24 * 60 * 60 * 1000).toISOString()
          : new Date(now.getTime() + NAILS_ONCE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      paymentId: opts.paymentId,
      promoCode: opts.promoCode,
      onceUsed: false,
    };
    access[token] = entry;
    persistAccess();
    return entry;
  }

  function grantFromPayment(paymentId: string): NailsAccessEntry {
    // Idempotent: reuse existing month token for same payment (полный месяц)
    const existing = Object.values(access).find((a) => a.paymentId === paymentId && a.kind === "month");
    if (existing) {
      // Если срок ещё есть — отдаём тот же доступ; если истёк — выдаём новый месяц
      if (resolveAccess(existing.token)) return existing;
      const renewed = grantAccess({ kind: "month", paymentId });
      return renewed;
    }
    return grantAccess({ kind: "month", paymentId });
  }

  function publicAccessView(entry: NailsAccessEntry) {
    return {
      allowed: true as const,
      token: entry.token,
      kind: entry.kind,
      expiresAt: entry.expiresAt,
      canBrowseCatalog: entry.kind === "month" || !entry.onceUsed,
      canSeeMasterGuide: true,
    };
  }

  function loadCatalogRaw(): any[] {
    try {
      const raw = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf-8"));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function stripGuide(item: any) {
    if (!item || typeof item !== "object") return item;
    const { masterGuide, master_guide, ...rest } = item;
    return rest;
  }

  function registerRoutes(app: Express) {
    app.get("/api/nails/prices", (_req: Request, res: Response) => {
      res.json({ month: NAILS_MONTH_PRICE, currency: "RUB", days: NAILS_MONTH_DAYS });
    });

    app.get("/api/nails/access", (req: Request, res: Response) => {
      const entry = resolveAccess(req.query.token);
      if (!entry) return res.json({ allowed: false, reason: "invalid_or_expired" });
      res.json(publicAccessView(entry));
    });

    /** Mark once-access as consumed (after user opened guides/catalog). */
    app.post("/api/nails/consume-once", (req: Request, res: Response) => {
      const token = String(req.body?.token || "").trim();
      const entry = resolveAccess(token);
      if (!entry) return res.json({ success: false, reason: "invalid_or_expired" });
      if (entry.kind === "once") {
        entry.onceUsed = true;
        access[token] = entry;
        persistAccess();
      }
      res.json({ success: true, kind: entry.kind });
    });

    app.post("/api/nails/check-promo", (req: Request, res: Response) => {
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!code) return res.json({ valid: false });
      const entry = promos[code];
      if (!entry) return res.json({ valid: false, reason: "not_found" });
      if (entry.used) return res.json({ valid: false, reason: "used" });
      return res.json({ valid: true, kind: entry.kind, code });
    });

    app.post("/api/nails/redeem-promo", (req: Request, res: Response) => {
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!code) return res.json({ success: false, reason: "no_code" });
      const entry = promos[code];
      if (!entry) return res.json({ success: false, reason: "not_found" });
      if (entry.used) return res.json({ success: false, reason: "used" });
      entry.used = true;
      entry.redeemedAt = new Date().toISOString();
      promos[code] = entry;
      persistPromos();
      const granted = grantAccess({ kind: entry.kind, promoCode: code });
      return res.json({
        success: true,
        ...publicAccessView(granted),
      });
    });

    app.post("/api/nails/generate-promo", (req: Request, res: Response) => {
      if (String(req.body?.secret || "") !== ADMIN_KEY) {
        return res.status(403).json({ error: "unauthorized" });
      }
      const kind: NailsAccessKind = req.body?.kind === "once" ? "once" : "month";
      const count = Math.min(Math.max(parseInt(String(req.body?.count || "10"), 10) || 10, 1), 100);
      const newCodes: string[] = [];
      for (let i = 0; i < count; i++) {
        let code = generatePromoCode();
        while (promos[code]) code = generatePromoCode();
        promos[code] = { used: false, kind, createdAt: new Date().toISOString() };
        newCodes.push(code);
      }
      persistPromos();
      res.json({ codes: newCodes, kind, count: newCodes.length });
    });

    app.get("/api/nails/promo-list", (req: Request, res: Response) => {
      if (String(req.query.secret || "") !== ADMIN_KEY) {
        // also allow header for admin page convenience — but keep secret required
        return res.status(403).json({ error: "unauthorized" });
      }
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const limit = Math.min(100, parseInt(String(req.query.limit || "10"), 10) || 10);
      const status = String(req.query.status || "all");
      const kindF = String(req.query.kind || "all");
      const q = String(req.query.q || "").trim().toUpperCase();

      let list = Object.entries(promos).map(([code, e]) => ({ code, ...e }));
      if (status === "free") list = list.filter((e) => !e.used);
      else if (status === "used") list = list.filter((e) => e.used);
      if (kindF === "once" || kindF === "month") list = list.filter((e) => e.kind === kindF);
      if (q) list = list.filter((e) => e.code.includes(q));
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const unused = list.filter((e) => !e.used).length;
      const used = list.filter((e) => e.used).length;
      const codes = list.slice((page - 1) * limit, page * limit);
      res.json({ total, unused, used, codes, page, totalPages, limit });
    });

    app.post("/api/nails/promo-delete", (req: Request, res: Response) => {
      if (String(req.body?.secret || "") !== ADMIN_KEY) {
        return res.status(403).json({ error: "unauthorized" });
      }
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!code || !promos[code]) return res.json({ success: false, reason: "not_found" });
      delete promos[code];
      persistPromos();
      res.json({ success: true });
    });

    app.post("/api/nails/promo-reset", (req: Request, res: Response) => {
      if (String(req.body?.secret || "") !== ADMIN_KEY) {
        return res.status(403).json({ error: "unauthorized" });
      }
      const code = String(req.body?.code || "").trim().toUpperCase();
      if (!code || !promos[code]) return res.json({ success: false, reason: "not_found" });
      promos[code].used = false;
      delete promos[code].redeemedAt;
      persistPromos();
      res.json({ success: true });
    });

    /** Lightweight catalog without master guides — safe for free clients. */
    app.get("/api/nails/lite-catalog", (_req: Request, res: Response) => {
      const catalog = loadCatalogRaw().map(stripGuide);
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(catalog);
    });

    /** Full master guide for one design — requires valid access token. */
    app.get("/api/nails/guide", (req: Request, res: Response) => {
      const entry = resolveAccess(req.query.token);
      if (!entry) return res.status(403).json({ error: "access_denied" });
      const filename = String(req.query.filename || "").trim();
      if (!filename) return res.status(400).json({ error: "filename_required" });
      const item = loadCatalogRaw().find((c) => c?.filename === filename);
      if (!item) return res.status(404).json({ error: "not_found" });
      res.json({
        filename,
        masterGuide: item.masterGuide || item.master_guide || null,
        difficulty: item.difficulty || null,
        timeMinutes: item.timeMinutes ?? null,
        techniques: Array.isArray(item.techniques) ? item.techniques : [],
        description: item.description || null,
      });
    });

    /** Batch guides for top-3 etc. */
    app.post("/api/nails/guides", (req: Request, res: Response) => {
      const entry = resolveAccess(req.body?.token);
      if (!entry) return res.status(403).json({ error: "access_denied" });
      const filenames: string[] = Array.isArray(req.body?.filenames) ? req.body.filenames.map(String) : [];
      const catalog = loadCatalogRaw();
      const byName = new Map(catalog.map((c) => [c.filename, c]));
      const guides: Record<string, any> = {};
      for (const f of filenames.slice(0, 20)) {
        const item = byName.get(f);
        if (!item) continue;
        guides[f] = {
          masterGuide: item.masterGuide || item.master_guide || null,
          difficulty: item.difficulty || null,
          timeMinutes: item.timeMinutes ?? null,
          techniques: Array.isArray(item.techniques) ? item.techniques : [],
        };
      }
      res.json({ guides, kind: entry.kind, expiresAt: entry.expiresAt });
    });
  }

  return {
    registerRoutes,
    grantFromPayment,
    resolveAccess,
    reload,
    NAILS_MONTH_PRICE,
  };
}

export type NailsSubscription = ReturnType<typeof createNailsSubscription>;
