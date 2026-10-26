# ReOUTER — Local AI Rotator

ReOUTER adalah aplikasi **local AI model rotator** ber-tema **galaksi & planet**. Satu endpoint OpenAI-compatible lokal (`http://127.0.0.1:9301/v1`) yang otomatis mengrotasi antar banyak provider AI — kalau provider mati, token habis, atau key ditolak, langsung **failover** ke provider lain **tanpa harus ganti model**.

## Fitur

- 🌌 **Galaksi interaktif** — planet = provider, orbit = urutan prioritas rotator, core = gateway ReOUTER.
  - Tembakan bintang antar-planet / dari inti galaksi saat request diproses atau gagal.
  - Kolom Rotator + Log Rotator di bawah galaksi (sejajar).
  - **Zoom in / zoom out** (+ / − / reset, atau **Ctrl + scroll**) di area galaksi.
  - Scroll horizontal & vertikal area galaksi.
  - Planet yang sedang melayani → **LIVE · &lt;provider&gt;**, berdenyut + ring + beam.
- 📊 **Statistik besar** — token input, token output, respon rata-rata (font 30px bold).
- 🔌 **Setup provider** — paste API key + **Cek API Provider**, daftar model muncul dengan checkbox.
  - Search box untuk mencari model cepat.
- 🔄 **Rotator** — mode **Failover** (prioritas pertama dulu, otomatis pindah) atau **Round-robin** (bergiliran).
- 🧾 **Log Rotator** — timeline request / try / success / fail dengan provider & planet.
- 🧪 **Test request** — selalu lewat **▶ Kirim Request**.
- 🖥️ **Launcher** — `ReOUTER.vbs` + `reouter.ico` + `run.bat` → double-click buka browser langsung ke app.

## Cara Pakai

1. `npm install` di folder `reouter/`.
2. `node server/index.js` (atau `npm start`).
3. Buka `http://127.0.0.1:9301/`.
4. Tambahkan provider → paste API key → **Cek API Provider**.
5. Centang model → **▶ Kirim Request**.
6. Kalau gagal → rotator otomatis pindah ke provider lain.

## Arsitektur

```
reouter/
├── mockup/v3.html     # UI (galaksi, planet, rotator, log, statistik)
├── server/
│   ├── index.js       # Express server + gateway /v1, /anthropic, /api
│   ├── rotator.js     # Failover engine + event log + stats kumulatif
│   ├── providers.js   # Adapters OpenAI / Anthropic / Gemini + classifyError
│   ├── modelinfo.js   # Tabel harga / kecepatan / kapabilitas model
│   └── config.js      # Persistensi config (data/config.json)
├── run.bat            # Launcher
├── ReOUTER.vbs        # Silent launcher (.vbs)
└── reouter.ico        # Icon desktop
```

## Endpoints

| Endpoint | Fungsi |
|---|---|
| `GET /api/state` | State semua provider + events + stats |
| `POST /api/providers` | Tambah provider |
| `PATCH /api/providers/:id` | Update (apiKey, picked, enabled, ...) |
| `DELETE /api/providers/:id` | Hapus provider |
| `POST /api/providers/:id/check` | Cek API → daftar model |
| `POST /api/test` | Kirim test request lewat rotator |
| `GET /api/stats` | Statistik kumulatif |
| `GET /v1/chat/completions` | OpenAI-compatible gateway |
| `GET /anthropic/v1/messages` | Anthropic-compatible gateway |
| `GET /health` | Health check |

## Screenshot

![ReOUTER](docs/screenshot-main.png)

---

© ReOUTER — built for local AI failover.
