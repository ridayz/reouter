import React, { useEffect, useState, useCallback } from "react";
import ProviderMap from "./components/ProviderMap.jsx";
import Metrics from "./components/Metrics.jsx";
import Providers from "./components/Providers.jsx";
import Logs from "./components/Logs.jsx";
import History from "./components/History.jsx";
import Settings from "./components/Settings.jsx";
import QuickAdd from "./components/QuickAdd.jsx";

const nav = [
  { id: "quick", label: "Tambah Cepat", icon: "⚡" },
  { id: "command", label: "Command Center", icon: "◎" },
  { id: "history", label: "Riwayat Request", icon: "≡" },
  { id: "gateway", label: "Gateway & Failover", icon: "⚡" },
  { id: "keys", label: "Pusat API Key", icon: "🔑" },
  { id: "agents", label: "Agent & Model", icon: "◆" },
  { id: "settings", label: "Pengaturan Sistem", icon: "⚙" },
];

export default function App() {
  const [config, setConfig] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [section, setSection] = useState("command");
  const [connected, setConnected] = useState(false);

  const refresh = useCallback(async () => {
    const [c, m, l] = await Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/metrics").then((r) => r.json()),
      fetch("/api/logs").then((r) => r.json()),
    ]);
    setConfig(c);
    setMetrics(m);
    setLogs(l);
  }, []);

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.metrics) setMetrics(msg.metrics);
      if (msg.type === "log") fetch("/api/logs").then((r) => r.json()).then(setLogs);
    };
    return () => es.close();
  }, [refresh]);

  const activeProviders =
    config?.providers?.filter((p) => p.enabled && p.hasKey).length || 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <span>Re</span>
          </div>
          <div className="brand-text">
            <span className="brand-name">ReOUTER</span>
            <span className="brand-sub">AI Gateway</span>
          </div>
        </div>
        <div className="badge-ai">Multi-Provider Router &amp; Agent Bridge</div>

        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${section === n.id ? "active" : ""}`}
              onClick={() => setSection(n.id)}
            >
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="online-box">
          <div className="online-row">
            <span className={`dot ${connected ? "ok" : "bad"}`} />
            {connected ? "ONLINE · REALTIME" : "OFFLINE"}
          </div>
          <div className="mono small" style={{ color: "var(--muted2)", marginTop: 5 }}>
            127.0.0.1:9301 · {activeProviders} key aktif
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            <b>ReOUTER</b>
            <span className="sep">/</span>
            {nav.find((n) => n.id === section)?.label}
          </div>
          <div className="top-pill">🔥 Real Multi-Provider Routing</div>
          <div className="top-actions">
            <span className="mono small" style={{ color: "var(--muted)" }}>
              127.0.0.1:9301
            </span>
            <span className="pill green">Triple Priority Failover</span>
          </div>
        </header>

        {section === "quick" && (
          <>
            <QuickAdd refresh={refresh} />
            {config && <Providers config={config} refresh={refresh} mode="keys" />}
          </>
        )}
        {section === "command" && (
          <>
            {config && <ProviderMap config={config} metrics={metrics} logs={logs} />}
            {config && <Providers config={config} refresh={refresh} mode="keys" />}
            <Metrics metrics={metrics} logs={logs} />
            <div className="two-col">
              <Logs logs={logs} metrics={metrics} compact />
              <RouterInfo config={config} refresh={refresh} />
            </div>
          </>
        )}
        {section === "history" && <History logs={logs} />}
        {section === "gateway" && <RouterInfo config={config} full refresh={refresh} />}
        {section === "keys" && config && <Providers config={config} refresh={refresh} mode="keys" />}
        {section === "agents" && config && <Providers config={config} refresh={refresh} mode="agents" />}
        {section === "settings" && config && <Settings config={config} refresh={refresh} />}
      </main>
    </div>
  );
}

function RouterInfo({ config, full, refresh }) {
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Balas OK saja, satu kata.");

  const allModels = (config?.providers || [])
    .filter((p) => p.enabled && p.hasKey)
    .flatMap((p) => (p.models || []).map((m) => ({ m, p: p.name })));

  async function test() {
    setBusy(true);
    setTestMsg("Mengirim request nyata…");
    try {
      const r = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || undefined, prompt }),
      });
      const data = await r.json();
      setTestMsg(
        data.ok
          ? `✅ ${data.provider} (${data.model}) · ${data.latencyMs} ms → "${String(data.text).trim()}"`
          : `❌ ${data.error}`
      );
    } catch (e) {
      setTestMsg("❌ " + e);
    }
    setBusy(false);
    refresh?.();
  }

  async function setMode(mode) {
    const c = await fetch("/api/config").then((r) => r.json());
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routing: { ...c.routing, mode } }),
    });
    refresh?.();
  }

  return (
    <div className="card">
      <h3>⚡ Mode Routing &amp; Uji Coba</h3>
      <p className="muted small" style={{ marginTop: 4 }}>
        Provider dicoba sesuai <b>prioritas</b> (1 → N). Kalau satu gagal, otomatis pindah ke
        berikutnya (failover berjenjang).
      </p>

      <div className="row gap" style={{ marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setMode("failover")}>
          🔀 Failover
        </button>
        <button className="btn" onClick={() => setMode("round-robin")}>
          🔁 Round-robin
        </button>
      </div>

      <hr />
      <h4>Uji Gateway (request nyata)</h4>
      <div className="row gap" style={{ flexWrap: "wrap" }}>
        <label className="grow">
          Model / Agent
          <select className="model-select" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">— pilih (atau auto) —</option>
            {allModels.map(({ m, p }) => (
              <option key={p + m} value={m}>
                {m} · {p}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Prompt
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <button className="btn primary" onClick={test} disabled={busy}>
          {busy ? "Mengirim…" : "▶ Test"}
        </button>
      </div>
      {testMsg && <div className="test-msg mono small">{testMsg}</div>}

      {full && (
        <>
          <hr />
          <h4>Endpoint gateway (OpenAI-compatible)</h4>
          <pre className="code">{`POST http://127.0.0.1:9301/v1/chat/completions
Content-Type: application/json

{
  "model": "nama-model",
  "messages": [{ "role": "user", "content": "Halo" }]
}`}</pre>
          <p className="muted small" style={{ marginTop: 10 }}>
            Arahkan aplikasi/IDE apa pun yang mendukung "OpenAI API base URL" ke{" "}
            <code>http://127.0.0.1:9301/v1</code>. Lihat daftar model di{" "}
            <code>http://127.0.0.1:9301/v1/models</code>.
          </p>
        </>
      )}
    </div>
  );
}
