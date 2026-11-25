/*
  ╭━━━〔 MIKASA-MINIBOT V1 〕━━━╮
  ┃ server.js — /health, /pair, /qr
  ┃ ⚡ POWERED BY CØDEVERSE
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯
*/

// Small HTTP server: /health (keep-alive ping) and /pair (used by the Netlify page).
import http from 'node:http';
import { BOT_NAME, BOT_VERSION } from './commands.js';
import { createSession, getSession, getAllSessions, startQrSession, getQrState, countPendingQr } from './whatsapp.js';

const PORT = process.env.PORT || 3000;
const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const send = (res, code, obj) => { res.writeHead(code, HEADERS); res.end(JSON.stringify(obj)); };

export function startServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...HEADERS, 'Access-Control-Allow-Methods': 'GET,OPTIONS' }); return res.end(); }
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/' || url.pathname === '/health') {
      return send(res, 200, { status: 'ok', bot: BOT_NAME, version: BOT_VERSION, uptime: Math.round(process.uptime()), sessions: getAllSessions().length });
    }

    if (url.pathname === '/pair') {
      const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
      if (phone.length < 7 || phone.length > 15 || phone.startsWith('0'))
        return send(res, 400, { error: 'Invalid number. Use international format without +.' });
      const existing = getSession(phone);
      if (existing) return send(res, 200, existing.connected ? { connected: true } : { error: 'Session is starting, try again in a few seconds.' });
      try {
        const { code } = await createSession(phone);
        return send(res, 200, code ? { code } : { connected: true });
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }
    if (url.pathname === '/qr') {
      if (countPendingQr() >= 5) return send(res, 429, { error: 'Server busy, try again in a minute.' });
      try {
        const id = await startQrSession();
        for (let i = 0; i < 30; i++) {            // wait up to ~15s for the first QR
          const st = getQrState(id);
          if (st?.qr || st?.error) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        const st = getQrState(id) || {};
        return send(res, st.error ? 500 : 200, st.error ? { error: st.error } : { id, qr: st.qr });
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    if (url.pathname === '/qr-status') {
      const st = getQrState(url.searchParams.get('id') || '');
      return send(res, st ? 200 : 404, st || { error: 'unknown or expired id' });
    }

    send(res, 404, { error: 'not found' });
  });
  server.listen(PORT, '0.0.0.0', () => console.log(`🌐 ${BOT_NAME} HTTP server listening on ${PORT}`));
}
