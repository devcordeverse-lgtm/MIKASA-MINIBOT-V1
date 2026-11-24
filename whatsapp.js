/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ whatsapp.js — sessions, pairing & QR login
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import {
  handleCommand,
  handleGroupWelcome,
  WA_CHANNELS,
  WA_GROUPS,
  PREFIX,
  BOT_NAME,
  BOT_VERSION,
  DEV_NAME,
  MENU_IMAGE,
  NEWSLETTER_JID,
  NEWSLETTER_NAME,
  TOTAL_CMDS,
  forwardedContext,
  invalidateGroupCache,
} from './commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const PROFILE_PIC_PATH = path.join(__dirname, 'assets', 'profile.jpg');

const activeSessions = new Map();
const reconnectAttempts = new Map();
// Numbers whose socket we closed ourselves (e.g. watchdog forcing a refresh).
// When present, the close handler must NOT treat the disconnect as a fatal
// "corrupted session" — it's expected, and the creds are still fine.
const intentionalEnds = new Set();
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

// Deduplication cache
const processedMsgIds = new Set();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(SESSIONS_DIR);
ensureDir(path.join(__dirname, 'assets'));

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS  (same look as commands.js: 𝗯𝗼𝗹𝗱 titles + ╭〔 〕╮ boxes)
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
// card('TITLE', ['line', ...], round?)  round=true → ╭╮╰╯ box, else ┏┓┗┛ box
function card(title, lines, round = false) {
  const [tl, tr, bl, br] = round ? ['╭', '╮', '╰', '╯'] : ['┏', '┓', '┗', '┛'];
  return `${tl}━━━〔 ${bold(title)} 〕━━━${tr}\n┃\n${lines.map((l) => `┃ ${l}`).join('\n')}\n┃\n${bl}${BAR}${br}`;
}
const row = (k, v) => `▹ ${bold(k)} ⌁ ${v}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// BOT PROFILE  (name + picture, uses MENU_IMAGE)
// ─────────────────────────────────────────────────────────────────────────────
// MENU_IMAGE is a local file path (menu.jpg next to commands.js) — read it from disk.
function readMenuImage() {
  try { return fs.readFileSync(MENU_IMAGE); } catch { return null; }
}

async function getProfilePicBuffer() {
  // 1) custom picture: assets/profile.jpg
  if (fs.existsSync(PROFILE_PIC_PATH)) {
    try { return fs.readFileSync(PROFILE_PIC_PATH); } catch {}
  }
  // 2) menu.jpg (local file)
  const local = readMenuImage();
  if (local) return local;
  // 3) MENU_IMAGE as a remote URL (cached to assets/profile.jpg)
  if (/^https?:\/\//i.test(String(MENU_IMAGE))) {
    try {
      const res = await axios.get(MENU_IMAGE, { responseType: 'arraybuffer', timeout: 15000 });
      const buf = Buffer.from(res.data);
      fs.writeFileSync(PROFILE_PIC_PATH, buf);
      return buf;
    } catch {}
  }
  return null;
}

async function setupBotProfile(natsu) {
  try {
    await natsu.updateProfileName(BOT_NAME);
    console.log(`✅ Profile name set: ${BOT_NAME}`);
  } catch (err) {
    console.log(`⚠️ Could not set profile name: ${err.message}`);
  }
  try {
    const imgBuf = await getProfilePicBuffer();
    if (imgBuf) {
      await natsu.updateProfilePicture(natsu.user.id, imgBuf);
      console.log('✅ Profile picture updated.');
    }
  } catch (err) {
    console.log(`⚠️ Could not set profile picture: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME MESSAGE  (image + forwarded-from-channel context)
