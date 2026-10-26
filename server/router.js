// Failover engine: tries enabled providers in priority order (triple-priority),
// measures real latency, records real token/cost telemetry.
import { callProvider, estimateCost, newId } from "./providers.js";
import { addLog } from "./metrics.js";

export async function routeChat(req, cfg) {
  const started = Date.now();
  const requestId = newId();

  let candidates = cfg.providers
    .filter((p) => p.enabled && p.hasKey !== false && p.apiKey)
    .sort((a, b) => a.priority - b.priority);

  // Optional: force a specific provider (by id or name) for testing/direct use.
  if (req.provider) {
    const want = String(req.provider).toLowerCase();
    const forced = cfg.providers.filter(
      (p) => p.enabled && p.apiKey && (p.id === want || p.name.toLowerCase() === want)
    );
    if (forced.length) candidates = forced;
  }

  if (candidates.length === 0) {
    addLog({
      id: requestId,
      ts: new Date().toISOString(),
      status: "error",
      providerName: "—",
      model: req.model || "—",
      prompt: promptPreview(req.messages),
      reply: "Tidak ada provider aktif. Isi API key di dashboard.",
      latencyMs: Date.now() - started,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
    });
    throw new Error("NO_PROVIDER");
  }

  const attempts = [];
  for (const provider of candidates) {
    const model = pickModel(provider, req.model);
    const t0 = Date.now();
    try {
      const out = await callProvider(provider, model, req.messages);
      const latencyMs = Date.now() - t0;
      const cost = estimateCost(provider, out.model, out.tokensIn, out.tokensOut);
      addLog({
        id: requestId,
        ts: new Date().toISOString(),
        status: "ok",
        providerId: provider.id,
        providerName: provider.name,
        planet: provider.planet,
        model: out.model,
        prompt: promptPreview(req.messages),
        reply: out.text.slice(0, 160),
        latencyMs,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        cost,
        attempts: attempts.length,
      });
      return { ...out, provider: provider.name, planet: provider.planet, latencyMs, requestId };
    } catch (e) {
      attempts.push({ provider: provider.name, error: String(e.message || e) });
      addLog({
        id: newId(),
        ts: new Date().toISOString(),
        status: "error",
        providerId: provider.id,
        providerName: provider.name,
        planet: provider.planet,
        model,
        prompt: promptPreview(req.messages),
        reply: `GAGAL: ${e.message || e}`,
        latencyMs: Date.now() - t0,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        attempt: attempts.length,
      });
    }
  }

  throw new Error(
    `SEMUA_GAGAL: ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`
  );
}

function pickModel(provider, requested) {
  if (requested && provider.models.includes(requested)) return requested;
  return provider.models[0];
}

function promptPreview(messages) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return (last?.content || "").slice(0, 120);
}
