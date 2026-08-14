// Generate 2026 trend nail photos into public/nails/all/
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const POLZA_BASE_URL = process.env.POLZA_BASE_URL || "https://polza.ai/api/v1";
const POLZA_API_KEY = process.env.POLZA_API_KEY;
const MODEL = "seedream/5-pro-text-to-image";
const OUT_DIR = path.join(__dirname, "public", "nails", "all");
const PROMPTS = path.join(__dirname, "public", "nails", "_2026_prompts.json");

const SUPER = `
REAL CAMERA PHOTO of a real woman's living hand, 100mm macro, beauty campaign. Not AI, not CGI, not a mannequin.

GOLD STANDARD POSE (copy this exactly):
Dorsal TOP-DOWN. Back of the hand to the camera. Camera ABOVE, looking down onto the TOP of 4-5 nail plates. Hand resting on draped satin or knit. Fingers slightly together. Thumb nail also from the TOP.
Looks like t_0264e003188b1e32 / t_4e5f9035d996c7ea: real skin pores, real knuckles, no jewelry.

FORBIDDEN: palm to camera, side profile, 3/4 sidewall, rings on fingers, bracelets, waxy doll skin, extra fingers, floating jewelry.
`;

function extractImage(data) {
  if (data.output?.url) return { kind: "url", value: data.output.url };
  if (data.output?.b64_json) return { kind: "b64", value: data.output.b64_json };
  if (typeof data.output?.data === "string" && data.output.data.startsWith("data:")) {
    return { kind: "b64", value: data.output.data.replace(/^data:[^;]+;base64,/, "") };
  }
  if (typeof data.output?.data === "string" && data.output.data.startsWith("http")) {
    return { kind: "url", value: data.output.data };
  }
  if (data.url && String(data.url).startsWith("http")) return { kind: "url", value: data.url };
  if (Array.isArray(data.data) && data.data[0]) {
    if (data.data[0].b64_json) return { kind: "b64", value: data.data[0].b64_json };
    if (data.data[0].url) return { kind: "url", value: data.data[0].url };
  }
  return null;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateOne(prompt) {
  const body = {
    model: MODEL,
    input: { prompt: prompt + SUPER, aspect_ratio: "3:4", quality: "medium" },
  };
  const res = await fetch(`${POLZA_BASE_URL}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${POLZA_API_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
  let img = extractImage(data);
  if (img) return img;
  const jobId = data.id || data.requestId;
  if (!jobId) throw new Error(`no image ${JSON.stringify(data).slice(0, 240)}`);
  const start = Date.now();
  while (Date.now() - start < 240000) {
    await sleep(4000);
    const poll = await fetch(`${POLZA_BASE_URL}/media/${jobId}`, {
      headers: { Authorization: `Bearer ${POLZA_API_KEY}` },
    });
    const pd = await poll.json();
    img = extractImage(pd);
    if (img) return img;
    const st = String(pd.status || "").toLowerCase();
    if (["failed", "error", "cancelled"].includes(st)) throw new Error(`job ${st}`);
  }
  throw new Error("timeout");
}

async function saveImg(img, dest) {
  if (img.kind === "url") {
    const r = await fetch(img.value);
    if (!r.ok) throw new Error(`download ${r.status}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return;
  }
  fs.writeFileSync(dest, Buffer.from(img.value, "base64"));
}

async function main() {
  if (!POLZA_API_KEY) {
    console.error("missing key");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv.slice(2);
  const items = JSON.parse(fs.readFileSync(PROMPTS, "utf-8"));
  const failed = [];
  for (const item of items) {
    if (only.length && !only.includes(item.id)) continue;
    const dest = path.join(OUT_DIR, `${item.id}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
      console.log("[SKIP]", item.id);
      continue;
    }
    console.log("[GEN]", item.id);
    try {
      let last = null;
      for (let a = 1; a <= 3; a++) {
        try {
          const img = await generateOne(item.prompt);
          await saveImg(img, dest);
          last = null;
          break;
        } catch (e) {
          last = e;
          console.log("[RETRY]", item.id, a, String(e.message || e).slice(0, 100));
          await sleep(5000);
        }
      }
      if (last) throw last;
      console.log("[OK]", item.id, fs.statSync(dest).size);
    } catch (e) {
      console.error("[FAIL]", item.id, e.message.slice(0, 160));
      failed.push(item.id);
    }
  }
  if (failed.length) {
    console.error("failed", failed.join(", "));
    process.exit(2);
  }
  console.log("done");
}

main();
