import { default as makeWASocket, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'fs';
import P from "pino";
import { keepAlive } from './keep_alive.js';

// Start the keep-alive server
keepAlive();

const forceLog = (...args) => {
    process.stdout.write(args.join(' ') + '\n');
}

forceLog('Bot starting...\n');

let isTyping = false; // Track whether the user is typing

async function connectToWhatsApp() {
    try {
        // Check if the auth directory exists, otherwise create it
        if (!fs.existsSync('./auth')) {
            fs.mkdirSync('./auth');
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth');

        // Create WhatsApp socket instance
        const sock = makeWASocket.default({
            auth: state,
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            browser: ['Whatsapp Bot', 'Desktop', '1.0.0'],
            reconnectAttempts: Infinity,
            connectTimeoutMs: 60000,
            qrTimeout: 60000,
        });

        // Handle connection status updates
        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    await connectToWhatsApp();
                }
            } else if (connection === 'open') {
                forceLog('Connected to WhatsApp!\n');
            }
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);

        // Monitor presence to check if you're typing
        sock.ev.on('presence.update', (presence) => {
            if (presence.key.remoteJid === '9103835046@s.whatsapp.net') {
                // If your presence status is typing, set isTyping to true
                if (presence.type === 'composing' || presence.type === 'recording') {
                    isTyping = true;
                } else {
                    isTyping = false;
                }
            }
        });

        // Handle incoming messages
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

            // Only send auto-reply if you're not typing
            if (isTyping) {
                console.log('Bot detected that you are typing, no auto-reply sent');
                return; // Don't send auto-reply if you're typing
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
