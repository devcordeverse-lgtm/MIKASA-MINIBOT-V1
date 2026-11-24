/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ commands.js — 120 commands
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { videoCommand } from './video.js';
import { tiktokCommand } from './tiktok.js';
import { instagramCommand } from './instagram.js';
import { playCommand } from './play.js';
import { viewonceCommand } from './viewonce.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// CORE CONFIG  (edit these values)
// ─────────────────────────────────────────────────────────────────────────────
export const PREFIX   = '.';
export const PREFIXES = ['.', '/', '!', '#', ',', '+'];   // all prefixes accepted
export const BOT_NAME = 'MIKASA-MINIBOT';
export const DEV_NAME = 'CØDEVERSE';
export const BOT_VERSION = 'V1';

// Menu picture = local file "menu.jpg" next to this file (replace it with your Mikasa image)
export const MENU_IMAGE  = path.join(__dirname, 'menu.jpg');
const MENU_BUFFER = (() => { try { return fs.readFileSync(MENU_IMAGE); } catch { return null; } })();
if (!MENU_BUFFER) console.warn('⚠️ menu.jpg not found next to commands.js — menu will be sent without image');

export const NEWSLETTER_JID  = '120363412011169641@newsletter';
export const NEWSLETTER_NAME = 'MIKASA-MINIBOT';

// ─── OWNER INFO ──────────────────────────────────────────────────────────────
export const OWNER_NUMBER  = '18295802916';            // no +, no spaces
export const OWNER_NAME    = 'Mikasa Owner';
export const OWNER_WA      = `https://wa.me/${OWNER_NUMBER}`;
export const OWNER_TG      = '';                       // e.g. https://t.me/yourname
export const OWNER_GITHUB  = 'https://github.com/WeedTech';
export const REPO_URL      = 'https://github.com/WeedTech/MIKASA-MINIBOT';
export const WELCOME_USE_PROFILE_PIC = true;  // welcome/goodbye use the member's profile pic (fallback: menu image)
export const WELCOME_LINK  = '';              // optional link line shown in welcome/goodbye cards ('' = hidden)

// Fill these with your real links (empty = hidden)
export const WA_CHANNELS = [];   // ['https://whatsapp.com/channel/XXXX']
export const WA_GROUPS   = [];   // ['https://chat.whatsapp.com/XXXX']

// Forwarded-from-channel context (messages look forwarded from the newsletter)
export function forwardedContext() {
  return {
    isForwarded: true,
    forwardingScore: 999,
    forwardedNewsletterMessageInfo: {
      newsletterJid: NEWSLETTER_JID,
      newsletterName: NEWSLETTER_NAME,
      serverMessageId: -1,
    },
    externalAdReply: {
      title: `${BOT_NAME} ${BOT_VERSION}`,
      body: `Powered by ${DEV_NAME}`,
      ...(MENU_BUFFER ? { thumbnail: MENU_BUFFER } : {}),
      sourceUrl: WA_CHANNELS[0] || OWNER_WA,
      mediaType: 1,
      renderLargerThumbnail: false,
    },
  };
}

// Channel button only (no link preview card)
export function newsletterContext() {
  return {
    isForwarded: true,
    forwardingScore: 999,
    forwardedNewsletterMessageInfo: {
      newsletterJid: NEWSLETTER_JID,
      newsletterName: NEWSLETTER_NAME,
      serverMessageId: -1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT STATE
// ─────────────────────────────────────────────────────────────────────────────
const STATE_FILE = path.join(DATA_DIR, 'state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function getState() {
  const s = loadState();
  s.sudo        ??= [];
  s.banned      ??= [];
  s.antilink    ??= {};      // groupJid -> bool
  s.badwords    ??= {};      // groupJid -> bool
  s.welcome     ??= {};      // groupJid -> false when disabled (default ON)
  s.mode        ??= 'public';
  s.autoread    ??= false;
  s.autobio     ??= false;
  s.autorecord  ??= false;
  s.autotyping  ??= false;
  s.autoviewsts ??= false;
  s.autoreact   ??= false;
  s.warns       ??= {};      // groupJid -> { userJid: count }
  s.afks        ??= {};      // userJid -> { reason, since }
  s.prefix      ??= '.';
  return s;
}
function updateState(fn) { const s = getState(); fn(s); saveState(s); return s; }

// ─────────────────────────────────────────────────────────────────────────────
// STYLE HELPERS  (𝗯𝗼𝗹𝗱 titles + ┏━〔 〕━┓ boxes)
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
const fmtUptime = (sec) => `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m ${Math.floor(sec % 60)}s`;

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const RAND = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unwrap(m) {
  let x = m;
  for (let i = 0; i < 5; i++) {
    const n = x?.ephemeralMessage?.message ||
              x?.viewOnceMessage?.message ||
              x?.viewOnceMessageV2?.message ||
              x?.viewOnceMessageV2Extension?.message ||
              x?.documentWithCaptionMessage?.message ||
              null;
    if (!n) break;
    x = n;
  }
  return x;
}

export function getMessageText(msg) {
  if (!msg?.message) return '';
  const src = unwrap(msg.message) || {};
  return (
    src.conversation ||
    src.extendedTextMessage?.text ||
    src.imageMessage?.caption ||
    src.videoMessage?.caption ||
    src.documentMessage?.caption ||
    src.buttonsResponseMessage?.selectedDisplayText ||
    src.templateButtonReplyMessage?.selectedDisplayText ||
    src.listResponseMessage?.singleSelectReply?.selectedRowId ||
    (() => { try { return JSON.parse(src.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}').id; } catch { return ''; } })() ||
    ''
  ).trim();
}

// contextInfo of whatever message type it is (text, image caption, video…)
function ctxInfo(msg) {
  const m = unwrap(msg.message) || {};
  for (const k of Object.keys(m)) {
    const c = m[k]?.contextInfo;
    if (c) return c;
  }
  return {};
}
function quotedOf(msg) {
  const ci = ctxInfo(msg);
  return ci.quotedMessage ? { message: unwrap(ci.quotedMessage), participant: ci.participant, stanzaId: ci.stanzaId } : null;
}
// target user: @mention → replied message author → number in text
function resolveTarget(msg, arg) {
  const ci = ctxInfo(msg);
  if (ci.mentionedJid?.[0]) return ci.mentionedJid[0];
  if (ci.quotedMessage && ci.participant) return ci.participant;
  const n = String(arg || '').replace(/\D/g, '');
  return n.length >= 7 ? `${n}@s.whatsapp.net` : null;
}

const isGroup = (jid) => jid?.endsWith('@g.us');
const senderOf = (msg) => msg.key.participant || msg.key.remoteJid;
const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0];

// Group metadata cache (60 s)
const _groupMetaCache = new Map();
const GROUP_META_TTL = 60 * 1000;
export function invalidateGroupCache(jid) { _groupMetaCache.delete(jid); }

async function getGroupAdmins(natsu, jid) {
  try {
    const now = Date.now();
    const cached = _groupMetaCache.get(jid);
    let meta;
    if (cached && cached.exp > now) meta = cached.meta;
    else {
      meta = await natsu.groupMetadata(jid);
      _groupMetaCache.set(jid, { meta, exp: now + GROUP_META_TTL });
    }
    const admins = meta.participants.filter((p) => p.admin).map((p) => p.id);
    const botPhone = numOf(natsu.user?.id);
    const botLidNum = numOf(natsu.user?.lid);
    const botJid = botPhone ? `${botPhone}@s.whatsapp.net` : '';
    const botLid = botLidNum ? `${botLidNum}@lid` : '';
    const botIsAdmin = admins.includes(botJid) || (botLid && admins.includes(botLid));
    return { meta, admins, botIsAdmin, botJid };
  } catch { return { meta: null, admins: [], botIsAdmin: false, botJid: '' }; }
}

function isGroupAdmin(adminsList, userJid) {
  if (!userJid) return false;
  const phone = numOf(userJid);
  return adminsList.some((a) => a === userJid || numOf(a) === phone);
}

async function tryFetch(urls) {
  for (const u of urls) {
    try {
      const r = await axios.get(u, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.data) return r.data;
    } catch {}
  }
  return null;
}

// AI gateway (pollinations first, 2 in parallel, then fallback)
async function askAI(prompt, model = 'gpt') {
  const q = encodeURIComponent(prompt);
  const map = { gpt: 'openai', gemini: 'gemini', deepseek: 'deepseek', code: 'qwen-coder', story: 'openai' };
  const m = map[model] || 'openai';
  const urls = [
    `https://text.pollinations.ai/${q}?model=${m}`,
    `https://text.pollinations.ai/${q}`,
    `https://api.dreaded.site/api/chatgpt?text=${q}`,
  ];
  const parse = (d) => {
    if (typeof d === 'string' && d.trim().startsWith('{')) { try { d = JSON.parse(d); } catch {} }
    return typeof d === 'string'
      ? d
      : (d?.BK9 || d?.result || d?.response || d?.data?.response || d?.data?.message || d?.message || d?.answer || null);
  };
  const call = (u) => axios.get(u, { timeout: 20000, responseType: 'text', transformResponse: [(d) => d] })
    .then((r) => parse(r.data)).then((a) => (a && String(a).trim() ? String(a).trim() : Promise.reject(new Error('empty'))));
  try { return await Promise.any(urls.slice(0, 2).map(call)); } catch {}
  try { const a = await call(urls[2]); if (a) return a; } catch {}
  return null;
}

// Image helpers
const _imgCache = new Map();
async function getImageBuffer(url) {
  if (_imgCache.has(url)) return _imgCache.get(url);
  if (!/^https?:\/\//i.test(url)) {
    try { const b = fs.readFileSync(url); _imgCache.set(url, b); return b; } catch { return null; }
  }
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000 });
    const buf = Buffer.from(r.data);
    _imgCache.set(url, buf);
    return buf;
  } catch { return null; }
}
async function sendImage(natsu, jid, url, caption, msg) {
  const isUrl = /^https?:\/\//i.test(url);
  const buf = isUrl ? null : await getImageBuffer(url);
  if (!isUrl && !buf) return sendText(natsu, jid, caption || '', msg);
  return natsu.sendMessage(jid, { image: buf || { url }, caption: caption || '', contextInfo: forwardedContext() }, { quoted: msg });
}
async function sendText(natsu, jid, text, msg) {
  return natsu.sendMessage(jid, { text, contextInfo: forwardedContext() }, { quoted: msg });
}

// ─────────────────────────────────────────────────────────────────────────────
// MENU — 120 commands
// ─────────────────────────────────────────────────────────────────────────────
const MENU_GROUPS = {
  GROUP: ['add','kick','promote','demote','tagall','hidetag','tagadmins','mute','unmute','antilink','antibadword','welcome','groupinfo','groupname','setgdesc','link','resetlink','listadmin','left','warn','warns','resetwarn','opentime','closetime','vcf','join'],
  OWNER: ['self','public','ban','unban','block','unblock','addsudo','delsudo','listsudo','autoread','autotyping','autorecording','autoreact','autoviewstatus','autobio','broadcast','restart','setpp'],
  GENERAL: ['menu','ping','alive','runtime','owner','repo','info','jid','support','pair'],
  SYSTEM: ['setprefix','prefix','mode'],
  AI: ['ai','gpt','gemini','deepseek','codeai','imagine','storyai','translate'],
  DOWNLOAD: ['play','video','tiktok','instagram','facebook','apk','mediafire','pinterest','spotify','gitclone','lyrics','yts'],
  FUN: ['truth','dare','joke','meme','ship','rate','flirt','roast','compliment','wouldyou','8ball','fact','quote','dadjoke','cat','dog','character','riddle'],
  GAMES: ['rps','dice','coin','guess','hangman','math'],
  TOOLS: ['weather','currency','time','qrcode','shorturl','iplookup','calc','dictionary','password','tts','readmore','github','npm','wiki','crypto','remind','afk','getpp','vv'],
};
export const TOTAL_CMDS = Object.values(MENU_GROUPS).reduce((n, a) => n + a.length, 0);

// Hidden aliases (not counted / not shown)
const ALIASES = { help: 'menu', list: 'menu', ig: 'instagram', fb: 'facebook', tt: 'tiktok', grouplink: 'link', viewonce: 'vv' };

// Commands that also work WITHOUT a prefix (kept tiny on purpose: normal chat must not trigger the bot)
export const KNOWN_CMDS = new Set(['menu', 'ping', 'alive']);

// ZARI-MD style (serif bold letters)
function serif(s) {
  return [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90)  return String.fromCodePoint(0x1D400 + (c - 65));
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D41A + (c - 97));
    return ch;
  }).join('');
}

