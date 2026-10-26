import React from "react";

export default function Logs({ logs, metrics, compact }) {
  const shown = compact ? logs.slice(0, 6) : logs;
  return (
    <div className="card">
      <div className="card-head">
        <h3>📡 Request Terbaru</h3>
        <span className="mono small muted">
          {logs.length} item {metrics && `· ${metrics.successRate}% ok`}
        </span>
      </div>
      <div className="log-list">
        {shown.length === 0 && (
          <p className="muted small">
            Belum ada request. Kirim ke <code>POST http://127.0.0.1:9301/v1/chat/completions</code>{" "}
            atau pakai tombol "Test" di menu Gateway.
          </p>
        )}
        {shown.map((l) => (
          <div key={l.id + l.ts} className={`log-item ${l.status === "ok" ? "" : "bad"}`}>
            <div className="log-top">
              <span className="log-model">
                {l.model} {l.planet && <span className="muted small">({l.planet})</span>}
              </span>
              <span className={`tag ${l.status === "ok" ? "green" : "red"}`}>
                {l.status === "ok" ? "OK" : "GAGAL"}
              </span>
            </div>
            <div className="log-text">"{l.prompt}"</div>
            <div className="log-text reply">→ {l.reply}</div>
            <div className="log-meta mono small muted">
              {l.providerName} · {l.latencyMs} ms · in {l.tokensIn} / out {l.tokensOut} · $
              {l.cost.toFixed(5)} · {new Date(l.ts).toLocaleTimeString()}
              {l.attempts ? ` · failover #${l.attempts + 1}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
