/*
 * config.js — penyimpanan state ReOUTER di disk.
 *
 * File: data/config.json (berisi provider + API key plaintext, lokal saja).
 * API key TIDAK pernah dikirim balik ke browser — hanya versi tersamar.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
export const DATA_DIR = path.join(ROOT, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

const PILIHAN_PLANET = [
  { planet: "Bulan", c1: "#c9d3ea", c2: "#5b6478", glow: "#a9b6d6" },
  { planet: "Merkurius", c1: "#f9d9b8", c2: "#a86a3d", glow: "#f4b183" },
  { planet: "Venus", c1: "#ffd9a0", c2: "#c08a3e", glow: "#ffc46b" },
  { planet: "Mars", c1: "#ffb9a3", c2: "#8e3b2a", glow: "#ff8a66" },
  { planet: "Jupiter", c1: "#e8c9a8", c2: "#8a5a3a", glow: "#dda87a" },
  { planet: "Saturnus", c1: "#e6dcc0", c2: "#8a7b53", glow: "#d8c99b" },
  { planet: "Uranus", c1: "#c7f0f4", c2: "#3f7f8c", glow: "#8fe3ec" },
  { planet: "Neptunus", c1: "#bcd0ff", c2: "#2f3f8e", glow: "#8aa8ff" },
];

const DEFAULT_STATE = {
  mode: "failover", // failover | round
  providers: [],
};

let state = null;

function load() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      state = {
        mode: raw.mode === "round" ? "round" : "failover",
        providers: Array.isArray(raw.providers) ? raw.providers : [],
      };
      return;
    }
  } catch (err) {
    console.error("[config] gagal baca config, mulai kosong:", err.message);
  }
  state = structuredClone(DEFAULT_STATE);
}

export function getState() {
  if (!state) load();
  return state;
}

export function saveState() {
  if (!state) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function nextPlanet() {
  const used = new Set(getState().providers.map((p) => p.planet));
  const free = PILIHAN_PLANET.find((p) => !used.has(p.planet));
  if (free) return free;
  const i = getState().providers.length % PILIHAN_PLANET.length;
  return PILIHAN_PLANET[i];
}

export function maskKey(key) {
  if (!key) return "";
  const k = String(key);
  if (k.length <= 10) return "••••";
  return `${k.slice(0, 5)}••••••••${k.slice(-4)}`;
}

/** Versi aman untuk browser: tanpa API key asli. */
export function publicProvider(p) {
  return {
    id: p.id,
    name: p.name,
    planet: p.planet,
    c1: p.c1,
    c2: p.c2,
    glow: p.glow,
    baseUrl: p.baseUrl,
    priority: p.priority,
    enabled: p.enabled,
    hasKey: Boolean(p.apiKey),
    keyHint: maskKey(p.apiKey),
    status: p.status || "unknown",
    models: p.models || [],
    picked: p.picked || [],
    tokens: p.tokens || { used: 0, limit: 0 },
    lastCheck: p.lastCheck || null,
    lastError: p.lastError || null,
    cooldownUntil: p.cooldownUntil || 0,
  };
}

export function publicState() {
  const s = getState();
  return {
    mode: s.mode,
    providers: s.providers
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map(publicProvider),
  };
}
