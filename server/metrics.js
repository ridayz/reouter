// Telemetry store: request logs + rolling metrics. Real numbers only.
import { EventEmitter } from "node:events";

export const bus = new EventEmitter();
export const logs = []; // newest first
const MAX_LOGS = 500;

export function addLog(entry) {
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.pop();
  bus.emit("log", entry);
}

export function computeMetrics() {
  const total = logs.length;
  const success = logs.filter((l) => l.status === "ok").length;
  const failed = total - success;
  const tokensIn = logs.reduce((s, l) => s + (l.tokensIn || 0), 0);
  const tokensOut = logs.reduce((s, l) => s + (l.tokensOut || 0), 0);
  const cost = logs.reduce((s, l) => s + (l.cost || 0), 0);
  const latencies = logs.filter((l) => l.status === "ok").map((l) => l.latencyMs);
  latencies.sort((a, b) => a - b);
  const median = latencies.length
    ? latencies[Math.floor(latencies.length / 2)]
    : 0;

  // Who answered — grouped by provider name
  const byProvider = {};
  for (const l of logs) {
    const k = l.status === "ok" ? l.providerName : "Gagal";
    byProvider[k] = (byProvider[k] || 0) + 1;
  }

  return {
    total,
    success,
    failed,
    successRate: total ? Math.round((success / total) * 1000) / 10 : 0,
    tokensIn,
    tokensOut,
    cost: Math.round(cost * 1000000) / 1000000,
    medianLatencyMs: median,
    byProvider,
  };
}
