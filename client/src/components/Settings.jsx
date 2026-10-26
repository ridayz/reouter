import React, { useState, useEffect } from "react";

export default function Settings({ config, refresh }) {
  const [port, setPort] = useState(config.port);
  const [ocConfig, setOcConfig] = useState("");
  const [copied, setCopied] = useState("");
  const base = `http://127.0.0.1:${config.port}`;

  useEffect(() => {
    fetch("/api/opencode-config")
      .then((r) => r.json())
      .then((c) => setOcConfig(JSON.stringify(c, null, 2)));
  }, [config]);

  async function save() {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: Number(port) }),
    });
    refresh();
  }

  function copy(text, label) {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  const enabledCount = config.providers.filter((p) => p.enabled).length;

  return (
    <>
      <div className="card">
        <h3>🔌 Pasang di OpenCode</h3>
        <p className="muted small" style={{ marginTop: 4 }}>
          ReOUTER kompatibel penuh dengan OpenAI API. Config di bawah <b>di-generate otomatis</b>{" "}
          dari {enabledCount} provider yang lo aktifkan — tinggal salin.
        </p>

        <h4 style={{ marginTop: 16 }}>Langkah pemasangan</h4>
        <ol className="muted small" style={{ lineHeight: 2, paddingLeft: 20 }}>
          <li>Jalankan ReOUTER (`run.bat`) — biarkan terminal terbuka.</li>
          <li>Buka file config OpenCode: <code>%USERPROFILE%\.config\opencode\opencode.json</code></li>
          <li>
            Tempel blok <code>provider</code> di bawah. Kalau file sudah punya <code>provider</code>,
            gabungkan isinya (jangan dobel key).
          </li>
          <li>Simpan, restart OpenCode.</li>
          <li>
            Pilih model lewat <b>/models</b> di OpenCode, atau ganti <code>model</code> di config
            jadi <code>reouter/nama-model</code>.
          </li>
        </ol>

        <h4 style={{ marginTop: 18 }}>1. Config OpenCode (auto-generated)</h4>
        <pre className="code">{ocConfig}</pre>
        <div className="copy-row">
          <button className="btn small" onClick={() => copy(ocConfig, "oc")}>
            {copied === "oc" ? "✅ Tersalin" : "📋 Copy config"}
          </button>
          <button className="btn small" onClick={() => copy(`${base}/v1`, "url")}>
            {copied === "url" ? "✅ Tersalin" : "Copy Base URL"}
          </button>
        </div>

        <h4 style={{ marginTop: 18 }}>2. Contoh minimal (satu model)</h4>
        <pre className="code">{`{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "reouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "ReOUTER",
      "options": {
        "baseURL": "${base}/v1",
        "apiKey": "reouter"
      },
      "models": {
        "MODEL-ANDA": { "name": "Model via ReOUTER" }
      }
    }
  },
  "model": "reouter/MODEL-ANDA"
}`}</pre>

        <h4 style={{ marginTop: 18 }}>3. Tes lewat terminal</h4>
        <pre className="code">{`curl ${base}/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -d "{\\"model\\":\\"MODEL-ANDA\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"Halo\\"}]}"

# Lihat daftar model yang tersedia:
curl ${base}/v1/models`}</pre>

        <div className="test-msg small" style={{ marginTop: 14 }}>
          <b>Cara kerja:</b> OpenCode kirim request ke ReOUTER → ReOUTER pilih provider sesuai
          prioritas &amp; failover otomatis → jawaban balik. Ganti model di OpenCode = ganti model yang
          dipakai. Semua request tampil realtime di <b>Riwayat Request</b>.
        </div>
      </div>

      <div className="card">
        <h3>⚙ Pengaturan Sistem</h3>
        <div className="row gap" style={{ marginTop: 14 }}>
          <label className="grow">
            Port gateway (butuh restart)
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
          <button className="btn primary" onClick={save}>
            Simpan
          </button>
        </div>
      </div>
    </>
  );
}
