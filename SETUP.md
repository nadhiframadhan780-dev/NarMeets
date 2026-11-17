# Ketemu — Panduan Konfigurasi Lanjutan & LiveKit Cloud (Opsional)

Aplikasi **Ketemu** dapat langsung dijalankan dan di-deploy tanpa mengisi variabel tambahan apa pun (mode bawaan memakai WebSocket + WebRTC Mesh + SQLite lokal).

Jika Anda ingin mengaktifkan **LiveKit SFU Region Singapore (`sin1`)** untuk pertemuan skala besar, tambahkan variabel berikut melalui **Secrets Panel** atau berkas `.env` lokal Anda:

```env
LIVEKIT_URL="wss://your-project.livekit.cloud"
LIVEKIT_API_KEY="API..."
LIVEKIT_API_SECRET="..."
LIVEKIT_REGION="sin1"

# Opsional: TURN Server kustom
TURN_URL="turn:turn.domainanda.com:3478"
TURN_USERNAME="..."
TURN_CREDENTIAL="..."

# Opsional: Secret & Path Database persisten
SESSION_SECRET="acak-minimal-64-karakter"
DATABASE_PATH="./ketemu.db"
```

## Cara Mendapatkan API Key LiveKit Cloud
1. Buka https://cloud.livekit.io dan buat proyek baru.
2. Pilih region **Singapore (`ap-southeast-1` / `sin1`)** untuk latensi terendah dari Indonesia.
3. Masuk ke **Settings → Keys**, klik **Add New Key**, lalu masukkan `LIVEKIT_URL`, `LIVEKIT_API_KEY`, dan `LIVEKIT_API_SECRET` ke panel Secrets sebelum deploy ulang.
