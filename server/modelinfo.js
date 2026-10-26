/*
 * modelinfo.js — database harga & kemampuan model AI.
 *
 * Harga = USD per 1 juta token (input / output), perkiraan dari daftar harga publik.
 * Dipakai untuk membantu memilih model termurah / tercepat / paling pintar.
 */

/** Cocokkan nama model ke profil. Urutan penting: paling spesifik dulu. */
const RULES = [
  // ---------- OpenAI ----------
  { re: /^gpt-4o-mini/i, name: "GPT-4o mini", vendor: "OpenAI", in: 0.15, out: 0.6, ctx: 128000, speed: 120, tier: "cheap", smart: 3, tags: ["murah", "cepat"] },
  { re: /^gpt-4o(?!-mini)/i, name: "GPT-4o", vendor: "OpenAI", in: 2.5, out: 10, ctx: 128000, speed: 80, tier: "balanced", smart: 4, tags: ["multimodal"] },
  { re: /^gpt-4\.1-mini/i, name: "GPT-4.1 mini", vendor: "OpenAI", in: 0.4, out: 1.6, ctx: 1047576, speed: 110, tier: "cheap", smart: 3.5, tags: ["murah", "context besar"] },
  { re: /^gpt-4\.1-nano/i, name: "GPT-4.1 nano", vendor: "OpenAI", in: 0.1, out: 0.4, ctx: 1047576, speed: 180, tier: "cheap", smart: 2.5, tags: ["termurah", "tercepat"] },
  { re: /^gpt-4\.1/i, name: "GPT-4.1", vendor: "OpenAI", in: 2.0, out: 8, ctx: 1047576, speed: 75, tier: "balanced", smart: 4.5, tags: ["context besar"] },
  { re: /^o4-mini/i, name: "o4-mini", vendor: "OpenAI", in: 1.1, out: 4.4, ctx: 200000, speed: 60, tier: "balanced", smart: 4.5, tags: ["reasoning"] },
  { re: /^o3-mini/i, name: "o3-mini", vendor: "OpenAI", in: 1.1, out: 4.4, ctx: 200000, speed: 55, tier: "balanced", smart: 4, tags: ["reasoning"] },
  { re: /^o3(?!-)/i, name: "o3", vendor: "OpenAI", in: 10, out: 40, ctx: 200000, speed: 35, tier: "flagship", smart: 5, tags: ["reasoning", "mahal"] },
  { re: /^gpt-5/i, name: "GPT-5", vendor: "OpenAI", in: 1.25, out: 10, ctx: 400000, speed: 70, tier: "flagship", smart: 5, tags: ["flagship"] },
  { re: /^gpt-6.*astra/i, name: "GPT-6 Astra", vendor: "OpenAI", in: 1.1, out: 8, ctx: 1000000, speed: 85, tier: "flagship", smart: 5, tags: ["flagship", "context besar"] },
  { re: /^gpt-6.*sol/i, name: "GPT-6 Sol", vendor: "OpenAI", in: 1.25, out: 10, ctx: 400000, speed: 80, tier: "flagship", smart: 5, tags: ["flagship"] },
  { re: /^gpt-6.*luna/i, name: "GPT-6 Luna", vendor: "OpenAI", in: 0.25, out: 1.2, ctx: 400000, speed: 150, tier: "cheap", smart: 3.5, tags: ["murah", "cepat"] },
  { re: /^gpt-6/i, name: "GPT-6", vendor: "OpenAI", in: 1.25, out: 10, ctx: 400000, speed: 80, tier: "flagship", smart: 5, tags: ["flagship"] },

  // ---------- Anthropic ----------
  { re: /haiku/i, name: "Claude Haiku", vendor: "Anthropic", in: 0.8, out: 4, ctx: 200000, speed: 150, tier: "cheap", smart: 3, tags: ["cepat", "murah"] },
  { re: /opus/i, name: "Claude Opus", vendor: "Anthropic", in: 15, out: 75, ctx: 200000, speed: 30, tier: "flagship", smart: 5, tags: ["paling pintar", "mahal"] },
  { re: /sonnet/i, name: "Claude Sonnet", vendor: "Anthropic", in: 3, out: 15, ctx: 200000, speed: 65, tier: "balanced", smart: 4.5, tags: ["coding bagus"] },

  // ---------- Google ----------
  { re: /gemini-.*flash-lite/i, name: "Gemini Flash Lite", vendor: "Google", in: 0.075, out: 0.3, ctx: 1000000, speed: 200, tier: "cheap", smart: 2.5, tags: ["termurah", "tercepat"] },
  { re: /gemini-.*flash/i, name: "Gemini Flash", vendor: "Google", in: 0.3, out: 2.5, ctx: 1000000, speed: 160, tier: "cheap", smart: 3.5, tags: ["cepat", "murah"] },
  { re: /gemini-.*pro/i, name: "Gemini Pro", vendor: "Google", in: 1.25, out: 10, ctx: 2000000, speed: 70, tier: "flagship", smart: 4.5, tags: ["context raksasa"] },

  // ---------- DeepSeek ----------
  { re: /deepseek.*reasoner|deepseek-r1/i, name: "DeepSeek Reasoner", vendor: "DeepSeek", in: 0.55, out: 2.19, ctx: 64000, speed: 30, tier: "balanced", smart: 4.5, tags: ["reasoning", "murah"] },
  { re: /deepseek/i, name: "DeepSeek Chat", vendor: "DeepSeek", in: 0.27, out: 1.1, ctx: 64000, speed: 90, tier: "cheap", smart: 3.5, tags: ["murah banget"] },

  // ---------- Llama / lain-lain ----------
  { re: /llama-?3.*70b/i, name: "Llama 3.3 70B", vendor: "Meta", in: 0.59, out: 0.79, ctx: 128000, speed: 300, tier: "fast", smart: 3, tags: ["super cepat"] },
  { re: /llama-?3.*8b/i, name: "Llama 3.1 8B", vendor: "Meta", in: 0.05, out: 0.08, ctx: 128000, speed: 500, tier: "cheap", smart: 2, tags: ["termurah", "kilat"] },
  { re: /llama/i, name: "Llama", vendor: "Meta", in: 0.2, out: 0.4, ctx: 128000, speed: 250, tier: "fast", smart: 2.5, tags: ["cepat"] },
  { re: /mixtral/i, name: "Mixtral", vendor: "Mistral", in: 0.24, out: 0.24, ctx: 32000, speed: 200, tier: "fast", smart: 2.5, tags: ["cepat"] },
  { re: /qwen/i, name: "Qwen", vendor: "Alibaba", in: 0.2, out: 0.6, ctx: 128000, speed: 140, tier: "cheap", smart: 3, tags: ["murah"] },
  { re: /glm/i, name: "GLM", vendor: "Z.ai", in: 0.2, out: 0.6, ctx: 128000, speed: 130, tier: "cheap", smart: 3, tags: ["murah"] },
  { re: /kimi|moonshot/i, name: "Kimi", vendor: "Moonshot", in: 0.3, out: 1.2, ctx: 256000, speed: 100, tier: "balanced", smart: 3.5, tags: ["context besar"] },
  { re: /mistral-large/i, name: "Mistral Large", vendor: "Mistral", in: 2, out: 6, ctx: 128000, speed: 70, tier: "balanced", smart: 4, tags: [] },
  { re: /mimo/i, name: "MiMo", vendor: "Xiaomi", in: 0.15, out: 0.6, ctx: 128000, speed: 170, tier: "cheap", smart: 2.5, tags: ["murah", "cepat"] },
  { re: /muse/i, name: "Muse", vendor: "Muse", in: 0.5, out: 2, ctx: 128000, speed: 110, tier: "balanced", smart: 3, tags: [] },
];

const FALLBACK = { name: null, vendor: "?", in: null, out: null, ctx: null, speed: null, tier: "unknown", smart: null, tags: [] };

export function modelInfo(id) {
  const key = String(id || "");
  for (const r of RULES) if (r.re.test(key)) return { ...r, matched: true };
  return { ...FALLBACK, matched: false };
}

/** Data ringkas untuk badge di UI. */
export function modelBadges(id) {
  const m = modelInfo(id);
  return {
    vendor: m.vendor,
    tier: m.tier,
    smart: m.smart,
    speed: m.speed,
    priceIn: m.in,
    priceOut: m.out,
    ctx: m.ctx,
    tags: m.tags,
    known: m.matched,
  };
}