function menuHeader(userName) {
  const st = getState();
  const usedGB = ((os.totalmem() - os.freemem()) / 1024 ** 3).toFixed(2);
  const totGB  = (os.totalmem() / 1024 ** 3).toFixed(2);
  const modeIcon = st.mode === 'public' ? '❤️‍🩹' : '🔒';
  return [
    `┌──《 ${serif(BOT_NAME)} 》──◇`,
    `│❥•${serif('Run')}     : ${fmtUptime(process.uptime())}`,
    `│❥•${serif('Mode')}    : ${st.mode.toUpperCase()} ${modeIcon}`,
    `│❥•${serif('Prefix')}  : ${st.prefix}`,
    `│❥•${serif('Ram')}     : ${usedGB} / ${totGB} GB`,
    `│❥•${serif('Time')}    : ${new Date().toLocaleTimeString('en-GB')}`,
    `│❥•${serif('User')}    : ${userName || 'User'}`,
    `└────────────◇`,
  ].join('\n');
}

// pkg = '' → main menu (list of packages) ; pkg = 'group' → commands of that package
function buildMenu(userName, pkg = '') {
  const st = getState();
  const head = menuHeader(userName);
  const foot = `\n\n> Made with love by ${serif(BOT_NAME)}`;
  const key = Object.keys(MENU_GROUPS).find((k) => k.toLowerCase() === String(pkg).toLowerCase());

  if (key) {
    const cmds = MENU_GROUPS[key];
    return `${head}\n\n┌──《 ${serif(key)} 》──◇\n${cmds.map((c) => `│❥ ${st.prefix}${c}`).join('\n')}\n└────────────◇${foot}`;
  }
  const list = Object.entries(MENU_GROUPS)
    .map(([k, v]) => `│❥ ${st.prefix}menu ${k.toLowerCase()}  (${v.length})`).join('\n');
  return `${head}\n\n┌──《 ${serif('PACKAGES')} 》──◇\n${list}\n│❥ ${st.prefix}menu all\n└────────────◇${foot}`;
}

