/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ index.js — entry point
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

import 'dotenv/config';
import { startTelegramBot } from './telegram.js';
import { startServer } from './server.js';
import { BOT_NAME, BOT_VERSION, DEV_NAME } from './commands.js';

// ── GLOBAL CRASH GUARDS ─────────────────────────────────────────────────────
// Baileys sometimes writes creds AFTER we delete the session folder, which
// throws an async ENOENT and kills the whole process. Swallow these so the
// bot stays online instead of crashing the container.
process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err);
  if (/ENOENT|creds\.json|pre-?key|no such file/i.test(msg)) {
    console.log(`⚠️ Ignored non-fatal: ${msg}`);
    return;
  }
  console.error('❗ uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  const msg = String(reason?.message || reason);
  if (/ENOENT|creds\.json|pre-?key|no such file|Connection Closed|Stream Errored/i.test(msg)) {
    console.log(`⚠️ Ignored non-fatal rejection: ${msg}`);
    return;
  }
  console.error('❗ unhandledRejection:', reason);
});

console.log('');
console.log('╭━━━〔 𝗠𝗜𝗞𝗔𝗦𝗔-𝗠𝗜𝗡𝗜𝗕𝗢𝗧 〕━━━╮');
console.log(`   🚀 ${BOT_NAME} ${BOT_VERSION}`);
console.log('   WhatsApp Bot via Telegram');
console.log('   Connection by Pairing Code');
console.log(`   ⚡ Powered by ${DEV_NAME}`);
console.log('╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯');
console.log('');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN missing from .env file.');
  console.error('   Copy .env.example → .env and fill in your token.');
  process.exit(1);
}

startServer();
startTelegramBot().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
