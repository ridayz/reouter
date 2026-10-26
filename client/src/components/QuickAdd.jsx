import React, { useState } from "react";

// One-shot setup: paste a key, ReOUTER figures out which provider it is and
// shows the available models as checkboxes. Pick what you want, save.
export default function QuickAdd({ refresh }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState({});
  const [saved, setSaved] = useState(false);

  async function detect() {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    setSaved(false);
    try {
      const r = await fetch("/api/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim(), preview: true }),
      });
      const data = await r.json();
      if (data.ok || data.preview) {
        setResult(data);
        // Default: everything checked (most people want all models).
        const all = {};
        (data.models || []).forEach((m) => (all[m] = true));
        setChecked(all);
      } else {
        setError(data.error || "Key tidak dikenali");
      }
    } catch (e) {
      setError("Gagal: " + e);
    }
    setBusy(false);
  }

  async function save() {
    const models = (result?.models || []).filter((m) => checked[m]);
    setBusy(true);
    try {
      const r = await fetch("/api/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key.trim(), models }),
      });
      const data = await r.json();
      if (data.ok) {
        setSaved(true);
        setResult({ ...result, provider: data.provider, name: data.name });
        refresh();
      } else {
        setError(data.error || "Gagal menyimpan");
      }
    } catch (e) {
      setError("Gagal: " + e);
    }
    setBusy(false);
  }

  const allChecked = result?.models?.length && result.models.every((m) => checked[m]);
  const chosenCount = (result?.models || []).filter((m) => checked[m]).length;

  return (
    <div className="card">
      <h3>⚡ Tambah Cepat — Cek API</h3>
      <p className="muted small" style={{ marginTop: 3 }}>
        Tempel API key → klik <b>Cek API</b>. ReOUTER langsung memeriksa apakah key-nya{" "}
        <b>valid</b>, kenali providernya, dan tampilkan daftar model buat dicentang.
      </p>

      <div className="row gap" style={{ marginTop: 14 }}>
        <label className="grow">
          API Key
          <input
            type="password"
            placeholder="tempel API key di sini…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && detect()}
          />
        </label>
        <button className="btn primary" onClick={detect} disabled={busy || !key.trim()}>
          {busy ? "⏳ Memeriksa…" : "✅ Cek API"}
        </button>
      </div>

      {error && (
        <div className="test-msg mono small" style={{ borderColor: "var(--red)" }}>
          <b>❌ API key TIDAK valid</b>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      {result && (
        <>
          <div
            className="test-msg"
            style={{ marginTop: 14, borderColor: "var(--green)" }}
          >
            <b>✅ API key VALID</b> — Terdeteksi: <b>{result.name}</b> ({result.provider}) ·{" "}
            {result.models?.length || 0} model tersedia
          </div>

          {result.models?.length > 0 && (
            <>
              <div className="card-head" style={{ marginTop: 16, marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>
                  Pilih model yang mau dipakai ({chosenCount}/{result.models.length})
                </h4>
                <button
                  className="btn small"
                  onClick={() => {
                    const all = {};
                    const target = !allChecked;
                    result.models.forEach((m) => (all[m] = target));
                    setChecked(all);
                  }}
                >
                  {allChecked ? "Kosongkan" : "Pilih semua"}
                </button>
              </div>

              <div className="model-grid">
                {result.models.map((m) => (
                  <label key={m} className="model-check">
                    <input
                      type="checkbox"
                      checked={!!checked[m]}
                      onChange={(e) => setChecked((c) => ({ ...c, [m]: e.target.checked }))}
                    />
                    <span className="mono">{m}</span>
                  </label>
                ))}
              </div>

              <div className="row gap" style={{ marginTop: 16 }}>
                <button
                  className="btn primary"
                  onClick={save}
                  disabled={busy || chosenCount === 0 || saved}
                >
                  {saved ? "✅ Tersimpan" : `💾 Simpan ${chosenCount} model`}
                </button>
                {saved && (
                  <span className="muted small">
                    Provider aktif. Lihat di menu Agent &amp; Model.
                  </span>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
