import React, { useMemo, useEffect, useState } from "react";

// Orbit jarak per layer prioritas
const ORBITS = [150, 200, 250, 300, 350];

// Palet ungu→pink (archify)
const PALETTE = ["#a855f7", "#ec4899", "#c026d3", "#8b5cf6", "#f472b6", "#d946ef", "#a78bfa"];

// Bintang latar — acak tapi deterministik biar nggak "geser" tiap render
function makeStars(count) {
  const stars = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rnd() * 960,
      y: rnd() * 520,
      r: rnd() * 1.4 + 0.3,
      d: (rnd() * 3 + 1.5).toFixed(2),
      o: (rnd() * 0.5 + 0.15).toFixed(2),
    });
  }
  return stars;
}

export default function ProviderMap({ config, metrics, logs }) {
  const providers = config?.providers || [];
  const answeredBy = metrics?.byProvider || {};

  const [live, setLive] = useState(null);
  const [coreActive, setCoreActive] = useState(false);

  const stars = useMemo(() => makeStars(90), []);

  useEffect(() => {
    if (!logs?.length) return;
    const last = logs[0];
    if (!last?.providerName || last.status !== "ok") return;
    setLive(last.providerName);
    setCoreActive(true);
    const t = setTimeout(() => {
      setLive(null);
      setCoreActive(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [logs]);

  const placed = useMemo(() => {
    return providers.map((p, i) => {
      const layer = Math.min(p.priority || i + 1, ORBITS.length) - 1;
      const r = ORBITS[layer];
      const ry = r * 0.6;
      const start = (i / Math.max(providers.length, 1)) * 360;
      const dur = 18 + layer * 8; // orbit luar lebih lambat
      return {
        ...p,
        r,
        ry,
        start,
        dur,
        color: PALETTE[i % PALETTE.length],
        answers: answeredBy[p.name] || 0,
        isLive: live === p.name,
      };
    });
  }, [providers, answeredBy, live]);

  const activeCount = placed.filter((p) => p.enabled && p.hasKey).length;

  return (
    <div className="card map-card">
      <div className="map-head">
        <div className="hero-brand" style={{ marginBottom: 0 }}>
          <div className="hero-logo">
            <span>Re</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="hero-title">Tata Surya Provider</div>
            <div className="hero-sub">
              {activeCount} aktif · {placed.filter((p) => p.hasKey).length} punya key
              {live ? <span className="live-tag"> · LIVE: {live}</span> : null}
            </div>
          </div>
        </div>
        <span className={`pill ${live ? "live" : "purple"}`}>
          {live ? "● Memproses…" : "Poros: ReOUTER"}
        </span>
      </div>

      {placed.length === 0 && (
        <div className="map-empty">
          <div className="map-empty-icon">🛰</div>
          <div>Belum ada provider.</div>
          <div className="small">
            Tambahkan lewat menu <b>Tambah Cepat</b> atau <b>Pusat API Key</b>.
          </div>
        </div>
      )}

      {placed.length > 0 && (
        <svg viewBox="0 0 960 520" className="map-svg" role="img" aria-label="Peta provider">
          <defs>
            <radialGradient id="coreGlow">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.65" />
              <stop offset="45%" stopColor="#ec4899" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <linearGradient id="coreRing" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f0abfc" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>

            {/* Jalur orbit untuk animateMotion setiap planet */}
            {placed.map((p) => (
              <path
                key={`path-${p.id}`}
                id={`orbit-${p.id}`}
                d={`M 480 260 m -${p.r} 0 a ${p.r} ${p.ry} 0 1 0 ${p.r * 2} 0 a ${p.r} ${p.ry} 0 1 0 -${p.r * 2} 0`}
                fill="none"
              />
            ))}
          </defs>

          {/* ---- Bintang latar berkedip ---- */}
          <g className="stars">
            {stars.map((s, i) => (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill="#f1f5f9"
                opacity={s.o}
                className="star"
                style={{ animationDelay: `${s.d}s` }}
              />
            ))}
          </g>

          {/* ---- Cincin orbit ---- */}
          {ORBITS.map((r, i) => (
            <ellipse
              key={i}
              cx="480"
              cy="260"
              rx={r}
              ry={r * 0.6}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeDasharray="2 9"
              className="orbit-ring"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
          ))}

          {/* ---- Inti ReOUTER ---- */}
          <circle
            className="core-pulse"
            cx="480"
            cy="260"
            r={coreActive ? 100 : 88}
            fill="url(#coreGlow)"
            style={{ transition: "r 500ms cubic-bezier(0.22,1,0.36,1)" }}
          />
          {/* Cincin berputar mengelilingi inti */}
          <g className="core-rotor" style={{ transformOrigin: "480px 260px" }}>
            <circle
              cx="480"
              cy="230"
              r="4"
              fill="#f0abfc"
              style={{ filter: "drop-shadow(0 0 6px #ec4899)" }}
            />
            <circle
              cx="480"
              cy="290"
              r="3"
              fill="#d8b4fe"
              style={{ filter: "drop-shadow(0 0 6px #a855f7)" }}
            />
          </g>
          <circle
            className={coreActive ? "core-ring core-ring-active" : "core-ring"}
            cx="480"
            cy="260"
            r="27"
            fill="#06070b"
            stroke="url(#coreRing)"
            strokeWidth={coreActive ? 2.5 : 2}
          />
          <text x="480" y="265" textAnchor="middle" className="core-label">
            Re
          </text>

          {/* ---- Planet yang benar-benar mengorbit ---- */}
          {placed.map((p) => {
            const on = p.enabled && p.hasKey;
            return (
              <g key={p.id} className="planet-orbit">
                {/* Garis ke inti (diam) */}
                <line
                  x1="480"
                  y1="260"
                  x2="480"
                  y2={260 - p.r}
                  stroke="none"
                />

                {/* Grup planet yang jalan keliling orbit */}
                <g className="planet-mover">
                  <animateMotion
                    dur={`${p.dur}s`}
                    repeatCount="indefinite"
                    rotate="auto"
                    keyPoints="0;1"
                    keyTimes="0;1"
                    calcMode="linear"
                  >
                    <mpath href={`#orbit-${p.id}`} />
                  </animateMotion>

                  {/* Halo mengembang saat menjawab */}
                  {p.isLive && (
                    <>
                      <circle r="14" fill="none" stroke={p.color} strokeWidth="1.5" className="halo" />
                      <circle r="14" fill="none" stroke={p.color} strokeWidth="1.5" className="halo halo2" />
                    </>
                  )}

                  <circle
                    r={p.isLive ? 17 : p.answers > 0 ? 14 : 11}
                    fill={on ? p.color : "#39415a"}
                    opacity={on ? 1 : 0.5}
                    className="planet-dot"
                    style={{
                      filter: on ? `drop-shadow(0 0 ${p.isLive ? 18 : 10}px ${p.color})` : "none",
                      transition: "r 350ms cubic-bezier(0.22,1,0.36,1)",
                    }}
                  />
                  {!p.hasKey && <circle r="3.5" fill="#06070b" opacity="0.85" />}

                  {/* Label ikut planet, ditarik balik biar tegak */}
                  <g className="planet-label-group">
                    <text y="-24" textAnchor="middle" className="planet-label">
                      {p.planet}
                    </text>
                    <text y="30" textAnchor="middle" className="planet-sub">
                      {p.isLive ? "menjawab…" : on ? `P${p.priority} · ${p.answers}` : "standby"}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        </svg>
      )}

      {placed.length > 0 && (
        <div className="legend">
          <span className="legend-item">
            <i style={{ background: "linear-gradient(90deg,#a855f7,#ec4899)" }} /> Inti ReOUTER
          </span>
          {placed.map((p) => (
            <span key={p.id} className={`legend-item ${p.isLive ? "legend-live" : ""}`}>
              <i style={{ background: p.hasKey && p.enabled ? p.color : "#39415a" }} />
              {p.planet} — {p.name}
              {p.isLive && <b className="legend-badge">LIVE</b>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
