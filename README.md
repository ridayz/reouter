# 🛰 ReOUTER — AI Gateway & Command Center

Router AI **nyata**: satu gateway OpenAI-compatible yang menyalurkan request ke banyak
provider (OpenAI, Anthropic, Gemini, Groq, OpenRouter, atau **provider premium lo sendiri**),
dengan **failover berjenjang**, penghitungan **token & biaya asli**, dashboard realtime,
dan siap dipasang di **OpenCode**.

## ✨ Fitur
- ⚡ **Tambah Cepat** — tempel API key, ReOUTER kenali sendiri providernya, terus muncul daftar model buat dicentang. Nggak usah milih provider manual.
- 🔑 **Satu API key, banyak agent** — tarik daftar model dari API, centang yang mau dipakai.
- 🪐 **Nama bintang otomatis** — provider diberi nama benda langit otomatis. Tidak perlu dipilih.
- ⚡ **Triple-priority failover** — provider dicoba sesuai prioritas, gagal otomatis pindah.
- 📊 **Telemetry real** — request, success rate, token in/out, latensi, biaya (dari harga asli).
- ≡ **Riwayat request** — cari, filter (berhasil/gagal), ekspor CSV.
- 🔌 **`/v1/models` + config OpenCode auto-generate** — tinggal salin dari menu Pengaturan.

## 🔎 Provider yang bisa dideteksi otomatis
OpenAI · Groq · OpenRouter · Anthropic · Google Gemini · DeepSeek · Mistral

Provider lain? Pakai menu **🔑 Pusat API Key** → isi **Base URL** manual (yang OpenAI-compatible).

## 🚀 Cara jalan
1. Jalankan **`run.bat`** (atau `node server/index.js`).
2. Buka **http://127.0.0.1:9301**
3. Menu **🔑 Pusat API Key** → isi key → **🔄 Tarik Daftar Model** → pilih agent → nyalakan provider.
4. Menu **⚡ Gateway & Failover** → **▶ Test** untuk kirim request nyata.

## 🔌 Pasang di OpenCode
Tambahkan ke `opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "reouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "ReOUTER",
      "options": {
        "baseURL": "http://127.0.0.1:9301/v1",
        "apiKey": "reouter"
      },
      "models": {
        "gpt-4o-mini": { "name": "OpenAI GPT-4o mini" },
        "claude-3-5-sonnet-20241022": { "name": "Claude 3.5 Sonnet" },
        "gemini-2.0-flash": { "name": "Gemini 2.0 Flash" }
      }
    }
  }
}
```
Nama model harus sama dengan yang lo aktifkan di menu **Agent & Model**.

## 🌐 Gateway (OpenAI-compatible)
```bash
curl http://127.0.0.1:9301/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Halo"}]}'
```
Response menyertakan `provider` (siapa yang menjawab) + `usage` token asli.

## 🧩 Menambah provider premium sendiri
Di `server/config.json` (atau lewat UI), tambah entri:
```json
{
  "id": "premiumku",
  "name": "Provider Premium",
  "planet": "Neptunus",
  "enabled": true,
  "priority": 1,
  "baseUrl": "https://api.providerkamu.com/v1",
  "apiKey": "ISI_KEY",
  "models": [],
  "pricing": {}
}
```
Isi `baseUrl` (OpenAI-compatible) + key → klik **Tarik Daftar Model** → `models` keisi otomatis
(semua agent dari 1 key lo). Provider non-OpenAI (Anthropic/Gemini native) sudah punya adapter.

## 📐 Arsitektur
```
server/
  index.js      # Express: gateway /v1 + /v1/models + API dashboard + SSE
  router.js     # Engine failover + pengukuran latensi
  providers.js  # Adapter (OpenAI/Anthropic/Gemini) + auto-list model + hitung biaya
  metrics.js    # Log + agregasi metrik real
  config.js     # Baca/tulis config, redaksi API key
  config.json   # Daftar provider + key (JANGAN di-share)
client/
  src/          # Dashboard React: peta provider, metrik, riwayat, pengaturan OpenCode
```

## 🔒 Keamanan
- `server/config.json` menyimpan API key plaintext lokal → jangan di-commit/di-share.
- Hanya listen di `127.0.0.1` (tidak terekspos ke jaringan).
- API key tidak pernah dikirim balik ke browser (hanya status `hasKey`).
