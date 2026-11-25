import https from 'node:https';
import http from 'node:http';
import { forwardedContext } from './commands.js';
import { cardF } from './style.js';

// play-dl est chargé à la demande : s'il manque, le bot démarre quand même
let _playdl = null;
async function getPlayDLLib() {
    if (!_playdl) {
        const mod = await import('play-dl');
        _playdl = mod.default || mod;
    }
    return _playdl;
}

// ========================================
// FRAME (same style as the menu in commands.js → style.js)
// ========================================
const frame = (title, lines = []) => cardF(title, lines);

// ========================================
// API (single server: knightbotapi)
// ========================================
const API_URL    = 'https://knightbotapi.stream/api/download/ytaudio';
const API_KEY    = 'knight';
const API_FORMAT = '128kbps';
const MAX_TRIES  = 3; // retries so it keeps working even if the server hiccups

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ========================================
// HTTP GET (own helper instead of axios)
// Fixes "Parse Error: Header overflow": Node limits response headers to 16 KB,
// some servers/CDNs send more → we allow up to 1 MB and use a lenient parser.
// Redirects are followed manually.
// ========================================
function getBuffer(urlStr, { params, headers, timeout = 120000, maxBytes = 100 * 1024 * 1024, redirects = 5 } = {}) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(urlStr); } catch { return reject(new Error('Invalid URL')); }
        if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

        const lib = u.protocol === 'http:' ? http : https;
        const req = lib.request(u, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*', ...headers },
            maxHeaderSize: 1024 * 1024,
            insecureHTTPParser: true,
            timeout
        }, (res) => {
            // redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                res.resume();
                if (redirects <= 0) return reject(new Error('Too many redirects'));
                const next = new URL(res.headers.location, u).toString();
                return resolve(getBuffer(next, { headers, timeout, maxBytes, redirects: redirects - 1 }));
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
// GET RAW MESSAGE TEXT
// ========================================
function getMessageText(msg) {
    if (!msg?.message) return '';

    return (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        msg.message.documentMessage?.caption ||
        ''
    ).trim();
}

// ========================================
// EXTRACT YOUTUBE URL
// ========================================
function extractYouTubeUrl(text) {
    if (!text) return null;

    const match = text.match(
        /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i
    );

    if (!match) return null;

    return match[0]
        .replace(/[),.!?;:'"`]+$/g, '')
        .trim();
}

// ========================================
// GET QUERY
// ========================================
function getQuery(messageText, args) {
    const argsText = Array.isArray(args) ? args.join(' ').trim() : '';
    if (argsText) return argsText;

    return messageText.split(/\s+/).slice(1).join(' ').trim();
}

// ========================================
// FORMAT HELPERS
// ========================================
function formatViews(n) {
    const num = Number(n);
    if (!num) return 'N/A';
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return String(num);
}

function cleanFileName(title) {
    return String(title || 'audio')
        .replace(/[^\w\s]/g, '')
        .trim()
        .slice(0, 80) || 'audio';
}

// ========================================
// SEARCH YOUTUBE
// 1) own request (accepts big headers — fixes "Header overflow")
// 2) yt-search   3) play-dl
// ========================================
function findFirstVideoRenderer(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 25) return null;
    if (node.videoRenderer?.videoId) return node.videoRenderer;
    const values = Array.isArray(node) ? node : Object.values(node);
    for (const v of values) {
        const hit = findFirstVideoRenderer(v, depth + 1);
        if (hit) return hit;
    }
    return null;
}

async function searchOwn(query) {
    const res = await getBuffer('https://www.youtube.com/results', {
        params: { search_query: query, sp: 'EgIQAQ==' },
        headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: 'CONSENT=YES+1; SOCS=CAI'
        },
        timeout: 30000
    });
    const html = res.buffer.toString('utf8');
    const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
    if (!m) throw new Error('search page unreadable');
    const v = findFirstVideoRenderer(JSON.parse(m[1]));
    if (!v) return null;
    return {
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        title: v.title?.runs?.[0]?.text || 'Unknown title',
        thumbnail: v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        duration: v.lengthText?.simpleText || 'N/A',
        views: v.viewCountText?.simpleText || 'N/A'
    };
}

