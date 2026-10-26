import React, { useState } from "react";

// Auto-assigned celestial names in order of appearance. Users never have to
// pick one — the UI derives it from the provider's position.
const AUTO_PLANETS = [
  "Matahari", "Merkurius", "Venus", "Bumi", "Mars", "Jupiter", "Saturnus",
  "Uranus", "Neptunus", "Pluto", "Triton", "Titan", "Europa", "Ganymede",
  "Callisto", "Io",
];

export default function Providers({ config, refresh, mode = "keys" }) {
  const [editing, setEditing] = useState({});
  const [fetching, setFetching] = useState({});
  const [fetchMsg, setFetchMsg] = useState({});

  const isKeys = mode === "keys";
  const isAgents = mode === "agents";

  function setField(id, field, value) {
    setEditing((e) => ({ ...e, [id]: { ...(e[id] || {}), [field]: value } }));
  }

  function eff(p, index) {
    const base = { ...p, ...(editing[p.id] || {}) };
    if (!base.planet) base.planet = AUTO_PLANETS[index % AUTO_PLANETS.length];
    return base;
  }

  async function save() {
    const providers = config.providers.map((p, i) => ({ ...p, ...eff(p, i) }));
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers }),
    });
    setEditing({});
    refresh();
  }

  async function toggle(p, i) {
    const providers = config.providers.map((x, xi) => {
      const e = eff(x, xi);
      if (x.id === p.id) e.enabled = !e.enabled;
      return { ...x, ...e };
    });
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers }),
    });
    setEditing({});
    refresh();
  }

  async function fetchModels(p) {
    setFetching((s) => ({ ...s, [p.id]: true }));
    setFetchMsg((s) => ({ ...s, [p.id]: "Menarik daftar model dari API…" }));
    try {
      const r = await fetch("/api/fetch-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, apiKey: editing[p.id]?.apiKey || "" }),
      });
      const data = await r.json();
      setFetchMsg((s) => ({
        ...s,
        [p.id]: data.ok ? `✅ ${data.count} model ditemukan` : `❌ ${data.error}`,
      }));
      if (data.ok) refresh();
    } catch (err) {
      setFetchMsg((s) => ({ ...s, [p.id]: "❌ " + err }));
    }
    setFetching((s) => ({ ...s, [p.id]: false }));
  }

  const dirty = Object.keys(editing).length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3>{isKeys ? "🔑 Pusat API Key" : "◆ Agent & Model"}</h3>
          <p className="muted small" style={{ marginTop: 3 }}>
            {isKeys
              ? "Isi API key dari tiap provider, lalu nyalakan. Nama bintang diisi otomatis."
              : "Tarik daftar model asli dari API, lalu pilih agent yang dipakai router."}
          </p>
        </div>
        <div className="row gap">
          <span className="muted small">
            {config.providers.filter((p) => p.hasKey).length}/{config.providers.length} punya key
          </span>
          {dirty && (
            <button className="btn primary" onClick={save}>
              💾 Simpan
            </button>
          )}
        </div>
      </div>

      <div className="provider-list">
        {config.providers.map((raw, i) => {
          const p = eff(raw, i);
          return (
            <div key={p.id} className={`provider ${p.enabled && p.hasKey ? "on" : ""}`}>
              <div className="provider-top">
                <div>
                  <div className="provider-name">
                    <span className="planet-chip" title="Nama bintang otomatis">
                      <span className="planet-dot" style={{ background: "#b9c8ff" }} />
                      {p.planet}
                    </span>
                    <input
                      className="mini"
                      style={{ width: 150 }}
                      value={p.name}
                      onChange={(ev) => setField(p.id, "name", ev.target.value)}
                      title="Nama provider"
                    />
                  </div>
                  <div className="mono small muted" style={{ marginTop: 4 }}>
                    {p.baseUrl}
                  </div>
                </div>
                <div className="row gap">
                  <span className={`pill ${p.hasKey ? "green" : "red"}`}>
                    {p.hasKey ? "🔑 key ok" : "🔒 no key"}
                  </span>
                  <button className="btn small" onClick={() => toggle(raw, i)}>
                    {p.enabled ? "Aktif ✅" : "Nonaktif"}
                  </button>
                </div>
              </div>

              {/* ==== PUSAT API KEY: key + base url + prioritas ==== */}
              {isKeys && (
                <div className="provider-fields">
                  <label>
                    Prioritas
                    <input
                      className="mini"
                      type="number"
                      min="1"
                      value={p.priority}
                      onChange={(ev) => setField(p.id, "priority", Number(ev.target.value))}
                    />
                  </label>
                  <label className="grow">
                    API Key {p.hasKey && <span className="muted small">(kosongkan = tetap)</span>}
                    <input
                      type="password"
                      placeholder={p.hasKey ? "•••••••• (tersimpan)" : "tempel API key di sini…"}
                      onChange={(ev) => setField(p.id, "apiKey", ev.target.value)}
                    />
                  </label>
                  <label className="grow">
                    Base URL
                    <input
                      value={p.baseUrl}
                      onChange={(ev) => setField(p.id, "baseUrl", ev.target.value)}
                    />
                  </label>
                </div>
              )}

              {/* ==== AGENT & MODEL: tarik + pilih agent ==== */}
              {isAgents && (
                <>
                  <div className="provider-fields">
                    <label className="grow">
                      Agent / Model ({p.models.length} tersedia)
                      <input
                        value={p.models.join(", ")}
                        placeholder="belum ada model — klik Tarik Daftar Model"
                        onChange={(ev) =>
                          setField(
                            p.id,
                            "models",
                            ev.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                          )
                        }
                      />
                    </label>
                    <button
                      className="btn"
                      disabled={fetching[p.id] || !p.hasKey}
                      onClick={() => fetchModels(raw)}
                      title={p.hasKey ? "Ambil daftar model dari API" : "Isi API key dulu"}
                    >
                      {fetching[p.id] ? "⏳ Menarik…" : "🔄 Tarik Daftar Model"}
                    </button>
                  </div>

                  {p.models.length > 0 && (
                    <div className="provider-fields">
                      <label className="grow">
                        ⭐ Agent aktif (dipakai router lebih dulu)
                        <select
                          value={p.models[0]}
                          onChange={(ev) => {
                            const rest = p.models.filter((m) => m !== ev.target.value);
                            setField(p.id, "models", [ev.target.value, ...rest]);
                          }}
                        >
                          {p.models.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}

                  {!p.hasKey && (
                    <p className="muted small" style={{ marginTop: 8 }}>
                      ⚠️ Provider ini belum punya API key — isi di menu <b>🔑 Pusat API Key</b>.
                    </p>
                  )}
                  {fetchMsg[p.id] && <div className="test-msg mono small">{fetchMsg[p.id]}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {dirty && (
        <div style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={save}>
            💾 Simpan perubahan
          </button>
        </div>
      )}
    </div>
  );
}
