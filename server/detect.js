// Detect which provider an API key belongs to, by trying it against the
// known provider endpoints. First one that authenticates wins.
// Also returns the model list so the user gets agents for free.

const KNOWN = [
  {
    id: "tokenrouter",
    name: "TokenRouter",
    keyPrefix: "tr-",
    test: (k) => ({
      url: "https://tokenrouter.ai.id/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "uoi",
    name: "UOI Token",
    test: (k) => ({
      url: "https://token.uoi.my.id/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "sumopod",
    name: "Sumopod DeepSeek",
    test: (k) => ({
      url: "https://ai.sumopod.com/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "agnes",
    name: "Agnes AI",
    test: (k) => ({
      url: "https://apihub.agnes-ai.com/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "openagentic",
    name: "OpenAgentic",
    test: (k) => ({
      url: "https://openagentic.id/api/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "openai",
    name: "OpenAI",
    test: (k) => ({
      url: "https://api.openai.com/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "groq",
    name: "Groq",
    test: (k) => ({
      url: "https://api.groq.com/openai/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    test: (k) => ({
      url: "https://openrouter.ai/api/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    test: (k) => ({
      url: "https://api.deepseek.com/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "mistral",
    name: "Mistral",
    test: (k) => ({
      url: "https://api.mistral.ai/v1/models",
      headers: { Authorization: `Bearer ${k}` },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    test: (k) => ({
      url: "https://api.anthropic.com/v1/models",
      headers: { "x-api-key": k, "anthropic-version": "2023-06-01" },
    }),
    parseModels: (d) => (d.data || []).map((m) => m.id),
  },
  {
    id: "gemini",
    name: "Google Gemini",
    test: (k) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${k}`,
      headers: {},
    }),
    parseModels: (d) =>
      (d.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, "")),
  },
];

export async function detectProvider(key) {
  const results = [];
  for (const p of KNOWN) {
    try {
      const { url, headers } = p.test(key);
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        let models = [];
        try {
          models = p.parseModels(data);
        } catch {
          models = [];
        }
        // Some /models endpoints are public (e.g. OpenRouter) and answer even
        // for a bogus key. Verify the key actually authenticates with a tiny
        // completion call before claiming ownership.
        const verified = await verifyKey(p.id, key, models);
        if (verified) {
          return { ok: true, provider: p.id, name: p.name, models };
        }
        results.push({ provider: p.id, error: "key tidak valid (auth gagal)" });
      } else {
        results.push({ provider: p.id, status: res.status });
      }
    } catch (e) {
      results.push({ provider: p.id, error: String(e.message || e) });
    }
  }
  return { ok: false, tried: results };
}

// Cheap auth check: a 1-token chat request. 401/403 => wrong key.
async function verifyKey(providerId, key, models) {
  const pick = models[0] || "test";
  const cfg = {
    tokenrouter: {
      url: "https://tokenrouter.ai.id/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    uoi: {
      url: "https://token.uoi.my.id/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    sumopod: {
      url: "https://ai.sumopod.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    agnes: {
      url: "https://apihub.agnes-ai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    openagentic: {
      url: "https://openagentic.id/api/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    openai: {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    groq: {
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    openrouter: {
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    deepseek: {
      url: "https://api.deepseek.com/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    mistral: {
      url: "https://api.mistral.ai/v1/chat/completions",
      headers: { Authorization: `Bearer ${key}` },
      body: { model: pick, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
    },
    anthropic: {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: { model: pick, max_tokens: 1, messages: [{ role: "user", content: "hi" }] },
    },
    gemini: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${pick}:generateContent?key=${key}`,
      headers: {},
      body: { contents: [{ parts: [{ text: "hi" }] }] },
    },
  }[providerId];
  if (!cfg) return true;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cfg.headers },
      body: JSON.stringify(cfg.body),
    });
    // 401/403 = definitely wrong. 400/404 (model issue) still means key works.
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

