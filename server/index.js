// ReOUTER — real multi-provider AI gateway + telemetry dashboard.
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, saveConfig, publicConfig, mergeConfig } from "./config.js";
import { routeChat } from "./router.js";
import { listModels } from "./providers.js";
import { detectProvider } from "./detect.js";
import { logs, computeMetrics, bus } from "./metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// ---- OpenAI-compatible gateway (real routing) ----
app.post("/v1/chat/completions", async (req, res) => {
  const cfg = loadConfig();
  try {
    const out = await routeChat(req.body, cfg);
    res.json({
      id: out.requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: out.model,
      provider: out.provider,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: out.text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: out.tokensIn,
        completion_tokens: out.tokensOut,
        total_tokens: out.tokensIn + out.tokensOut,
      },
    });
  } catch (e) {
    res.status(502).json({ error: { message: String(e.message || e) } });
  }
});

// ---- Model listing for clients (OpenCode, IDEs, etc.) ----
// Exposes every model of every enabled provider so a client can pick an "agent".
app.get("/v1/models", (_req, res) => {
  const cfg = loadConfig();
  const data = [];
  for (const p of cfg.providers) {
    if (!p.enabled) continue;
    const models = (p.models && p.models.length ? p.models : []).map((m) => ({
      id: m,
      object: "model",
      owned_by: p.name,
      provider: p.name,
      label: p.label || p.name,
      planet: p.planet,
    }));
    data.push(...models);
  }
  res.json({ object: "list", data });
});

// ---- Dashboard API ----
app.get("/api/config", (_req, res) => res.json(publicConfig(loadConfig())));

app.post("/api/config", (req, res) => {
  const cur = loadConfig();
  const saved = saveConfig(mergeConfig(cur, req.body || {}));
  res.json(publicConfig(saved));
});

// Auto-discover a provider's real model list from its API.
app.post("/api/fetch-models", async (req, res) => {
  const cfg = loadConfig();
  const id = req.body?.id;
  const provider = cfg.providers.find((p) => p.id === id);
  if (!provider) return res.status(404).json({ error: "Provider tidak ditemukan" });

  // Allow testing with a key typed but not yet saved.
  const probe = { ...provider, apiKey: req.body?.apiKey?.trim() || provider.apiKey };
  if (!probe.apiKey) return res.status(400).json({ error: "API key kosong" });

  try {
    const models = await listModels(probe);
    // Persist discovered models so the dropdown keeps working offline.
    const cur = loadConfig();
    cur.providers = cur.providers.map((p) => (p.id === id ? { ...p, models } : p));
    saveConfig(cur);
    res.json({ ok: true, count: models.length, models });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// One-shot setup: paste a key -> we detect the provider, register it, and
// pull its model list. No manual provider picking.
app.post("/api/quick-add", async (req, res) => {
  const key = (req.body?.apiKey || "").trim();
  if (!key) return res.status(400).json({ error: "API key kosong" });

  let det;
  try {
    det = await detectProvider(key);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
  if (!det.ok) {
    return res
      .status(404)
      .json({ error: "Key tidak dikenali di provider yang dikenal", tried: det.tried });
  }

  const cfg = loadConfig();
  const existing = cfg.providers.find((p) => p.id === det.provider);

  // Preview mode: just report detection + model list, don't save yet.
  if (req.body?.preview) {
    return res.json({
      preview: true,
      provider: det.provider,
      name: existing?.name || det.name,
      models: det.models,
    });
  }

  // Only keep models the user selected (if provided).
  const selected = Array.isArray(req.body?.models) ? req.body.models : det.models;
  const baseUrls = {
    tokenrouter: "https://tokenrouter.ai.id/v1",
    uoi: "https://token.uoi.my.id/v1",
    sumopod: "https://ai.sumopod.com/v1",
    agnes: "https://apihub.agnes-ai.com/v1",
    openagentic: "https://openagentic.id/api/v1",
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    deepseek: "https://api.deepseek.com/v1",
    mistral: "https://api.mistral.ai/v1",
    anthropic: "https://api.anthropic.com/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta",
  };

  const entry = {
    ...(existing || {}),
    id: det.provider,
    name: existing?.name || det.name,
    planet: existing?.planet || "",
    enabled: true,
    priority: existing?.priority ?? cfg.providers.length + 1,
    baseUrl: baseUrls[det.provider],
    apiKey: key,
    models: selected,
    pricing: existing?.pricing || {},
  };

  cfg.providers = existing
    ? cfg.providers.map((p) => (p.id === det.provider ? entry : p))
    : [...cfg.providers, entry];

  saveConfig(cfg);
  res.json({
    ok: true,
    provider: det.provider,
    name: entry.name,
    modelCount: det.models.length,
    models: det.models,
  });
});

// Generate an OpenCode provider config from currently enabled providers.
app.get("/api/opencode-config", (_req, res) => {
  const cfg = loadConfig();
  const models = {};
  for (const p of cfg.providers) {
    if (!p.enabled) continue;
    for (const m of p.models || []) {
      models[m] = { name: `${m} · ${p.name}` };
    }
  }
  const port = cfg.port || 9301;
  res.json({
    $schema: "https://opencode.ai/config.json",
    provider: {
      reouter: {
        npm: "@ai-sdk/openai-compatible",
        name: "ReOUTER",
        options: {
          baseURL: `http://127.0.0.1:${port}/v1`,
          apiKey: "reouter",
        },
        models,
      },
    },
  });
});

app.get("/api/metrics", (_req, res) => res.json(computeMetrics()));
app.get("/api/logs", (_req, res) => res.json(logs.slice(0, 200)));

// Realtime stream
app.get("/api/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ type: "metrics", data: computeMetrics() })}\n\n`);
  const onLog = () => {
    res.write(`data: ${JSON.stringify({ type: "log", metrics: computeMetrics() })}\n\n`);
  };
  bus.on("log", onLog);
  const hb = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    bus.off("log", onLog);
    clearInterval(hb);
  });
});

// Live test endpoint for the dashboard "Test" button
app.post("/api/test", async (req, res) => {
  const cfg = loadConfig();
  const model = req.body?.model;
  try {
    const out = await routeChat(
      {
        model,
        messages: [
          { role: "user", content: req.body?.prompt || "Balas OK saja, satu kata." },
        ],
      },
      cfg
    );
    res.json({
      ok: true,
      provider: out.provider,
      model: out.model,
      text: out.text,
      latencyMs: out.latencyMs,
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
  }
});

// Serve built dashboard if present
const dist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(dist));

// Mockup (hanya untuk dilihat, bukan bagian aplikasi)
app.use("/mockup", express.static(path.join(__dirname, "..", "mockup")));
app.get(/^(?!\/v1|\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

const cfg = loadConfig();
const PORT = process.env.PORT || cfg.port || 9301;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`ReOUTER gateway    -> http://127.0.0.1:${PORT}/v1`);
  console.log(`ReOUTER dashboard  -> http://127.0.0.1:${PORT}/`);
});
