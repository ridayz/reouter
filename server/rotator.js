import { getState, saveState } from "./config.js";
import { chatComplete, classifyError } from "./providers.js";

let rrIndex = 0;
const events = [];

/* Statistik kumulatif (nyala selama server hidup) */
const stats = { requests: 0, success: 0, fail: 0, tokensIn: 0, tokensOut: 0, msTotal: 0, msCount: 0 };

export function getStats() {
  return {
    ...stats,
    msAvg: stats.msCount ? Math.round(stats.msTotal / stats.msCount) : 0,
  };
}

export function pushEvent(type, data) {
  const ev = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), ts: Date.now(), type, ...data };
  events.push(ev);
  if (events.length > 400) events.shift();
  return ev;
}

export function getEvents() {
  return events;
}

export function isCooling(p) {
  return (p.cooldownUntil || 0) > Date.now();
}

export function isReady(p) {
  return p.enabled && p.hasKeyState !== false && p.apiKey && p.status === "ok" && (p.picked || []).length > 0 && !isCooling(p);
}

export function candidateOrder(mode) {
  const list = getState().providers.slice().sort((a, b) => a.priority - b.priority);
  if (mode === "round" && list.length > 0) {
    const start = rrIndex++ % list.length;
    return list.slice(start).concat(list.slice(0, start));
  }
  return list;
}

function cooldown(p, ms, reason) {
  if (!ms) return;
  p.cooldownUntil = Date.now() + ms;
  p.lastError = reason;
  saveState();
}

function pickModel(p, requested) {
  const picked = p.picked || [];
  if (!picked.length) return null;
  if (requested && picked.includes(requested)) return requested;
  return picked[0];
}

export async function routeChat(messages, requestedModel, opts = {}) {
  const state = getState();
  const mode = opts.mode || state.mode;
  const order = candidateOrder(mode);
  const attempts = [];
  const startedAt = Date.now();

  stats.requests++;
  pushEvent("request", { model: requestedModel || "(auto)", mode, candidates: order.length });

  for (const p of order) {
    const label = { id: p.id, name: p.name, planet: p.planet };

    if (!p.enabled) { attempts.push({ ...label, skipped: "nonaktif", kind: "skip" }); continue; }
    if (!p.apiKey || p.status !== "ok") { attempts.push({ ...label, skipped: "belum dicek", kind: "skip" }); continue; }
    if (!(p.picked || []).length) { attempts.push({ ...label, skipped: "tanpa model", kind: "skip" }); continue; }
    if (isCooling(p)) {
      const sisa = Math.ceil((p.cooldownUntil - Date.now()) / 1000);
      attempts.push({ ...label, skipped: "cooldown " + sisa + "s", kind: "skip" }); continue;
    }

    const model = pickModel(p, requestedModel);
    pushEvent("try", { provider: p.name, planet: p.planet, model });

    try {
      const out = await chatComplete(p, model, messages, opts);
      p.tokens = p.tokens || { used: 0, limit: 0 };
      p.tokens.used = (p.tokens.used || 0) + (out.usage?.prompt_tokens || 0) + (out.usage?.completion_tokens || 0);
      p.lastError = null;
      p.status = "ok";
      p.lastCheck = Date.now();
      saveState();

      stats.success++;
      stats.tokensIn += out.usage?.prompt_tokens || 0;
      stats.tokensOut += out.usage?.completion_tokens || 0;
      stats.msTotal += out.ms || 0;
      stats.msCount++;

      pushEvent("success", { provider: p.name, planet: p.planet, model, ms: out.ms, usage: out.usage });
      return { ok: true, provider: { ...label, baseUrl: p.baseUrl }, model, text: out.text, usage: out.usage, attempts, ms: Date.now() - startedAt, raw: out.raw };
    } catch (err) {
      const cls = classifyError(err);
      cooldown(p, cls.cooldownMs, err.message);
      attempts.push({ ...label, model, error: err.message, kind: cls.kind });
      pushEvent("fail", { provider: p.name, planet: p.planet, model, error: err.message, kind: cls.kind });
      stats.fail++;
    }
  }

  return { ok: false, attempts, ms: Date.now() - startedAt, error: "Semua provider gagal. Cek log." };
}

export function activeModelIds() {
  const out = [];
  for (const p of getState().providers) {
    if (!p.enabled || p.status !== "ok" || !p.apiKey) continue;
    for (const m of p.picked || []) if (!out.includes(m)) out.push(m);
  }
  return out;
}