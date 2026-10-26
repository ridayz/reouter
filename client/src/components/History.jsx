import React, { useState, useMemo } from "react";

export default function History({ logs }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filter === "ok" && l.status !== "ok") return false;
      if (filter === "fail" && l.status === "ok") return false;
      if (q) {
        const blob = `${l.model} ${l.providerName} ${l.prompt} ${l.reply}`.toLowerCase();
        if (!blob.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, filter, q]);

  function exportCsv() {
    const header = [
      "waktu",
      "status",
      "provider",
      "model",
      "prompt",
      "balasan",
      "token_masuk",
      "token_keluar",
      "latensi_ms",
      "biaya_usd",
      "percobaan",
    ];
    const rows = filtered.map((l) => [
      l.ts,
      l.status,
      l.providerName,
      l.model,
      JSON.stringify(l.prompt || ""),
      JSON.stringify(l.reply || ""),
      l.tokensIn,
      l.tokensOut,
      l.latencyMs,
      (l.cost || 0).toFixed(6),
      l.attempts ?? 0,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reouter-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>≡ Riwayat Request</h3>
          <p className="muted small" style={{ marginTop: 3 }}>
            Setiap request dari IDE, agent, atau klien mana pun. Klik baris untuk lihat detail.
          </p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={!filtered.length}>
          ⬇ Unduh CSV
        </button>
      </div>

      <div className="filter-bar">
        <input
          placeholder="🔍 Cari model, klien, atau isi pesan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="seg">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            Semua
          </button>
          <button className={filter === "ok" ? "active" : ""} onClick={() => setFilter("ok")}>
            Berhasil
          </button>
          <button className={filter === "fail" ? "active" : ""} onClick={() => setFilter("fail")}>
            Gagal
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted small">Tidak ada request yang cocok.</p>
      ) : (
        <div className="table-wrap">
          <table className="hist">
            <thead>
              <tr>
                <th>Status</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Pesan</th>
                <th>Token masuk/keluar</th>
                <th>Latensi</th>
                <th>Biaya</th>
                <th>Waktu</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => (
                <tr key={l.id + l.ts + i}>
                  <td>
                    <span className={`tag ${l.status === "ok" ? "green" : "red"}`}>
                      {l.status === "ok" ? "Berhasil" : "Gagal"}
                    </span>
                  </td>
                  <td>
                    <span className="client-chip">🛰 {l.providerName}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {l.model}
                    {l.attempts ? (
                      <div className="muted" style={{ fontSize: 11 }}>
                        failover #{l.attempts + 1}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <div style={{ color: "#c9d1e8" }}>{l.prompt}</div>
                    <div className="muted small" style={{ marginTop: 3 }}>
                      → {l.reply}
                    </div>
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    <span style={{ color: "#7cc7d8" }}>{l.tokensIn}</span> /{" "}
                    <span style={{ color: "#ffb020" }}>{l.tokensOut}</span>
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    {l.latencyMs < 1000
                      ? `${l.latencyMs} ms`
                      : `${(l.latencyMs / 1000).toFixed(2)} dtk`}
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    ${(l.cost || 0).toFixed(5)}
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {new Date(l.ts).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
