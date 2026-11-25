import axios from 'axios';
import { forwardedContext, PREFIX } from './commands.js';
import { cardF, row } from './style.js';

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
// CHECK TIKTOK URL
// ========================================
function isTikTokUrl(url) {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        return (
            host === 'tiktok.com' ||
            host === 'www.tiktok.com' ||
            host === 'vt.tiktok.com' ||
            host === 'vm.tiktok.com'
        );
    } catch {
        return false;
    }
}

// ========================================
// EXTRACT TIKTOK URL
// IMPORTANT:
// We DO NOT lowercase the URL.
// TikTok short codes can contain uppercase letters.
// ========================================
function extractTikTokUrl(text) {
    if (!text) return null;

    const match = text.match(
        /https?:\/\/(?:www\.|vt\.|vm\.)?tiktok\.com\/[^\s]+/i
    );

    if (!match) return null;

    return match[0]
        .replace(/[),.!?;:'"`]+$/g, '')
        .trim();
}

// ========================================
// RESOLVE SHORT TIKTOK URL
// ========================================
async function resolveTikTokUrl(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();

        // Full TikTok URLs don't need resolving
        if (
            host === 'tiktok.com' ||
            host === 'www.tiktok.com'
        ) {
            return url;
        }

        console.log('🔄 Resolving TikTok short URL...');
        console.log('🔗 Original:', url);

        const response = await axios.get(url, {
            maxRedirects: 5,
            timeout: 30000,

            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Linux; Android 13; SM-A326K) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
                'Accept':
                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },

            validateStatus: status =>
                status >= 200 && status < 400
        });

        const finalUrl =
            response.request?.res?.responseUrl ||
            response.request?._redirectable?._currentUrl;

        if (finalUrl && isTikTokUrl(finalUrl)) {
            console.log('✅ Resolved URL:', finalUrl);
            return finalUrl;
        }

        console.log(
            '⚠️ Could not resolve short URL, using original URL.'
        );

        return url;

    } catch (error) {

        console.log(
            '⚠️ Short URL resolve failed:',
            error.message
        );

        return url;
    }
}

// ========================================
// TIKWM API (more stable)
// ========================================
async function getTikTokDL(url) {
    try {
        console.log('========================================');
        console.log('🎵 TIKTOK DOWNLOADER (TIKWM)');
        console.log('🔗 URL:', url);
        console.log('========================================');

        const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;

        const response = await axios.get(apiUrl, {
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.tiktok.com/'
            }
        });

        const resData = response.data;

        if (!resData || resData.code !== 0 || !resData.data) {
            return {
                status: false,
                message: resData.msg || 'TikTok API returned an empty or invalid response.'
            };
        }

        const data = resData.data;
        const videoUrl = data.hdplay || data.play; // take HD first if available

        if (!videoUrl) {
            return {
                status: false,
                message: 'TikTok API did not return a downloadable video.'
            };
        }

        return {
            status: true,
            nowm: videoUrl,
            wm: data.wmplay || videoUrl,
            title: String(data.title || 'TikTok Video'),
            author: String(data.author?.nickname || data.author?.unique_id || 'Unknown')
        };

    } catch (error) {
        console.error('❌ TIKTOK API ERROR:', error.message);
        return {
            status: false,
            message: 'Error occurred while fetching the TikTok video from the server.'
        };
    }
}

