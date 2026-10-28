/* ReOUTER — dashboard (vanilla JS, tema gelap) */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => new Intl.NumberFormat("id-ID").format(Number(n) || 0);
  const time = (ts) => new Date(ts || Date.now()).toLocaleTimeString("id-ID", { hour12: false });
  const ago = (ts) => {
    if (!ts) return "—";
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + " dtk lalu";
    if (s < 3600) return Math.round(s / 60) + " mnt lalu";
    if (s < 86400) return Math.round(s / 3600) + " jam lalu";
    return Math.round(s / 86400) + " hari lalu";
  };
  const money = (v) => (v == null ? "—" : v === 0 ? "$0" : v < 0.1 ? "$" + v.toFixed(3) : "$" + v.toFixed(2));
  const ctxLabel = (n) => (!n ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : Math.round(n / 1e3) + "K");

  const ORIGIN = location.origin;
  const MODE_TEXT = { auto: "AI terbaik otomatis", failover: "Urutan prioritas", round: "Bergiliran" };
  const TIER = { flagship: "Flagship", balanced: "Seimbang", fast: "Cepat", cheap: "Murah", unknown: "?" };
  const COLORS = ["#8b5cf6", "#0ea5e9", "#fbd7bd", "#11a861", "#f8bf5b", "#ef4444", "#9069f9", "#525252"];

  let S = { mode: "auto", providers: [], presets: [], events: [], stats: {}, ranking: [] };
  let seen = new Set();
  let page = "";
  let range = { from: "", to: "" };

  /* ------------------------------ API ------------------------------ */
  async function api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && (data.error.message || data.error)) || "Permintaan gagal");
    return data;
  }

  function toast(msg, kind = "info") {
    const t = $("#toast");
    t.className = "toast show " + kind;
    t.textContent = msg;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.className = "toast " + kind), 3400);
  }

  function copy(text, label = "Disalin") {
    const done = () => toast(label + " ✓", "ok");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => toast("Gagal menyalin", "bad"));
    else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    }
  }

  /* ------------------------------ Helpers ------------------------------ */
  const cooling = (p) => (p.cooldownUntil || 0) > Date.now();
  const ready = (p) => p.enabled && p.status === "ok" && p.hasKey && (p.picked || []).length > 0 && !cooling(p);
  const ordered = () => S.providers.slice().sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const allModels = () => {
    const out = [];
    ordered().forEach((p) => (p.picked || []).forEach((m) => out.push({ p, m })));
    return out;
  };
  const best = () => (S.ranking && S.ranking[0]) || null;
  const initials = (name) =>
    String(name || "?")
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");

  function pill(p) {
    if (p.status === "error") return '<span class="pill bad"><span class="dot-s bad"></span>Error</span>';
    if (cooling(p)) return '<span class="pill warn"><span class="dot-s warn"></span>Jeda</span>';
    if (ready(p)) return '<span class="pill ok"><span class="dot-s ok"></span>Siap</span>';
    if (p.status === "ok") return '<span class="pill info">Tanpa model</span>';
    return '<span class="pill">Belum dicek</span>';
  }
  function dot(p) {
    const c = ready(p) ? "ok" : p.status === "error" ? "bad" : cooling(p) ? "warn" : "";
    return `<span class="dot-s ${c}"></span>`;
  }
  function stars(score) {
    if (score == null) return "";
    const n = Math.max(0, Math.min(5, Math.round(score)));
    return `<span style="color:#c4b5fd;letter-spacing:.5px">${"★".repeat(n)}<span style="color:#3f3f3f">${"☆".repeat(5 - n)}</span></span>`;
  }
  function modelMeta(inf) {
    if (!inf || !inf.known) return '<span class="mmeta">harga belum terdata</span>';
    return `<span class="mmeta">${TIER[inf.tier] || inf.tier} · ${stars(inf.smart)} · ⚡ ${inf.speed ?? "—"} tok/s · ${money(inf.priceIn)}/${money(inf.priceOut)} per 1M · ${ctxLabel(inf.ctx)} ctx</span>`;
  }
  function head(title, sub, right = "") {
    return `<div class="ph"><div><h1>${title}</h1><p>${sub}</p></div><div class="d-flex align-items-center" style="gap:8px">${right}</div></div>`;
  }

  /* ------------------------------ Data ------------------------------ */
  let loading = false;
  async function refresh() {
    if (loading) return;
    loading = true;
    try {
      S = await api("/state");
      const b = $("#serverBadge");
      b.className = "live";
      b.innerHTML = '<i class="dot"></i><span>LIVE</span>';
      $$("#modeSwitch [data-mode]").forEach((x) => x.classList.toggle("on", x.dataset.mode === S.mode));
      watchEvents(S.events || []);
      render();
    } catch (e) {
      const b = $("#serverBadge");
      b.className = "live off";
      b.innerHTML = '<i class="dot"></i><span>OFFLINE</span>';
    } finally {
      loading = false;
    }
  }

  function watchEvents(events) {
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      if (page !== "dashboard") continue;
      if (ev.type === "fail") toast(`${ev.provider} gagal → pindah ke AI berikutnya`, "bad");
      if (ev.type === "success" && document.body.dataset.failing === "1") toast(`${ev.provider} mengambil alih · ${ev.ms} ms`, "ok");
      document.body.dataset.failing = ev.type === "fail" ? "1" : ev.type === "success" || ev.type === "request" ? "0" : document.body.dataset.failing;
    }
    if (seen.size > 4000) seen = new Set([...seen].slice(-2000));
  }

  const inRange = (ts) => {
    if (!range.from && !range.to) return true;
    const d = new Date(ts);
    // 1 hari tanpa aktivitas tetap ditampilkan supaya dashboard tidak kosong
    if (range.from && d < new Date(new Date(range.from + "T00:00:00").getTime() - 864e5)) return false;
    if (range.to && d > new Date(new Date(range.to + "T23:59:59").getTime() + 864e5)) return false;
    return true;
  };
  const events = () => (S.events || []).filter((e) => inRange(e.ts));

  /* ------------------------------ Router ------------------------------ */
  const VIEWS = { dashboard: viewDashboard, setup: viewSetup, models: viewModels, ranking: viewRanking, connect: viewConnect, logs: viewLogs };

  // Panel #view yang menggulung (bukan jendela) — jadi posisi tiap menu disimpan di sini.
  const scrollPos = {};
  // Keyword pencarian model per provider (biar tidak hilang saat refresh 2,5 detik).
  const searchQuery = {};

  function render() {
    const name = (location.hash || "#/dashboard").replace(/^#\/?/, "").split("?")[0] || "dashboard";
    const fn = VIEWS[name] || viewDashboard;
    if (page !== name) {
      const prev = page;
      const view = $("#view");
      if (prev) scrollPos[prev] = view.scrollTop;
      page = name;
      $$("#sideNav .side-link, .side-nav .side-link[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
      view.innerHTML = `<div class="wrap">${fn()}</div>`;
      bind();
      onMount();
      // kembali ke posisi terakhir menu ini; menu baru mulai dari atas
      view.scrollTop = scrollPos[name] || 0;
    } else {
      update();
    }
  }

  // Simpan posisi gulung terakhir tiap menu (refresh 2,5 detik tidak mengubah scrollTop).
  $("#view").addEventListener(
    "scroll",
    () => {
      if (page) scrollPos[page] = $("#view").scrollTop;
    },
    { passive: true },
  );
  window.addEventListener("hashchange", render);

  /* ------------------------------ Dashboard ------------------------------ */
  function viewDashboard() {
    const st = S.stats || {};
    const ok = S.providers.filter(ready).length;
    return `
      ${head(
        `Hello! Let's look at your AI traffic`,
        "Satu endpoint untuk semua AI — kalau satu mati, yang lain langsung ambil alih.",
        `<button class="btn sm" id="btnTest"><i class="ic ic-send"></i>Tes Sekarang</button>`,
      )}

      <div class="grid-4" id="kpiRow">
        ${stat("Provider siap", `${ok}<span class="unit"> / ${S.providers.length}</span>`, ok ? "aktif & terverifikasi" : "belum ada yang siap", "canvas", "kpi", "#/setup")}
        ${stat("Request sukses", num(st.success || 0), `<b>${st.successRate || 0}%</b> berhasil`, "canvas", "rq", "#/logs")}
        ${stat("Pengambilalihan", num(st.failovers || 0), "model mati → AI lain kerja", "canvas", "fo", "#/logs")}
        ${stat("Respon rata-rata", `${num(st.msAvg || 0)}<span class="unit"> ms</span>`, `${num(st.requests || 0)} request total`, "canvas", "ms", "#/ranking")}
      </div>

      <div class="grid-main" style="margin-top:16px">
        <div class="d-flex flex-column" style="gap:16px">
          <div class="card" id="heroCard"></div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Urutan pengambilalihan</h2><span class="chip ghost">${esc(MODE_TEXT[S.mode] || "")}</span></div>
            <p class="card-sub">Kalau nomor 1 mati atau lambat, nomor berikutnya langsung dipakai.</p>
            <div id="chain"></div>
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Transaksi terakhir</h2><a class="chip" href="#/logs">Lihat semua</a></div>
            <p class="card-sub">Request yang masuk dan siapa yang menjawab.</p>
            <div style="overflow-x:auto"><table class="tbl" id="recentTbl"></table></div>
          </div>
        </div>

        <div class="d-flex flex-column" style="gap:16px">
          <div class="card">
            <div class="card-head"><h2 class="card-title">Siapa menjawab</h2><span class="chip ghost">${S.providers.length} provider</span></div>
            <p class="card-sub" style="margin-bottom:8px">Proporsi request yang dilayani.</p>
            <div style="height:150px"><canvas id="chartWho" style="width:100%;height:150px"></canvas></div>
            <div id="legend" class="mt-3"></div>
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Log terakhir</h2><a class="chip" href="#/logs">Buka</a></div>
            <div class="log" id="miniLog" style="max-height:260px"></div>
          </div>
        </div>
      </div>`;
  }

  function stat(label, value, sub, _t, key, href) {
    return `<a class="card stat" href="${href}">
      <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-badge">${key === "kpi" ? "aktif" : "live"}</span></div>
      <div class="stat-value" data-kpi="${key}">${value}</div>
      <div class="stat-delta">${sub}</div>
      <div class="stat-bar"><i data-bar="${key}" style="width:0%"></i></div>
      <canvas class="stat-spark" data-spark="${key}"></canvas>
    </a>`;
  }

  function heroHTML() {
    const top = best();
    if (!top) {
      return `<div class="empty">
        <div class="empty-ic"><i class="ic ic-plug" style="width:24px;height:24px"></i></div>
        <h3>Belum ada provider siap pakai</h3>
        <p>Tempel satu API key, ReOUTER mengurus sisanya.</p>
        <a class="btn primary" href="#/setup"><i class="ic ic-plus"></i>Tambah provider pertama</a>
      </div>`;
    }
    return `<div class="card-head">
        <div><h2 class="card-title">AI yang dipakai sekarang</h2><p class="card-sub" style="margin:0">${esc(MODE_TEXT[S.mode] || "")}</p></div>
        <button class="chip" id="btnTest2"><i class="ic ic-send" style="width:13px;height:13px"></i>Tes</button>
      </div>
      <div class="hero" style="margin-top:14px">
        <div class="hero-ava">${esc(initials(top.name))}</div>
        <div style="min-width:0">
          <div class="hero-name">${esc(top.name)}</div>
          <div class="hero-model">${esc(top.model || "—")}</div>
        </div>
        <div class="hero-score"><b>${top.score}</b><span>skor</span></div>
      </div>
      <div class="meter">
        <div><b>${top.latencyMs} ms</b><span>kecepatan terukur</span></div>
        <div><b>${top.quality}%</b><span>kualitas model</span></div>
        <div><b>${top.reliability}%</b><span>keandalan</span></div>
      </div>`;
  }

  function chainHTML() {
    const list = ordered().filter((p) => p.enabled);
    if (!list.length) return '<div class="log-empty">Belum ada provider aktif.</div>';
    const rank = new Map((S.ranking || []).map((r, i) => [r.id, { n: i + 1, ...r }]));
    const rows = list
      .slice()
      .sort((a, b) => {
        const A = rank.get(a.id);
        const B = rank.get(b.id);
        if (A && B) return A.n - B.n;
        if (A) return -1;
        if (B) return 1;
        return a.priority - b.priority;
      })
      .slice(0, 6);
    return (
      rows
        .map((p, i) => {
          const r = rank.get(p.id);
          return `<div class="rowline">
          <span class="rank-no ${i === 0 ? "top" : ""}">${i + 1}</span>
          ${dot(p)}
          <div class="row-main">
            <div class="row-title">${esc(p.name)}</div>
            <div class="row-sub">${esc((p.picked || [])[0] || "belum pilih model")}</div>
          </div>
          <div class="row-end" style="min-width:92px">
            ${r ? `<b>${r.score}</b> skor<div class="bar" style="margin-top:5px"><i style="width:${Math.min(100, r.score)}%"></i></div>` : pill(p)}
          </div>
        </div>`;
        })
        .join("") || ""
    );
  }

  function recentHTML() {
    const rows = events().filter((e) => e.type === "success" || e.type === "fail").slice(-6).reverse();
    const out = ['<thead><tr><th>Provider</th><th>Model</th><th>Status</th><th class="r">Waktu</th></tr></thead><tbody>'];
    if (!rows.length) {
      out.push('<tr><td colspan="4" style="color:#6b6b6b;text-align:center;padding:26px">Belum ada request. Klik <b>Tes Sekarang</b>.</td></tr>');
    }
    for (const ev of rows) {
      const ok = ev.type === "success";
      out.push(`<tr>
        <td>${dot({ status: ok ? "ok" : "error", enabled: true, hasKey: true, picked: [1] })} <span style="margin-left:6px">${esc(ev.provider || "—")}</span></td>
        <td class="mono" style="font-size:.74rem;color:#a3a3a3">${esc(ev.model || "—")}</td>
        <td>${ok ? `<span class="amt-up">✓ ${ev.ms} ms</span>` : '<span class="amt-down">✗ pindah</span>'}</td>
        <td class="r" style="color:#6b6b6b">${time(ev.ts)}</td>
      </tr>`);
    }
    out.push("</tbody>");
    return out.join("");
  }

  function logLines(limit = 60) {
    const kc = { request: "c-acc", try: "c-acc", success: "c-ok", fail: "c-bad", check: "c-warn" };
    const list = events().slice(-limit).reverse();
    if (!list.length) return '<div class="log-empty">Belum ada aktivitas. Coba tombol <b>Tes Sekarang</b>.</div>';
    return list
      .map((ev) => {
        let msg;
        switch (ev.type) {
          case "request": msg = `request · ${esc(ev.model)} · ${esc(MODE_TEXT[ev.mode] || ev.mode)} · ${ev.candidates} kandidat`; break;
          case "try": msg = `→ coba ${esc(ev.provider)} · ${esc(ev.model)}`; break;
          case "success": msg = `✓ ${esc(ev.provider)} menjawab · ${ev.ms} ms`; break;
          case "fail": msg = `✗ ${esc(ev.provider)} gagal (${esc(ev.kind)}) — ${esc(ev.error)} → ambil alih`; break;
          case "check": msg = ev.ok ? `cek key ${esc(ev.provider)}: ${ev.count} model` : `cek key ${esc(ev.provider)} gagal — ${esc(ev.error)}`; break;
          default: msg = esc(ev.type);
        }
        return `<div class="ln"><span class="t">${time(ev.ts)}</span><span class="m ${kc[ev.type] || ""}">${msg}</span></div>`;
      })
      .join("");
  }

  /* ------------------------------ Charts ------------------------------ */
  function series(pred) {
    const list = events().slice(-40);
    const vals = [0];
    let acc = 0;
    for (const ev of list) {
      if (pred(ev)) acc += 1;
      vals.push(acc);
    }
    if (vals.length < 6) return [0, 1, 0, 2, 1, 3, 2, 4, 3, 5].slice(0, 10);
    return vals;
  }
  function drawSparks() {
    if (!window.ReChart) return;
    const st = S.stats || {};
    const okCount = S.providers.filter(ready).length;
    const c = (k) => document.querySelector(`[data-spark="${k}"]`);
    const a = c("kpi");
    if (a) ReChart.spark(a, series(() => true), { color: "#8b5cf6", fill: "rgba(139,92,246,.28)" });
    const b = c("rq");
    if (b) ReChart.spark(b, series((e) => e.type === "success"), { color: "#11a861", fill: "rgba(17,168,97,.22)" });
    const d = c("fo");
    if (d) ReChart.spark(d, series((e) => e.type === "fail"), { color: "#f8bf5b", fill: "rgba(248,191,91,.2)" });
    const e = c("ms");
    if (e) ReChart.spark(e, series((x) => x.type === "success").map((v) => v * (st.msAvg || 800) * 0.6), { color: "#0ea5e9", fill: "rgba(14,165,233,.2)" });
    const bar = (k, pct) => {
      const el = document.querySelector(`[data-bar="${k}"]`);
      if (el) el.style.width = Math.max(4, Math.min(100, pct)) + "%";
    };
    bar("kpi", S.providers.length ? (okCount / S.providers.length) * 100 : 4);
    bar("rq", st.successRate || 4);
    bar("fo", st.requestCount ? Math.min(100, (st.failovers || 0) * 20) : 4);
    bar("ms", Math.max(4, Math.min(100, 100 - (st.msAvg || 0) / 60)));
  }

  function drawWho() {
    if (!window.ReChart) return;
    const by = {};
    for (const ev of events()) if (ev.type === "success") by[ev.provider] = (by[ev.provider] || 0) + 1;
    const keys = Object.keys(by);
    const items = keys.map((k, i) => ({ name: k, value: by[k], color: COLORS[i % COLORS.length] }));
    const cv = $("#chartWho");
    if (cv) ReChart.donut(cv, items, { label: "REQUEST" });
    const lg = $("#legend");
    if (lg) {
      lg.innerHTML = items.length
        ? items
            .map(
              (it, i) => `<div class="rowline" style="padding:6px 0;border:0">
                <span style="width:9px;height:9px;border-radius:99px;background:${it.color};flex:0 0 9px"></span>
                <span class="row-title" style="font-weight:500">${esc(it.name)}</span>
                <span class="row-end">${Math.round((it.value / items.reduce((s, x) => s + x.value, 0)) * 100)}%</span>
              </div>`,
            )
            .join("")
        : '<div style="color:#6b6b6b;font-size:.76rem;text-align:center;padding:6px">Belum ada data</div>';
    }
  }

  /* ------------------------------ Setup ------------------------------ */
  function viewSetup() {
    return `
      ${head("Provider &amp; API Key", "Tempel API key milikmu. ReOUTER membaca model, mengetes kecepatan, lalu memilih yang terbaik.")}
      <div class="setup-grid">
        <div class="card">
          <h2 class="card-title">Tambah provider</h2>
          <p class="card-sub">Cukup key-nya, provider terdeteksi otomatis.</p>
          <div class="field">
            <label for="fKey">API Key</label>
            <input type="password" class="input" id="fKey" placeholder="sk-… / tr-… / AIza…" autocomplete="off" />
          </div>
          <button class="btn primary block" id="btnDetect"><i class="ic ic-plug"></i>Cek &amp; Tambahkan</button>
          <div id="detectMsg" style="font-size:.78rem;margin-top:10px;color:#a3a3a3"></div>
          <hr style="border:0;border-top:1px solid var(--line);margin:18px 0" />
          <button class="btn ghost sm" id="toggleManual" style="padding-left:0">+ Tambah manual (base URL sendiri)</button>
          <div id="manualBox" style="display:none;margin-top:12px">
            <div class="field"><label>Provider</label><select class="select" id="fPreset"><option value="">— pilih / manual —</option>${(S.presets || [])
              .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
              .join("")}</select></div>
            <div class="field"><label>Nama</label><input class="input" id="fName" placeholder="mis. TokenRouterAI" /></div>
            <div class="field"><label>Base URL</label><input class="input" id="fUrl" placeholder="https://api.provider.com/v1" /></div>
            <div class="field"><label>API Key</label><input class="input" type="password" id="fKey2" autocomplete="off" /></div>
            <button class="btn block" id="btnManualAdd"><i class="ic ic-plus"></i>Tambah &amp; cek API</button>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2 class="card-title">Provider terpasang</h2><span class="chip ghost">${S.providers.length}</span></div>
          <p class="card-sub">Klik baris untuk mengatur model &amp; kunci.</p>
          <div id="provList"></div>
        </div>
      </div>`;
  }

  function provListHTML() {
    if (!S.providers.length) {
      return '<div class="empty"><div class="empty-ic"><i class="ic ic-plug"></i></div><h3>Belum ada provider</h3><p>Tempel API key di sebelah kiri.</p></div>';
    }
    return ordered()
      .map((p) => {
        const models = p.models || [];
        const picked = p.picked || [];
        return `<div class="prov ${p.enabled ? "" : "off"} ${p.status === "error" ? "bad" : ""}" data-pid="${p.id}">
        <div class="prov-head">
          <div class="hero-ava" style="width:36px;height:36px;flex:0 0 36px;border-radius:10px;font-size:.76rem;background:linear-gradient(140deg,#8b5cf6,#4c1d95)">${esc(initials(p.name))}</div>
          <div style="min-width:0;flex:1">
            <div class="prov-name">${esc(p.name)}</div>
            <div class="prov-url">${esc(p.baseUrl || "—")}</div>
          </div>
          ${pill(p)}
          <button class="icon-btn" data-act="toggle" title="${p.enabled ? "Matikan" : "Aktifkan"}" style="width:30px;height:30px">
            <span class="dot-s ${p.enabled ? "ok" : ""}" style="width:10px;height:10px"></span>
          </button>
          <button class="icon-btn" data-act="open" title="Atur model" style="width:30px;height:30px">${p.enabled ? "⌄" : "⌄"}</button>
        </div>
        <div class="prov-meta">
          <span>🔑 ${esc(p.keyHint || (p.hasKey ? "tersimpan" : "belum ada"))}</span>
          <span>🧩 ${picked.length} model aktif</span>
          <span>⚡ ${p.latency ? p.latency + " ms" : "belum diukur"}</span>
          <span>🕒 ${p.lastCheck ? ago(p.lastCheck) : "belum dicek"}</span>
          <span>⇅ prioritas ${p.priority}</span>
        </div>
        ${p.lastError ? `<div class="prov-err">⚠ ${esc(p.lastError)}</div>` : ""}
        <div class="prov-body">
          <div class="field"><label>Nama</label><input class="input sm i-name" value="${esc(p.name)}" /></div>
          <div class="field"><label>Base URL</label><input class="input sm i-url" value="${esc(p.baseUrl)}" /></div>
          <div class="field"><label>API Key <span style="color:#6b6b6b;font-weight:400">(kosongkan kalau tidak diubah)</span></label>
            <input class="input sm i-key" type="password" placeholder="${esc(p.keyHint || "tempel key baru…")}" autocomplete="off" /></div>
          <div class="d-flex" style="gap:8px;flex-wrap:wrap;margin-bottom:14px">
            <button class="btn sm primary" data-act="check">Cek ulang API</button>
            <button class="btn sm" data-act="reset">Pulihkan dari jeda</button>
            <button class="btn sm danger" data-act="del" style="margin-left:auto">Hapus</button>
          </div>
          <div class="card-head" style="margin-bottom:8px">
            <span style="font-size:.76rem;font-weight:600;color:#d4d4d4">Model yang dipakai</span>
            <button class="chip" data-act="all">Centang semua</button>
          </div>
          <input class="input sm i-search" placeholder="cari model…" style="margin-bottom:8px" value="${esc(searchQuery[p.id] || "")}" />
          <div class="models">${
            models
              .map((m) => {
                const inf = (p.modelInfo || {})[m] || {};
                const q = String(searchQuery[p.id] || "").trim().toLowerCase();
                const hide = q && !m.toLowerCase().includes(q);
                return `<label class="mrow"${hide ? ' style="display:none"' : ""}>
                  <input type="checkbox" class="m-check" data-m="${esc(m)}" ${picked.includes(m) ? "checked" : ""} />
                  <span style="min-width:0"><span class="mname mono">${esc(m)}</span><br />${modelMeta(inf)}</span>
                </label>`;
              })
              .join("") || '<div style="padding:16px;color:#6b6b6b;font-size:.78rem">Belum ada model. Klik <b>Cek ulang API</b>.</div>'
          }</div>
        </div>
      </div>`;
      })
      .join("");
  }

  /* ------------------------------Models ------------------------------ */
  function viewModels() {
    return `${head("Model Aktif", "Model yang dicentang di provider ini yang boleh dipakai ReOUTER.", '<a class="btn sm" href="#/setup"><i class="ic ic-plus"></i>Tambah model</a>')}
      <div class="card" style="padding:6px 8px">
        <div style="overflow-x:auto"><table class="tbl" id="modelTbl"></table></div>
      </div>`;
  }
  function modelTableHTML() {
    const items = allModels();
    const head = '<thead><tr><th>Model</th><th>Provider</th><th>Kualitas</th><th>Kecepatan</th><th class="r">Harga / 1M</th><th>Status</th><th style="text-align:right">Aksi</th></tr></thead><tbody>';
    if (!items.length) return head + '<tr><td colspan="7" style="text-align:center;color:#6b6b6b;padding:40px">Belum ada model aktif. <a href="#/setup" style="color:#c4b5fd">Tambah provider</a> dulu.</td></tr></tbody>';
    return (
      head +
      items
        .map(({ p, m }) => {
          const inf = (p.modelInfo || {})[m] || {};
          return `<tr>
            <td class="mono" style="font-size:.76rem">${esc(m)}</td>
            <td>${dot(p)} <span style="margin-left:6px">${esc(p.name)}</span></td>
            <td>${stars(inf.smart)} <span style="color:#6b6b6b">${inf.known ? TIER[inf.tier] : ""}</span></td>
            <td>${inf.speed ? "⚡ " + inf.speed + " tok/s" : "—"}</td>
            <td class="r" style="color:#a3a3a3">${inf.known ? money(inf.priceIn) + " / " + money(inf.priceOut) : "—"}</td>
            <td>${pill(p)}</td>
            <td style="text-align:right"><button class="btn sm danger" data-delmodel data-pid="${esc(p.id)}" data-m="${esc(m)}" title="Hapus ${esc(m)} dari daftar aktif">Hapus</button></td>
          </tr>`;
        })
        .join("") +
      "</tbody>"
    );
  }

  /* ------------------------------ Ranking ------------------------------ */
  function viewRanking() {
    return `${head("Peringkat AI", "Skor = kualitas model + kecepatan nyata + keandalan. Paling atas dipakai lebih dulu.", '<button class="btn sm" id="btnTest"><i class="ic ic-send"></i>Tes request</button>')}
      <div class="grid-main">
        <div class="card">
          <div class="card-head"><h2 class="card-title">Urutan otomatis</h2><span class="chip ghost">${esc(MODE_TEXT[S.mode])}</span></div>
          <p class="card-sub">Diperbarui setiap request.</p>
          <div id="rankList"></div>
        </div>
        <div class="card">
          <h2 class="card-title">Cara skor dihitung</h2>
          <p class="card-sub">Bobot tetap, tanpa tebak-tebakan.</p>
          <div class="rowline"><div class="row-main"><div class="row-title">Kualitas 40%</div><div class="row-sub">Model lambat &amp; sering salah turun peringkat.</div></div></div>
          <div class="rowline"><div class="row-main"><div class="row-title">Kecepatan 40%</div><div class="row-sub">Latensi nyata dari request kamu.</div></div></div>
          <div class="rowline"><div class="row-main"><div class="row-title">Keandalan 12%</div><div class="row-sub">Rasio berhasil vs gagal.</div></div></div>
          <div class="rowline"><div class="row-main"><div class="row-title">Prioritas 8%</div><div class="row-sub">Pemecah seri kalau skor hampir sama.</div></div></div>
        </div>
      </div>`;
  }
  function rankListHTML() {
    const r = S.ranking || [];
    if (!r.length) return '<div class="empty"><div class="empty-ic"><i class="ic ic-award"></i></div><h3>Belum ada peringkat</h3><p>Skor muncul setelah provider dicek dan dipakai.</p></div>';
    return r
      .map(
        (x, i) => `<div class="rowline">
        <span class="rank-no ${i === 0 ? "top" : ""}">${i + 1}</span>
        <div class="row-main">
          <div class="row-title">${esc(x.name)}</div>
          <div class="row-sub mono">${esc(x.model || "—")}</div>
          <div class="bar"><i style="width:${Math.min(100, x.score)}%"></i></div>
        </div>
        <div class="row-end" style="min-width:150px">
          <b>${x.score}</b> skor<br />
          ${x.latencyMs} ms · cerdas ${x.quality}%<br />
          berhasil ${x.reliability}%
        </div>
      </div>`,
      )
      .join("");
  }

  /* ------------------------------ Connect ------------------------------ */
  function viewConnect() {
    const models = [...new Set(allModels().map((i) => i.m))];
    const first = models[0] || "auto";
    const box = (label, val) => `<div class="field"><label>${label}</label><div class="copy"><code>${esc(val)}</code><button class="btn sm" data-copy="${esc(val)}">Copy</button></div></div>`;
    return `${head("Koneksikan CLI", "Pakai endpoint ReOUTER di editor/CLI apa pun yang bisa bicara OpenAI API.")}
      <div style="display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:16px;align-items:start" class="setup-grid">
        <div class="card">
          <h2 class="card-title">Endpoint kamu</h2>
          <p class="card-sub">OpenAI-compatible.</p>
          ${box("Base URL", ORIGIN + "/v1")}
          ${box("API Key", "reouter")}
          ${box("Model", first)}
          <p style="color:#6b6b6b;font-size:.76rem;margin:0">Model apa pun yang aktif diarahkan ke AI paling siap — kalau mati, pindah sendiri.</p>
        </div>
        <div class="card">
          <div class="card-head"><h2 class="card-title">Contoh konfigurasi</h2></div>
          <div class="tabs mb-3" id="cfgTabs" style="margin-bottom:12px">
            <a href="#" data-cfg="opencode" class="on">OpenCode</a>
            <a href="#" data-cfg="claude">Claude Code</a>
            <a href="#" data-cfg="env">Cline / Aider</a>
            <a href="#" data-cfg="curl">cURL</a>
          </div>
          <pre class="pre" id="cfgCode"></pre>
          <button class="btn primary sm" id="cfgCopy" style="margin-top:12px">Copy config</button>
        </div>
      </div>`;
  }
  function cfgText(kind) {
    const models = [...new Set(allModels().map((i) => i.m))];
    const first = models[0] || "auto";
    const list = models.length ? models : ["auto"];
    if (kind === "opencode") {
      return `{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "reouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "ReOUTER",
      "options": { "baseURL": "${ORIGIN}/v1", "apiKey": "reouter" },
      "models": {
${list.map((m) => `        ${JSON.stringify(m)}: { "name": ${JSON.stringify(m)} }`).join(",\n")}
      }
    }
  }
}`;
    }
    if (kind === "claude") {
      return `{
  "env": {
    "ANTHROPIC_BASE_URL": "${ORIGIN}/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "reouter",
    "ANTHROPIC_MODEL": "${first}"
  }
}`;
    }
    if (kind === "env") {
      return `export OPENAI_BASE_URL="${ORIGIN}/v1"
