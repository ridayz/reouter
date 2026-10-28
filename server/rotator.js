import { getState } from "./config.js";
import { chatComplete, classifyError } from "./providers.js";
import { candidateOrder, isCooling, markCooldown, recordFail, recordSuccess, recordProbe, ranking } from "./ranking.js";
import { modelInfo } from "./modelinfo.js";

let rrIndex = 0;
const events = [];

/* Statistik kumulatif (nyala selama server hidup) */
const stats = {
  requests: 0,
  success: 0,
  fail: 0,
  failovers: 0,
  tokensIn: 0,
  tokensOut: 0,
  msTotal: 0,
  msCount: 0,
};

export function getStats() {
  return {
    ...stats,
    msAvg: stats.msCount ? Math.round(stats.msTotal / stats.msCount) : 0,
    successRate: stats.requests ? Math.round((stats.success / stats.requests) * 1000) / 10 : 0,
  };
}

/** Peringkat model/provider terbaik saat ini (dipakai dashboard). */
export function getRanking() {
  return ranking();
}

export { recordProbe };

export function pushEvent(type, data) {
  const ev = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), ts: Date.now(), type, ...data };
  events.push(ev);
  if (events.length > 400) events.shift();
  return ev;
}

export function getEvents() {
  return events;
}

export { isCooling };

export function isReady(p) {
  return p.enabled && p.hasKeyState !== false && p.apiKey && p.status === "ok" && (p.picked || []).length > 0 && !isCooling(p);
}

function pickModel(p, requested) {
  const picked = p.picked || [];
  if (!picked.length) return null;
  if (requested && picked.includes(requested)) return requested;
  // tanpa permintaan spesifik: pakai model terkuat yang aktif di provider ini
  return picked.slice().sort((a, b) => (modelInfo(b).smart || 0) - (modelInfo(a).smart || 0))[0];
}

export async function routeChat(messages, requestedModel, opts = {}) {
  const state = getState();
  const requested = opts.mode || state.mode;
  // "auto" = pilih AI terbaik otomatis. Mode lama (failover/round) tetap jalan.
  const mode = requested === "round" ? "round" : requested === "failover" ? "failover" : "auto";
  const order = candidateOrder(mode, rrIndex++, requestedModel);
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

    // jangan buang seluruh provider cuma karena satu model rusak: coba model lain dulu
    const model = pickModel(p, requestedModel);
    pushEvent("try", { provider: p.name, planet: p.planet, model });

    try {
      const out = await chatComplete(p, model, messages, opts);
      p.tokens = p.tokens || { used: 0, limit: 0 };
      p.tokens.used = (p.tokens.used || 0) + (out.usage?.prompt_tokens || 0) + (out.usage?.completion_tokens || 0);
      p.lastError = null;
      p.status = "ok";
      p.lastCheck = Date.now();
      recordSuccess(p, out.ms);

      stats.success++;
      stats.tokensIn += out.usage?.prompt_tokens || 0;
      stats.tokensOut += out.usage?.completion_tokens || 0;
      stats.msTotal += out.ms || 0;
      stats.msCount++;
      if (attempts.some((a) => a.kind !== "skip")) stats.failovers++;

      pushEvent("success", { provider: p.name, planet: p.planet, model, ms: out.ms, usage: out.usage });
      return { ok: true, provider: { ...label, baseUrl: p.baseUrl }, model, text: out.text, usage: out.usage, attempts, ms: Date.now() - startedAt, raw: out.raw };
    } catch (err) {
      const cls = classifyError(err);
      markCooldown(p, cls.cooldownMs, err.message);
      attempts.push({ ...label, model, error: err.message, kind: cls.kind });
      pushEvent("fail", { provider: p.name, planet: p.planet, model, error: err.message, kind: cls.kind });
      stats.fail++;
      recordFail(p);
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
