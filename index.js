import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

// Penanganan global error
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message || err);
});

process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection:', reason?.message || reason);
});

// Server HTTP ringan untuk Health Check Port Binding (Dibutuhkan oleh Render / Koyeb)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>🤖 Bot WhatsApp Gemini (Baileys Engine) Siap Beroperasi!</h1><p>Status: Aktif & Running 24/7 (Sangat Hemat RAM ~30MB)</p>');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health-check HTTP server mendengarkan di 0.0.0.0:${PORT}`);
});

// Validasi API Key Gemini
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

// Sesi percakapan & persona per chat ID (Memory)
const userSessions = new Map();

function getOrCreateSession(chatId, customInstruction = null) {
    const instruction = customInstruction || defaultSystemInstruction;
    
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: instruction
    });

    const chatSession = model.startChat({ history: [] });
    const sessionData = { chatSession, customRole: customInstruction, model };

    userSessions.set(chatId, sessionData);
    return sessionData;
}

// Ekstraksi teks dari pesan Baileys (Mendukung pesan grup, ephemeral & viewOnce)
function getMessageText(msg) {
    let message = msg?.message;
    if (!message) return '';

    // Buka wrapper pesan grup (ephemeral, viewOnce, dll)
    if (message.ephemeralMessage) message = message.ephemeralMessage.message;
    if (message.viewOnceMessage) message = message.viewOnceMessage.message;
    if (message.viewOnceMessageV2) message = message.viewOnceMessageV2.message;
    if (message.documentWithCaptionMessage) message = message.documentWithCaptionMessage.message;

    return message?.conversation ||
        message?.extendedTextMessage?.text ||
        message?.imageMessage?.caption ||
        message?.videoMessage?.caption ||
        message?.documentMessage?.caption || '';
}

// Deteksi MIME type media (Mendukung wrapper grup)
function getMediaMimeType(msg) {
    let m = msg?.message;
    if (!m) return null;

    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;

    return m?.imageMessage?.mimetype ||
        m?.audioMessage?.mimetype ||
        m?.videoMessage?.mimetype ||
        m?.documentMessage?.mimetype ||
        m?.stickerMessage?.mimetype || null;
}