// ========================================
// TIKTOK COMMAND
// ========================================
const tiktokCommand = async (
    sock,
    chatId,
    msg,
    args = []
) => {

    try {

        // ========================================
        // GET TEXT FROM MESSAGE
        // ========================================
        const messageText = getMessageText(msg);

        console.log('📩 TikTok message:', messageText);

        // ========================================
        // ALSO CHECK ARGS
        // ========================================
        const argsText = Array.isArray(args)
            ? args.join(' ').trim()
            : '';

        const searchText =
            messageText || argsText;

        console.log('🔎 TikTok search text:', searchText);

        // ========================================
        // FIND URL
        // ========================================
        let tiktokUrl =
            extractTikTokUrl(searchText);

        // ========================================
        // FALLBACK TO ARGS
        // ========================================
        if (!tiktokUrl && argsText) {
            tiktokUrl =
                extractTikTokUrl(argsText);
        }

        // ========================================
        // NO LINK
        // ========================================
        if (!tiktokUrl) {

            await sock.sendMessage(
                chatId,
                {
                    text: cardF('TIKTOK', [
                        `📌 Usage: *${PREFIX}tiktok <link>*`,
                        `▹ Example: ${PREFIX}tiktok https://vt.tiktok.com/xxxxxx/`
                    ]),
                    contextInfo: forwardedContext()
                },
                {
                    quoted: msg
                }
            );

            return;
        }

        console.log('🔗 TikTok URL found:', tiktokUrl);

        // ========================================
        // VALIDATE DOMAIN
        // ========================================
        if (!isTikTokUrl(tiktokUrl)) {

            await sock.sendMessage(
                chatId,
                {
                    text: cardF('TIKTOK', [
                        '❌ This is not a valid TikTok link!',
                        '▹ https://www.tiktok.com/...',
                        '▹ https://vt.tiktok.com/...',
                        '▹ https://vm.tiktok.com/...'
                    ]),
                    contextInfo: forwardedContext()
                },
                {
                    quoted: msg
                }
            );

            return;
        }

        console.log('✅ Valid TikTok URL');

        // ========================================
        // DOWNLOAD MESSAGE
        // ========================================
        await sock.sendMessage(
            chatId,
            {
                text: cardF('TIKTOK', ['⏳ Downloading TikTok video…']),
                contextInfo: forwardedContext()
            },
            {
                quoted: msg
            }
        );

        // ========================================
        // RESOLVE SHORT URL
        // ========================================
        const finalUrl =
            await resolveTikTokUrl(tiktokUrl);

        console.log(
            '🎯 Final URL:',
            finalUrl
        );

        // ========================================
        // GET VIDEO
        // ========================================
        const result =
            await getTikTokDL(finalUrl);

        // ========================================
        // DOWNLOAD FAILED
        // ========================================
        if (!result.status) {

            await sock.sendMessage(
                chatId,
                {
                    text: cardF('TIKTOK', ['❌ Download failed!', `${result.message}`]),
                    contextInfo: forwardedContext()
                },
                {
                    quoted: msg
                }
            );

            return;
        }

        // ========================================
        // CHECK VIDEO URL
        // ========================================
        if (
            !result.nowm ||
            typeof result.nowm !== 'string'
        ) {

            await sock.sendMessage(
                chatId,
                {
                    text: cardF('TIKTOK', ['❌ No downloadable video was returned by the API.']),
                    contextInfo: forwardedContext()
                },
                {
                    quoted: msg
                }
            );

            return;
        }

        console.log(
            '🎬 Video URL:',
            result.nowm
        );

        // ========================================
        // SEND VIDEO
        // ========================================
        await sock.sendMessage(
            chatId,
            {
                video: {
                    url: result.nowm
                },

                caption: cardF('TIKTOK', [
                    row('AUTHOR', result.author),
                    row('TITLE', result.title),
                    row('STATUS', '✅ Success')
                ], true),

                contextInfo: forwardedContext()
            },
            {
                quoted: msg
            }
        );

        console.log(
            '✅ TikTok video sent successfully.'
        );

    } catch (error) {

        console.error(
            '❌ TikTok command error:',
            error
        );

        try {

            await sock.sendMessage(
                chatId,
                {
                    text: cardF('TIKTOK', [
                        '❌ A technical error occurred while processing TikTok.',
                        `Error: ${error.message}`
                    ]),
                    contextInfo: forwardedContext()
                },
                {
                    quoted: msg
                }
            );

        } catch (sendError) {

            console.error(
                '❌ Could not send error message:',
                sendError.message
            );
        }
    }
};

// ========================================
// EXPORT
// ========================================
export { tiktokCommand };
