import { default as makeWASocket, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { useMultiFileAuthState } from '@whiskeysockets/baileys'
import fs from 'fs'
import P from "pino"
import { keepAlive } from './keep_alive.js'

// Start the keep-alive server
keepAlive();


const forceLog = (...args) => {
    process.stdout.write(args.join(' ') + '\n');
}

forceLog('Bot starting...\n');

async function connectToWhatsApp() {
    try {
        if (!fs.existsSync('./auth')) {
            fs.mkdirSync('./auth');
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth');

        const sock = makeWASocket.default({
            auth: state,
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            browser: ['Whatsapp Bot', 'Desktop', '1.0.0'],
            reconnectAttempts: Infinity,
            connectTimeoutMs: 60000,
            qrTimeout: 60000,
        });

        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if(connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if(shouldReconnect) {
                    await connectToWhatsApp();
                }
            } else if(connection === 'open') {
                forceLog('Connected to WhatsApp!\n');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            console.log('Received message:', type);
            const msg = messages[0];
            if (!msg || !msg.message || msg.key.fromMe) return;

            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            console.log('Message content:', text);

            // Check if the message is from a group (group IDs contain @g.us)
            const isGroup = msg.key.remoteJid.endsWith('@g.us');
            if (isGroup) {
                console.log('Skipping group message');
                return; // Skip auto-reply for group messages
            }

            try {
                const autoReplyMessage = `Hey! 😊 Thanks for dropping a message. I'm currently not available, but your text has been safely saved in the inbox vault 📥. I'll get back to you as soon as I can — promise! 🤝 Until then, take care and talk soon! 🌸`;
                console.log('Sending auto-reply to:', msg.key.remoteJid);
                await sock.sendMessage(msg.key.remoteJid, { text: autoReplyMessage });
                console.log('Auto-reply sent successfully');
            } catch (error) {
                console.error('Error sending message:', error);
            }
        });

    } catch (err) {
        console.error('Connection error: ', err);
        forceLog('Attempting to reconnect in 5 seconds...\n');
        setTimeout(connectToWhatsApp, 5000);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    forceLog('Shutting down...\n');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    forceLog('Attempting to recover...\n');
});

connectToWhatsApp();