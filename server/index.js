/*
 * index.js — server ReOUTER.
 *
 *  Dashboard (dipakai UI)   : /api/*
 *  Gateway untuk CLI coding : /v1/chat/completions, /v1/models   (OpenAI-compatible)
 *  Adapter Anthropic        : /anthropic/v1/messages             (buat Claude Code)
 *  UI                       : /  (file mockup/v3.html)
 */
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  getState,
  saveState,
  publicState,
  publicProvider,
  nextPlanet,
  maskKey,
} from "./config.js";
import { listModels, PROVIDER_PRESETS, guessKind } from "./providers.js";
import { routeChat, activeModelIds, getEvents, pushEvent, getStats } from "./rotator.js";
import { modelBadges } from "./modelinfo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.REOUTER_PORT || 9301);
const HOST = "127.0.0.1";

const app = express();
app.use(express.json({ limit: "25mb" }));

/* nggak ada auth supaya gampang dipakai CLI lokal, tapi CORS dibatasi */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ======================= API DASHBOARD ======================= */

app.get("/api/state", (req, res) => {
  const state = publicState();
  // lengkapi tiap model dengan info harga / kecepatan / kemampuan
  for (const p of state.providers) {
    p.modelInfo = {};
    for (const m of p.models) p.modelInfo[m] = modelBadges(m);
  }
  res.json({ ...state, presets: PROVIDER_PRESETS, events: getEvents().slice(-60), stats: getStats() });
});

/** Info harga satu model (dipakai UI kalau butuh detail). */
app.get("/api/model-info", (req, res) => {
  const id = String(req.query.model || "");
  if (!id) return res.status(400).json({ error: "model wajib diisi" });
  res.json({ model: id, info: modelBadges(id) });
});

app.post("/api/mode", (req, res) => {
  const s = getState();
  s.mode = req.body?.mode === "round" ? "round" : "failover";
  saveState();
  res.json({ ok: true, mode: s.mode });
});

function findProvider(id) {
  return getState().providers.find((p) => p.id === id);
}

app.post("/api/providers", (req, res) => {
  const s = getState();
  const body = req.body || {};
  const look = nextPlanet();
  const p = {
    id: crypto.randomUUID().slice(0, 8),
    name: (body.name || "Provider").trim(),
    planet: look.planet,
    c1: look.c1,
    c2: look.c2,
    glow: look.glow,
    baseUrl: (body.baseUrl || "").trim(),
    kind: body.kind || guessKind(body.baseUrl),
    apiKey: (body.apiKey || "").trim(),
    priority: s.providers.length + 1,
    enabled: true,
    status: "unknown",
    models: [],
    picked: [],
    tokens: { used: 0, limit: 0 },
    cooldownUntil: 0,
  };
  s.providers.push(p);
  saveState();
  res.json({ ok: true, provider: publicProvider(p) });
});

app.patch("/api/providers/:id", (req, res) => {
  const p = findProvider(req.params.id);
  if (!p) return res.status(404).json({ error: "Provider tidak ditemukan" });
  const b = req.body || {};

  if (typeof b.name === "string") p.name = b.name.trim() || p.name;
  if (typeof b.baseUrl === "string") {
    p.baseUrl = b.baseUrl.trim();
    if (!b.kind) p.kind = guessKind(p.baseUrl);
  }
  if (typeof b.kind === "string") p.kind = b.kind;
  if (typeof b.apiKey === "string" && b.apiKey.trim() && !b.apiKey.includes("••")) {
    p.apiKey = b.apiKey.trim();
    p.status = "unknown";
  }
  if (typeof b.enabled === "boolean") p.enabled = b.enabled;
  if (typeof b.priority === "number") p.priority = b.priority;
  if (Array.isArray(b.picked)) {
    p.picked = b.picked.filter((m) => (p.models || []).includes(m) || true);
    if (p.picked.length) p.enabled = true;
  }
  if (Array.isArray(b.models)) p.models = b.models;
  if (typeof b.resetCooldown === "boolean" && b.resetCooldown) {
    p.cooldownUntil = 0;
    p.lastError = null;
  }

  saveState();
  res.json({ ok: true, provider: publicProvider(p) });
});

