/*
 * providers.js — adapter provider nyata.
 *
 * Tiga gaya API yang didukung:
 *   - openai    : {baseUrl}/v1/models  +  {baseUrl}/chat/completions     (OpenAI, Groq, OpenRouter, DeepSeek, TokenRouter, dll)
 *   - anthropic : {baseUrl}/v1/models  +  {baseUrl}/v1/messages          (Anthropic native)
 *   - gemini    : {baseUrl}/v1beta/models + {baseUrl}/v1beta/...:generateContent (Google)
 *
 * Semua request keluar langsung dari mesin lokal, pakai API key milik user.
 */

const TIMEOUT_LIST = 20000;
const TIMEOUT_CHAT = 180000;

export const PROVIDER_PRESETS = [
  { id: "openai", name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com" },
  { id: "gemini", name: "Google Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com" },
  { id: "groq", name: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter", name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "deepseek", name: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1" },
  { id: "mistral", name: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1" },
  { id: "tokenrouter", name: "TokenRouterAI", kind: "openai", baseUrl: "https://api.tokenrouter.ai/v1" },
  { id: "custom", name: "Custom (OpenAI-compatible)", kind: "openai", baseUrl: "" },
];

/** Tebak jenis API dari base URL kalau user tidak memilih. */
export function guessKind(baseUrl) {
  const u = String(baseUrl || "").toLowerCase();
  if (u.includes("anthropic.com")) return "anthropic";
  if (u.includes("generativelanguage.googleapis.com")) return "gemini";
  return "openai";
}

function trimSlash(u) {
  return String(u || "").replace(/\/+$/, "");
}

async function fetchJson(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    return { res, body, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function errText(body) {
  if (!body) return "";
  const e = body.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") return e.message || JSON.stringify(e).slice(0, 300);
  if (body.message) return body.message;
  if (body.raw) return String(body.raw).slice(0, 200);
  return "";
}

/* ---------------- daftar model ---------------- */

export async function listModels(provider) {
  const kind = provider.kind || guessKind(provider.baseUrl);
  const base = trimSlash(provider.baseUrl);

  if (kind === "anthropic") {
    const { res, body, ms } = await fetchJson(
      `${base}/v1/models?limit=1000`,
      {
        headers: {
          "x-api-key": provider.apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
      TIMEOUT_LIST,
    );
    if (!res.ok) throw apiError(res, body);
    const list = Array.isArray(body?.data) ? body.data : [];
    return { models: list.map((m) => m.id).filter(Boolean), ms };
  }

  if (kind === "gemini") {
    const { res, body, ms } = await fetchJson(
      `${base}/v1beta/models?key=${encodeURIComponent(provider.apiKey)}&pageSize=1000`,
      {},
      TIMEOUT_LIST,
    );
    if (!res.ok) throw apiError(res, body);
    const list = Array.isArray(body?.models) ? body.models : [];
    const models = list
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);
    return { models, ms };
  }

  // openai-compatible
  const { res, body, ms } = await fetchJson(
    `${base}/models`,
    { headers: { Authorization: `Bearer ${provider.apiKey}` } },
    TIMEOUT_LIST,
  );
  if (!res.ok) throw apiError(res, body);
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  const models = list
    .map((m) => (typeof m === "string" ? m : m.id || m.name))
    .filter(Boolean)
    .sort();
  return { models, ms };
}

function apiError(res, body) {
  const detail = errText(body) || res.statusText || "request gagal";
  const err = new Error(`${res.status} ${detail}`);
  err.status = res.status;
  return err;
}

/* ---------------- chat completion ---------------- */

/**
 * Kirim request chat ke provider tertentu.
 * @returns {{text:string, usage:{prompt_tokens:number,completion_tokens:number}, raw:object}}
 */
export async function chatComplete(provider, model, messages, opts = {}) {
  const kind = provider.kind || guessKind(provider.baseUrl);
  const base = trimSlash(provider.baseUrl);
  const maxTokens = opts.maxTokens || 1024;

  if (kind === "anthropic") {
    // system dipisah, sisanya jadi messages
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    const payload = { model, max_tokens: maxTokens, messages: rest };
    if (system) payload.system = system;
    if (opts.temperature != null) payload.temperature = opts.temperature;

    const { res, body, ms } = await fetchJson(
      `${base}/v1/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": provider.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
      },
      TIMEOUT_CHAT,
    );
    if (!res.ok) throw apiError(res, body);
    const text = (body?.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
    return {
      text,
      usage: {
        prompt_tokens: body?.usage?.input_tokens || 0,
        completion_tokens: body?.usage?.output_tokens || 0,
      },
      ms,
      raw: body,
    };
  }

  if (kind === "gemini") {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const payload = { contents, generationConfig: { maxOutputTokens: maxTokens } };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };

    const { res, body, ms } = await fetchJson(
      `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
      TIMEOUT_CHAT,
    );
    if (!res.ok) throw apiError(res, body);
    const text = (body?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    return {
      text,
      usage: {
        prompt_tokens: body?.usageMetadata?.promptTokenCount || 0,
        completion_tokens: body?.usageMetadata?.candidatesTokenCount || 0,
      },
      ms,
      raw: body,
    };
  }

  // openai-compatible
  const payload = { model, messages, max_tokens: maxTokens };
  if (opts.temperature != null) payload.temperature = opts.temperature;
  const { res, body, ms } = await fetchJson(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify(payload),
    },
    TIMEOUT_CHAT,
  );
  if (!res.ok) throw apiError(res, body);
  const text = body?.choices?.[0]?.message?.content ?? "";
  return {
    text: typeof text === "string" ? text : JSON.stringify(text),
    usage: {
      prompt_tokens: body?.usage?.prompt_tokens || 0,
      completion_tokens: body?.usage?.completion_tokens || 0,
    },
    ms,
    raw: body,
  };
}

/**
 * Klasifikasi error untuk keputusan rotator:
 *   "quota"   → token/kredit habis  (cooldown panjang)
 *   "auth"    → API key ditolak      (cooldown panjang, provider perlu dicek ulang)
 *   "rate"    → rate limit sementara (cooldown pendek)
 *   "network" → mati/timeout         (cooldown pendek)
 *   "other"   → error request (mis. model tidak ada)
 */
export function classifyError(err) {
  const status = err?.status;
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("abort") || msg.includes("timeout") || msg.includes("fetch failed") || msg.includes("econn"))
    return { kind: "network", retryable: true, cooldownMs: 20_000 };
  if (status === 401 || status === 403) return { kind: "auth", retryable: true, cooldownMs: 300_000 };
  if (status === 402 || msg.includes("insufficient") || msg.includes("quota") || msg.includes("credit") || msg.includes("balance"))
    return { kind: "quota", retryable: true, cooldownMs: 600_000 };
  if (status === 429) return { kind: "rate", retryable: true, cooldownMs: 30_000 };
  if (status >= 500) return { kind: "network", retryable: true, cooldownMs: 20_000 };
  if (status === 400 || status === 404) return { kind: "other", retryable: true, cooldownMs: 0 };
  return { kind: "other", retryable: true, cooldownMs: 5_000 };
}
