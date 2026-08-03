# 🤖 WhatsApp Bot dengan Google Gemini API (Multimodal & Memory)

Proyek Bot WhatsApp otomatis berfitur lengkap yang ditenagai oleh **Google Gemini AI**. Bot ini mendukung percakapan teks berlanjut (Memory/Context), analisis media & gambar (Multimodal), pengubahan peran (Persona), serta manajemen perintah.

---

## ✨ Fitur Utama

- 💬 **Tanya Jawab Teks Cerdas**: Menjawab pertanyaan secara instan dengan kecerdasan Gemini AI.
- 🖼️ **Multimodal Support (Gambar & Media)**: Analisis foto, gambar, dokumen, atau pesan suara yang dikirim langsung atau di-reply dengan perintah `!gemini`.
- 🧠 **Context Memory (Riwayat Percakapan)**: Memahami konteks obrolan sebelumnya untuk diskusi berkelanjutan.
- 🎭 **Persona / Custom Role (`!role`)**: Mengubah kepribadian atau mode bot secara dinamis (contoh: Tutor, Dokter, Programmer, dll).
- 🧹 **Reset Memory (`!reset`)**: Menghapus riwayat ingatan bot dalam sekali perintah.
- 👥 **Dukungan Grup & Chat Pribadi**: Berfungsi seamless di pesan pribadi maupun grup WhatsApp.

---

## 📁 Struktur Folder

- [`package.json`](file:///C:/Users/Wahyu%20Noer%20Rahmat/Documents/semester-6/KKN_Proker_TI/wa-bot-gemini/package.json) - Pengaturan dependensi & script Node.js
- [`index.js`](file:///C:/Users/Wahyu%20Noer%20Rahmat/Documents/semester-6/KKN_Proker_TI/wa-bot-gemini/index.js) - Kode utama integrasi WhatsApp Web & Gemini API
- [`.env.example`](file:///C:/Users/Wahyu%20Noer%20Rahmat/Documents/semester-6/KKN_Proker_TI/wa-bot-gemini/.env.example) - Template variabel lingkungan untuk API Key Gemini & Pengaturan Bot
- [`.gitignore`](file:///C:/Users/Wahyu%20Noer%20Rahmat/Documents/semester-6/KKN_Proker_TI/wa-bot-gemini/.gitignore) - Mengabaikan `node_modules`, `.env`, dan sesi WhatsApp

---

## 🚀 Langkah Pemasangan & Menjalankan Bot

### 1. Masuk ke Folder Proyek
Buka terminal dan masuk ke folder `wa-bot-gemini`:
```bash
cd wa-bot-gemini
```

### 2. Install Dependensi
Jalankan perintah berikut untuk menginstal seluruh pustaka yang dibutuhkan:
```bash
npm install
```

### 3. Konfigurasi File `.env`
1. Salin berkas `.env.example` menjadi `.env`:
   - Di PowerShell:
     ```powershell
     copy .env.example .env
     ```
2. Buka berkas `.env` dan masukkan API Key Gemini Anda:
   ```env
   GEMINI_API_KEY=AIzaSy... (API Key Anda)
   GEMINI_MODEL=gemini-1.5-flash
   SYSTEM_INSTRUCTION="Kamu adalah asisten cerdas WhatsApp yang ramah..."
   ```
   *(Dapatkan API Key gratis di [Google AI Studio](https://aistudio.google.com/))*

### 4. Jalankan Bot
Jalankan bot dengan perintah:
```bash
npm start
```
Atau untuk mode pengembangan (auto-reload):
```bash
npm run dev
```

1. Terminal akan menampilkan **QR Code**.
2. Buka aplikasi WhatsApp di HP Anda.
3. Masuk ke **Menu / Pengaturan > Perangkat Tertaut > Tautkan Perangkat**.
4. Scan QR Code yang ada di terminal.
5. Bot siap digunakan! 🎉

---

## 📜 Perintah Bot (Commands)

| Perintah | Deskripsi | Contoh |
| --- | --- | --- |
| `!help` / `!menu` | Menampilkan menu bantuan dan daftar perintah | `!help` |
| `!gemini <pertanyaan>` | Mengirim pertanyaan ke Gemini AI | `!gemini Jelaskan teori relativitas secara singkat` |
| `!reset` / `!clear` | Menghapus riwayat/ingatan percakapan pada chat tersebut | `!reset` |
| `!role <peran>` | Mengubah kepribadian / instruksi bot | `!role Kamu adalah guru fisika SMA...` |
| `!role reset` | Mengembalikan peran bot ke default | `!role reset` |
| `!model` | Menampilkan nama model Gemini yang sedang aktif | `!model` |
| `!id` | Menampilkan ID chat / grup ini (digunakan untuk setup whitelist) | `!id` |

---

## 🛡️ Pengaturan Filter & Whitelist (Merespon Grup/Kontak Tertentu)

Anda bisa mengatur bot agar hanya merespon di grup/kontak tertentu melalui berkas [`.env`](file:///C:/Users/Wahyu%20Noer%20Rahmat/Documents/semester-6/KKN_Proker_TI/wa-bot-gemini/.env):

### 1. Pilihan Mode Pengoperasian (`BOT_MODE`)
- `BOT_MODE=all` *(Default)*: Merespon semua chat pribadi & grup.
- `BOT_MODE=groups_only`: Hanya merespon di grup WhatsApp.
- `BOT_MODE=private_only`: Hanya merespon di chat pribadi.
- `BOT_MODE=whitelist_only`: Hanya merespon kontak atau grup yang terdaftar di `ALLOWED_CHATS`.

### 2. Membatasi ke Grup / Kontak Tertentu (`ALLOWED_CHATS`)
1. Kirim pesan `!id` ke bot di dalam grup atau dari nomor WhatsApp yang ingin Anda daftarkan.
2. Bot akan membalas dengan ID (contoh: `120363123456789012@g.us` untuk grup atau `6281234567890@c.us` untuk kontak).
3. Masukkan ID tersebut pada file `.env` di variabel `ALLOWED_CHATS`:
   ```env
   BOT_MODE=whitelist_only
   ALLOWED_CHATS=120363123456789012@g.us,6281234567890@c.us
   ```
*(Pisahkan dengan koma jika lebih dari satu ID)*


---

## 💡 Cara Mengirim Foto / Gambar ke Bot

1. **Upload Foto dengan Caption**:
   Attach gambar di WhatsApp, lalu beri caption `!gemini Jelaskan makanan apa ini`.
2. **Reply Pesan Foto**:
   Reply/balas foto yang pernah dikirim di chat dengan mengetik `!gemini Apa isi teks di gambar ini?`.
