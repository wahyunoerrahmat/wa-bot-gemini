import whatsappweb from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

// Server HTTP ringan untuk Health Check Port Binding (Dibutuhkan oleh Render / Koyeb)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>🤖 Bot WhatsApp Gemini Siap Beroperasi!</h1><p>Status: Aktif & Running 24/7 di Cloud</p>');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health-check HTTP server mendengarkan di 0.0.0.0:${PORT}`);
});

// Penanganan global error agar bot tidak crash secara tak terduga
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message || err);
});

process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    // Abaikan error internal Puppeteer saat halaman WhatsApp Web sedang di-reload
    if (msg.includes('Execution context was destroyed') || msg.includes('Protocol error')) {
        return;
    }
    console.error('⚠️ Unhandled Rejection:', msg);
});

const { Client, LocalAuth } = whatsappweb;

// Validasi API Key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.error("❌ ERROR: Silakan atur GEMINI_API_KEY yang valid di file .env!");
    process.exit(1);
}

// Konfigurasi Model & System Instruction
const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const defaultSystemInstruction = process.env.SYSTEM_INSTRUCTION || 
    "Kamu adalah asisten cerdas WhatsApp yang ramah, membantu, serta merespon dengan cepat dan tepat dalam Bahasa Indonesia.";

// Inisialisasi Gemini API
const genAI = new GoogleGenerativeAI(apiKey);

// Penyimpanan sesi percakapan & persona per chat ID (Memory)
// Format: { [chatId]: { chatSession: GeminiChatSession, customRole: string | null } }
const userSessions = new Map();

/**
 * Mendapatkan atau membuat sesi percakapan Gemini untuk chat tertentu
 */
function getOrCreateSession(chatId, customInstruction = null) {
    const instruction = customInstruction || defaultSystemInstruction;
    
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: instruction
    });

    const chatSession = model.startChat({
        history: []
    });

    const sessionData = {
        chatSession,
        customRole: customInstruction,
        model
    };

    userSessions.set(chatId, sessionData);
    return sessionData;
}

/**
 * Mengonversi WhatsApp Media ke format inlineData Gemini
 */
function mediaToGenerativePart(media) {
    return {
        inlineData: {
            data: media.data,
            mimeType: media.mimetype
        }
    };
}

// Inisialisasi WhatsApp Client (Dioptimalkan untuk hemat RAM < 200MB di Cloud Free Tier)
const puppeteerOptions = {
    headless: true,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-component-update',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-dev-tools',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-speech-api',
        '--disable-sync',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings'
    ]
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: puppeteerOptions
});