async function searchYtSearch(query) {
    const mod = await import('yt-search');
    const yts = mod.default || mod;
    const { videos } = await yts(query);
    const v = videos?.[0];
    if (!v) return null;
    return {
        url: v.url,
        title: v.title || 'Unknown title',
        thumbnail: v.thumbnail || '',
        duration: v.timestamp || 'N/A',
        views: formatViews(v.views)
    };
}

async function searchPlayDl(query) {
    const playdl = await getPlayDLLib();
    const results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
    const v = results?.[0];
    if (!v) return null;
    return {
        url: v.url,
        title: v.title || 'Unknown title',
        thumbnail: v.thumbnails?.[0]?.url || '',
        duration: v.durationRaw || 'N/A',
        views: formatViews(v.views)
    };
}

async function searchYouTube(query) {
    console.log('🔎 YouTube search:', query);

    const methods = [
        ['own', searchOwn],
        ['yt-search', searchYtSearch],
        ['play-dl', searchPlayDl]
    ];
    let lastError = null;
    let anyOk = false;

    for (const [name, fn] of methods) {
        try {
            const r = await fn(query);
            anyOk = true;
            if (r) { console.log(`✅ Search OK (${name})`); return r; }
        } catch (e) {
            lastError = e;
            console.log(`⚠️ Search failed (${name}): ${e.message}`);
        }
    }

    if (!anyOk && lastError) throw new Error(`Search failed: ${lastError.message}`);
    return null; // search worked but found nothing
}

// ========================================
// GET INFO FROM A DIRECT YOUTUBE LINK
// ========================================
async function getVideoInfo(url) {
    // 1) oEmbed (tiny response, works even when play-dl fails)
    try {
        const r = await getBuffer('https://www.youtube.com/oembed', {
            params: { url, format: 'json' },
            timeout: 15000
        });
        const j = JSON.parse(r.buffer.toString('utf8'));
        if (j?.title) {
            return {
                url,
                title: j.title,
                thumbnail: j.thumbnail_url || '',
                duration: 'N/A',
                views: 'N/A'
            };
        }
    } catch (e) {
        console.log('⚠️ oEmbed failed:', e.message);
    }

    // 2) play-dl
    try {
        const playdl = await getPlayDLLib();
        const info = await playdl.video_basic_info(url);
        const d = info.video_details;

        return {
            url,
            title: d.title || 'Unknown title',
            thumbnail: d.thumbnails?.[d.thumbnails.length - 1]?.url || '',
            duration: d.durationRaw || 'N/A',
            views: formatViews(d.views)
        };
    } catch (error) {
        console.log('⚠️ Could not read video info:', error.message);

        return {
            url,
            title: 'YouTube Audio',
            thumbnail: '',
            duration: 'N/A',
            views: 'N/A'
        };
    }
}

// ========================================
// FIND THE AUDIO LINK INSIDE ANY JSON SHAPE
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

function pickAudioUrl(json) {
    const urls = collectUrls(json);
    const bad = (u) =>
        /thumb|image|cover|poster|avatar/.test(u.key) ||
        /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.value) ||
        /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(u.value);
    const good = urls.filter((u) => !bad(u));
    const prio = ['downloadurl', 'download_url', 'download', 'dl', 'audio', 'audiourl', 'audio_url', 'mp3', 'url', 'link', 'file'];
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

// ========================================
// KNIGHT API — GET AUDIO (with retries)
// ========================================
async function fetchFromKnight(url) {
    const res = await getBuffer(API_URL, {
        params: { apikey: API_KEY, format: API_FORMAT, url }
    });

    const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
    const buf = res.buffer;

    // The API sent the audio file directly
    if ((ctype.startsWith('audio/') || ctype.includes('octet-stream')) && buf.length > 10 * 1024) {
        return { buffer: buf, title: '' };
    }

    // The API sent JSON with a download link
    let json;
    try { json = JSON.parse(buf.toString('utf8')); }
    catch { throw new Error('API returned an unreadable response'); }

    const audioUrl = pickAudioUrl(json);
    if (!audioUrl) {
        throw new Error(json?.message || json?.error || 'API returned no download link');
    }

    const dl = await getBuffer(audioUrl);
    if (dl.buffer.length < 10 * 1024) throw new Error('Downloaded file is too small');

    return { buffer: dl.buffer, title: pickTitle(json) };
}

