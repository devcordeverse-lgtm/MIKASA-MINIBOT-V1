/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ viewonce.js — reveal view-once media (.vv)
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { forwardedContext } from './commands.js';
import { cardF, row } from './style.js';

// ── helpers ──────────────────────────────────────────────────────────────────
// peel the wrappers WhatsApp puts around view-once / ephemeral messages
function unwrap(m) {
  let x = m;
  for (let i = 0; i < 5; i++) {
    const n =
      x?.ephemeralMessage?.message ||
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

// contextInfo of whatever message type it is (text, image, video…)
function ctxInfo(msg) {
  const m = unwrap(msg?.message) || {};
  for (const k of Object.keys(m)) {
    const c = m[k]?.contextInfo;
    if (c) return c;
  }
  return {};
}

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];

function findMedia(quotedMessage) {
  const m = unwrap(quotedMessage);
  if (!m) return null;
  const type = MEDIA_TYPES.find((t) => m[t]);
  return type ? { type, content: m[type], message: m } : null;
}

const botJid = (natsu) =>
  `${String(natsu.user?.id || '').split(':')[0].split('@')[0]}@s.whatsapp.net`;

// ── command ──────────────────────────────────────────────────────────────────
// Reply to a view-once photo / video / voice note with  .vv        → revealed in this chat
//                                                       .vv dm     → sent privately to the bot's own chat
export async function viewonceCommand(natsu, jid, msg, prefix = '.') {
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    '';
  const arg = text.trim().split(/\s+/).slice(1).join(' ').toLowerCase();
  const toDM = ['dm', 'pm', 'me', 'private'].includes(arg);

  const ci = ctxInfo(msg);
  if (!ci.quotedMessage) {
    await natsu.sendMessage(jid, {
      text: cardF('VIEW ONCE', [
        `📌 Reply to a view-once media with *${prefix}vv*`,
        `▹ *${prefix}vv* → reveal here`,
        `▹ *${prefix}vv dm* → send it to your DM`,
      ]),
      contextInfo: forwardedContext(),
    }, { quoted: msg });
    return;
  }

  const media = findMedia(ci.quotedMessage);
  if (!media) {
    await natsu.sendMessage(jid, {
      text: cardF('VIEW ONCE', ['❌ The replied message has no photo, video or voice note.']),
      contextInfo: forwardedContext(),
    }, { quoted: msg });
    return;
  }

  try { await natsu.sendMessage(jid, { react: { text: '⌛', key: msg.key } }); } catch {}

  const fakeMsg = {
    key: { remoteJid: jid, id: ci.stanzaId, participant: ci.participant },
    message: media.message,
  };

  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
  if (!buffer?.length) throw new Error('Could not download this media (already opened or expired).');

  const target = toDM ? botJid(natsu) : jid;
  const author = ci.participant ? `+${String(ci.participant).split('@')[0].split(':')[0]}` : 'Unknown';
  const origCaption = (media.content.caption || '').trim();
  const info = [
    row('TYPE', media.type.replace('Message', '').toUpperCase()),
    row('FROM', author),
    row('STATUS', '✅ Revealed'),
  ];
  if (origCaption) info.push(row('CAPTION', origCaption));
  const caption = cardF('VIEW ONCE', info, true);

  if (media.type === 'imageMessage') {
    await natsu.sendMessage(target, { image: buffer, caption, contextInfo: forwardedContext() }, { quoted: msg });
  } else if (media.type === 'videoMessage') {
    await natsu.sendMessage(target, {
      video: buffer,
      mimetype: media.content.mimetype || 'video/mp4',
      caption,
      contextInfo: forwardedContext(),
    }, { quoted: msg });
  } else {
    // voice note: no caption possible → info card first, then the audio
    await natsu.sendMessage(target, { text: caption, contextInfo: forwardedContext() }, { quoted: msg });
    await natsu.sendMessage(target, {
      audio: buffer,
      mimetype: media.content.mimetype || 'audio/ogg; codecs=opus',
      ptt: !!media.content.ptt,
    }, { quoted: msg });
  }

  if (toDM && target !== jid) {
    await natsu.sendMessage(jid, {
      text: cardF('VIEW ONCE', ['✅ Sent to your DM.']),
      contextInfo: forwardedContext(),
    }, { quoted: msg });
  }
  try { await natsu.sendMessage(jid, { react: { text: '✅', key: msg.key } }); } catch {}
}

export default viewonceCommand;