app.delete("/api/providers/:id", (req, res) => {
  const s = getState();
  const i = s.providers.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Provider tidak ditemukan" });
  s.providers.splice(i, 1);
  s.providers.forEach((p, idx) => (p.priority = idx + 1));
  saveState();
  res.json({ ok: true });
});

/** Tombol "Cek API Provider" — benar-benar menembak API provider. */
app.post("/api/providers/:id/check", async (req, res) => {
  const p = findProvider(req.params.id);
  if (!p) return res.status(404).json({ error: "Provider tidak ditemukan" });
  const b = req.body || {};

  if (typeof b.apiKey === "string" && b.apiKey.trim() && !b.apiKey.includes("••")) p.apiKey = b.apiKey.trim();
  if (typeof b.baseUrl === "string" && b.baseUrl.trim()) p.baseUrl = b.baseUrl.trim();
  if (typeof b.kind === "string") p.kind = b.kind;

  if (!p.apiKey) {
    p.status = "error";
    p.lastError = "API key kosong";
    saveState();
    return res.status(400).json({ ok: false, error: "API key kosong", provider: publicProvider(p) });
  }
  if (!p.baseUrl) {
    p.status = "error";
    p.lastError = "Base URL kosong";
    saveState();
    return res.status(400).json({ ok: false, error: "Base URL kosong", provider: publicProvider(p) });
  }

  try {
    const { models, ms } = await listModels(p);
    p.status = "ok";
    p.lastError = null;
    p.lastCheck = Date.now();
    p.latency = ms;
    p.models = models;
    // buang picked yang sudah tidak ada
    p.picked = (p.picked || []).filter((m) => models.includes(m));
    // kalau belum ada pilihan, aktifkan beberapa model pertama
    if (!p.picked.length && models.length) p.picked = models.slice(0, Math.min(2, models.length));
    saveState();
    pushEvent("check", { provider: p.name, planet: p.planet, ok: true, count: models.length, ms });
    res.json({ ok: true, count: models.length, ms, provider: publicProvider(p) });
  } catch (err) {
    p.status = "error";
    p.lastError = err.message;
    p.lastCheck = Date.now();
    saveState();
    pushEvent("check", { provider: p.name, planet: p.planet, ok: false, error: err.message });
    res.status(200).json({ ok: false, error: err.message, provider: publicProvider(p) });
  }
});

/** Tes rotator: kirim 1 prompt nyata lewat seluruh rantai provider. */
app.post("/api/test", async (req, res) => {
  const prompt = (req.body?.prompt || "Balas satu kalimat singkat: halo dari ReOUTER.").trim();
  const model = req.body?.model || null;
  const out = await routeChat([{ role: "user", content: prompt }], model, { maxTokens: 128 });
  res.json({ ...out, prompt });
});

app.get("/api/usage", (req, res) => {
  res.json({
    providers: publicState().providers.map((p) => ({
      id: p.id,
      name: p.name,
      planet: p.planet,
      tokens: p.tokens,
      status: p.status,
      lastError: p.lastError,
      cooldownUntil: p.cooldownUntil,
    })),
  });
});

/* ======================= GATEWAY (untuk CLI) ======================= */

function modelObjects() {
  const seen = new Set();
  const out = [];
  for (const p of publicState().providers) {
    if (!p.enabled || p.status !== "ok") continue;
    for (const m of p.picked) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push({ id: m, object: "model", owned_by: p.name, provider_planet: p.planet });
    }
  }
  return out;
}

app.get("/v1/models", (req, res) => {
  res.json({ object: "list", data: modelObjects() });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mode: getState().mode,
    providers: publicState().providers.map((p) => ({
      name: p.name,
      planet: p.planet,
      status: p.status,
      enabled: p.enabled,
      models: p.picked.length,
      cooldownMs: Math.max(0, p.cooldownUntil - Date.now()),
      lastError: p.lastError,
    })),
  });
});

