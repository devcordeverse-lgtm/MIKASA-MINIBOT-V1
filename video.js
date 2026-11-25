import https from 'node:https';
import http from 'node:http';
import yts from 'yt-search';
import { forwardedContext, PREFIX } from './commands.js';
import { cardF, row } from './style.js';

// ===============================
// API (single server: knightbotapi — ytmp4)
// ===============================
const API_URL    = 'https://knightbotapi.stream/api/download/ytmp4';
const API_KEY    = 'knight';
const API_FORMAT = '480p';
const MAX_TRIES  = 3; // retries so it keeps working even if the server hiccups
const MAX_VIDEO_BYTES = 64 * 1024 * 1024; // above this → sent as a document

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ========================================
// HTTP GET (own helper instead of axios)
// Fixes "Parse Error: Header overflow": Node limits response headers to 16 KB,
// some servers/CDNs send more → we allow up to 1 MB and use a lenient parser.
// Redirects are followed manually.
// ========================================
function getBuffer(urlStr, { params, timeout = 120000, maxBytes = 100 * 1024 * 1024, redirects = 5 } = {}) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(urlStr); } catch { return reject(new Error('Invalid URL')); }
        if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

        const lib = u.protocol === 'http:' ? http : https;
        const req = lib.request(u, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
            maxHeaderSize: 1024 * 1024,
            insecureHTTPParser: true,
            timeout
        }, (res) => {
            // redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                if (redirects <= 0) return reject(new Error('Too many redirects'));
                const next = new URL(res.headers.location, u).toString();
                return resolve(getBuffer(next, { timeout, maxBytes, redirects: redirects - 1 }));
            }
            if (res.statusCode >= 400) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            let size = 0;
            res.on('data', (c) => {
                size += c.length;
                if (size > maxBytes) return req.destroy(new Error('File too large'));
                chunks.push(c);
            });
            res.on('end', () => resolve({ buffer: Buffer.concat(chunks), headers: res.headers }));
            res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error('Request timeout')));
        req.on('error', reject);
        req.end();
    });
}

// ========================================
// FIND THE VIDEO LINK INSIDE ANY JSON SHAPE
// ========================================
function collectUrls(obj, key = '', out = [], depth = 0) {
    if (depth > 6 || obj == null) return out;
    if (typeof obj === 'string') {
        if (/^https?:\/\//i.test(obj)) out.push({ key: key.toLowerCase(), value: obj });
    } else if (Array.isArray(obj)) {
        obj.forEach((v) => collectUrls(v, key, out, depth + 1));
    } else if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) collectUrls(v, k, out, depth + 1);
    }
    return out;
}

function pickMediaUrl(json) {
    const urls = collectUrls(json);
    const bad = (u) =>
        /thumb|image|cover|poster|avatar/.test(u.key) ||
        /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.value) ||
        /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(u.value);
    const good = urls.filter((u) => !bad(u));
    const prio = ['downloadurl', 'download_url', 'download', 'dl', 'video', 'videourl', 'video_url', 'mp4', 'url', 'link', 'file'];
    for (const k of prio) {
        const hit = good.find((u) => u.key === k);
        if (hit) return hit.value;
    }
    return good[0]?.value || null;
}

function pickTitle(json) {
    const roots = [json, json?.data, json?.result, json?.download];
    for (const r of roots) {
        if (r && typeof r.title === 'string' && r.title.trim()) return r.title.trim();
    }
    return '';
}

// ===============================
// KNIGHT API — GET VIDEO (with retries)
// ===============================
async function fetchFromKnight(youtubeUrl) {
    const res = await getBuffer(API_URL, {
        params: { apikey: API_KEY, format: API_FORMAT, url: youtubeUrl }
    });

    const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
    const buf = res.buffer;

    // The API sent the video file directly
    if ((ctype.startsWith('video/') || ctype.includes('octet-stream')) && buf.length > 50 * 1024) {
        return { buffer: buf, title: '' };
    }

    // The API sent JSON with a download link
    let json;
    try { json = JSON.parse(buf.toString('utf8')); }
    catch { throw new Error('API returned an unreadable response'); }

    const videoLink = pickMediaUrl(json);
    if (!videoLink) {
        throw new Error(json?.message || json?.error || 'API returned no download link');
    }

    const dl = await getBuffer(videoLink);
    if (dl.buffer.length < 50 * 1024) throw new Error('Downloaded file is too small');

    return { buffer: dl.buffer, title: pickTitle(json) };
}