export OPENAI_API_KEY="reouter"

# lalu jalankan seperti biasa:
aider --openai-api-base "$OPENAI_BASE_URL" \\
      --openai-api-key "$OPENAI_API_KEY" \\
      --model openai/${first}`;
    }
    return `curl ${ORIGIN}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer reouter" \\
  -d '{
    "model": "${first}",
    "messages": [{ "role": "user", "content": "halo" }]
  }'`;
  }

  /* ------------------------------ Logs ------------------------------ */
  function viewLogs() {
    return `${head("Log Live", "Setiap request, percobaan, dan pengambilalihan tercatat di sini.", '<button class="btn sm" id="btnTest"><i class="ic ic-send"></i>Tes request</button>')}
      <div class="card">
        <div class="card-head"><h2 class="card-title">Riwayat ReOUTER</h2><span class="chip ghost" id="logHint">live</span></div>
        <p class="card-sub">Terbaru di atas.</p>
        <div class="log" id="bigLog" style="max-height:62vh"></div>
      </div>`;
  }

  /* ------------------------------ Update / Mount ------------------------------ */
  function update() {
    // Jangan timpa DOM kalau pengguna sedang mengetik / berinteraksi di menu Setup
    // (search model, isi nama/URL/key) — kalau ditimpa, input hilang & gulungan mental.
    const typing = document.activeElement && document.activeElement.closest("#provList, .prov-body");
    const searchOpen = $$("#provList .prov.open").some((d) => {
      const s = d.querySelector(".i-search");
      return s && s.value.trim();
    });

    if (page === "dashboard") {
      const st = S.stats || {};
      const ok = S.providers.filter(ready).length;
      const set = (k, html) => {
        const el = document.querySelector(`[data-kpi="${k}"]`);
        if (el) el.innerHTML = html;
      };
      set("kpi", `${ok}<span class="unit"> / ${S.providers.length}</span>`);
      set("rq", num(st.success || 0));
      set("fo", num(st.failovers || 0));
      set("ms", `${num(st.msAvg || 0)}<span class="unit"> ms</span>`);
      const hero = $("#heroCard");
      if (hero) hero.innerHTML = heroHTML();
      const chain = $("#chain");
      if (chain) chain.innerHTML = chainHTML();
      const tbl = $("#recentTbl");
      if (tbl) tbl.innerHTML = recentHTML();
      const mini = $("#miniLog");
      if (mini) mini.innerHTML = logLines(40);
      drawSparks();
      drawWho();
    }
    if (page === "setup") {
      const list = $("#provList");
      if (list && !typing && !searchOpen) {
        // Simpan dulu keyword & status buka tiap provider sebelum DOM ditimpa
        $$("#provList .prov").forEach((d) => {
          const s = d.querySelector(".i-search");
          if (s) searchQuery[d.dataset.pid] = s.value;
        });
        const open = $$("#provList .prov.open").map((d) => d.dataset.pid);
        list.innerHTML = provListHTML();
        open.forEach((id) => {
          const d = $(`#provList [data-pid="${id}"]`);
          if (d) d.classList.add("open");
        });
      }
    }
    if (page === "models") {
      const t = $("#modelTbl");
      if (t) t.innerHTML = modelTableHTML();
    }
    if (page === "ranking") {
      const r = $("#rankList");
      if (r) r.innerHTML = rankListHTML();
    }
    if (page === "logs") {
      const l = $("#bigLog");
      if (l) l.innerHTML = logLines(120);
      const h = $("#logHint");
      if (h) h.textContent = `${S.providers.length} provider · ${events().length} event`;
    }
  }

  function onMount() {
    update();
    if (page === "connect") {
      let cfg = "opencode";
      const paint = () => {
        $("#cfgCode").textContent = cfgText(cfg);
        $$("#cfgTabs a").forEach((a) => a.classList.toggle("on", a.dataset.cfg === cfg));
      };
      $$("#cfgTabs a").forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault();
          cfg = a.dataset.cfg;
          paint();
        }),
      );
      paint();
      $("#cfgCopy").addEventListener("click", () => copy($("#cfgCode").textContent, "Config disalin"));
    }
  }

  /* ------------------------------ Actions ------------------------------ */
  async function runTest() {
    $$("#btnTest, #btnTest2").forEach((b) => (b.disabled = true));
    toast("Mengirim request uji…", "info");
    try {
      const out = await api("/test", { method: "POST", body: { prompt: "Balas satu kalimat singkat: ReOUTER siap." } });
      if (out.ok) toast(`${out.provider.name} menjawab dalam ${out.ms} ms`, "ok");
      else toast("Semua provider gagal — cek log", "bad");
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      $$("#btnTest, #btnTest2").forEach((b) => (b.disabled = false));
      refresh();
    }
  }

  function bind() {
    $$("#btnTest, #btnTest2").forEach((b) => b.addEventListener("click", runTest));

    if (page === "setup") {
      const msg = (html, color = "#f87171") => {
        const el = $("#detectMsg");
        if (el) el.innerHTML = html ? `<span style="color:${color}">${html}</span>` : "";
      };
      $("#toggleManual").addEventListener("click", () => {
        const box = $("#manualBox");
        box.style.display = box.style.display === "none" ? "block" : "none";
      });
      $("#btnDetect").addEventListener("click", async () => {
        const key = $("#fKey").value.trim();
        if (!key) return msg("API key masih kosong.");
        const btn = $("#btnDetect");
        btn.disabled = true;
        btn.textContent = "Mengecek provider…";
        msg("");
        try {
          const out = await api("/detect", { method: "POST", body: { apiKey: key } });
          if (out.ok) {
            $("#fKey").value = "";
            msg(`Terdeteksi <b>${esc(out.provider.name)}</b> · ${out.count} model siap.`, "#4ade80");
            toast(`${out.provider.name} ditambahkan`, "ok");
            await refresh();
          } else msg(`Gagal: ${esc(out.error)}. Coba tambah manual.`);
        } catch (e) {
          msg(esc(e.message));
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="ic ic-plug"></i>Cek &amp; Tambahkan';
        }
      });
      $("#fKey").addEventListener("keydown", (e) => e.key === "Enter" && $("#btnDetect").click());
      $("#fPreset").addEventListener("change", () => {
        const pr = (S.presets || []).find((x) => x.id === $("#fPreset").value);
        if (!pr) return;
        $("#fName").value = pr.name;
        $("#fUrl").value = pr.baseUrl;
        $("#fKey2").focus();
      });
      $("#btnManualAdd").addEventListener("click", async () => {
        const name = $("#fName").value.trim() || "Provider";
        const baseUrl = $("#fUrl").value.trim();
        const apiKey = $("#fKey2").value.trim();
        if (!baseUrl) return toast("Base URL wajib diisi", "bad");
        try {
          const { provider } = await api("/providers", { method: "POST", body: { name, baseUrl, apiKey } });
          toast(`${name} ditambahkan`, "ok");
          await refresh();
          if (apiKey) {
            const out = await api(`/providers/${provider.id}/check`, { method: "POST", body: {} });
            toast(out.ok ? `${out.count} model ditemukan` : out.error, out.ok ? "ok" : "bad");
            await refresh();
          }
        } catch (e) {
          toast(e.message, "bad");
        }
      });
    }
  }

  /* ------------------------------ Delegated events ------------------------------ */
  document.addEventListener("click", async (e) => {
    // Hapus 1 model dari daftar aktif (menu Model Aktif) = uncheck dari provider
    const delBtn = e.target.closest("[data-delmodel]");
    if (delBtn) {
      const pid = delBtn.dataset.pid;
      const m = delBtn.dataset.m;
      const p = S.providers.find((x) => x.id === pid);
      if (!p) return;
      if (!confirm(`Hapus model ${m} dari daftar aktif?`)) return;
      delBtn.disabled = true;
      const picked = (p.picked || []).filter((x) => x !== m);
      p.picked = picked;
      try {
        await api(`/providers/${p.id}`, { method: "PATCH", body: { picked } });
        toast(`${m} dihapus dari aktif`, "info");
        await refresh();
      } catch (err) {
        p.picked = [...(p.picked || []), m];
        toast(err.message, "bad");
        delBtn.disabled = false;
      }
      return;
    }
    const mode = e.target.closest("#modeSwitch [data-mode]");
    if (mode) {
      try {
        await api("/mode", { method: "POST", body: { mode: mode.dataset.mode } });
        toast("Mode: " + MODE_TEXT[mode.dataset.mode], "ok");
        await refresh();
      } catch (err) {
        toast(err.message, "bad");
      }
      return;
    }

    const cp = e.target.closest("[data-copy]");
    if (cp) return copy(cp.dataset.copy, "Disalin");

    if (e.target.closest("#menuBtn")) {
      $("#side").classList.toggle("open");
      return;
    }
    if (e.target.closest(".side-link")) $("#side").classList.remove("open");

    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const row = btn.closest("[data-pid]");
    if (!row) return;
    const pid = row.dataset.pid;
    const p = S.providers.find((x) => x.id === pid);
    if (!p) return;
    const act = btn.dataset.act;
    const keep = () => {
      const d = $(`[data-pid="${pid}"]`);
      if (d) d.classList.add("open");
    };

    if (act === "open") {
      row.classList.toggle("open");
      return;
    }
    if (act === "toggle") {
      try {
        await api(`/providers/${pid}`, { method: "PATCH", body: { enabled: !p.enabled } });
        toast(`${p.name} ${p.enabled ? "dimatikan" : "diaktifkan"}`, p.enabled ? "info" : "ok");
        await refresh();
        keep();
      } catch (err) {
        toast(err.message, "bad");
      }
      return;
    }
    if (act === "check") {
      const name = row.querySelector(".i-name").value.trim();
      const baseUrl = row.querySelector(".i-url").value.trim();
      const apiKey = row.querySelector(".i-key").value.trim();
      btn.disabled = true;
      btn.textContent = "Mengecek…";
      try {
        await api(`/providers/${pid}`, { method: "PATCH", body: { name, baseUrl, ...(apiKey ? { apiKey } : {}) } });
        const out = await api(`/providers/${pid}/check`, { method: "POST", body: {} });
        toast(out.ok ? `${out.count} model · ${out.ms} ms` : out.error, out.ok ? "ok" : "bad");
        await refresh();
        keep();
      } catch (err) {
        toast(err.message, "bad");
      } finally {
        btn.disabled = false;
        btn.textContent = "Cek ulang API";
      }
      return;
    }
    if (act === "reset") {
      await api(`/providers/${pid}`, { method: "PATCH", body: { resetCooldown: true } });
      toast(`${p.name} dipulihkan`, "ok");
      await refresh();
      keep();
      return;
    }
    if (act === "all") {
      await api(`/providers/${pid}`, { method: "PATCH", body: { picked: p.models.slice(), enabled: true } });
      toast(`Semua ${p.models.length} model dipakai`, "ok");
      await refresh();
      keep();
      return;
    }
    if (act === "del") {
      if (!confirm(`Hapus provider ${p.name}?`)) return;
      await api(`/providers/${pid}`, { method: "DELETE" });
      toast(`${p.name} dihapus`, "info");
      await refresh();
    }
  });

  document.addEventListener("change", async (e) => {
    const cb = e.target.closest(".m-check");
    if (!cb) return;
    const row = cb.closest("[data-pid]");
    const p = S.providers.find((x) => x.id === row.dataset.pid);
    if (!p) return;
    const m = cb.dataset.m;
    const picked = cb.checked ? [...new Set([...p.picked, m])] : p.picked.filter((x) => x !== m);
    p.picked = picked;
    try {
      await api(`/providers/${p.id}`, { method: "PATCH", body: { picked } });
    } catch (err) {
      cb.checked = !cb.checked;
      toast(err.message, "bad");
    }
    refresh();
  });

  document.addEventListener("input", (e) => {
    const s = e.target.closest(".i-search");
    if (!s) return;
    const q = s.value.trim().toLowerCase();
    // simpan keyword per provider supaya tidak hilang saat refresh berkala
    const host = s.closest("[data-pid]");
    if (host) searchQuery[host.dataset.pid] = s.value;
    $$(".mrow", s.closest(".prov-body")).forEach((r) => {
      const hit = !q || r.querySelector(".mname").textContent.toLowerCase().includes(q);
      r.style.display = hit ? "" : "none";
    });
  });

  const dateInputs = () => {
    const f = $("#dateFrom");
    const t = $("#dateTo");
    if (f && t && !f.value) {
      const now = new Date();
      const start = new Date(now.getTime() - 13 * 864e5);
      const iso = (d) => d.toISOString().slice(0, 10);
      f.value = iso(start);
      t.value = iso(now);
      range = { from: f.value, to: t.value };
    }
  };
  document.addEventListener("change", (e) => {
    if (e.target.id === "dateFrom" || e.target.id === "dateTo") {
      range = { from: $("#dateFrom").value, to: $("#dateTo").value };
      page = "";
      render();
    }
  });

  /* ------------------------------ Boot ------------------------------ */
  dateInputs();
  refresh();
  setInterval(() => !document.hidden && refresh(), 2500);
  window.addEventListener("resize", () => {
    if (page === "dashboard") {
      drawSparks();
      drawWho();
    }
  });
})();