app.post("/v1/chat/completions", async (req, res) => {
  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return res.status(400).json({ error: { message: "messages kosong", type: "invalid_request_error" } });

  const out = await routeChat(messages, body.model, {
    maxTokens: body.max_tokens || body.max_completion_tokens || 1024,
    temperature: body.temperature,
  });

  if (!out.ok) {
    return res.status(503).json({
      error: { message: out.error, type: "rotator_error", attempts: out.attempts },
    });
  }

  const content = out.text;
  res.json({
    id: "chatcmpl-" + crypto.randomUUID().slice(0, 24),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: out.model,
    provider: out.provider.name,
    provider_planet: out.provider.planet,
    reouter: { attempts: out.attempts.length, ms: out.ms },
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: out.usage.prompt_tokens,
      completion_tokens: out.usage.completion_tokens,
      total_tokens: out.usage.prompt_tokens + out.usage.completion_tokens,
    },
  });
});

/** Streaming sederhana: teks dikirim utuh sebagai satu chunk lalu [DONE]. */
app.post("/v1/chat/completions/stream", async (req, res) => {
  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const out = await routeChat(messages, body.model, { maxTokens: body.max_tokens || 1024 });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const id = "chatcmpl-" + crypto.randomUUID().slice(0, 24);
  if (!out.ok) {
    res.write(`data: ${JSON.stringify({ error: out.error })}\n\n`);
    return res.end("data: [DONE]\n\n");
  }
  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      model: out.model,
      choices: [{ index: 0, delta: { role: "assistant", content: out.text }, finish_reason: null }],
    })}\n\n`,
  );
  res.write(
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  );
  res.end("data: [DONE]\n\n");
});

/* ======================= ADAPTER ANTHROPIC (Claude Code) ======================= */
/**
 * Claude Code ngomong pakai format Anthropic. Endpoint ini menerima format itu,
 * lalu meneruskannya ke rotator — jadi Claude Code otomatis ikut failover.
 */
app.post("/anthropic/v1/messages", async (req, res) => {
  const body = req.body || {};
  const messages = [];
  if (body.system) {
    const sys = Array.isArray(body.system)
      ? body.system.map((s) => s.text || "").join("\n\n")
      : String(body.system);
    messages.push({ role: "system", content: sys });
  }
  for (const m of body.messages || []) {
    const content = Array.isArray(m.content)
      ? m.content.map((c) => (typeof c === "string" ? c : c.text || "")).join("")
      : String(m.content || "");
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content });
  }

  const out = await routeChat(messages, body.model, { maxTokens: body.max_tokens || 1024 });
  if (!out.ok) {
    return res.status(503).json({ type: "error", error: { type: "api_error", message: out.error } });
  }
  res.json({
    id: "msg_" + crypto.randomUUID().slice(0, 20),
    type: "message",
    role: "assistant",
    model: out.model,
    provider: out.provider.name,
    content: [{ type: "text", text: out.text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: out.usage.prompt_tokens, output_tokens: out.usage.completion_tokens },
  });
});

/* ======================= UI ======================= */

app.use(express.static(path.join(ROOT, "mockup")));
app.get("/", (req, res) => res.sendFile(path.join(ROOT, "mockup", "v3.html")));

/* ======================= START ======================= */

app.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`;
  console.log("");
  console.log("  ReOUTER siap 🚀");
  console.log("  ─────────────────────────────────────────────");
  console.log(`  Dashboard : ${base}`);
  console.log(`  Gateway   : ${base}/v1      (OpenAI-compatible)`);
  console.log(`  Anthropic : ${base}/anthropic (untuk Claude Code)`);
  console.log(`  Model     : ${base}/v1/models`);
  console.log("  ─────────────────────────────────────────────");
  console.log("  Tekan Ctrl+C untuk berhenti.");
  console.log("");
});

// biar file config selalu tersimpan rapi
process.on("SIGINT", () => {
  saveState();
  console.log("\n  ReOUTER berhenti.");
  process.exit(0);
});
