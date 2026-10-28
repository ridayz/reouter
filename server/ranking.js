/*
 * ranking.js — "pemilih model terbaik" untuk mode failover.
 *
 * Skor gabungan (0-100) dari:
 *   - kualitas   : skor kecerdasan model (modelinfo) — model lemot & "ngawur" turun
 *   - kecepatan  : latensi nyata (pengukuran rotator sendiri, bukan tabel)
 *   - keandalan  : rasio sukses / jumlah percobaan provider
 *   - prioritas  : urutan pilihan user sebagai pengaman terakhir
 *
 * Semua angka yang dipakai untuk kecepatan & keandalan adalah hasil request nyata.
 */
import { getState, saveState } from "./config.js";
import { modelInfo } from "./modelinfo.js";

const SMOOTH = 2;             // ukuran riwayat latensi: makin kecil, makin cepat menyesuaikan
const RETRY_AFTER_FAIL = 15_000;

export function isCooling(p) {
  return (p.cooldownUntil || 0) > Date.now();
}

/** Statistik runtime per provider (tidak disimpan ke disk). */
function ensureStats(p) {
  if (!p.stats) p.stats = {};
  const s = p.stats;
  if (typeof s.ok !== "number") s.ok = 0;
  if (typeof s.fail !== "number") s.fail = 0;
  if (typeof s.latencyMs !== "number") s.latencyMs = p.latency || 1200;
  return s;
}

export function recordSuccess(p, ms) {
  const s = ensureStats(p);
  s.ok += 1;
  s.lastOk = Date.now();
  s.lastFailAt = 0;
  if (ms > 0) {
    // percobaan pertama langsung dipakai apa adanya, berikutnya baru dirata-rata
    s.latencyMs = s.ok === 1 ? ms : Math.round((s.latencyMs * SMOOTH + ms) / (SMOOTH + 1));
  }
  p.latency = s.latencyMs;
}

export function recordFail(p) {
  const s = ensureStats(p);
  s.fail += 1;
  s.lastFailAt = Date.now();
}

function modelQuality(p) {
  const model = (p.picked || [])[0] || (p.models || [])[0] || "";
  const info = modelInfo(model);
  // smart 1-5 → 0.3-1. Model terbaik pun tidak menutupi provider yang 10x lebih lambat,
  // tapi model "bodoh" tetap tidak akan dipilih kalau ada yang lebih pintar.
  return info.smart ? 0.3 + 0.7 * Math.min(1, Math.max(0, (info.smart - 1) / 4)) : 0.6;
}

function speedScore(p) {
  const s = ensureStats(p);
  const ms = Math.max(80, s.latencyMs || 1200);
  // logaritmik: 300ms vs 600ms beda jelas, 2s vs 2.3s tidak berlebihan
  return Math.min(1, Math.max(0, Math.log(2500 / ms) / Math.log(2500 / 200)));
}

function reliability(p) {
  const s = ensureStats(p);
  const total = s.ok + s.fail;
  return (s.ok + 1) / (total + 2); // Laplace: 1 gagal dari 1 request tidak langsung menjatuhkan skor
}

function priorityScore(p, list) {
  const n = Math.max(1, list.length - 1);
  const idx = Math.min(n, Math.max(0, (p.priority || 1) - 1));
  return 1 - idx / (n + 1);
}

export function scoreProvider(p, list) {
  const q = modelQuality(p);
  const sp = speedScore(p);
  const rel = reliability(p);
  const pr = priorityScore(p, list);
  // kecepatan & kualitas paling berpengaruh, sisanya penyeimbang
  const score = q * 40 + sp * 40 + rel * 12 + pr * 8;
  return {
    score: Math.round(score * 10) / 10,
    quality: Math.round(((q - 0.3) / 0.7) * 100),
    speed: Math.round(sp * 100),
    reliability: Math.round(rel * 100),
    latencyMs: ensureStats(p).latencyMs,
  };
}

/** Pemanggilan pertama belum punya ukuran: anggap semua sama cepat supaya adil. */
export function warmupLatency(providers) {
  for (const p of providers) {
    const s = ensureStats(p);
    if (s.ok === 0 && s.fail === 0) s.latencyMs = 1200;
  }
}

/** Hasil "cek API" = percobaan nyata pertama. Sekali ukur, langsung dipakai (tanpa smoothing). */
export function recordProbe(p, ms) {
  const s = ensureStats(p);
  if (!ms) return;
  if (s.ok === 0 && s.fail === 0) s.latencyMs = ms;
  p.latency = s.latencyMs;
}

/** Daftar provider yang boleh dicoba, urut dari yang paling layak. */
export function candidateOrder(mode, rrIndex = 0, requestedModel = null) {
  const all = getState().providers.slice();
  if (mode !== "auto") return all.sort((a, b) => a.priority - b.priority);

  const list = all.slice();
  const ready = list.filter(
    (p) =>
      p.enabled &&
      p.apiKey &&
      p.status === "ok" &&
      (p.picked || []).length &&
      // kalau user minta model tertentu, provider yang punya model itu didahulukan
      (!requestedModel || p.picked.includes(requestedModel)),
  );
  const ranked = ready
    .map((p) => ({ p, s: scoreProvider(p, list) }))
    .sort((a, b) => b.s.score - a.s.score)
    .map((x) => x.p);
  const rest = list.filter((p) => !ready.includes(p)).sort((a, b) => a.priority - b.priority);
  const out = ranked.concat(rest);
  if (!out.length) return out;
  const start = rrIndex % out.length;
  const head = out.slice(0, Math.min(3, out.length)); // top-3 diacak putaran supaya beban merata
  if (head.length > 1) {
    const k = rrIndex % head.length;
    const rotated = head.slice(k).concat(head.slice(0, k));
    return rotated.concat(out.slice(head.length));
  }
  return out.slice(start).concat(out.slice(0, start));
}

/** Detail peringkat untuk dashboard (provider teratas = yang dipakai lebih dulu). */
export function ranking() {
  const list = getState().providers.slice();
  warmupLatency(list);
  const ready = list.filter((p) => p.enabled && p.apiKey && p.status === "ok" && (p.picked || []).length);
  const modelOf = (p) => {
    const models = p.picked || [];
    // tampilkan model terkuat, karena itu yang mewakili kualitas provider
    const bestModel = models.slice().sort((a, b) => modelInfo(b).smart - modelInfo(a).smart)[0];
    return bestModel || "";
  };
  const ranked = ready
    .map((p) => ({ id: p.id, name: p.name, planet: p.planet, model: modelOf(p), ...scoreProvider(p, list) }))
    .sort((a, b) => b.score - a.score);
  return ranked;
}

/** Simpan cooldown tanpa menulis disk pada setiap kegagalan (hemat, tapi state tetap aman). */
export function markCooldown(p, ms, reason) {
  if (!ms) return;
  p.cooldownUntil = Date.now() + ms;
  p.lastError = reason;
  try {
    saveState();
  } catch {
    /* penyimpanan gagal tidak boleh menghentikan failover */
  }
}

export { RETRY_AFTER_FAIL };