async function getVideo(youtubeUrl) {
    let lastError = 'unknown error';
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        try {
            console.log(`[VIDEO] Knight API (attempt ${attempt}/${MAX_TRIES})...`);
            const data = await fetchFromKnight(youtubeUrl);
            console.log('[VIDEO] Knight API OK');
            return data;
        } catch (err) {
            lastError = err.message;
            console.log(`[VIDEO] Knight API failed: ${lastError}`);
            if (attempt < MAX_TRIES) await sleep(1500 * attempt);
        }
    }
    throw new Error(`All download sources failed. (${lastError})`);
}

export async function videoCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const searchQuery = text.split(' ').slice(1).join(' ').trim();

        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: cardF('VIDEO', [`📌 Usage: *${PREFIX}video <name or YouTube link>*`, '▹ Example: ' + PREFIX + 'video afrobeat 2026']), contextInfo: forwardedContext() }, { quoted: message });
            return;
        }

        // Determine if input is a YouTube link
        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';
        if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
            videoUrl = searchQuery;
        } else {
            // Search YouTube for the video
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: cardF('VIDEO', ['❌ No videos found!']), contextInfo: forwardedContext() }, { quoted: message });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        // Validate YouTube URL
        const urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
        if (!urls) {
            await sock.sendMessage(chatId, { text: cardF('VIDEO', ['❌ This is not a valid YouTube link!']), contextInfo: forwardedContext() }, { quoted: message });
            return;
        }

        // Send thumbnail immediately (never blocks the download if it fails)
        try {
            const ytId = (videoUrl.match(/(?:youtu\.be\/|v=|shorts\/)([a-zA-Z0-9_-]{11})/) || [])[1];
            const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
            const captionTitle = videoTitle || searchQuery;
            if (thumb) {
                await sock.sendMessage(chatId, {
                    image: { url: thumb },
                    caption: cardF('VIDEO', [row('TITLE', captionTitle), '⏳ Downloading…']),
                    contextInfo: forwardedContext()
                }, { quoted: message });
            }
        } catch (e) { console.error('[VIDEO] thumb error:', e?.message || e); }

        // Download (Knight API only)
        const data = await getVideo(videoUrl);
        const title = data.title || videoTitle || 'Video';
        const fileName = `${title.replace(/[^\w\s-]/g, '').trim().slice(0, 80) || 'video'}.mp4`;
        const caption = cardF('VIDEO', [row('TITLE', title), row('STATUS', '✅ Success')], true);

        if (data.buffer.length > MAX_VIDEO_BYTES) {
            // too big for a normal WhatsApp video → send as a file
            await sock.sendMessage(chatId, {
                document: data.buffer,
                mimetype: 'video/mp4',
                fileName,
                caption,
                contextInfo: forwardedContext()
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                video: data.buffer,
                mimetype: 'video/mp4',
                fileName,
                caption,
                contextInfo: forwardedContext()
            }, { quoted: message });
        }

    } catch (error) {
        console.error('[VIDEO] Command Error:', error?.message || error);

        let errorMessage = '❌ Failed to download video.';
        if (error.message && error.message.includes('All download sources failed')) {
            errorMessage = '❌ ' + error.message;
        } else if (error.message) {
            errorMessage = '❌ Download failed: ' + error.message;
        }
        errorMessage = cardF('VIDEO', [errorMessage]);

        try {
            await sock.sendMessage(chatId, { text: errorMessage, contextInfo: forwardedContext() }, { quoted: message });
        } catch (sendErr) {
            console.error('[VIDEO] Could not send error message:', sendErr?.message || sendErr);
        }
    }
}

export default videoCommand;
