/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ style.js — shared look (same as commands.js)
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

import { BOT_NAME, DEV_NAME } from './commands.js';

export function bold(s) {
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
export function card(title, lines = [], round = false) {
  const [tl, tr, bl, br] = round ? ['╭', '╮', '╰', '╯'] : ['┏', '┓', '┗', '┛'];
  return `${tl}━━━〔 ${bold(title)} 〕━━━${tr}\n┃\n${lines.map((l) => `┃ ${l}`).join('\n')}\n┃\n${bl}${BAR}${br}`;
}

export const row = (k, v) => `▹ ${bold(k)} ⌁ ${v}`;

// card + footer, ready to send (used by the downloader modules)
export const cardF = (title, lines = [], round = false) =>
  `${card(title, lines, round)}\n\n> ${BOT_NAME} • ${DEV_NAME}`;