// ─────────────────────────────────────────────────────────────────────────────
async function sendWelcomeMessage(natsu, phoneNumber) {
  const selfJid = `${phoneNumber}@s.whatsapp.net`;
  const caption = card('ONLINE', [
    `🟢 ${BOT_NAME} ${BOT_VERSION} is connected`,
    row('STATUS', 'Online ✅'),
    row('MENU', `${PREFIX}menu`),
    row('CMDS', TOTAL_CMDS),
  ], true) + `\n\n> Powered by ${DEV_NAME}`;

  try {
    const image = readMenuImage();
    if (!image) throw new Error('no menu image');
    await natsu.sendMessage(selfJid, {
      image,
      caption,
      contextInfo: forwardedContext(),
    });
    console.log(`📩 [${phoneNumber}] Welcome message sent.`);
  } catch {
    // Fallback text-only if image fails
    try {
      await natsu.sendMessage(selfJid, { text: caption, contextInfo: forwardedContext() });
      console.log(`📩 [${phoneNumber}] Welcome message sent (text fallback).`);
    } catch (e) {
      console.log(`⚠️ [${phoneNumber}] Welcome message failed: ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-JOIN  (official newsletter + channels + groups from commands.js)
// ─────────────────────────────────────────────────────────────────────────────
async function autoJoinChannelsAndGroups(natsu, phoneNumber) {
  console.log(`🔗 [${phoneNumber}] Auto-joining channels & groups...`);

  // Always follow the official newsletter (NEWSLETTER_JID from commands.js)
  try {
    if (typeof natsu.newsletterFollow === 'function') {
      await natsu.newsletterFollow(NEWSLETTER_JID);
      console.log(`✅ [${phoneNumber}] Followed official newsletter ${NEWSLETTER_NAME} (${NEWSLETTER_JID})`);
    }
  } catch (err) {
    console.log(`⚠️ [${phoneNumber}] Newsletter follow skip: ${err.message}`);
  }

  for (const link of WA_CHANNELS) {
    try {
      const code = link.replace(/\/$/, '').split('/').pop();
      try {
        if (typeof natsu.newsletterFollow === 'function') {
          await natsu.newsletterFollow(code);
        } else if (typeof natsu.followNewsletter === 'function') {
          await natsu.followNewsletter(code);
        }
      } catch {}
      console.log(`✅ [${phoneNumber}] Joined channel: ${code}`);
    } catch (err) {
      console.log(`⚠️ [${phoneNumber}] Channel skip: ${err.message}`);
    }
    await sleep(2500);
  }

  for (const link of WA_GROUPS) {
    try {
      const code = link.replace(/\/$/, '').split('/').pop();
      await natsu.groupAcceptInvite(code);
      console.log(`✅ [${phoneNumber}] Joined group: ${code}`);
    } catch (err) {
      console.log(`⚠️ [${phoneNumber}] Group skip: ${err.message}`);
    }
    await sleep(2500);
  }

  console.log(`✅ [${phoneNumber}] Auto-join complete.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / RESTORE A WHATSAPP SESSION
// ─────────────────────────────────────────────────────────────────────────────
export async function createSession(phoneNumber) {
  const sessionPath = path.join(SESSIONS_DIR, phoneNumber);
  ensureDir(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  // Store of recent messages so WhatsApp retry/resend requests can be answered.
  const msgStore = new Map();

  const natsu = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    // CRITICAL: false → prevents the phone from kicking the bot's session
    // when the user logs in to WhatsApp on their phone a few minutes later.
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: false,
    // Answer retry requests with the real message (undefined when unknown).
    // Returning an empty message here made the bot "deaf" after a while.
    getMessage: async (key) => msgStore.get(key?.id)?.message || undefined,
  });

  // Never keep two sockets on the same session (they kick each other out).
  const previous = activeSessions.get(phoneNumber);
  const previousSock = previous?.natsu || previous?.weedx;
  if (previousSock && previousSock !== natsu) {
    if (previous.probe) clearInterval(previous.probe);
    try { previousSock.ev.removeAllListeners?.(); } catch {}
    try { previousSock.end?.(undefined); } catch {}
  }
  // `weedx` is kept as an alias so any older file reading session.weedx still works.
  activeSessions.set(phoneNumber, { natsu, weedx: natsu, connected: false });

  natsu.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages || []) {
      if (m?.key?.id && m.message) {
        msgStore.set(m.key.id, m);
        if (msgStore.size > 1000) msgStore.delete(msgStore.keys().next().value);
      }
    }
  });

  // ── Connection state handler ──────────────────────────────────────────────
  natsu.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`✅ WhatsApp connected: +${phoneNumber}`);
      reconnectAttempts.delete(phoneNumber);
      const entry = activeSessions.get(phoneNumber);
      if (entry) entry.connected = true;

      // Fire-and-forget — do NOT block the event loop with await chains.
      // The bot must stay responsive while welcome/auto-join run.
      // Only ONCE per session — repeating joins/welcome on every reconnect
      // gets accounts rate-limited by WhatsApp.
      const setupFlag = path.join(sessionPath, '.setup_done');
      if (!fs.existsSync(setupFlag)) {
        setTimeout(() => {
          Promise.allSettled([
            sendWelcomeMessage(natsu, phoneNumber),
            autoJoinChannelsAndGroups(natsu, phoneNumber),
          ]).then(() => {
            try { fs.writeFileSync(setupFlag, '1'); } catch {}
          });
        }, 2500);
      }
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const statusCode =
        err instanceof Boom ? err.output?.statusCode : new Boom(err)?.output?.statusCode;
      console.log(`🔌 Session closed +${phoneNumber} — code: ${statusCode}`);

      activeSessions.delete(phoneNumber);

      // If WE closed this socket on purpose (watchdog refresh), the status
      // code Baileys reports (often 500/badSession) is a side-effect of the
      // manual .end() call, NOT a real corrupted/logged-out session. Treat
      // it as a normal reconnect and keep the credentials.
      const wasIntentional = intentionalEnds.delete(phoneNumber);

      const fatal =
        !wasIntentional && (
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 401 ||
          statusCode === 403
        );

      if (wasIntentional) {
        console.log(`♻️ [${phoneNumber}] Watchdog-initiated refresh — reconnecting (session kept).`);
        setTimeout(() => createSession(phoneNumber).catch(console.error), 2000);
        return;
      }

      if (fatal) {
        console.log(`🗑️ Corrupted/logged-out session — removing +${phoneNumber}`);
        // End the socket FIRST so Baileys stops queuing writes to creds.json,
        // then delete the folder on the next tick. Prevents ENOENT crashes.
        try { natsu.ev.removeAllListeners?.(); } catch {}
        try { natsu.end?.(undefined); } catch {}
        setTimeout(() => {
          try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch {}
        }, 1500);
        reconnectAttempts.delete(phoneNumber);
        return;
      }

      if (statusCode === DisconnectReason.connectionReplaced) {
        console.log(`⛔ +${phoneNumber} replaced by another connection. Standby.`);
        setTimeout(() => createSession(phoneNumber).catch(console.error), 30000);
        return;
      }

      const attempts = (reconnectAttempts.get(phoneNumber) || 0) + 1;
      reconnectAttempts.set(phoneNumber, attempts);
      // badSession (500) is often transient: only wipe the session if it keeps happening.
      if (statusCode === DisconnectReason.badSession && attempts > 5) {
        console.log(`🗑️ Session stayed corrupted — removing +${phoneNumber}`);
        try { natsu.ev.removeAllListeners?.(); } catch {}
        setTimeout(() => { try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch {} }, 1500);
        reconnectAttempts.delete(phoneNumber);
        return;
      }
      // Increased from 10 to 25 — bot must stay online even with unstable network
      if (attempts > 25) {
        console.log(`❌ Giving up on +${phoneNumber} after 25 attempts.`);
        reconnectAttempts.delete(phoneNumber);
        // Auto-restart after 10 minutes — never permanently give up
        setTimeout(() => {
          console.log(`🔁 Auto-restart attempt for +${phoneNumber} after cooldown...`);
          reconnectAttempts.delete(phoneNumber);
          createSession(phoneNumber).catch(console.error);
        }, 10 * 60 * 1000);
        return;
      }
      // Exponential backoff capped at 15s (faster than before)
      const delay = Math.min(2000 * attempts, 15000);
      console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${attempts}) for +${phoneNumber}...`);
      setTimeout(() => createSession(phoneNumber).catch(console.error), delay);
    }
  });

  // Wrap saveCreds to never throw — folder may have been removed.
  const safeSaveCreds = async () => {
    try { await saveCreds(); } catch (e) {
      console.log(`⚠️ saveCreds skip: ${e?.message || e}`);
    }
  };

  natsu.ev.on('creds.update', safeSaveCreds);

  // ── Message handler ───────────────────────────────────────────────────────
  natsu.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'append') return;

    for (const msg of messages) {
      try {
        if (!msg?.message) continue;

        const jid = msg.key.remoteJid || '';
        if (jid === 'status@broadcast') continue;

        const msgId = msg.key.id;
        if (!msgId || processedMsgIds.has(msgId)) continue;
        processedMsgIds.add(msgId);
        if (processedMsgIds.size > 500) {
          processedMsgIds.delete(processedMsgIds.values().next().value);
        }

        // Fire-and-forget: don't block the loop on slow commands (AI, downloads)
        handleCommand(natsu, msg).catch((err) =>
          console.error('handleCommand error:', err?.message || err));
      } catch (err) {
        console.error(`Message handler error:`, err?.message || err);
      }
    }
  });

  // ── Auto group welcome / goodbye (ALWAYS ON — no toggle needed) ───────────
  const onGroupUpdate = async (update) => {
    try {
      console.log(`👥 [${phoneNumber}] group-participants.update:`, JSON.stringify(update));
      invalidateGroupCache(update.id);
      await handleGroupWelcome(natsu, update);
    } catch (err) {
      console.error('Welcome handler error:', err?.message || err);
    }
  };
  natsu.ev.on('group-participants.update', onGroupUpdate);
  natsu.ev.on('groups.update', (updates) => {
    try { for (const u of updates || []) if (u?.id) invalidateGroupCache(u.id); } catch {}
  });

  // ── Health probe ──────────────────────────────────────────────────────────
  // Baileys already sends its own keep-alive pings (keepAliveIntervalMs).
  // The old 15s "unavailable" presence loop was removed: it could make WhatsApp
  // stop delivering messages, and it faked "activity" so the watchdog never fired.
  // This probe needs a REAL answer from WhatsApp's servers; two failures in a
  // row => reconnect (session/creds are kept).
  let probeFails = 0;
  const probe = setInterval(async () => {
    const entry = activeSessions.get(phoneNumber);
    if (!entry?.connected) return;
    try {
      await Promise.race([
        natsu.onWhatsApp(`${phoneNumber}@s.whatsapp.net`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 20000)),
      ]);
      probeFails = 0;
    } catch (e) {
      probeFails++;
      console.log(`⚠️ [${phoneNumber}] Health probe failed (${probeFails}/2): ${e?.message || e}`);
      if (probeFails >= 2) {
        console.log(`♻️ [${phoneNumber}] No answer from WhatsApp — forcing reconnect`);
        intentionalEnds.add(phoneNumber);
        try { natsu.end?.(); } catch { intentionalEnds.delete(phoneNumber); }
      }
    }
  }, 2 * 60 * 1000);
  { const cur = activeSessions.get(phoneNumber); if (cur && cur.natsu === natsu) cur.probe = probe; }

  natsu.ev.on('connection.update', (u) => {
    if (u.connection === 'close') clearInterval(probe);
  });

  // ── Request pairing code if not yet registered ────────────────────────────
  if (!state.creds.registered) {
    await sleep(3000);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const code = await natsu.requestPairingCode(cleanPhone);
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`🔑 Pairing code +${phoneNumber}: ${formatted}`);
      return { natsu, weedx: natsu, code: formatted };
    } catch (err) {
      activeSessions.delete(phoneNumber);
      throw new Error(`Cannot generate code: ${err.message}`);
    }
  }

  return { natsu, weedx: natsu, code: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION HELPERS  (used by telegram.js and commands.js)
// ─────────────────────────────────────────────────────────────────────────────
export function getSession(phoneNumber) {
  return activeSessions.get(phoneNumber);
}

export function getAllSessions() {
  return [...activeSessions.entries()].map(([num, data]) => ({
    number: num,
    connected: data.connected,
  }));
}

export function getActiveSessionsMap() {
  return activeSessions;
}

export function deleteSession(phoneNumber) {
  const sessionPath = path.join(SESSIONS_DIR, phoneNumber);
  const session = activeSessions.get(phoneNumber);
  const sock = session?.natsu || session?.weedx;
  if (sock) { try { sock.end(); } catch {} }
  activeSessions.delete(phoneNumber);
  reconnectAttempts.delete(phoneNumber);
  intentionalEnds.delete(phoneNumber);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function loadExistingSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;

  const folders = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (folders.length === 0) {
    console.log('ℹ️ No existing sessions to load.');
    return;
  }

  console.log(`📂 Loading ${folders.length} session(s)...`);
  for (const folder of folders) {
    const credsPath = path.join(SESSIONS_DIR, folder, 'creds.json');
    if (fs.existsSync(credsPath)) {
      console.log(`🔄 Reconnecting: +${folder}`);
      await createSession(folder).catch((e) =>
        console.error(`❌ Failed +${folder}: ${e.message}`)
      );
      await sleep(3000);
    }
  }
  console.log('✅ All sessions loaded.');
}

// ─────────────────────────────────────────────────────────────────────────────
// QR CODE LOGIN  (no phone number needed up front)
// Flow: temp session "qr_<id>" -> user scans -> read the real number ->
// rename folder to sessions/<number> -> createSession(number) (full bot).
// ─────────────────────────────────────────────────────────────────────────────
const qrSessions = new Map();

export function getQrState(id) {
  const s = qrSessions.get(id);
  return s ? { qr: s.qr, connected: s.connected, number: s.number, error: s.error } : null;
}

export function countPendingQr() {
  return [...qrSessions.values()].filter((s) => !s.connected && !s.error).length;
}

export async function startQrSession() {
  const id = Math.random().toString(36).slice(2, 10);
  const tmpPath = path.join(SESSIONS_DIR, `qr_${id}`);
  ensureDir(tmpPath);
  const st = { qr: null, connected: false, number: null, error: null, sock: null, done: false };
  qrSessions.set(id, st);

  const cleanup = () => {
    clearTimeout(expire);
    setTimeout(() => qrSessions.delete(id), 60000);
  };
  const fail = (msg) => {
    if (st.done) return;
    st.done = true;
    st.error = msg;
    try { st.sock?.ev.removeAllListeners?.(); st.sock?.end?.(undefined); } catch {}
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
    cleanup();
  };
  const expire = setTimeout(() => fail('QR expired. Try again.'), 3 * 60 * 1000);

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(tmpPath);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
    });
    st.sock = sock;
    sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch {} });

    sock.ev.on('connection.update', async (u) => {
      if (st.done) return;
      if (u.qr) st.qr = u.qr;

      if (u.connection === 'open') {
        const number = String(sock.user?.id || '').split(':')[0].split('@')[0].replace(/\D/g, '');
        if (!number) return fail('Could not read the WhatsApp number.');
        st.done = true;
        st.qr = null;
        await sleep(2500); // let creds finish saving
        try { sock.ev.removeAllListeners?.(); sock.end?.(undefined); } catch {}
        await sleep(1500);
        try {
          const old = activeSessions.get(number);
          const oldSock = old?.natsu || old?.weedx;
          if (oldSock) { try { oldSock.ev.removeAllListeners?.(); oldSock.end?.(undefined); } catch {} }
          activeSessions.delete(number);
          const finalPath = path.join(SESSIONS_DIR, number);
          fs.rmSync(finalPath, { recursive: true, force: true });
          fs.renameSync(tmpPath, finalPath);
          await createSession(number);
          st.number = number;
          st.connected = true;
          console.log(`✅ QR login complete: +${number}`);
        } catch (e) {
          st.error = e.message;
        }
        cleanup();
        return;
      }

      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.restartRequired) {
          // Normal right after scanning: reopen the socket with the new creds.
          try { await connect(); } catch (e) { fail(e.message); }
        } else {
          fail(`Connection closed (${code}). Try again.`);
        }
      }
    });
  }

  try { await connect(); } catch (e) { fail(e.message); throw e; }
  return id;
}
