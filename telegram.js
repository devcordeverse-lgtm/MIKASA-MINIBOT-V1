/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ telegram.js — Telegram control panel
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

import { Telegraf, Markup } from 'telegraf';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSession,
  deleteSession,
  getAllSessions,
  loadExistingSessions,
} from './whatsapp.js';
import {
  BOT_NAME,
  BOT_VERSION,
  DEV_NAME,
  PREFIX,
  TOTAL_CMDS,
  NEWSLETTER_JID,
  OWNER_WA,
  OWNER_TG,
  OWNER_GITHUB,
  REPO_URL,
  WA_CHANNELS,
  WA_GROUPS,
} from './commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS  (same look as commands.js: 𝗯𝗼𝗹𝗱 titles + ┏━〔 〕━┓ boxes)
// ─────────────────────────────────────────────────────────────────────────────
function bold(s) {
  return [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90)  return String.fromCodePoint(0x1D5D4 + (c - 65));
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D5EE + (c - 97));
    if (c >= 48 && c <= 57)  return String.fromCodePoint(0x1D7EC + (c - 48));
    return ch;
  }).join('');
}
const BAR = '━━━━━━━━━━━━━━━━━━';
function card(title, lines, round = false) {
  const [tl, tr, bl, br] = round ? ['╭', '╮', '╰', '╯'] : ['┏', '┓', '┗', '┛'];
  return `${tl}━━━〔 ${bold(title)} 〕━━━${tr}\n┃\n${lines.map((l) => `┃ ${l}`).join('\n')}\n┃\n${bl}${BAR}${br}`;
}
const row = (k, v) => `▹ ${bold(k)} ⌁ ${v}`;
const FOOT = `\n\n> ${BOT_NAME} • ${DEV_NAME}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (s) => `<code>${esc(s)}</code>`;
const HTML = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };

function fmtUptime(sec) {
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ${Math.floor(sec % 60)}s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function getAdmins() {
  if (!fs.existsSync(ADMINS_FILE)) {
    const defaults = process.env.TELEGRAM_ADMIN_CHAT_ID
      ? [String(process.env.TELEGRAM_ADMIN_CHAT_ID)]
      : [];
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return readJson(ADMINS_FILE, []);
}

function isAdmin(ctx) {
  return getAdmins().includes(String(ctx.from?.id));
}

function trackUser(id) {
  if (!id) return;
  const users = readJson(USERS_FILE, []);
  const sid = String(id);
  if (!users.includes(sid)) {
    users.push(sid);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }
}

function parsePhone(text) {
  const raw = text.trim().split(/\s+/)[1];
  return raw ? raw.replace(/\D/g, '') : '';
}

function sessionsList(withNumbers = true) {
  const sessions = getAllSessions();
  const list = sessions.map((s, i) =>
    withNumbers
      ? `▹ ${i + 1}. +${s.number} — ${s.connected ? '🟢 Connected' : '🔴 Disconnected'}`
      : `▹ ${i + 1}. +${s.number}`);
  return { sessions, list };
}

const botStartTime = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// BOT STARTUP
// ─────────────────────────────────────────────────────────────────────────────
export async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is missing (set it in your environment / .env).');
    process.exit(1);
  }

  const bot = new Telegraf(token, { handlerTimeout: 90_000 });

  // every command: track the user, then run
  const guard = (fn) => async (ctx) => {
    trackUser(ctx.from?.id);
    return fn(ctx);
  };

  // ── Inline buttons ──────────────────────────────────────────────────────────
  bot.action('how_connect', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      card('CONNECT WHATSAPP', [
        '1️⃣ Send  /pair YOUR_NUMBER',
        '     Example: /pair 18295802916',
        '2️⃣ Receive your 8-character code',
        '3️⃣ WhatsApp → Settings → Linked Devices',
        '     Link a Device → Use phone number',
        '4️⃣ Enter the code ✅',
        '',
        '⚠️ The code expires in 2 minutes',
      ], true) + FOOT
    ).catch(() => {});
  });

  bot.action('show_status', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const { sessions, list } = sessionsList();
    if (!sessions.length) {
      return ctx.reply(card('STATUS', ['No active WhatsApp sessions.', 'Use /pair to connect one.']) + FOOT).catch(() => {});
    }
    await ctx.reply(card('SESSIONS', [row('TOTAL', sessions.length), '', ...list]) + FOOT).catch(() => {});
  });

  // ── /start ──────────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    trackUser(ctx.from.id);
    const name = ctx.from.first_name || ctx.from.username || 'User';
    await ctx.reply(
      card(`${BOT_NAME} ${BOT_VERSION}`, [
        `👋 Hello ${name}!`,
        'Link your WhatsApp with a pairing code — no QR scan.',
        '',
        row('/pair', '5094xxxxxxxx'),
        row('/delpair', '5094xxxxxxxx'),
        row('/status', 'active sessions'),
        row('/listpair', 'paired numbers'),
        row('/runtime', 'uptime'),
        row('/owner', 'contact & links'),
        row('/help', 'full help'),
        '',
        row('COMMANDS', `${TOTAL_CMDS} on WhatsApp`),
        row('DEV', DEV_NAME),
      ], true) + FOOT,
      Markup.inlineKeyboard([
        [Markup.button.callback('📱 How to connect?', 'how_connect')],
        [Markup.button.callback('📊 View sessions', 'show_status')],
      ])
    );
  });

  // ── /help ───────────────────────────────────────────────────────────────────
  bot.command('help', guard(async (ctx) => {
    await ctx.reply(
      card('HELP', [
        bold('TELEGRAM'),
        '▹ /pair <number> — start a WA session',
        '▹ /delpair <number> — remove a session',
        '▹ /status — active sessions',
        '▹ /listpair — paired numbers (admin)',
        '▹ /runtime — bot uptime',
        '▹ /owner — contact & links',
        '▹ /broadcast <msg> — send to all (admin)',
        '',
        bold('WHATSAPP'),
        `▹ prefix: ${PREFIX}  (also / ! # , +)`,
        `▹ ${PREFIX}menu — all ${TOTAL_CMDS} commands`,
        `▹ ${PREFIX}ping · ${PREFIX}alive · ${PREFIX}runtime · ${PREFIX}info`,
        `▹ ${PREFIX}play · ${PREFIX}video · ${PREFIX}tiktok · ${PREFIX}instagram`,
        `▹ ${PREFIX}ai · ${PREFIX}weather · ${PREFIX}crypto · ${PREFIX}calc`,
      ]) + FOOT
    );
  }));

  // ── /pair ───────────────────────────────────────────────────────────────────
  bot.command('pair', guard(async (ctx) => {
    const phone = parsePhone(ctx.message.text);
    if (!phone) {
      return ctx.reply(card('PAIR', [
        '📌 Usage: /pair 1829xxxxxxx',
        '▹ International format, no +, no leading 0',
        '▹ You will get an 8-character code',
        '▹ WhatsApp → Linked Devices → Link a device',
        '▹ Use phone number → enter the code',
      ]) + FOOT);
    }
    if (phone.length < 7 || phone.length > 15 || phone.startsWith('0')) {
      return ctx.reply('❌ Invalid number. Use international format, no + and no leading 0.');
    }

    await ctx.reply(`⏳ Generating pairing code for +${phone}…`);

    try {
      const { code: pairCode } = await createSession(phone);
      if (pairCode) {
        await ctx.reply(
          card('PAIRING CODE', [
            row('NUMBER', `+${phone}`),
            row('CODE', code(pairCode)),
            row('EXPIRES', '2 minutes'),
            '',
            'WhatsApp → Settings → Linked Devices',
            'Link a Device → Use phone number',
            `Enter: ${esc(pairCode)}`,
          ], true) + esc(FOOT),
          HTML
        );
      } else {
        await ctx.reply(`✅ +${phone} is already connected to ${BOT_NAME}!`);
      }
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  }));

  // ── /delpair ────────────────────────────────────────────────────────────────
  bot.command('delpair', guard(async (ctx) => {
    const phone = parsePhone(ctx.message.text);
    if (!phone) return ctx.reply('❌ Usage: /delpair 18295802916');
    try {
      const ok = deleteSession(phone);
      await ctx.reply(ok ? `✅ Session +${phone} disconnected.` : `⚠️ No session found for +${phone}.`);
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  }));

  // ── /status ─────────────────────────────────────────────────────────────────
  bot.command('status', guard(async (ctx) => {
    const { sessions, list } = sessionsList();
    if (!sessions.length) {
      return ctx.reply(card('STATUS', [`No active sessions on ${BOT_NAME}.`, 'Use /pair to link a number.']) + FOOT);
    }
    await ctx.reply(
      card('SESSIONS', [row('TOTAL', sessions.length), '', ...list]) + FOOT,
      Markup.inlineKeyboard([[Markup.button.callback('🔄 Refresh', 'show_status')]])
    );
  }));

  // ── /listpair ───────────────────────────────────────────────────────────────
  bot.command('listpair', guard(async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only.');
    const { sessions, list } = sessionsList(false);
    if (!sessions.length) return ctx.reply('ℹ️ No paired numbers yet.');
    await ctx.reply(card('PAIRED NUMBERS', [row('TOTAL', sessions.length), '', ...list]) + FOOT);
  }));

  // ── /runtime ────────────────────────────────────────────────────────────────
  bot.command('runtime', guard(async (ctx) => {
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const usedGB = ((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2);
    const totGB = (os.totalmem() / 1024 ** 3).toFixed(2);
    await ctx.reply(
      card('RUNTIME', [
        row('BOT', `${BOT_NAME} ${BOT_VERSION}`),
        row('UPTIME', fmtUptime((Date.now() - botStartTime) / 1000)),
        row('MEMORY', `${mem} MB`),
        row('RAM', `${usedGB} / ${totGB} GB`),
        row('WA SESSIONS', getAllSessions().length),
      ], true) + FOOT
    );
  }));

  // ── /owner ──────────────────────────────────────────────────────────────────
  bot.command(['owner', 'support'], guard(async (ctx) => {
    const lines = [row('DEV', DEV_NAME), row('WHATSAPP', OWNER_WA)];
    if (OWNER_TG) lines.push(row('TELEGRAM', OWNER_TG));
    WA_CHANNELS.forEach((l, i) => lines.push(row(`CHANNEL ${i + 1}`, l)));
    WA_GROUPS.forEach((l, i) => lines.push(row(`GROUP ${i + 1}`, l)));
    lines.push(row('GITHUB', OWNER_GITHUB), row('REPO', REPO_URL), row('NEWSLETTER', NEWSLETTER_JID));
    await ctx.reply(card('OWNER', lines) + FOOT, { link_preview_options: { is_disabled: true } });
  }));

  // ── /broadcast ──────────────────────────────────────────────────────────────
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('❌ Admin only.');
    const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!text) return ctx.reply('Usage: /broadcast [message]');

    const users = readJson(USERS_FILE, []);
    let ok = 0, fail = 0;
    for (const uid of users) {
      try {
        await bot.telegram.sendMessage(uid, card('BROADCAST', [text]) + FOOT);
        ok++;
      } catch { fail++; }
    }
    await ctx.reply(card('BROADCAST DONE', [row('SENT', `🟢 ${ok}`), row('FAILED', `🔴 ${fail}`)]) + FOOT);
  });

  // ── Catch-all text ──────────────────────────────────────────────────────────
  bot.on('message', async (ctx) => {
    if (ctx.message?.text && !ctx.message.text.startsWith('/')) {
      await ctx.reply(`🤔 I didn't quite get that.\nType /help to see everything I can do.${FOOT}`);
    }
  });

  bot.catch((err) => {
    console.error('Telegraf error:', err.message);
  });

  // ── Load existing sessions then launch ──────────────────────────────────────
  console.log('📂 Loading existing WhatsApp sessions...');
  await loadExistingSessions();

  await bot.launch();

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  console.log('');
  console.log(`✅ ${BOT_NAME} ${BOT_VERSION} started successfully!`);
  console.log('🤖 Telegram bot active — waiting for commands...');
  console.log(`> Dev: ${DEV_NAME}`);
  console.log('━'.repeat(40));
}
