/* ReOUTER — grafik ringan tanpa dependensi (sparkline, donut, bar) */
(function () {
  "use strict";

  const css = (v, fb) => (getComputedStyle(document.documentElement).getPropertyValue(v) || fb).trim();
  const ACCENT = "#8b5cf6";
  const ACCENT_2 = "#9069f9";

  // Gambar ulang saat ukuran elemen berubah (window resize, sidebar, scrollbar).
  // Tanpa ini canvas yang digambar saat elemen belum bertata letak akan "memaksa" halaman
  // tidak bisa digulung karena menahan tinggi dokumen.
  const pending = new WeakMap();
  const ro = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver((entries) => {
        for (const en of entries) {
          const c = en.target;
          const job = pending.get(c);
          if (!job) continue;
          clearTimeout(job.t);
          job.t = setTimeout(() => {
            job.draw();
            measure(c);
          }, 60);
        }
      })
    : null;
  const last = new WeakMap();
  function measure(c) {
    last.set(c, c.clientWidth + "x" + c.clientHeight);
  }
  function observe(c, draw) {
    if (!ro) return;
    pending.set(c, { draw, t: 0 });
    if (!last.has(c)) {
      ro.observe(c);
      measure(c);
    }
  }

  function prep(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // canvas blok dengan tinggi tetap => clientWidth/Height tidak bergantung atribut width/height
    const w = Math.max(40, canvas.clientWidth || canvas.parentElement.clientWidth || 300);
    const h = Math.max(40, canvas.clientHeight || 120);
    // Set ukuran HANYA kalau berubah. Mengganti canvas.width/height memicu layout ulang
    // setiap kali redraw; atribut itu juga sempat membuat tinggi dokumen tidak stabil.
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /** Garis halus dengan area gradasi — dipakai di kartu statistik. */
  function spark(canvas, values, opts = {}) {
    observe(canvas, () => spark(canvas, values, opts));
    const pts = (values && values.length ? values : [0]).map(Number);
    const { ctx, w, h } = prep(canvas);
    const max = Math.max(...pts, 1);
    const min = Math.min(...pts, 0);
    const span = max - min || 1;
    const stepX = pts.length > 1 ? w / (pts.length - 1) : w;
    const y = (v) => h - 4 - ((v - min) / span) * (h - 10);

    const path = new Path2D();
    pts.forEach((v, i) => (i ? path.lineTo(i * stepX, y(v)) : path.moveTo(0, y(v))));

    const area = new Path2D(path);
    area.lineTo(w, h);
    area.lineTo(0, h);
    area.closePath();

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, opts.fill || "rgba(139,92,246,.35)");
    g.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = g;
    ctx.fill(area);

    ctx.strokeStyle = opts.color || ACCENT_2;
    ctx.lineWidth = opts.width || 1.8;
    ctx.lineJoin = "round";
    ctx.stroke(path);

    if (opts.dot !== false && pts.length) {
      ctx.beginPath();
      ctx.arc(w - 0.5, y(pts[pts.length - 1]), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = opts.color || ACCENT_2;
      ctx.fill();
    }
  }

  /** Donut proporsi — siapa menjawab request. */
  function donut(canvas, items, opts = {}) {
    observe(canvas, () => donut(canvas, items, opts));
    const { ctx, w, h } = prep(canvas);
    const total = items.reduce((s, i) => s + i.value, 0);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 6;
    const inner = r * 0.64;

    if (!total) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
      ctx.fillStyle = "#262626";
      ctx.fill("evenodd");
      return;
    }

    let a = -Math.PI / 2;
    items.forEach((it) => {
      const sweep = (it.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a, a + sweep);
      ctx.arc(cx, cy, inner, a + sweep, a, true);
      ctx.closePath();
      ctx.fillStyle = it.color;
      ctx.fill();
      a += sweep;
    });

    ctx.textAlign = "center";
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText(String(total), cx, cy + 2);
    ctx.fillStyle = "#6b6b6b";
    ctx.font = "500 10px Inter, system-ui, sans-serif";
    ctx.fillText(opts.label || "REQUEST", cx, cy + 16);
  }

  /** Batang horizontal — perbandingan skor/speed antar provider. */
  function bars(canvas, items) {
    const { ctx, w, h } = prep(canvas);
    const rowH = Math.max(18, Math.floor(h / Math.max(items.length, 1)));
    const max = Math.max(...items.map((i) => i.value), 100);
    items.forEach((it, idx) => {
      const y = idx * rowH + rowH / 2;
      ctx.fillStyle = "#1f1f1f";
      ctx.fillRect(0, y - 3, w, 6);
      ctx.fillStyle = it.color || ACCENT;
      ctx.fillRect(0, y - 3, Math.max(2, (it.value / max) * w), 6);
    });
  }

  window.ReChart = { spark, donut, bars };
})();