function buildFullMenu(userName) {
  const st = getState();
  const body = Object.entries(MENU_GROUPS).map(([k, cmds]) =>
    `┌──《 ${serif(k)} 》──◇\n${cmds.map((c) => `│❥ ${st.prefix}${c}`).join('\n')}\n└────────────◇`).join('\n\n');
  return `${menuHeader(userName)}\n\n${body}\n\n> Made with love by ${serif(BOT_NAME)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL FRAME — every plain text / caption gets the ┏━〔 〕━┓ style.
// Already-framed messages (menu, cards) are untouched.
// ─────────────────────────────────────────────────────────────────────────────
const _ALREADY_FRAMED = /^\s*[╭┌╔┏╒]/;
const FRAME_TOP = `┏━━━〔 ${bold('MIKASA')} 〕━━━┓`;
const FRAME_END = `┗${BAR}┛`;
export function frameText(t) {
  if (typeof t !== 'string' || !t.trim() || _ALREADY_FRAMED.test(t)) return t;
  const lines = t.replace(/\s+$/, '').replace(/^\s*\n/, '').split('\n');
  const foot = [];
  while (lines.length && (/^>/.test(lines[lines.length - 1]) || (!lines[lines.length - 1].trim() && foot.length))) {
    foot.unshift(lines.pop());
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return t;
  // code blocks break if every line is prefixed → top/bottom only
  const body = t.includes('```') ? lines : lines.map((l) => (l.trim() ? `┃ ${l}` : '┃'));
  const footer = foot.filter((l) => l.trim()).length ? `\n\n${foot.join('\n').trim()}` : '';
  return `${FRAME_TOP}\n${body.join('\n')}\n${FRAME_END}${footer}`;
}
function frameContent(c) {
  if (!c || typeof c !== 'object') return c;
  if (typeof c.text === 'string')    return { ...c, text: frameText(c.text) };
  if (typeof c.caption === 'string') return { ...c, caption: frameText(c.caption) };
  return c;
}
function frameSocket(natsu) {
  if (!natsu || natsu.__framed || typeof natsu.sendMessage !== 'function') return natsu;
  const orig = natsu.sendMessage.bind(natsu);
  natsu.sendMessage = (jid, content, ...rest) => orig(jid, frameContent(content), ...rest);
  natsu.__framed = true;
  return natsu;
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP WELCOME / GOODBYE  (ON by default — admins can toggle with .welcome off)
// ─────────────────────────────────────────────────────────────────────────────
async function getProfilePic(natsu, ...jids) {
  for (const j of jids) {
    if (!j) continue;
    try { const url = await natsu.profilePictureUrl(j, 'image'); if (url) return url; } catch {}
  }
  return null;
}

function buildGroupCard({ isJoin, groupName, number, members, admins }) {
  const lines = [
    row('GROUP', groupName || 'Group'),
    row('USER', `@${number}`),
    row('MEMBERS', members),
    row('ADMINS', admins),
  ];
  if (WELCOME_LINK) lines.push(row('LINK', WELCOME_LINK));
  return `${card(isJoin ? 'WELCOME' : 'GOODBYE', lines)}\n\n> ${BOT_NAME} • ${DEV_NAME}`;
}

export async function handleGroupWelcome(natsu, update = {}) {
  frameSocket(natsu);
  const { id, participants = [], action } = update;
  if (!id || !String(id).endsWith('@g.us')) return;
  if (!participants.length) return;
  if (getState().welcome?.[id] === false) return;

  const act = String(action || '').toLowerCase();
  const isJoin = ['add', 'invite', 'join'].includes(act);
  const isLeave = ['remove', 'leave', 'kick'].includes(act);
  if (!isJoin && !isLeave) return;

  invalidateGroupCache(id);
  let groupName = '', members = 'N/A', admins = 'N/A';
  try {
    const meta = await natsu.groupMetadata(id);
    groupName = meta?.subject || '';
    members = meta?.participants?.length ?? 'N/A';
    admins = meta?.participants?.filter((p) => p.admin).length ?? 'N/A';
  } catch {}

  for (const raw of participants) {
    const jidP = typeof raw === 'string' ? raw : (raw?.id || raw?.jid || '');
    if (!jidP) continue;
    const phoneJid = typeof raw === 'object' ? raw?.phoneNumber : '';
    const number = numOf(phoneJid || jidP);
    try {
      const caption = buildGroupCard({ isJoin, groupName, number, members, admins });
      const pp = WELCOME_USE_PROFILE_PIC ? await getProfilePic(natsu, jidP, phoneJid) : null;
      const payload = (src) => ({
        image: src === 'menu' ? MENU_BUFFER : { url: src },
        caption, mentions: [jidP], contextInfo: forwardedContext(),
      });
      try {
        if (!pp && !MENU_BUFFER) throw new Error('no image');
        await natsu.sendMessage(id, payload(pp || 'menu'));
      } catch {
        try {
          if (!MENU_BUFFER) throw new Error('no menu image');
          await natsu.sendMessage(id, payload('menu'));
        } catch {
          await natsu.sendMessage(id, { text: caption, mentions: [jidP], contextInfo: forwardedContext() });
        }
      }
      console.log(`👋 ${isJoin ? 'Welcome' : 'Goodbye'} sent in ${groupName} for ${number}`);
    } catch (e) { console.log(`⚠️ Welcome/Goodbye failed: ${e.message}`); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const _isUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+/i.test(u.trim());
const _cleanUrl = (u) => (_isUrl(u) ? u.trim().replace(/\s+/g, '') : null);
const _DL_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};
const _getJson = async (url) => { const r = await axios.get(url, { timeout: 60000, headers: _DL_HEADERS }); return { status: r.status, data: r.data }; };
async function _fetchThumb(url) {
  try { const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 }); return Buffer.from(r.data); } catch {}
  return undefined;
}

async function ytSearchList(query, n = 5) {
  const eps = [
    `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    `https://yewtu.be/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    `https://invidious.privacydev.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
  ];
  for (const ep of eps) {
    try {
      const r = await axios.get(ep, { timeout: 8000, headers: _DL_HEADERS });
      const list = (Array.isArray(r.data) ? r.data : []).filter((v) => v.videoId).slice(0, n);
      if (list.length) return list.map((v) => ({
        title: v.title, author: v.author, seconds: v.lengthSeconds || 0,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      }));
    } catch {}
  }
  return [];
}

async function downloadFb(url) {
  const enc = encodeURIComponent(url);
  const apis = [
    async () => {
      const d = await _getJson(`https://api.giftedtech.web.id/api/download/facebook?apikey=gifted&url=${enc}`);
      const r = d.data?.result || d.data;
      const u = _cleanUrl(r?.hd || r?.download_url || r?.video || r?.url);
      if (u) return { url: u, thumbnail: r?.thumbnail || '' };
      throw new Error('gifted');
    },
    async () => {
      const d = await _getJson(`https://tele-social.vercel.app/down?url=${enc}`);
      if (!d.data?.status) throw new Error('telesocial');
      const media = d.data.data?.media || {};
      const u = _cleanUrl(media.download) || _cleanUrl(media.video);
      if (u) return { url: u, thumbnail: _cleanUrl(d.data.data?.thumbnail) || '' };
      throw new Error('telesocial');
    },
    async () => {
      const d = await _getJson(`https://api.dreaded.site/api/facebook?url=${enc}`);
      const r = d.data?.result || d.data || d;
      const u = _cleanUrl(r?.download_url || r?.video || r?.url);
      if (u) return { url: u, thumbnail: r?.thumbnail || '' };
      throw new Error('dreaded');
    },
    async () => {
      const d = await _getJson(`https://api.yupra.my.id/api/downloader/facebook?url=${enc}`);
      const r = d.data?.data || {};
      const u = _cleanUrl(r.download_url);
      if (u) return { url: u, thumbnail: _cleanUrl(r.thumbnail) || '' };
      throw new Error('yupra');
    },
  ];
  for (const api of apis) {
    try { const r = await api(); if (r?.url) return r; } catch (e) { console.log('[fb] api failed:', e.message); }
  }
  throw new Error('All Facebook servers failed');
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL DATA (fun / games)
// ─────────────────────────────────────────────────────────────────────────────
const TRUTHS = ["What's your biggest secret?", 'Have you ever lied to your best friend?', "What's your worst habit?", "What's the most embarrassing thing you've ever done?", 'Who was your first crush?', "What's a lie you still tell people?", "What's the last thing you searched on your phone?"];
const DARES  = ['Send a selfie right now 📸', 'Record a voice note singing a song 🎤', 'Text your crush a compliment 💌', 'Do 10 push-ups and send proof 💪', 'Put "I love Mikasa" in your bio for 24h', 'Send your most used emoji 10 times'];
const FLIRTS = ["Are you Wi-Fi? Because I'm feeling a connection. 💞", 'Did it hurt when you fell from heaven? 😇', 'You must be a magician — everyone else disappears when I look at you. ✨', 'Is your name Google? Because you have everything I\'m searching for. 💘'];
const ROASTS = ['You bring everyone so much joy… when you leave the room. 😂', "You're proof that even God makes mistakes sometimes.", "You're not stupid; you just have bad luck thinking.", 'Your secrets are safe with me — I never listen when you talk. 😌'];
const COMPS  = ['You light up every room you enter. ✨', 'Your smile could power a city. 💖', "You're the human version of sunshine. ☀️", 'You make hard things look easy. 🔥'];
const WYR    = ['Would you rather fly or read minds?', 'Would you rather be invisible or super strong?', 'Would you rather have unlimited money or unlimited time?', 'Would you rather never use social media again or never watch a video again?'];
const BALL   = ['Yes, absolutely.', 'No way.', 'Ask again later.', 'Outlook good.', "Don't count on it.", 'It is certain.', 'Very doubtful.', 'Without a doubt.'];
const RIDDLES = [
  { q: 'What has keys but can\'t open locks?', a: 'A piano' },
  { q: 'What gets wetter the more it dries?', a: 'A towel' },
  { q: 'What has hands but cannot clap?', a: 'A clock' },
  { q: 'The more you take, the more you leave behind. What am I?', a: 'Footsteps' },
  { q: 'What can travel around the world while staying in a corner?', a: 'A stamp' },
  { q: 'What has a head and a tail but no body?', a: 'A coin' },
];
const HANGMAN_WORDS = ['javascript','whatsapp','mikasa','baileys','telegram','africa','python','kingdom','server','keyboard','channel','library','network','survey','titan'];
const BADWORDS = /\b(fuck|fucking|shit|bitch|asshole|bastard|cunt|dick|putain|merde|connard|connasse|salope|encul[eé]|pute)\b/i;
const games = { hangman: new Map(), guess: new Map(), math: new Map(), riddle: new Map() };

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-BIO TIMER
// ─────────────────────────────────────────────────────────────────────────────
let _bioTimer = null;
let _bioSock = null;
function syncBio(natsu, on, prefix) {
  if (!on) { if (_bioTimer) { clearInterval(_bioTimer); _bioTimer = null; _bioSock = null; } return; }
  if (_bioTimer && _bioSock === natsu) return;
  if (_bioTimer) clearInterval(_bioTimer);
  _bioSock = natsu;
  const tick = async () => {
    try { await natsu.updateProfileStatus(`🤖 ${BOT_NAME} ${BOT_VERSION} • up ${fmtUptime(process.uptime())} • prefix ${prefix}`); } catch {}
  };
  tick();
  _bioTimer = setInterval(tick, 60_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────
export async function handleCommand(natsu, msg) {
  frameSocket(natsu);
  const jid = msg.key?.remoteJid;
  if (!jid) return;

  const state = getState();
  const senderJid = senderOf(msg);
  const senderNum = numOf(senderJid);
  const altNum = numOf(msg.key.participantAlt || msg.key.remoteJidAlt || '');
  const botNum = numOf(natsu.user?.id);
  const isCreator = !!msg.key.fromMe || [senderNum, altNum].some((n) => n && (n === OWNER_NUMBER || n === botNum || state.sudo.includes(n)));
  const P = state.prefix || PREFIX;

  syncBio(natsu, state.autobio, P);

  // Auto-read / auto-view status
  if (state.autoread && jid !== 'status@broadcast') { try { await natsu.readMessages([msg.key]); } catch {} }
  if (jid === 'status@broadcast') {
    if (state.autoviewsts) { try { await natsu.readMessages([msg.key]); } catch {} }
    return; // never treat a status as a command
  }
  // Auto-react
  if (state.autoreact && !msg.key.fromMe) {
    try { await natsu.sendMessage(jid, { react: { text: RAND(['🗡️', '✨', '💫', '🔥', '⚡', '💖', '🩸']), key: msg.key } }); } catch {}
  }

  const text = getMessageText(msg);
  if (!text) return;

  // ── AFK
  try {
    if (state.afks?.[senderJid]) {
      const info = state.afks[senderJid];
      updateState((s) => { delete s.afks[senderJid]; });
      await natsu.sendMessage(jid, {
        text: `👋 Welcome back @${senderNum}!\nYou were AFK for ${Math.floor((Date.now() - info.since) / 60000)} min (${info.reason || 'no reason'}).`,
        mentions: [senderJid], contextInfo: forwardedContext(),
      }, { quoted: msg });
    }
    for (const mj of ctxInfo(msg).mentionedJid || []) {
      const info = state.afks?.[mj];
      if (info) {
        await natsu.sendMessage(jid, {
          text: `💤 @${numOf(mj)} is AFK — *${info.reason || 'no reason'}*`,
          mentions: [mj], contextInfo: forwardedContext(),
        }, { quoted: msg });
      }
    }
  } catch {}

  // ── prefix detection
  const prefixes = new Set([P, ...PREFIXES]);
  let usedPrefix = false;
  let raw = text;
  if (prefixes.has(raw[0])) { raw = raw.slice(1).trim(); usedPrefix = true; }
  const firstWord = raw.split(/\s+/)[0]?.toLowerCase() || '';
  const noPrefixMatch = !usedPrefix && KNOWN_CMDS.has(firstWord);

  // ── not a command → moderation filters
  if (!usedPrefix && !noPrefixMatch) {
    if (isGroup(jid) && !msg.key.fromMe && (state.antilink[jid] || state.badwords[jid])) {
      const LINK_RE = /(https?:\/\/\S+|www\.\S+|wa\.me\/\S+|t\.me\/\S+|chat\.whatsapp\.com\/\S+)/i;
      const hitLink = state.antilink[jid] && LINK_RE.test(text);
      const hitBad  = state.badwords[jid] && BADWORDS.test(text);
      if (hitLink || hitBad) {
        const { admins } = await getGroupAdmins(natsu, jid);
        if (!isGroupAdmin(admins, senderJid) && !isCreator) {
          try { await natsu.sendMessage(jid, { delete: msg.key }); } catch (e) { console.log(`⚠️ delete failed: ${e.message}`); }
          if (hitLink) {
            try { await natsu.groupParticipantsUpdate(jid, [senderJid], 'remove'); } catch (e) { console.log(`⚠️ kick failed: ${e.message}`); }
            return natsu.sendMessage(jid, { text: `⛔ @${senderNum} posted a link — removed.`, mentions: [senderJid], contextInfo: forwardedContext() });
          }
          return natsu.sendMessage(jid, { text: `🚫 @${senderNum} watch your language.`, mentions: [senderJid], contextInfo: forwardedContext() });
        }
      }
    }
    return;
  }

  const parts = raw.split(/\s+/);
  let cmd = (parts[0] || '').toLowerCase();
  if (!cmd) return;
  cmd = ALIASES[cmd] || cmd;
  const arg  = parts.slice(1).join(' ').trim();
  const args = parts.slice(1);

  // private mode: only owner/sudo in private chats
  if (state.mode === 'self' && !isGroup(jid) && !isCreator) return;
  if (state.banned.includes(senderNum) && !isCreator) return;

  // typing / recording presence
  if (state.autotyping) { try { await natsu.sendPresenceUpdate('composing', jid); } catch {} }
  else if (state.autorecord) { try { await natsu.sendPresenceUpdate('recording', jid); } catch {} }

  // ── helpers bound to this message
  const reply = (t) => sendText(natsu, jid, t, msg);
  const img   = (u, c) => sendImage(natsu, jid, u, c, msg);
  const usage = (s) => reply(`❌ Usage: *${P}${s}*`);
  const react = async (e) => { try { await natsu.sendMessage(jid, { react: { text: e, key: msg.key } }); } catch {} };
  const fake  = (t) => ({ key: msg.key, message: { conversation: t }, pushName: msg.pushName });
  const ownerOnly = async () => { if (isCreator) return true; await reply('❌ Owner only.'); return false; };
  const adminOnly = async () => {
    if (!isGroup(jid)) { await reply('❌ Groups only.'); return null; }
    const g = await getGroupAdmins(natsu, jid);
    if (!isCreator && !isGroupAdmin(g.admins, senderJid)) { await reply('❌ Admins only.'); return null; }
    return g;
  };
  const toggleArg = () => (/^(on|1|true|enable|yes)$/i.test(arg) ? true : /^(off|0|false|disable|no)$/i.test(arg) ? false : null);
  const downloadFail = async (name, e) => {
    await react('❌');
    await reply(card(`${name} FAILED`, [`⚠️ ${e?.message || 'All servers unavailable.'}`, 'Try again in a moment.']));
  };

  try {
    switch (cmd) {

      // ═════════════════════════ GROUP ═════════════════════════
      case 'add': case 'kick': case 'promote': case 'demote': {
        const g = await adminOnly(); if (!g) break;
        const target = resolveTarget(msg, arg);
        if (!target) { await usage(`${cmd} @user | number | reply`); break; }
        const action = cmd === 'kick' ? 'remove' : cmd;
        try {
          const res = await natsu.groupParticipantsUpdate(jid, [target], action);
          const st = String(res?.[0]?.status || '200');
          invalidateGroupCache(jid);
          if (st === '200') await natsu.sendMessage(jid, { text: `✅ ${cmd} → @${numOf(target)}`, mentions: [target], contextInfo: forwardedContext() }, { quoted: msg });
          else if (st === '403') await reply(`⚠️ Cannot add +${numOf(target)} (privacy settings). Send them the group link: *${P}link*`);
          else if (st === '409') await reply('ℹ️ Already in the group.');
          else await reply(`❌ ${cmd} failed (status ${st}). Is the bot admin?`);
        } catch (e) { await reply(`❌ ${cmd} failed: ${e.message}. Is the bot admin?`); }
        break;
      }
      case 'tagall': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        const { meta } = await getGroupAdmins(natsu, jid); if (!meta) break;
        const mentions = meta.participants.map((p) => p.id);
        const txt = card('TAG ALL', [`📢 ${arg || 'Attention everyone!'}`, '', ...mentions.map((m, i) => `${i + 1}. @${numOf(m)}`)]);
        await natsu.sendMessage(jid, { text: txt, mentions, contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'hidetag': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        const { meta } = await getGroupAdmins(natsu, jid); if (!meta) break;
        await natsu.sendMessage(jid, { text: arg || '📢', mentions: meta.participants.map((p) => p.id), contextInfo: forwardedContext() });
        break;
      }
      case 'tagadmins': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        const { admins } = await getGroupAdmins(natsu, jid);
        if (!admins.length) { await reply('❌ No admins found.'); break; }
        const txt = card('ADMINS', [...admins.map((a) => `▹ @${numOf(a)}`), ...(arg ? ['', `💬 ${arg}`] : [])]);
        await natsu.sendMessage(jid, { text: txt, mentions: admins, contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'mute': case 'unmute': {
        const g = await adminOnly(); if (!g) break;
        try {
          await natsu.groupSettingUpdate(jid, cmd === 'mute' ? 'announcement' : 'not_announcement');
          await reply(cmd === 'mute' ? '🔇 Group muted — only admins can send messages.' : '🔊 Group unmuted — everyone can send messages.');
        } catch (e) { await reply(`❌ ${e.message}. Is the bot admin?`); }
        break;
      }
      case 'antilink': case 'antibadword': {
        const g = await adminOnly(); if (!g) break;
        const key = cmd === 'antilink' ? 'antilink' : 'badwords';
        const v = toggleArg();
        if (v === null) { await reply(`ℹ️ ${cmd} is *${state[key][jid] ? 'ON' : 'OFF'}* here.\nUse *${P}${cmd} on* / *${P}${cmd} off*`); break; }
        updateState((s) => { s[key][jid] = v; });
        await reply(`🛡️ ${cmd} *${v ? 'enabled' : 'disabled'}* in this group.`);
        break;
      }
      case 'welcome': {
        const g = await adminOnly(); if (!g) break;
        const v = toggleArg();
        const cur = state.welcome[jid] !== false;
        if (v === null) { await reply(`ℹ️ Welcome/goodbye is *${cur ? 'ON' : 'OFF'}* here.\nUse *${P}welcome on* / *${P}welcome off*`); break; }
        updateState((s) => { s.welcome[jid] = v; });
        await reply(`👋 Welcome/goodbye *${v ? 'enabled' : 'disabled'}* in this group.`);
        break;
      }
      case 'groupinfo': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        const { meta, admins } = await getGroupAdmins(natsu, jid); if (!meta) { await reply('❌ Cannot read group info.'); break; }
        const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString('en-GB') : 'N/A';
        const txt = card('GROUP INFO', [
          row('NAME', meta.subject), row('MEMBERS', meta.participants.length), row('ADMINS', admins.length),
          row('CREATED', created), row('ID', jid), '', `📝 ${(meta.desc || 'No description').slice(0, 400)}`,
        ], true);
        const pp = await getProfilePic(natsu, jid);
        if (pp) await natsu.sendMessage(jid, { image: { url: pp }, caption: txt, contextInfo: forwardedContext() }, { quoted: msg });
        else await reply(txt);
        break;
      }
      case 'groupname': {
        const g = await adminOnly(); if (!g) break;
        if (!arg) { await usage('groupname <new name>'); break; }
        try { await natsu.groupUpdateSubject(jid, arg.slice(0, 100)); invalidateGroupCache(jid); await reply('✅ Group name updated.'); }
        catch (e) { await reply(`❌ ${e.message}. Is the bot admin?`); }
        break;
      }
      case 'setgdesc': {
        const g = await adminOnly(); if (!g) break;
        if (!arg) { await usage('setgdesc <description>'); break; }
        try { await natsu.groupUpdateDescription(jid, arg.slice(0, 500)); invalidateGroupCache(jid); await reply('✅ Group description updated.'); }
        catch (e) { await reply(`❌ ${e.message}. Is the bot admin?`); }
        break;
      }
      case 'link': {
        const g = await adminOnly(); if (!g) break;
        try { const code = await natsu.groupInviteCode(jid); await reply(`🔗 https://chat.whatsapp.com/${code}`); }
        catch (e) { await reply(`❌ ${e.message}. Is the bot admin?`); }
        break;
      }
      case 'resetlink': {
        const g = await adminOnly(); if (!g) break;
        try { const code = await natsu.groupRevokeInvite(jid); await reply(`✅ New link:\nhttps://chat.whatsapp.com/${code}`); }
        catch (e) { await reply(`❌ ${e.message}. Is the bot admin?`); }
        break;
      }
      case 'listadmin': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        const { admins } = await getGroupAdmins(natsu, jid);
        await reply(card(`ADMINS (${admins.length})`, admins.map((a, i) => `${i + 1}. +${numOf(a)}`)));
        break;
      }
      case 'left': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        if (!(await ownerOnly())) break;
        await reply('👋 Leaving the group…');
        try { await natsu.groupLeave(jid); } catch {}
        break;
      }
      case 'warn': {
        const g = await adminOnly(); if (!g) break;
        const target = resolveTarget(msg, '');
        if (!target) { await usage('warn (reply or @mention)'); break; }
        let kicked = false, count = 0;
        updateState((s) => {
          s.warns[jid] ??= {};
          s.warns[jid][target] = (s.warns[jid][target] || 0) + 1;
          count = s.warns[jid][target];
          if (count >= 3) { kicked = true; delete s.warns[jid][target]; }
        });
        if (kicked) {
          try { await natsu.groupParticipantsUpdate(jid, [target], 'remove'); } catch {}
          await natsu.sendMessage(jid, { text: `⛔ @${numOf(target)} removed (3/3 warns).`, mentions: [target], contextInfo: forwardedContext() });
        } else {
          await natsu.sendMessage(jid, { text: `⚠️ @${numOf(target)} warned (${count}/3). ${arg || ''}`, mentions: [target], contextInfo: forwardedContext() }, { quoted: msg });
        }
        break;
      }
      case 'warns': {
        if (!isGroup(jid)) { await reply('❌ Groups only.'); break; }
        const entries = Object.entries(state.warns[jid] || {});
        if (!entries.length) { await reply('✅ No warns in this group.'); break; }
        await natsu.sendMessage(jid, {
          text: card('WARNS', entries.map(([u, c]) => `▹ @${numOf(u)} → ${c}/3`)),
          mentions: entries.map(([u]) => u), contextInfo: forwardedContext(),
        }, { quoted: msg });
        break;
      }
      case 'resetwarn': {
        const g = await adminOnly(); if (!g) break;
        const target = resolveTarget(msg, '');
        updateState((s) => { if (target) { if (s.warns[jid]) delete s.warns[jid][target]; } else s.warns[jid] = {}; });
        await reply(`✅ Warns reset${target ? ` for @${numOf(target)}` : ' for the whole group'}.`);
        break;
      }
      case 'opentime': case 'closetime': {
        const g = await adminOnly(); if (!g) break;
        const mins = parseInt(arg, 10) || 0;
        if (mins < 1 || mins > 1440) { await usage(`${cmd} <minutes 1-1440>`); break; }
        await reply(`⏰ Group will ${cmd === 'opentime' ? 'open' : 'close'} in *${mins} min*.`);
        setTimeout(async () => {
          try {
            await natsu.groupSettingUpdate(jid, cmd === 'opentime' ? 'not_announcement' : 'announcement');
            await natsu.sendMessage(jid, { text: cmd === 'opentime' ? '🔊 Group is now open.' : '🔇 Group is now closed.', contextInfo: forwardedContext() });
          } catch {}
        }, mins * 60000);
        break;
      }
      case 'vcf': {
        const g = await adminOnly(); if (!g) break;
        let vcf = '';
        g.meta?.participants.forEach((p, i) => {
          const num = numOf(p.id);
          vcf += `BEGIN:VCARD\nVERSION:3.0\nFN:Member ${i + 1}\nTEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD\n`;
        });
        if (!vcf) { await reply('❌ Cannot read members.'); break; }
        await natsu.sendMessage(jid, { document: Buffer.from(vcf), fileName: `${(g.meta.subject || 'group').slice(0, 30)}.vcf`, mimetype: 'text/vcard', contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'join': {
        if (!(await ownerOnly())) break;
        if (!arg.includes('chat.whatsapp.com/')) { await usage('join <group link>'); break; }
        const code = arg.split('chat.whatsapp.com/').pop().split(/[?\s]/)[0];
        try { await natsu.groupAcceptInvite(code); await reply('✅ Joined the group!'); }
        catch (e) { await reply(`❌ ${e.message}`); }
        break;
      }

      // ═════════════════════════ OWNER ═════════════════════════
      case 'self': case 'public': {
        if (!(await ownerOnly())) break;
        updateState((s) => { s.mode = cmd; });
        await reply(`✅ Mode → *${cmd}*${cmd === 'self' ? '\n(private chats: owner only — groups stay open)' : ''}`);
        break;
      }
      case 'ban': case 'unban': {
        if (!(await ownerOnly())) break;
        const t = resolveTarget(msg, arg);
        if (!t) { await usage(`${cmd} <number> | @user | reply`); break; }
        const n = numOf(t);
        updateState((s) => { s.banned = cmd === 'ban' ? [...new Set([...s.banned, n])] : s.banned.filter((x) => x !== n); });
        await reply(`✅ ${cmd} → +${n}`);
        break;
      }
      case 'block': case 'unblock': {
        if (!(await ownerOnly())) break;
        const t = resolveTarget(msg, arg) || (!isGroup(jid) ? jid : null);
        if (!t) { await usage(`${cmd} <number> | @user | reply`); break; }
        try { await natsu.updateBlockStatus(t, cmd); await reply(`✅ ${cmd} → +${numOf(t)}`); }
        catch (e) { await reply(`❌ ${e.message}`); }
        break;
      }
      case 'addsudo': case 'delsudo': {
        if (!(await ownerOnly())) break;
        const t = resolveTarget(msg, arg);
        if (!t) { await usage(`${cmd} <number> | @user | reply`); break; }
        const n = numOf(t);
        updateState((s) => { s.sudo = cmd === 'addsudo' ? [...new Set([...s.sudo, n])] : s.sudo.filter((x) => x !== n); });
        await reply(`✅ ${cmd} → +${n}`);
        break;
      }
      case 'listsudo': {
        if (!(await ownerOnly())) break;
        await reply(card(`SUDO (${state.sudo.length})`, state.sudo.length ? state.sudo.map((n) => `▹ +${n}`) : ['(empty)']));
        break;
      }
      case 'autoread': case 'autotyping': case 'autorecording': case 'autoreact': case 'autoviewstatus': case 'autobio': {
        if (!(await ownerOnly())) break;
        const key = { autoread: 'autoread', autotyping: 'autotyping', autorecording: 'autorecord', autoreact: 'autoreact', autoviewstatus: 'autoviewsts', autobio: 'autobio' }[cmd];
        const v = toggleArg();
        if (v === null) { await reply(`ℹ️ ${cmd} is *${state[key] ? 'ON' : 'OFF'}*\nUse *${P}${cmd} on* / *${P}${cmd} off*`); break; }
        updateState((s) => { s[key] = v; });
        if (key === 'autobio') syncBio(natsu, v, P);
        await reply(`✅ ${cmd} → *${v ? 'ON' : 'OFF'}*`);
        break;
      }
      case 'broadcast': {
        if (!(await ownerOnly())) break;
        if (!arg) { await usage('broadcast <message>'); break; }
        await reply('📢 Broadcasting…');
        try {
          const chats = await natsu.groupFetchAllParticipating();
          let ok = 0;
          for (const id of Object.keys(chats)) {
            try {
              await natsu.sendMessage(id, { text: card('BROADCAST', [arg]) + `\n\n> ${BOT_NAME} • ${DEV_NAME}`, contextInfo: forwardedContext() });
              ok++; await sleep(1500);
            } catch {}
          }
          await reply(`✅ Sent to ${ok} group(s).`);
        } catch (e) { await reply(`❌ ${e.message}`); }
        break;
      }
      case 'restart': {
        if (!(await ownerOnly())) break;
        await reply('♻️ Restarting…');
        setTimeout(() => process.exit(0), 800);
        break;
      }
      case 'setpp': {
        if (!(await ownerOnly())) break;
        try {
          const q = quotedOf(msg);
          let buf = MENU_BUFFER;
          if (q?.message?.imageMessage) {
            const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
            buf = await downloadMediaMessage({ key: { remoteJid: jid, id: q.stanzaId, participant: q.participant }, message: q.message }, 'buffer', {});
          }
          if (!buf) throw new Error('Reply to an image (or put menu.jpg next to commands.js).');
          await natsu.updateProfilePicture(natsu.user.id, buf);
          await reply('✅ Bot profile picture updated.');
        } catch (e) { await reply(`❌ ${e.message}`); }
        break;
      }

      // ═════════════════════════ GENERAL ═════════════════════════
      case 'menu': {
        const userName = msg.pushName || senderNum;
        const pkg = (args[0] || '').toLowerCase();
        const menuText = pkg === 'all' ? buildFullMenu(userName) : buildMenu(userName, pkg);
        // Link-preview card: big image on top, "BOT • Online" + "Type .menu <package> for more"
        const ctx = {
          ...newsletterContext(),
          externalAdReply: {
            title: `${serif(BOT_NAME)} • Online`,
            body: `Type ${P}menu <package> for more`,
            ...(MENU_BUFFER ? { thumbnail: MENU_BUFFER } : {}),
            sourceUrl: WA_CHANNELS[0] || OWNER_WA,
            mediaType: 1,
            renderLargerThumbnail: true,
            showAdAttribution: false,
          },
        };
        // 3 buttons under the menu: Dev / List / Repo (quick replies → run the command)
        const btn = (text, id) => ({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) });
        const buttons = [btn('😌 Dev', `${P}owner`), btn('📜 List', `${P}menu all`), btn('📡 Repo', `${P}repo`)];
        try {
          const { generateWAMessageFromContent, proto } = await import('@whiskeysockets/baileys');
          const content = generateWAMessageFromContent(jid, {
            viewOnceMessage: { message: {
              messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
              interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: menuText }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: `Made with love by ${BOT_NAME}` }),
                header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
                contextInfo: ctx,
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons }),
              }),
            } },
          }, { quoted: msg });
          await natsu.relayMessage(jid, content.message, {
            messageId: content.key.id,
            additionalNodes: [{ tag: 'biz', attrs: {}, content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }] }],
          });
        } catch (e) {
          console.log(`⚠️ buttons failed (${e.message}) — sending plain menu`);
          try { await natsu.sendMessage(jid, { text: menuText, contextInfo: ctx }, { quoted: msg }); }
          catch { await natsu.sendMessage(jid, { text: menuText }); }
        }
        break;
      }
      case 'ping': {
        const ts = Number(msg.messageTimestamp) || 0;
        const lat = ts ? Math.max(0, Date.now() - ts * 1000) : 0;
        await reply(card('PONG', [row('SPEED', `${lat} ms`), row('UPTIME', fmtUptime(process.uptime())), row('BOT', `${BOT_NAME} ${BOT_VERSION}`)], true));
        break;
      }
      case 'alive': {
        const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        await img(MENU_IMAGE, card('ALIVE', [
          `🟢 ${BOT_NAME} is online`, row('UPTIME', fmtUptime(process.uptime())), row('MEMORY', `${mem} MB`),
          row('PREFIX', P), row('MODE', state.mode), row('CMDS', TOTAL_CMDS),
        ], true) + `\n\n> Powered by ${DEV_NAME}`);
        break;
      }
      case 'runtime': {
        const ramPct = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
        await reply(card('RUNTIME', [row('UPTIME', fmtUptime(process.uptime())), row('RAM', `${ramPct}%`), row('NODE', process.version)]));
        break;
      }
      case 'owner': {
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${OWNER_NAME}\nTEL;type=CELL;type=VOICE;waid=${OWNER_NUMBER}:+${OWNER_NUMBER}\nEND:VCARD`;
        await natsu.sendMessage(jid, { contacts: { displayName: OWNER_NAME, contacts: [{ vcard }] } }, { quoted: msg });
        break;
      }
      case 'repo': {
        await reply(card('REPO', [row('BOT', `${BOT_NAME} ${BOT_VERSION}`), row('GITHUB', REPO_URL), row('DEV', DEV_NAME)]));
        break;
      }
      case 'info': {
        await img(MENU_IMAGE, card('INFO', [
          row('BOT', `${BOT_NAME} ${BOT_VERSION}`), row('DEV', DEV_NAME), row('LIBRARY', 'Baileys'),
          row('NODE', process.version), row('PLATFORM', `${os.platform()} ${os.arch()}`),
          row('UPTIME', fmtUptime(process.uptime())), row('CMDS', TOTAL_CMDS),
        ], true));
        break;
      }
      case 'jid': {
        await reply(card('JID', [row('CHAT', jid), row('USER', senderJid)]));
        break;
      }
      case 'support': {
        const lines = [row('OWNER', OWNER_WA)];
        if (OWNER_TG) lines.push(row('TELEGRAM', OWNER_TG));
        WA_CHANNELS.forEach((l, i) => lines.push(row(`CHANNEL ${i + 1}`, l)));
        WA_GROUPS.forEach((l, i) => lines.push(row(`GROUP ${i + 1}`, l)));
        lines.push(row('GITHUB', OWNER_GITHUB));
        await reply(card('SUPPORT', lines));
        break;
      }
      case 'pair': {
        const phone = arg.replace(/\D/g, '');
        if (!phone) {
          await reply(card('PAIR', [`📌 Usage: *${P}pair 1829xxxxxxx*`, '▹ International format, no +, no leading 0', '▹ You will get an 8-character code', '▹ WhatsApp → Linked Devices → Link a device', '▹ Use phone number → enter the code']));
          break;
        }
        if (phone.length < 7 || phone.length > 15 || phone.startsWith('0')) { await reply('❌ Invalid number. Use international format, no + and no leading 0.'); break; }
        await reply(`⏳ Generating pairing code for *+${phone}*…`);
        try {
          const { createSession } = await import('./whatsapp.js');
          const { code } = await createSession(phone);
          if (code) await reply(card('PAIRING CODE', [row('NUMBER', `+${phone}`), row('CODE', `*${code}*`), row('EXPIRES', '2 minutes'), '', 'WhatsApp → Settings → Linked Devices', 'Link a Device → Use phone number', `Enter: *${code}*`], true));
          else await reply(`✅ *+${phone}* is already connected to ${BOT_NAME}!`);
        } catch (e) { await reply(`❌ ${e.message}`); }
        break;
      }

      // ═════════════════════════ SYSTEM ═════════════════════════
      case 'setprefix': {
        if (!(await ownerOnly())) break;
        const np = arg[0];
        if (!np) { await usage('setprefix <character>'); break; }
        updateState((s) => { s.prefix = np; });
        await reply(`✅ Main prefix → *${np}*\n(other prefixes stay active: ${PREFIXES.join(' ')})`);
        break;
      }
      case 'prefix': { await reply(card('PREFIX', [row('MAIN', P), row('ALSO WORKS', PREFIXES.join('  '))])); break; }
      case 'mode':   { await reply(card('MODE', [row('CURRENT', state.mode.toUpperCase()), `Use *${P}self* / *${P}public* (owner)`])); break; }

      // ═════════════════════════ AI ═════════════════════════
      case 'ai': case 'gpt': case 'gemini': case 'deepseek': {
        if (!arg) { await usage(`${cmd} <question>`); break; }
        await react('🤖');
        const ans = await askAI(arg, cmd === 'ai' ? 'gpt' : cmd);
        if (!ans) { await reply('🤖 The AI is busy. Try again in a moment.'); break; }
        await reply(card(cmd.toUpperCase(), [ans.slice(0, 3500)]));
        break;
      }
      case 'codeai': {
        if (!arg) { await usage('codeai <task>'); break; }
        await react('💻');
        const ans = await askAI(`You are a senior software engineer. Write clean, working code for: ${arg}`, 'code');
        await reply(ans ? `💻 *CODE AI*\n\n${ans.slice(0, 3500)}` : '🤖 The AI is busy. Try again in a moment.');
        break;
      }
      case 'storyai': {
        if (!arg) { await usage('storyai <theme>'); break; }
        await react('📖');
        const ans = await askAI(`Write a short, engaging story (about 250 words) about: ${arg}`, 'story');
        await reply(ans ? card('STORY', [ans.slice(0, 3500)]) : '🤖 The AI is busy. Try again in a moment.');
        break;
      }
      case 'imagine': {
        if (!arg) { await usage('imagine <description>'); break; }
        await react('🎨');
        await img(`https://image.pollinations.ai/prompt/${encodeURIComponent(arg)}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 99999)}`,
          card('IMAGINE', [`📝 ${arg}`], true));
        break;
      }
      case 'translate': {
        const m = arg.match(/^([a-z]{2}(?:-[A-Za-z]{2})?)\s+([\s\S]+)/);
        if (!m) { await usage('translate <lang> <text>  (ex: translate fr Hello)'); break; }
        const [, lang, txt] = m;
        let out = null;
        try {
          const r = await axios.get('https://translate.googleapis.com/translate_a/single', { params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: txt }, timeout: 8000 });
          out = (r.data?.[0] || []).map((x) => x[0]).join('');
        } catch {}
        if (!out) { const d = await tryFetch([`https://api.popcat.xyz/translate?to=${lang}&text=${encodeURIComponent(txt)}`]); out = d?.translated; }
        await reply(out ? card('TRANSLATE', [row('TO', lang), `💬 ${out}`]) : '❌ Translation failed.');
        break;
      }

      // ═════════════════════════ DOWNLOAD ═════════════════════════
      case 'play': {
        if (!arg) { await usage('play <song name or YouTube link>'); break; }
        await react('🎧');
        try { await playCommand(natsu, jid, fake(`play ${arg}`)); await react('✅'); }
        catch (e) { await downloadFail('PLAY', e); }
        break;
      }
      case 'video': {
        if (!arg) { await usage('video <name or YouTube link>'); break; }
        await react('⏳');
        try { await videoCommand(natsu, jid, fake(`video ${arg}`)); await react('✅'); }
        catch (e) { await downloadFail('VIDEO', e); }
        break;
      }
      case 'tiktok': {
        if (!arg) { await usage('tiktok <link>'); break; }
        await react('⏳');
        try { await tiktokCommand(natsu, jid, fake(`tiktok ${arg}`)); await react('✅'); }
        catch (e) { await downloadFail('TIKTOK', e); }
        break;
      }
      case 'instagram': {
        if (!arg) { await usage('instagram <link>'); break; }
        await react('⏳');
        try { await instagramCommand(natsu, jid, fake(`instagram ${arg}`)); await react('✅'); }
        catch (e) { await downloadFail('INSTAGRAM', e); }
        break;
      }
      case 'facebook': {
        if (!arg) { await usage('facebook <link>'); break; }
        if (!/facebook\.com|fb\.watch|fb\.com/i.test(arg)) { await reply('❌ Please send a real Facebook link.'); break; }
        await react('⏳');
        try {
          const data = await downloadFb(arg);
          const thumb = data.thumbnail ? await _fetchThumb(data.thumbnail) : undefined;
          await natsu.sendMessage(jid, {
            video: { url: data.url }, mimetype: 'video/mp4',
            caption: card('FACEBOOK', [row('STATUS', '✅ Success'), row('BOT', BOT_NAME), row('FOR', `@${senderNum}`)], true),
            mentions: [senderJid], jpegThumbnail: thumb, contextInfo: forwardedContext(),
          }, { quoted: msg });
          await react('✅');
        } catch (e) { await downloadFail('FACEBOOK', e); }
        break;
      }
      case 'apk': {
        if (!arg) { await usage('apk <app name>'); break; }
        await react('⏳');
        const d = await tryFetch([`https://api.giftedtech.web.id/api/download/apkdl?apikey=gifted&appName=${encodeURIComponent(arg)}`]);
        const r = d?.result;
        if (!r?.dllink) { await react('❌'); await reply('❌ App not found.'); break; }
        const cap = card('APK', [row('NAME', r.name), row('SIZE', r.size || 'N/A'), row('BOT', BOT_NAME)], true);
        try {
          await natsu.sendMessage(jid, { document: { url: r.dllink }, fileName: `${r.name}.apk`, mimetype: 'application/vnd.android.package-archive', caption: cap, contextInfo: forwardedContext() }, { quoted: msg });
          await react('✅');
        } catch { await reply(`${cap}\n🔗 ${r.dllink}`); }
        break;
      }
      case 'mediafire': {
        if (!/mediafire\.com/i.test(arg)) { await usage('mediafire <mediafire link>'); break; }
        await react('⏳');
        const d = await tryFetch([`https://api.giftedtech.web.id/api/download/mediafire?apikey=gifted&url=${encodeURIComponent(arg)}`]);
        const r = d?.result || d;
        const url = _cleanUrl(r?.downloadUrl || r?.download_url || r?.download || r?.link || r?.url);
        if (!url) { await react('❌'); await reply('❌ Could not fetch this MediaFire link.'); break; }
        const name = r?.fileName || r?.filename || r?.name || 'mediafire-file';
        const cap = card('MEDIAFIRE', [row('FILE', name), row('SIZE', r?.fileSize || r?.size || 'N/A')], true);
        try {
          await natsu.sendMessage(jid, { document: { url }, fileName: name, mimetype: r?.mimetype || 'application/octet-stream', caption: cap, contextInfo: forwardedContext() }, { quoted: msg });
          await react('✅');
        } catch { await reply(`${cap}\n🔗 ${url}`); }
        break;
      }
      case 'pinterest': {
        if (!arg) { await usage('pinterest <pin link>'); break; }
        await react('⏳');
        const d = await tryFetch([`https://api.giftedtech.web.id/api/download/pinterestdl?apikey=gifted&url=${encodeURIComponent(arg)}`]);
        const r = d?.result || d;
        const url = _cleanUrl(r?.download_url || r?.dl_url || r?.video || r?.image || r?.url);
        if (!url) { await react('❌'); await reply('❌ Could not fetch this Pinterest link.'); break; }
        const cap = card('PINTEREST', [row('STATUS', '✅ Success'), row('BOT', BOT_NAME)], true);
        try {
          if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) await natsu.sendMessage(jid, { video: { url }, caption: cap, contextInfo: forwardedContext() }, { quoted: msg });
          else await natsu.sendMessage(jid, { image: { url }, caption: cap, contextInfo: forwardedContext() }, { quoted: msg });
          await react('✅');
        } catch { await reply(`${cap}\n🔗 ${url}`); }
        break;
      }
      case 'spotify': {
        if (!arg) { await usage('spotify <song name or link>'); break; }
        await react('⏳');
        const d = await tryFetch([
          `https://api.giftedtech.web.id/api/download/spotifydl?apikey=gifted&url=${encodeURIComponent(arg)}`,
          `https://api.giftedtech.web.id/api/search/spotify?apikey=gifted&query=${encodeURIComponent(arg)}`,
        ]);
        const r = d?.result || d;
        const url = _cleanUrl(r?.download_url || r?.audio || r?.url || r?.[0]?.url);
        if (!url) { await react('❌'); await reply('❌ Spotify download failed.'); break; }
        try {
          await natsu.sendMessage(jid, { audio: { url }, mimetype: 'audio/mpeg', fileName: `${r?.title || 'spotify'}.mp3`, contextInfo: forwardedContext() }, { quoted: msg });
          await react('✅');
        } catch { await reply(`🔗 ${url}`); }
        break;
      }
      case 'gitclone': {
        const m = arg.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
        if (!m) { await usage('gitclone <github repo link>'); break; }
        const repoName = m[2].replace(/\.git$/, '');
        const zip = `https://api.github.com/repos/${m[1]}/${repoName}/zipball`;
        await react('⏳');
        try {
          await natsu.sendMessage(jid, { document: { url: zip }, fileName: `${repoName}.zip`, mimetype: 'application/zip', caption: card('GITCLONE', [row('REPO', `${m[1]}/${repoName}`)], true), contextInfo: forwardedContext() }, { quoted: msg });
          await react('✅');
        } catch { await react('❌'); await reply(`🔗 ${zip}`); }
        break;
      }
      case 'lyrics': {
        if (!arg) { await usage('lyrics <song title>'); break; }
        let title = '', artist = '', lyrics = '';
        try {
          const r = await axios.get('https://lrclib.net/api/search', { params: { q: arg }, timeout: 8000 });
          const hit = (r.data || []).find((x) => x.plainLyrics);
          if (hit) { title = hit.trackName; artist = hit.artistName; lyrics = hit.plainLyrics; }
        } catch {}
        if (!lyrics) {
          const d = await tryFetch([`https://api.popcat.xyz/lyrics?song=${encodeURIComponent(arg)}`]);
          if (d?.lyrics) { title = d.title; artist = d.artist; lyrics = d.lyrics; }
        }
        await reply(lyrics ? `🎵 *${title}* — ${artist}\n\n${String(lyrics).slice(0, 3500)}` : '❌ Lyrics not found.');
        break;
      }
      case 'yts': {
        if (!arg) { await usage('yts <search>'); break; }
        const list = await ytSearchList(arg, 5);
        if (!list.length) { await reply('❌ Search failed. Try again later.'); break; }
        await reply(card('YOUTUBE', list.flatMap((v, i) => [
          `*${i + 1}. ${v.title}*`, `   👤 ${v.author} • ⏱️ ${Math.floor(v.seconds / 60)}:${String(v.seconds % 60).padStart(2, '0')}`, `   🔗 ${v.url}`, '',
        ]).slice(0, -1)));
        break;
      }

      // ═════════════════════════ FUN ═════════════════════════
      case 'truth':      { await reply(card('TRUTH', [RAND(TRUTHS)], true)); break; }
      case 'dare':       { await reply(card('DARE', [RAND(DARES)], true)); break; }
      case 'flirt':      { await reply(card('FLIRT', [RAND(FLIRTS)], true)); break; }
      case 'roast':      { await reply(card('ROAST', [`${arg ? `${arg}\n┃ ` : ''}${RAND(ROASTS)}`], true)); break; }
      case 'compliment': { await reply(card('COMPLIMENT', [`${arg ? `${arg}\n┃ ` : ''}${RAND(COMPS)}`], true)); break; }
      case 'wouldyou':   { await reply(card('WOULD YOU RATHER', [RAND(WYR)], true)); break; }
      case '8ball': {
        if (!arg) { await usage('8ball <question>'); break; }
        await reply(card('8-BALL', [`❓ ${arg}`, `🎱 ${RAND(BALL)}`], true)); break;
      }
      case 'rate': { await reply(card('RATE', [`${arg || 'You'} → *${Math.floor(Math.random() * 10) + 1}/10* ⭐`], true)); break; }
      case 'ship': {
        const ci = ctxInfo(msg);
        let a, b;
        if ((ci.mentionedJid || []).length >= 2) { a = `@${numOf(ci.mentionedJid[0])}`; b = `@${numOf(ci.mentionedJid[1])}`; }
        else { const p = arg.split(/\s+and\s+|\s+&\s+|\s*,\s*|\s+x\s+/i); if (p.length >= 2) { a = p[0]; b = p[1]; } }
        if (!a || !b) { await usage('ship NameA and NameB'); break; }
        const pct = Math.floor(Math.random() * 101);
        const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
        await natsu.sendMessage(jid, { text: card('SHIP', [`${a} ❤️ ${b}`, `[${bar}] *${pct}%*`], true), mentions: ci.mentionedJid || [], contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'character': {
        const t = resolveTarget(msg, arg) || senderJid;
        const traits = ['Kind', 'Brave', 'Funny', 'Smart', 'Loyal', 'Creative', 'Calm', 'Lucky', 'Charming', 'Mysterious'];
        const lines = traits.map((x) => `▹ ${x}: *${Math.floor(Math.random() * 61) + 40}%*`);
        await natsu.sendMessage(jid, { text: card('CHARACTER', [`👤 @${numOf(t)}`, '', ...lines], true), mentions: [t], contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'joke': {
        try { const r = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 6000 }); await reply(card('JOKE', [r.data.setup, `➜ ${r.data.punchline}`], true)); }
        catch { await reply(card('JOKE', [RAND(['Why did the dev quit? No arrays.', 'I told a UDP joke, you might not get it.', 'There are 10 kinds of people: those who understand binary and those who don\'t.'])], true)); }
        break;
      }
      case 'dadjoke': {
        try { const r = await axios.get('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' }, timeout: 6000 }); await reply(card('DAD JOKE', [r.data.joke], true)); }
        catch { await reply(card('DAD JOKE', ["I don't trust stairs. They're always up to something."], true)); }
        break;
      }
      case 'fact': {
        try { const r = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 6000 }); await reply(card('FACT', [r.data.text], true)); }
        catch { await reply(card('FACT', ['Octopuses have three hearts. 🐙'], true)); }
        break;
      }
      case 'quote': {
        try { const r = await axios.get('https://zenquotes.io/api/random', { timeout: 6000 }); await reply(card('QUOTE', [`"${r.data[0].q}"`, `— ${r.data[0].a}`], true)); }
        catch { await reply(card('QUOTE', ['"The best way out is always through."', '— Robert Frost'], true)); }
        break;
      }
      case 'meme': {
        try { const r = await axios.get('https://meme-api.com/gimme', { timeout: 7000 }); await img(r.data.url, card('MEME', [r.data.title], true)); }
        catch { await reply('❌ Meme unavailable right now.'); }
        break;
      }
      case 'cat': {
        try { const r = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 7000 }); await img(r.data[0].url, '🐱 Meow!'); }
        catch { await reply('❌ Cat unavailable right now.'); }
        break;
      }
      case 'dog': {
        try { const r = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 7000 }); await img(r.data.message, '🐶 Woof!'); }
        catch { await reply('❌ Dog unavailable right now.'); }
        break;
      }
      case 'riddle': {
        const old = games.riddle.get(jid);
        if (arg && old) {
          games.riddle.delete(jid);
          const ok = old.a.toLowerCase().includes(arg.toLowerCase()) || arg.toLowerCase().includes(old.a.toLowerCase().replace(/^an? /, ''));
          await reply(ok ? `🎉 Correct! *${old.a}*` : `❌ Wrong. The answer was: *${old.a}*`);
        } else {
          const r = RAND(RIDDLES);
          games.riddle.set(jid, r);
          await reply(card('RIDDLE', [r.q, '', `Answer with *${P}riddle <answer>*`], true));
        }
        break;
      }

      // ═════════════════════════ GAMES ═════════════════════════
      case 'rps': {
        const ch = ['rock', 'paper', 'scissors'];
        const u = arg.toLowerCase(), b = RAND(ch);
        if (!ch.includes(u)) { await usage('rps rock|paper|scissors'); break; }
        const win = (u === 'rock' && b === 'scissors') || (u === 'paper' && b === 'rock') || (u === 'scissors' && b === 'paper');
        await reply(card('RPS', [`👤 You: ${u}`, `🤖 Bot: ${b}`, `➜ *${u === b ? 'Draw' : win ? 'You win!' : 'Bot wins!'}*`], true));
        break;
      }
      case 'dice': { await reply(card('DICE', [`🎲 Result: *${Math.floor(Math.random() * 6) + 1}*`], true)); break; }
      case 'coin': { await reply(card('COIN', [`🪙 *${RAND(['Heads', 'Tails'])}*`], true)); break; }
      case 'guess': {
        const g = games.guess.get(jid);
        const n = parseInt(arg, 10);
        if (!g || Number.isNaN(n)) {
          games.guess.set(jid, { n: Math.floor(Math.random() * 100) + 1, tries: 0 });
          await reply(card('GUESS', ['🎯 I picked a number from 1 to 100.', `Guess with *${P}guess <number>*`], true));
          break;
        }
        g.tries++;
        if (n === g.n) { games.guess.delete(jid); await reply(`🎉 Correct! It was *${g.n}* (${g.tries} tries).`); }
        else await reply(`${n < g.n ? '⬆️ Higher' : '⬇️ Lower'}! (try ${g.tries})`);
        break;
      }
      case 'hangman': {
        const g = games.hangman.get(jid);
        if (arg.length === 1 && /[a-z]/i.test(arg)) {
          if (!g) { await reply(`❌ Start a game first: *${P}hangman*`); break; }
          const l = arg.toLowerCase();
          if (g.guessed.has(l)) { await reply('ℹ️ You already tried that letter.'); break; }
          g.guessed.add(l);
          if (!g.word.includes(l)) g.tries--;
          const masked = g.word.split('').map((c) => (g.guessed.has(c) ? c : '_')).join(' ');
          if (!masked.includes('_')) { games.hangman.delete(jid); await reply(`🎉 You won! Word: *${g.word}*`); break; }
          if (g.tries <= 0) { games.hangman.delete(jid); await reply(`💀 You lost. Word: *${g.word}*`); break; }
          await reply(card('HANGMAN', [masked, `❤️ Tries left: ${g.tries}`, `🔤 Used: ${[...g.guessed].join(' ')}`], true));
        } else {
          const word = RAND(HANGMAN_WORDS);
          games.hangman.set(jid, { word, guessed: new Set(), tries: 6 });
          await reply(card('HANGMAN', [word.split('').map(() => '_').join(' '), `Guess with *${P}hangman <letter>*`], true));
        }
        break;
      }
      case 'math': {
        const g = games.math.get(jid);
        if (arg && g) {
          games.math.delete(jid);
          await reply(Number(arg) === g.r ? `🎉 Correct! ${g.q} = ${g.r}` : `❌ Wrong. ${g.q} = ${g.r}`);
        } else {
          const a = Math.floor(Math.random() * 20) + 1, b = Math.floor(Math.random() * 20) + 1;
          const op = RAND(['+', '-', '*']);
          const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
          games.math.set(jid, { q: `${a} ${op} ${b}`, r });
          await reply(card('MATH', [`🧮 ${a} ${op} ${b} = ?`, `Answer with *${P}math <number>*`], true));
        }
        break;
      }

      // ═════════════════════════ TOOLS ═════════════════════════
      case 'weather': {
        if (!arg) { await usage('weather <city>'); break; }
        try {
          const r = await axios.get(`https://wttr.in/${encodeURIComponent(arg)}?format=j1`, { timeout: 8000 });
          const c = r.data.current_condition[0], a = r.data.nearest_area[0];
          await reply(card('WEATHER', [row('PLACE', `${a.areaName[0].value}, ${a.country[0].value}`), row('TEMP', `${c.temp_C}°C (feels ${c.FeelsLikeC}°C)`), row('SKY', c.weatherDesc[0].value), row('HUMIDITY', `${c.humidity}%`), row('WIND', `${c.windspeedKmph} km/h`)], true));
        } catch { await reply('❌ Weather unavailable for this place.'); }
        break;
      }
      case 'currency': {
        const m = arg.match(/^([\d.,]+)\s+([a-z]{3})\s+(?:to\s+)?([a-z]{3})$/i);
        if (!m) { await usage('currency 100 USD EUR'); break; }
        const amt = parseFloat(m[1].replace(',', '.')), from = m[2].toUpperCase(), to = m[3].toUpperCase();
        try {
          const r = await axios.get(`https://api.exchangerate-api.com/v4/latest/${from}`, { timeout: 8000 });
          const rate = r.data.rates?.[to];
          if (!rate) throw new Error('rate');
          await reply(card('CURRENCY', [`💱 ${amt} ${from} = *${(amt * rate).toFixed(2)} ${to}*`, row('RATE', `1 ${from} = ${rate} ${to}`)], true));
        } catch { await reply('❌ Rate unavailable (check the currency codes).'); }
        break;
      }
      case 'time': {
        const tz = arg || 'UTC';
        try {
          const s = new Date().toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
          await reply(card('TIME', [row('ZONE', tz), `🕐 ${s}`], true));
        } catch { await reply(`❌ Unknown time zone. Example: *${P}time Africa/Kinshasa*`); }
        break;
      }
      case 'qrcode': {
        if (!arg) { await usage('qrcode <text or link>'); break; }
        await img(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(arg)}`, card('QR CODE', [arg.slice(0, 200)], true));
        break;
      }
      case 'shorturl': {
        if (!_isUrl(arg)) { await usage('shorturl <link>'); break; }
        try { const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(arg)}`, { timeout: 8000 }); await reply(`🔗 ${r.data}`); }
        catch { await reply('❌ Could not shorten this link.'); }
        break;
      }
      case 'iplookup': {
        if (!arg) { await usage('iplookup <ip>'); break; }
        let d = null;
        try { d = (await axios.get(`https://ipapi.co/${encodeURIComponent(arg)}/json/`, { timeout: 8000 })).data; if (d?.error) d = null; } catch {}
        if (!d) { try { const r = (await axios.get(`http://ip-api.com/json/${encodeURIComponent(arg)}`, { timeout: 8000 })).data; if (r.status === 'success') d = { ip: r.query, city: r.city, region: r.regionName, country_name: r.country, org: r.isp, timezone: r.timezone }; } catch {} }
        await reply(d ? card('IP LOOKUP', [row('IP', d.ip), row('CITY', d.city), row('REGION', d.region), row('COUNTRY', d.country_name), row('ISP', d.org), row('ZONE', d.timezone)], true) : '❌ Lookup failed.');
        break;
      }
      case 'calc': {
        const expr = arg.replace(/\s+/g, '').replace(/x/gi, '*').replace(/\^/g, '**').replace(/,/g, '.');
        if (!expr || expr.length > 100 || !/^[0-9+\-*/().%]+$/.test(expr)) { await usage('calc 12*(3+4)'); break; }
        try {
          // eslint-disable-next-line no-new-func
          const v = Function(`"use strict"; return (${expr});`)();
          if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('bad');
          await reply(card('CALC', [`🧮 ${expr} = *${Number(v.toFixed(8))}*`], true));
        } catch { await reply('❌ Invalid expression.'); }
        break;
      }
      case 'dictionary': {
        if (!arg) { await usage('dictionary <english word>'); break; }
        try {
          const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(arg.split(' ')[0])}`, { timeout: 8000 });
          const e = r.data[0], mean = e.meanings[0], def = mean.definitions[0];
          await reply(card('DICTIONARY', [row('WORD', e.word), row('TYPE', mean.partOfSpeech), `📖 ${def.definition}`, ...(def.example ? [`💬 _${def.example}_`] : [])], true));
        } catch { await reply('❌ Word not found.'); }
        break;
      }
      case 'password': {
        const len = Math.min(Math.max(parseInt(arg, 10) || 14, 6), 40);
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
        let pw = '';
        for (let i = 0; i < len; i++) pw += chars[crypto.randomInt(chars.length)];
        await reply(card('PASSWORD', [`🔐 \`${pw}\``, row('LENGTH', len)], true));
        break;
      }
      case 'tts': {
        const langs = ['en', 'fr', 'es', 'pt', 'ar', 'ht', 'de', 'it', 'sw', 'hi', 'id', 'ru', 'ja', 'ko', 'tr', 'zh'];
        let lang = 'en', txt = arg;
        const first = args[0]?.toLowerCase();
        if (first && langs.includes(first) && args.length > 1) { lang = first; txt = args.slice(1).join(' '); }
        if (!txt) { await usage('tts [lang] <text>  (ex: tts fr bonjour)'); break; }
        try {
          const r = await axios.get(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(txt.slice(0, 200))}&tl=${lang}&client=tw-ob`, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
          await natsu.sendMessage(jid, { audio: Buffer.from(r.data), mimetype: 'audio/mpeg', ptt: true, contextInfo: forwardedContext() }, { quoted: msg });
        } catch (e) { await reply(`❌ TTS failed: ${e.message}`); }
        break;
      }
      case 'readmore': {
        if (!arg.includes('|')) { await usage('readmore visible text | hidden text'); break; }
        const [a, ...b] = arg.split('|');
        await natsu.sendMessage(jid, { text: `${a.trim()}${'\u200e'.repeat(4001)}${b.join('|').trim()}`, contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'github': {
        if (!arg) { await usage('github <username>'); break; }
        try {
          const u = (await axios.get(`https://api.github.com/users/${encodeURIComponent(arg)}`, { timeout: 8000 })).data;
          await img(u.avatar_url, card('GITHUB', [row('USER', u.login), row('NAME', u.name || 'N/A'), row('BIO', (u.bio || 'N/A').slice(0, 120)), row('REPOS', u.public_repos), row('FOLLOWERS', u.followers), row('FOLLOWING', u.following), row('JOINED', (u.created_at || '').slice(0, 10)), row('LINK', u.html_url)], true));
        } catch { await reply('❌ GitHub user not found.'); }
        break;
      }
      case 'npm': {
        if (!arg) { await usage('npm <package>'); break; }
        try {
          const p = (await axios.get(`https://registry.npmjs.org/${encodeURIComponent(arg.split(' ')[0])}/latest`, { timeout: 8000 })).data;
          await reply(card('NPM', [row('NAME', p.name), row('VERSION', p.version), row('LICENSE', p.license || 'N/A'), `📝 ${(p.description || 'No description').slice(0, 200)}`, row('LINK', `https://www.npmjs.com/package/${p.name}`)], true));
        } catch { await reply('❌ Package not found.'); }
        break;
      }
      case 'wiki': {
        if (!arg) { await usage('wiki <topic>'); break; }
        try {
          const r = (await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(arg.replace(/\s+/g, '_'))}`, { timeout: 8000 })).data;
          if (!r.extract) throw new Error('none');
          const cap = card('WIKI', [`📚 *${r.title}*`, '', r.extract.slice(0, 900), '', row('LINK', r.content_urls?.mobile?.page || r.content_urls?.desktop?.page || '')], true);
          if (r.thumbnail?.source) await img(r.thumbnail.source, cap); else await reply(cap);
        } catch { await reply('❌ No article found.'); }
        break;
      }
      case 'crypto': {
        const coin = (arg || 'bitcoin').toLowerCase().split(' ')[0];
        try {
          const r = await axios.get('https://api.coingecko.com/api/v3/simple/price', { params: { ids: coin, vs_currencies: 'usd,eur', include_24hr_change: true }, timeout: 8000 });
          const d = r.data[coin]; if (!d) throw new Error('none');
          await reply(card('CRYPTO', [row('COIN', coin.toUpperCase()), row('USD', `$${d.usd}`), row('EUR', `€${d.eur}`), row('24H', `${Number(d.usd_24h_change).toFixed(2)}%`)], true));
        } catch { await reply('❌ Coin not found (use the full name, ex: bitcoin, ethereum).'); }
        break;
      }
      case 'remind': {
        const m = arg.match(/^(\d+)\s*(s|m|h)\s+([\s\S]+)/i);
        if (!m) { await usage('remind 10m drink water  (s / m / h)'); break; }
        const ms = parseInt(m[1], 10) * ({ s: 1000, m: 60000, h: 3600000 }[m[2].toLowerCase()]);
        if (ms < 1000 || ms > 24 * 3600000) { await reply('❌ Choose between 1 second and 24 hours.'); break; }
        await reply(`⏰ Reminder set for *${m[1]}${m[2].toLowerCase()}*.\n(lost if the bot restarts)`);
        setTimeout(async () => {
          try { await natsu.sendMessage(jid, { text: `⏰ @${senderNum} reminder:\n${m[3]}`, mentions: [senderJid], contextInfo: forwardedContext() }, { quoted: msg }); } catch {}
        }, ms);
        break;
      }
      case 'afk': {
        updateState((s) => { s.afks[senderJid] = { reason: arg || 'no reason', since: Date.now() }; });
        await natsu.sendMessage(jid, { text: `💤 @${senderNum} is now AFK: *${arg || 'no reason'}*`, mentions: [senderJid], contextInfo: forwardedContext() }, { quoted: msg });
        break;
      }
      case 'getpp': {
        const t = resolveTarget(msg, arg) || senderJid;
        const url = await getProfilePic(natsu, t);
        if (!url) { await reply('❌ No profile picture available (hidden or not set).'); break; }
        await img(url, `📸 Profile picture of +${numOf(t)}`);
        break;
      }
      case 'vv': {
        if (!isCreator) { await reply('❌ Owner/sudo only.'); break; }
        try { await viewonceCommand(natsu, jid, msg, P); }
        catch (e) { await reply(`❌ ViewOnce failed: ${e.message || 'error'}`); }
        break;
      }

      default: break; // unknown command → silent
    }
  } catch (err) {
    console.error(`[cmd ${cmd}]`, err?.message || err);
    try { await reply(`❌ Error: ${err.message || 'unknown'}`); } catch {}
  }
}