client.on('qr', (qr) => {
    console.log('\n📱 Scan QR Code berikut menggunakan aplikasi WhatsApp Anda:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    const botMode = (process.env.BOT_MODE || 'all').toLowerCase();
    const rawAllowed = process.env.ALLOWED_CHATS || '';
    const allowedList = rawAllowed.split(',').map(s => s.trim()).filter(Boolean);

    console.log('----------------------------------------------------');
    console.log('🤖 Bot WhatsApp Gemini Siap Beroperasi!');
    console.log(`📌 Model Utama : ${modelName}`);
    console.log(`🛡️ Mode Filter : ${botMode}`);
    if (allowedList.length > 0) {
        console.log(`📋 Whitelist    : ${allowedList.join(', ')}`);
    }
    console.log('----------------------------------------------------');
});

client.on('message', async (msg) => {
    // Abaikan pesan dari status broadcast
    if (msg.from === 'status@broadcast') return;

    const chatId = msg.from;
    const isGroup = chatId.endsWith('@g.us');
    const senderId = msg.author || msg.from;
    const prefix = '!gemini';
    let body = (msg.body || '').trim();

    // Perintah !id untuk mengetahui ID Chat/Grup/Nomor (Bisa diakses siapa saja untuk setup whitelist)
    if (body.toLowerCase() === '!id' || body.toLowerCase() === '!myid') {
        const idInfo = 
`📱 *Informasi ID WhatsApp*
- *Chat/Group ID:* \`${chatId}\`
- *Sender ID:* \`${senderId}\`
- *Tipe Chat:* ${isGroup ? 'Grup' : 'Pribadi'}

_Gunakan Chat ID di atas pada \`ALLOWED_CHATS\` di file \`.env\` jika ingin menggunakan fitur whitelist._`;
        await msg.reply(idInfo);
        return;
    }

    // --- LOGIKA FILTER MODE & WHITELIST ---
    const botMode = (process.env.BOT_MODE || 'all').toLowerCase();
    const rawAllowed = process.env.ALLOWED_CHATS || '';
    const allowedChats = rawAllowed.split(',').map(s => s.trim()).filter(Boolean);

    // 1. Cek Mode Filter
    if (botMode === 'groups_only' && !isGroup) return;
    if (botMode === 'private_only' && isGroup) return;

    // 2. Cek Whitelist (jika Mode whitelist_only atau jika ALLOWED_CHATS terisi)
    if (botMode === 'whitelist_only' || allowedChats.length > 0) {
        const isAllowed = allowedChats.some(id => 
            chatId.includes(id) || senderId.includes(id)
        );
        if (!isAllowed) {
            // Abaikan pesan dari chat/grup yang tidak masuk whitelist
            return;
        }
    }

    // Handling Perintah Khusus (!help, !menu, !reset, !clear, !role, !model)
    if (body.toLowerCase() === '!help' || body.toLowerCase() === '!menu') {
        const helpText = 
`🤖 *Fitur & Perintah WhatsApp Bot Gemini*

1️⃣ *Tanya Jawab Teks*
- *Private Chat:* Kirim pertanyaan langsung atau sertakan \`!gemini <pertanyaan>\`.
- *Grup:* Gunakan prefix \`!gemini <pertanyaan>\`.
  _Contoh:_ \`!gemini Buatkan resep nasi goreng simpel\`

2️⃣ *Analisis Gambar & Media (Multimodal)*
- Kirim foto/gambar/suara dengan caption \`!gemini <pertanyaan>\`.
- Atau reply pesan media/foto yang sudah ada dengan perintah \`!gemini <pertanyaan>\`.

3️⃣ *Manajemen Riwayat & Peran (Memory)*
- \`!reset\` / \`!clear\` : Menghapus ingatan/riwayat percakapan sesi ini.
- \`!role <deskripsi>\` : Mengubah kepribadian bot untuk chat ini.
  _Contoh:_ \`!role Kamu adalah guru matematika yang ramah\`
- \`!role reset\` : Mengembalikan kepribadian default bot.
- \`!model\` : Menampilkan model AI yang aktif.
- \`!id\` : Menampilkan ID WhatsApp chat/grup ini (untuk whitelist).`;
        await msg.reply(helpText);
        return;
    }

    if (body.toLowerCase() === '!reset' || body.toLowerCase() === '!clear') {
        userSessions.delete(chatId);
        await msg.reply('🔄 *Riwayat percakapan telah dihapus.* Kita mulai sesi baru dari awal!');
        return;
    }

    if (body.toLowerCase() === '!model') {
        await msg.reply(`🤖 Model Gemini yang saat ini aktif: *${modelName}*`);
        return;
    }

    if (body.toLowerCase().startsWith('!role')) {
        const rolePrompt = body.slice(5).trim();
        if (!rolePrompt) {
            const currentSession = userSessions.get(chatId);
            const activeRole = currentSession?.customRole || defaultSystemInstruction;
            await msg.reply(`🎭 *Peran Bot saat ini:*\n"${activeRole}"\n\nGunakan \`!role <deskripsi_peran>\` untuk mengubah atau \`!role reset\` untuk mengembalikan ke default.`);
            return;
        }

        if (rolePrompt.toLowerCase() === 'reset') {
            userSessions.delete(chatId);
            await msg.reply('🎭 Peran bot telah dikembalikan ke pengaturan default.');
            return;
        }

        // Set role baru & reset sesi dengan instruksi baru
        getOrCreateSession(chatId, rolePrompt);
        await msg.reply(`🎭 *Peran bot berhasil diperbarui!*\nBot sekarang berperan sebagai: "${rolePrompt}"`);
        return;
    }

    // Filter pesan untuk grup & private chat
    let prompt = body;
    if (isGroup) {
        if (!prompt.startsWith(prefix)) return;
        prompt = prompt.slice(prefix.length).trim();
    } else {
        if (prompt.startsWith(prefix)) {
            prompt = prompt.slice(prefix.length).trim();
        }
    }

    // Cek media (baik dikirim langsung maupun pesan yang di-reply)
    const allowedMediaTypes = ['image', 'audio', 'ptt', 'video', 'document', 'sticker'];
    let media = null;

    if (msg.hasMedia && allowedMediaTypes.includes(msg.type)) {
        try {
            media = await msg.downloadMedia();
        } catch (err) {
            // Log ringkas tanpa stack trace berlebih jika media gagal diunduh
            console.log(`ℹ️ Informasi: Media tipe '${msg.type}' tidak dapat diunduh.`);
        }
    } else if (msg.hasQuotedMsg) {
        try {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg && quotedMsg.hasMedia && allowedMediaTypes.includes(quotedMsg.type)) {
                media = await quotedMsg.downloadMedia();
            }
        } catch (err) {
            // Abaikan jika media quoted gagal diunduh
        }
    }

    // Jika tidak ada prompt & tidak ada media, abaikan atau beri info
    if (!prompt && !media) {
        if (isGroup || body.startsWith(prefix)) {
            await msg.reply('Silakan sertakan pertanyaan atau lampirkan foto/gambar/media.\nContoh: `!gemini Jelaskan foto ini`');
        }
        return;
    }

    // Tampilkan indikator "sedang mengetik..." di WhatsApp secara aman
    try {
        const chat = await msg.getChat();
        if (chat && typeof chat.sendStateTyping === 'function') {
            await chat.sendStateTyping();
        }
    } catch (err) {
        // Abaikan jika getChat / sendStateTyping gagal (opsional)
    }

    try {
        console.log(`💬 Memproses pesan dari ${msg.from} [Media: ${Boolean(media)}] : "${prompt || '(Hanya media)'}"`);

        // Dapatkan/buat sesi percakapan
        let sessionData = userSessions.get(chatId);
        if (!sessionData) {
            sessionData = getOrCreateSession(chatId);
        }

        let responseText = '';

        if (media) {
            // Jika ada media (multimodal), gunakan model.generateContent dengan media part
            const generativePart = mediaToGenerativePart(media);
            const contents = [prompt || 'Jelaskan atau analisis media ini secara detail.', generativePart];
            
            const result = await sessionData.model.generateContent(contents);
            responseText = result.response.text();

            // Catat percakapan teks ke riwayat jika ada prompt
            if (prompt) {
                try {
                    // Menyimpan interaksi ke sesi chat
                    await sessionData.chatSession.sendMessage(`[Pengguna mengirimkan file media jenis ${media.mimetype}]: ${prompt}`);
                } catch (e) {
                    // Abaikan jika pencatatan riwayat media error
                }
            }
        } else {
            // Percakapan teks berlanjut menggunakan sesi chat (Memory)
            const result = await sessionData.chatSession.sendMessage(prompt);
            responseText = result.response.text();
        }

        await msg.reply(responseText);
    } catch (error) {
        console.error('❌ Error Gemini API:', error);
        await msg.reply('⚠️ Maaf, terjadi kesalahan saat memproses permintaan Anda dengan Gemini AI.\n' + (error.message ? `_Detail: ${error.message}_` : ''));
    }
});

// Jalankan client WhatsApp
client.initialize();
