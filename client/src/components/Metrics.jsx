import React, { useEffect, useState, useRef } from "react";

// Animate a number from its previous value to the new one.
function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function fmt(n) {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)} rb`;
  return String(Math.round(n));
}

export default function Metrics({ metrics, logs }) {
  if (!metrics) return null;
  const m = metrics;

  const total = useCountUp(m.total);
  const rate = useCountUp(m.successRate);
  const tin = useCountUp(m.tokensIn);
  const tout = useCountUp(m.tokensOut);
  const lat = useCountUp(m.medianLatencyMs);
  const cost = useCountUp(m.cost);

  const answered = Object.entries(m.byProvider || {});
  const totalAns = answered.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div className="metrics-grid">
      <Metric label="Request" value={Math.round(total)} sub={`${m.success} berhasil, ${m.failed} gagal`} />
      <Metric
        label="Tingkat berhasil"
        value={`${rate.toFixed(0)}%`}
        sub="Dari semua request"
        acc={m.successRate >= 90}
      />
      <Metric label="Token masuk" value={fmt(tin)} sub={`${m.tokensIn.toLocaleString()} token`} />
      <Metric label="Token keluar" value={fmt(tout)} sub={`${m.tokensOut.toLocaleString()} token`} />
      <Metric label="Latensi median" value={`${Math.round(lat)} ms`} sub="Request berhasil" />
      <Metric label="Biaya perkiraan" value={`$${cost.toFixed(4)}`} sub="Dari harga provider" />

      <div className="card span-6">
        <h4>Siapa yang menjawab</h4>
        <div className="answer-bars">
          {answered.length === 0 && <p className="muted small">Belum ada request.</p>}
          {answered.map(([name, count]) => (
            <div key={name} className="answer-row">
              <span className={`tag ${name === "Gagal" ? "red" : "green"}`}>{name}</span>
              <div className="bar">
                <div
                  className={`bar-fill ${name === "Gagal" ? "red" : ""}`}
                  style={{ width: `${(count / totalAns) * 100}%` }}
                />
              </div>
              <span className="mono small">{Math.round((count / totalAns) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, acc }) {
  return (
    <div className="card metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${acc ? "acc" : ""}`}>{value}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}