async function getPlayDL(url) {
    console.log('========================================');
    console.log('🎧 PLAY DOWNLOADER');
    console.log('🔗 URL:', url);
    console.log('========================================');

    let lastError = 'unknown error';

    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        try {
            console.log(`🌐 Knight API (attempt ${attempt}/${MAX_TRIES})...`);
            const data = await fetchFromKnight(url);
            console.log('✅ Knight API OK');
            return { status: true, ...data };
        } catch (error) {
            lastError = error.message;
            console.log(`⚠️ Knight API failed: ${lastError}`);
            if (attempt < MAX_TRIES) await sleep(1500 * attempt);
        }
    }

    return { status: false, message: `Download failed. (${lastError})` };
}

// ========================================
// PLAY COMMAND
// ========================================
const playCommand = async (
    sock,
    chatId,
    msg,
    args = []
) => {
    try {
        const messageText = getMessageText(msg);

        console.log('📩 Play message:', messageText);

        const query = getQuery(messageText, args);

        console.log('🔎 Play query:', query);

        // NO QUERY
        if (!query) {
            await sock.sendMessage(
                chatId,
                {
                    text:
                        frame('PLAY', [
                            '❌ *Please provide a song name or YouTube link!*',
                            '*Example:*',
                            '.play afrobeat music',
                            '.play https://youtu.be/xxxxxxxxxxx'
                        ]),
                    contextInfo: forwardedContext()
                },
                { quoted: msg }
            );

            return;
        }

        // FIND VIDEO (LINK OR SEARCH)
        const ytUrl = extractYouTubeUrl(query);

        let video;

        if (ytUrl) {
            console.log('🔗 YouTube URL found:', ytUrl);
            video = await getVideoInfo(ytUrl);
        } else {
            video = await searchYouTube(query);
        }

        // NO RESULT
        if (!video) {
            await sock.sendMessage(
                chatId,
                {
                    text: frame('PLAY', ['❌ *No results found for your query!*']),
                    contextInfo: forwardedContext()
                },
                { quoted: msg }
            );

            return;
        }

        console.log('🎯 Video:', video.title, video.url);

        // DOWNLOAD MESSAGE (INFO CARD)
        const infoCaption = frame('🎧 PLAY', [
            `📝 *Title:* ${video.title}`,
            `⏱️ *Duration:* ${video.duration}`,
            `👁️ *Views:* ${video.views}`,
            `⏳ *Downloading audio...*`
        ]);

        let infoSent = false;
        if (video.thumbnail) {
            try {
                await sock.sendMessage(
                    chatId,
                    {
                        image: { url: video.thumbnail },
                        caption: infoCaption,
                        contextInfo: forwardedContext()
                    },
                    { quoted: msg }
                );
                infoSent = true;
            } catch (e) {
                console.log('⚠️ Thumbnail failed, sending text only:', e.message);
            }
        }
        if (!infoSent) {
            await sock.sendMessage(
                chatId,
                {
                    text: infoCaption,
                    contextInfo: forwardedContext()
                },
                { quoted: msg }
            );
        }

        // GET AUDIO
        const result = await getPlayDL(video.url);

        // DOWNLOAD FAILED
        if (!result.status) {
            await sock.sendMessage(
                chatId,
                {
                    text: frame('PLAY', [
                        '❌ *Download failed!*',
                        `${result.message}`
                    ]),
                    contextInfo: forwardedContext()
                },
                { quoted: msg }
            );

            return;
        }

        // SEND AUDIO
        const fileName =
            `${cleanFileName(result.title || video.title)}.mp3`;

        await sock.sendMessage(
            chatId,
            {
                audio: result.buffer,
                mimetype: 'audio/mpeg',
                fileName,
                ptt: false,
                contextInfo: forwardedContext()
            },
            { quoted: msg }
        );

        console.log('✅ Audio sent successfully.');

    } catch (error) {
        console.error('❌ Play command error:', error);

        try {
            await sock.sendMessage(
                chatId,
                {
                    text: frame('PLAY', [
                        '❌ *A technical error occurred while processing Play.*',
                        `Error: ${error.message}`
                    ]),
                    contextInfo: forwardedContext()
                },
                { quoted: msg }
            );

        } catch (sendError) {
            console.error('❌ Could not send error message:', sendError.message);
        }
    }
};

// ========================================
// EXPORT
// ========================================
export { playCommand };
