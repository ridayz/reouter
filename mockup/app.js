/* ReOUTER mockup — semua fungsi jalan pakai data dummy (tanpa server). */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- Pilih tema (?t=... atau dropdown, diingat di localStorage) ----------
  const themeSel = $("#themeSel");
  function applyTheme(t) {
    const link = $("#themeCss");
    if (t) link.href = "themes/" + t + ".css";
    else link.removeAttribute("href");
    themeSel.value = t;
    try { localStorage.setItem("reouter-theme", t); } catch (e) {}
  }
  let savedTheme = "";
  try { savedTheme = localStorage.getItem("reouter-theme") || ""; } catch (e) {}
  const qTheme = new URLSearchParams(location.search).get("t");
  themeSel.addEventListener("change", e => applyTheme(e.target.value));
  applyTheme(qTheme !== null ? qTheme : savedTheme);

  // ---------- Data dummy: banyak provider & model ----------
  const PROVIDERS = [
    { id: "tr",  name: "TokenRouterAI", planet: "Bulan",     color: "#a855f7", on: true,  key: true,  prio: 1,
      models: ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-pro", "zai/glm-5.3", "zai/glm-5.3-flash",
               "moonshot/kimi-k3.1-pro", "anthropic/claude-opus-4.7", "openai/gpt-6-sol", "google/gemini-3.8-flash"] },
    { id: "uoi", name: "UOI Token",     planet: "Merkurius", color: "#ec4899", on: true,  key: true,  prio: 2,
      models: ["gpt-6-sol", "deepseek-v4.1-flash", "claude-sonnet-4.5", "glm-5.3-flash", "gemini-3.8-flash"] },
    { id: "oa",  name: "OpenAI",        planet: "Venus",     color: "#c026d3", on: false, key: false, prio: 3, models: ["gpt-4o-mini", "gpt-4o"] },
    { id: "an",  name: "Anthropic",     planet: "Bumi",      color: "#8b5cf6", on: false, key: false, prio: 4, models: ["claude-3-5-haiku", "claude-3-5-sonnet"] },
    { id: "gm",  name: "Google Gemini", planet: "Mars",      color: "#f472b6", on: false, key: false, prio: 5, models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
    { id: "gq",  name: "Groq",          planet: "Jupiter",   color: "#d946ef", on: false, key: false, prio: 6, models: ["llama-3.3-70b", "llama-3.1-8b"] },
    { id: "or",  name: "OpenRouter",    planet: "Saturnus",  color: "#a78bfa", on: false, key: false, prio: 7, models: ["openai/gpt-4o-mini", "meta-llama/llama-3.3-70b"] }
  ];

  const HIST = [
    { ok: true,  prov: "TokenRouterAI", model: "deepseek/deepseek-v4.1-flash", tin: 2019, tout: 8,   lat: 3100, cost: 0.0004, ts: "17.48.06" },
    { ok: true,  prov: "UOI Token",     model: "gpt-6-sol",                    tin: 2069, tout: 69,  lat: 3800, cost: 0.0006, ts: "17.42.12" },
    { ok: false, prov: "OpenRouter",    model: "claude-opus-4.7",              tin: 0,    tout: 0,   lat: 200,  cost: 0,      ts: "17.40.55" },
    { ok: true,  prov: "TokenRouterAI", model: "zai/glm-5.3-flash",            tin: 2024, tout: 152, lat: 4200, cost: 0.0010, ts: "17.36.30" },
    { ok: true,  prov: "UOI Token",     model: "claude-sonnet-4.5",            tin: 1880, tout: 210, lat: 5100, cost: 0.0011, ts: "17.31.02" }
  ];

  const state = { view: "command", filter: "all", q: "", mode: "Failover", anim: true, live: true, modalKey: "", detected: null, requests: HIST.length };
  const TITLES = { command: "Command Center", history: "Riwayat Request", keys: "Pusat API Key", agents: "Agent & Model", settings: "Pengaturan" };

  // ---------- Navigasi & sidebar ----------
  function go(view) {
    state.view = view;
    $$(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + view));
    $$(".nav-item").forEach(b => b.classList.toggle("on", b.dataset.view === view));
    $("#crumbTxt").textContent = TITLES[view];
    $("#side").classList.remove("open");
  }
  $$(".nav-item").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  $("#menuBtn").addEventListener("click", () => $("#side").classList.toggle("open"));

  // ---------- Toast ----------
  let toastT;
  function toast(msg, kind = "") {
    const t = $("#toast");
    t.className = "toast " + kind;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- Metrik ----------
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + " rb" : String(n); }
  function renderMetrics() {
    const ok = HIST.filter(h => h.ok);
    const tin = HIST.reduce((s, h) => s + h.tin, 0);
    const tout = HIST.reduce((s, h) => s + h.tout, 0);
    const cost = HIST.reduce((s, h) => s + h.cost, 0);
    const lats = ok.map(h => h.lat).sort((a, b) => a - b);
    const med = lats.length ? lats[Math.floor(lats.length / 2)] : 0;
    $("#mReq").textContent = HIST.length;
    $("#mReqSub").textContent = `${ok.length} ok · ${HIST.length - ok.length} gagal`;
    $("#mRate").textContent = Math.round((ok.length / HIST.length) * 100) + "%";
    $("#mTin").textContent = fmt(tin);
    $("#mTout").textContent = fmt(tout);
    $("#mLat").textContent = (med / 1000).toFixed(1) + " dtk";
    $("#mCost").textContent = "$" + cost.toFixed(4);
  }

  // ---------- Orbit: planet mengorbit + klik ----------
  function renderOrbit() {
    const wrap = $("#planets");
    wrap.innerHTML = "";
    PROVIDERS.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "planet" + (p.on && p.key ? "" : " off");
      el.dataset.id = p.id;
      const ang = (i / PROVIDERS.length) * 360;
      const rad = 22 + p.prio * 5.5; // persen dari lebar/tinggi
      el.style.transform = `rotate(${ang}deg)`;
      el.innerHTML = `
        <span class="halo"></span><span class="halo h2"></span>
        <span class="dot" style="background:${p.color};box-shadow:0 0 12px ${p.color}"></span>
        <span class="lbl">${p.planet}</span>`;
      el.addEventListener("click", () => selectPlanet(p));
      wrap.appendChild(el);
    });
    applyOrbitMotion();
  }

  // Animasi orbit pakai requestAnimationFrame (bisa di-pause lewat toggle)
  let t0 = performance.now(), raf = null;
  function applyOrbitMotion() {
    cancelAnimationFrame(raf);
    if (!state.anim) return;
    const tick = (now) => {
      const sec = (now - t0) / 1000;
      const orbitEl = $("#orbit");
      const half = Math.min(orbitEl.offsetWidth, orbitEl.offsetHeight) / 2;
      PROVIDERS.forEach((p, i) => {
        const el = document.querySelector(`.planet[data-id="${p.id}"]`);
        if (!el) return;
        const speed = 6 + p.prio * 2.2; // detik per putaran
        const ang = ((i / PROVIDERS.length) * 360) + (sec / speed) * 360;
        const rad = half * (0.3 + p.prio * 0.065);
        el.style.transform = `rotate(${ang}deg) translateX(${rad}px)`;
        el.style.setProperty("--ang", ang);
        const lbl = el.querySelector(".lbl");
        if (lbl) lbl.style.transform = `translate(-50%, 0) rotate(${-ang}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function selectPlanet(p) {
    toast(`${p.name} · ${p.on && p.key ? "aktif" : "belum aktif"} · ${p.models.length} model`, p.on && p.key ? "ok" : "");
    const inp = $("#testModel");
    const opt = Array.from(inp.options).find(o => o.dataset.prov === p.id);
    if (opt) inp.value = opt.value;
  }

  // ---------- Uji gateway: kirim (simulasi) + animasi LIVE ----------
  function fillTestModels() {
    const sel = $("#testModel");
    sel.innerHTML = "";
    PROVIDERS.filter(p => p.on && p.key).forEach(p => {
      p.models.forEach(m => {
        const o = document.createElement("option");
        o.value = m; o.dataset.prov = p.id; o.textContent = `${m} · ${p.name}`;
        sel.appendChild(o);
      });
    });
  }

  let liveT;
  function setLive(p, on) {
    const core = $("#core");
    const badge = $("#liveBadge");
    const el = document.querySelector(`.planet[data-id="${p.id}"]`);
    if (on) {
      core.classList.add("work");
      el && el.classList.add("work");
      badge.textContent = "LIVE · " + p.name;
      badge.className = "pill live";
      if (el && state.anim) burst(el);
    } else {
      core.classList.remove("work");
      $$(".planet").forEach(x => x.classList.remove("work"));
      badge.textContent = "idle";
      badge.className = "pill";
    }
  }

  function burst(el) {
    const orbit = $("#orbit");
    const rect = orbit.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const px = er.left + er.width / 2 - rect.left;
    const py = er.top + er.height / 2 - rect.top;
    const trail = document.createElement("div");
    trail.className = "trail show";
    const len = Math.hypot(cx - px, cy - py);
    const deg = Math.atan2(cy - py, cx - px) * 180 / Math.PI;
    trail.style.width = len + "px";
    trail.style.transform = `rotate(${deg}deg)`;
    orbit.appendChild(trail);
    setTimeout(() => trail.remove(), 900);
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("span");
      s.className = "sparkle";
      s.style.left = px + "px"; s.style.top = py + "px";
      s.style.setProperty("--dx", (cx - px) * 0.6 + (Math.random() * 30 - 15) + "px");
      s.style.setProperty("--dy", (cy - py) * 0.6 + (Math.random() * 30 - 15) + "px");
      orbit.appendChild(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  function addHistory(entry) {
    HIST.unshift(entry);
    renderMetrics();
    renderHistory();
  }

  $("#testBtn").addEventListener("click", () => {
    const sel = $("#testModel");
    const model = sel.value;
    const opt = sel.selectedOptions[0];
    if (!model) return toast("Pilih model dulu", "err");
    const p = PROVIDERS.find(x => x.id === opt.dataset.prov);
    const out = $("#testOut");
    const btn = $("#testBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Mengirim…';
    out.className = "reply";
    out.textContent = `Menghubungi ${p.name}…`;
    setLive(p, true);
    const lat = 1200 + Math.random() * 2600;
    setTimeout(() => {
      const tin = 1800 + Math.round(Math.random() * 400);
      const tout = 8 + Math.round(Math.random() * 120);
      const cost = (tin * 0.5 + tout * 1.5) / 1e6;
      out.innerHTML = `✅ <b>${p.name}</b> · <span class="mono">${model}</span><br/>Jawaban contoh: "Halo dari ReOUTER." · ${tin} in / ${tout} out · ${(lat / 1000).toFixed(1)} dtk`;
      addHistory({ ok: true, prov: p.name, model, tin, tout, lat, cost, ts: new Date().toLocaleTimeString("id-ID") });
      setLive(p, false);
      btn.disabled = false;
      btn.textContent = "▶ Kirim Test";
      toast("Request berhasil", "ok");
    }, lat);
  });

  // ---------- Riwayat ----------
  function renderHistory() {
    const q = state.q.toLowerCase();
    const rows = HIST.filter(h => {
      if (state.filter === "ok" && !h.ok) return false;
      if (state.filter === "fail" && h.ok) return false;
      if (q && !`${h.model} ${h.prov}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const tb = $("#histBody");
    tb.innerHTML = rows.map(h => `
      <tr>
        <td><span class="pill ${h.ok ? "g" : "r"}">${h.ok ? "OK" : "GAGAL"}</span></td>
        <td>${h.prov}</td>
        <td class="mono">${h.model}</td>
        <td class="mono">${h.ok ? h.tin + " / " + h.tout : "— / —"}</td>
        <td class="mono">${h.ok ? (h.lat / 1000).toFixed(1) + " dtk" : "—"}</td>
      </tr>`).join("");
    $("#histEmpty").hidden = rows.length > 0;
  }
  $$(".seg button[data-f]").forEach(b => b.addEventListener("click", () => {
    $$(".seg button[data-f]").forEach(x => x.classList.toggle("on", x === b));
    state.filter = b.dataset.f;
    renderHistory();
  }));
  $("#histQ").addEventListener("input", e => { state.q = e.target.value; renderHistory(); });
  $("#csvBtn").addEventListener("click", () => {
    const head = "status,provider,model,tin,tout,latensi_ms,biaya";
    const body = HIST.map(h => [h.ok ? "ok" : "gagal", h.prov, h.model, h.tin, h.tout, Math.round(h.lat), h.cost.toFixed(6)].join(","));
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reouter-riwayat.csv";
    a.click();
    toast("CSV diunduh", "ok");
  });

  // ---------- Pusat API Key ----------
  function renderKeys() {
    const list = $("#keyList");
    list.innerHTML = PROVIDERS.map(p => `
      <div class="item ${p.on && p.key ? "on" : ""}">
        <div class="item-l">
          <div class="item-n">${p.planet} · ${p.name}</div>
          <div class="item-s">${p.key ? "🔑 key tersimpan" : "🔒 belum ada key"} · prioritas ${p.prio}</div>
        </div>
        <div class="item-r">
          <button class="btn small" data-act="toggle" data-id="${p.id}">${p.on ? "Aktif ✅" : "Nonaktif"}</button>
          <button class="btn small" data-act="del" data-id="${p.id}" ${p.key ? "" : "disabled"}>Hapus key</button>
        </div>
      </div>`).join("");
    $("#keyCount").textContent = PROVIDERS.filter(p => p.key).length + "/" + PROVIDERS.length + " punya key";
  }
  $("#keyList").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const p = PROVIDERS.find(x => x.id === b.dataset.id);
    if (b.dataset.act === "toggle") {
      if (!p.key) return toast("Isi key dulu sebelum mengaktifkan", "err");
      p.on = !p.on;
      toast(`${p.name} ${p.on ? "diaktifkan" : "dinonaktifkan"}`, p.on ? "ok" : "");
    }
    if (b.dataset.act === "del") {
      p.key = false; p.on = false;
      toast(`Key ${p.name} dihapus`, "err");
    }
    refreshAll();
  });

  // ---------- Agent & Model ----------
  function renderAgents() {
    const list = $("#agentList");
    list.innerHTML = PROVIDERS.filter(p => p.key).map(p => `
      <div class="item on">
        <div class="item-l"><div class="item-n">${p.planet} · ${p.name}</div>
          <div class="item-s">${p.models.length} model tersedia</div></div>
      </div>
      ${p.models.map(m => `
        <label class="model-row">
          <input type="checkbox" checked data-prov="${p.id}" data-model="${m}" />
          <span class="mono">${m}</span>
        </label>`).join("")}`).join("") || '<div class="empty">Belum ada provider dengan key.</div>';
    updateOC();
  }
  $("#agentList").addEventListener("change", updateOC);

  // ---------- Pengaturan ----------
  $$("#modeSeg button").forEach(b => b.addEventListener("click", () => {
    $$("#modeSeg button").forEach(x => x.classList.toggle("on", x === b));
    state.mode = b.dataset.m;
    $("#modeTxt").textContent = state.mode;
    toast("Mode: " + state.mode, "ok");
  }));
  $("#tAnim").addEventListener("change", e => {
    state.anim = e.target.checked;
    document.body.classList.toggle("noanim", !state.anim);
    applyOrbitMotion();
  });
  $("#tLive").addEventListener("change", e => { state.live = e.target.checked; });

  function updateOC() {
    const models = $$("#agentList input[type=checkbox]:checked").map(c => c.dataset.model);
    const obj = {
      $schema: "https://opencode.ai/config.json",
      provider: { reouter: { npm: "@ai-sdk/openai-compatible", name: "ReOUTER",
        options: { baseURL: "http://127.0.0.1:9301/v1", apiKey: "reouter" },
        models: Object.fromEntries(models.map(m => [m, { name: m }])) } }
    };
    $("#ocCode").textContent = JSON.stringify(obj, null, 2);
  }
  $("#copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#ocCode").textContent); toast("Config disalin", "ok"); }
    catch (e) { toast("Gagal menyalin", "err"); }
  });

  // ---------- Modal tambah key ----------
  const modal = $("#modal");
  function openModal() {
    modal.hidden = false;
    $("#newKey").value = ""; $("#cekList").innerHTML = ""; $("#cekMsg").textContent = "";
    $("#mSave").disabled = true; state.detected = null;
    setTimeout(() => $("#newKey").focus(), 50);
  }
  function closeModal() { modal.hidden = true; }
  $("#addBtn").addEventListener("click", openModal);
  $("#mClose").addEventListener("click", closeModal);
  $("#mCancel").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  $("#cekBtn").addEventListener("click", () => {
    const k = $("#newKey").value.trim();
    const msg = $("#cekMsg");
    const list = $("#cekList");
    if (!k) { msg.innerHTML = '<span style="color:#fecdd3">Tempel key dulu.</span>'; return; }
    const btn = $("#cekBtn");
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Memeriksa…';
    msg.textContent = "";
    setTimeout(() => {
      btn.disabled = false; btn.textContent = "✅ Cek API";
      const valid = k.length >= 12 && !/palsu|invalid/i.test(k);
      if (!valid) {
        msg.innerHTML = '<span style="color:#fecdd3">❌ API key TIDAK valid — ditolak provider.</span>';
        list.innerHTML = "";
        state.detected = null; $("#mSave").disabled = true;
        return;
      }
      const prov = PROVIDERS.find(p => p.id === "tr");
      state.detected = prov;
      msg.innerHTML = `<span style="color:var(--green)">✅ API key VALID — ${prov.name}</span>`;
      list.innerHTML = prov.models.map((m, i) => `
        <label class="model-row"><input type="checkbox" checked data-m="${m}" /><span class="mono">${m}</span></label>`).join("");
      $("#mSave").disabled = false;
    }, 900);
  });

  $("#mSave").addEventListener("click", () => {
    if (!state.detected) return;
    const p = PROVIDERS.find(x => x.id === state.detected.id);
    p.key = true; p.on = true;
    toast(`${p.name} disimpan · ${p.models.length} model`, "ok");
    closeModal();
    refreshAll();
  });

  // ---------- Refresh semua ----------
  function refreshAll() {
    renderMetrics();
    renderOrbit();
    fillTestModels();
    renderHistory();
    renderKeys();
    renderAgents();
    const anyOn = PROVIDERS.some(p => p.on && p.key);
    $("#connTxt").textContent = anyOn ? "ONLINE · REALTIME" : "OFFLINE";
    $(".live-dot").classList.toggle("off", !anyOn);
    $("#portTxt").textContent = "127.0.0.1:9301";
  }

  refreshAll();
  go("command");
})();