process.on('SIGTERM', () => {
    console.log('🛑 Menerima sinyal SIGTERM, menutup aplikasi secara halus...');
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    console.log('🛑 Menerima sinyal SIGINT, menutup aplikasi...');
    server.close(() => process.exit(0));
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');
    
    let version = [2, 3000, 1015901307];
    try {
        const v = await fetchLatestBaileysVersion();
        if (v && v.version) version = v.version;
    } catch (err) {
        console.log('Menggunakan versi Baileys fallback:', version);
    }

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Gemini WA Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 Scan QR Code berikut menggunakan aplikasi WhatsApp Anda:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            const botMode = (process.env.BOT_MODE || 'all').toLowerCase();
            const rawAllowed = process.env.ALLOWED_CHATS || '';
            const allowedList = rawAllowed.split(',').map(s => s.trim()).filter(Boolean);

            console.log('----------------------------------------------------');
            console.log('🤖 Bot WhatsApp Gemini (Baileys Engine) Siap Beroperasi!');
            console.log(`📌 Model Utama : ${modelName}`);
            console.log(`🛡️ Mode Filter : ${botMode}`);
            console.log(`⚡ RAM Usage   : ~30MB (Sangat Hemat & Stabil)`);
            if (allowedList.length > 0) {
                console.log(`📋 Whitelist    : ${allowedList.join(', ')}`);
            }
            console.log('----------------------------------------------------');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('🔄 Koneksi terputus, mencoba menghubungkan kembali:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (msg.key.fromMe) continue; // Abaikan pesan dari diri sendiri

            const chatId = msg.key.remoteJid;
            if (!chatId || chatId === 'status@broadcast') continue;

            const isGroup = chatId.endsWith('@g.us');
            const senderId = msg.key.participant || chatId;
            const prefix = '!gemini';
            let body = getMessageText(msg).trim();

            // Perintah !id / !myid
            if (body.toLowerCase() === '!id' || body.toLowerCase() === '!myid') {
                const idInfo = 
`📱 *Informasi ID WhatsApp*
- *Chat/Group ID:* \`${chatId}\`
- *Sender ID:* \`${senderId}\`
- *Tipe Chat:* ${isGroup ? 'Grup' : 'Pribadi'}

_Gunakan Chat ID di atas pada \`ALLOWED_CHATS\` di file \`.env\` jika ingin menggunakan fitur whitelist._`;
                await sock.sendMessage(chatId, { text: idInfo }, { quoted: msg });
                continue;
            }

            // Logika Filter Mode & Whitelist
            const botMode = (process.env.BOT_MODE || 'all').toLowerCase();
            const rawAllowed = process.env.ALLOWED_CHATS || '';
            const allowedChats = rawAllowed.split(',').map(s => s.trim()).filter(Boolean);

            if (botMode === 'groups_only' && !isGroup) continue;
            if (botMode === 'private_only' && isGroup) continue;

            if (botMode === 'whitelist_only' || allowedChats.length > 0) {
                const isAllowed = allowedChats.some(id => 
                    chatId.includes(id) || senderId.includes(id)
                );
                if (!isAllowed) continue;
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
                await sock.sendMessage(chatId, { text: helpText }, { quoted: msg });
                continue;
            }

            if (body.toLowerCase() === '!reset' || body.toLowerCase() === '!clear') {
                userSessions.delete(chatId);
                await sock.sendMessage(chatId, { text: '🔄 *Riwayat percakapan telah dihapus.* Kita mulai sesi baru dari awal!' }, { quoted: msg });
                continue;
            }

            if (body.toLowerCase() === '!model') {
                await sock.sendMessage(chatId, { text: `🤖 Model Gemini yang saat ini aktif: *${modelName}*` }, { quoted: msg });
                continue;
            }

            if (body.toLowerCase().startsWith('!role')) {
                const rolePrompt = body.slice(5).trim();
                if (!rolePrompt) {
                    const currentSession = userSessions.get(chatId);
                    const activeRole = currentSession?.customRole || defaultSystemInstruction;
                    await sock.sendMessage(chatId, { text: `🎭 *Peran Bot saat ini:*\n"${activeRole}"\n\nGunakan \`!role <deskripsi_peran>\` untuk mengubah atau \`!role reset\` untuk mengembalikan ke default.` }, { quoted: msg });
                    continue;
                }

                if (rolePrompt.toLowerCase() === 'reset') {
                    userSessions.delete(chatId);
                    await sock.sendMessage(chatId, { text: '🎭 Peran bot telah dikembalikan ke pengaturan default.' }, { quoted: msg });
                    continue;
                }

                getOrCreateSession(chatId, rolePrompt);
                await sock.sendMessage(chatId, { text: `🎭 *Peran bot berhasil diperbarui!*\nBot sekarang berperan sebagai: "${rolePrompt}"` }, { quoted: msg });
                continue;
            }

            // Filter pesan grup & private
            let prompt = body;
            if (isGroup) {
                if (!prompt.startsWith(prefix)) continue;
                prompt = prompt.slice(prefix.length).trim();
            } else {
                if (prompt.startsWith(prefix)) {
                    prompt = prompt.slice(prefix.length).trim();
                }
            }

            // Cek Media (Pesan langsung atau quoted message)
            let mediaBuffer = null;
            let mimeType = getMediaMimeType(msg);

            const hasDirectMedia = Boolean(mimeType);
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedMimeType = quotedMsg ? (
                quotedMsg.imageMessage?.mimetype ||
                quotedMsg.audioMessage?.mimetype ||
                quotedMsg.videoMessage?.mimetype ||
                quotedMsg.documentMessage?.mimetype ||
                quotedMsg.stickerMessage?.mimetype || null
            ) : null;

            if (hasDirectMedia) {
                try {
                    mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
                } catch (err) {
                    console.log('Gagal mengunduh media langsung:', err.message);
                }
            } else if (quotedMsg && quotedMimeType) {
                try {
                    mediaBuffer = await downloadMediaMessage({ message: quotedMsg, key: msg.key }, 'buffer', {});
                    mimeType = quotedMimeType;
                } catch (err) {
                    console.log('Gagal mengunduh media dari quoted message:', err.message);
                }
            }

            if (!prompt && !mediaBuffer) {
                if (isGroup || body.startsWith(prefix)) {
                    await sock.sendMessage(chatId, { text: 'Silakan sertakan pertanyaan atau lampirkan foto/gambar/media.\nContoh: `!gemini Jelaskan foto ini`' }, { quoted: msg });
                }
                continue;
            }

            // Indikator "sedang mengetik..."
            try {
                await sock.sendPresenceUpdate('composing', chatId);
            } catch (err) {}

            try {
                console.log(`💬 Memproses pesan dari ${chatId} [Media: ${Boolean(mediaBuffer)}] : "${prompt || '(Hanya media)'}"`);

                let sessionData = userSessions.get(chatId);
                if (!sessionData) {
                    sessionData = getOrCreateSession(chatId);
                }

                let responseText = '';

                if (mediaBuffer && mimeType) {
                    const generativePart = {
                        inlineData: {
                            data: mediaBuffer.toString('base64'),
                            mimeType: mimeType
                        }
                    };
                    const contents = [prompt || 'Jelaskan atau analisis media ini secara detail.', generativePart];
                    const result = await sessionData.model.generateContent(contents);
                    responseText = result.response.text();
                } else {
                    const result = await sessionData.chatSession.sendMessage(prompt);
                    responseText = result.response.text();
                }

                await sock.sendMessage(chatId, { text: responseText }, { quoted: msg });
            } catch (error) {
                console.error('❌ Error Gemini API:', error);
                await sock.sendMessage(chatId, { text: '⚠️ Maaf, terjadi kesalahan saat memproses permintaan Anda dengan Gemini AI.\n' + (error.message ? `_Detail: ${error.message}_` : '') }, { quoted: msg });
            }
        }
    });
}

startBot();
