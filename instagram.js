import { igdl } from 'ruhend-scraper';
import { forwardedContext, PREFIX } from './commands.js';
import { cardF, row } from './style.js';

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

const channelInfo = { get contextInfo() { return forwardedContext(); } };

// Function to extract unique media URLs with simple deduplication
function extractUniqueMedia(mediaData) {
    const uniqueMedia = [];
    const seenUrls = new Set();
    
    for (const media of mediaData) {
        if (!media.url) continue;
        
        if (!seenUrls.has(media.url)) {
            seenUrls.add(media.url);
            uniqueMedia.push(media);
        }
    }
    
    return uniqueMedia;
}

export async function instagramCommand(sock, chatId, message) {
    try {
        if (processedMessages.has(message.key.id)) return;
        
        processedMessages.add(message.key.id);
        setTimeout(() => {
            processedMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            await sock.sendMessage(chatId, { 
                text: cardF('INSTAGRAM', [`📌 Usage: *${PREFIX}instagram <link>*`, '▹ Post, reel or TV link']),
                ...channelInfo
            }, { quoted: message });
            return;
        }

        const instagramPatterns = [
            /https?:\/\/(?:www\.)?instagram\.com\//,
            /https?:\/\/(?:www\.)?instagr\.am\//,
            /https?:\/\/(?:www\.)?instagram\.com\/p\//,
            /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
            /https?:\/\/(?:www\.)?instagram\.com\/tv\//
        ];

        const isValidUrl = instagramPatterns.some(pattern => pattern.test(text));
        
        if (!isValidUrl) {
            await sock.sendMessage(chatId, { 
                text: cardF('INSTAGRAM', ['❌ Provide a valid Instagram post, reel, or media URL.']),
                ...channelInfo
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            react: { text: '⌛️', key: message.key }
        });

        const downloadData = await igdl(text);
        
        if (!downloadData || !downloadData.data || downloadData.data.length === 0) {
            await sock.sendMessage(chatId, { 
                text: cardF('INSTAGRAM', ['❌ No media found.', '▹ The link might be private or broken.']),
                ...channelInfo
            }, { quoted: message });
            return;
        }

        const uniqueMedia = extractUniqueMedia(downloadData.data);
        const mediaToDownload = uniqueMedia.slice(0, 20); // Clamp maximum items array down to 20
        
        if (mediaToDownload.length === 0) {
            await sock.sendMessage(chatId, { 
                text: cardF('INSTAGRAM', ['❌ Failed to read the media from this link.']),
                ...channelInfo
            }, { quoted: message });
            return;
        }

        const captionText = cardF('INSTAGRAM', [row('SOURCE', 'Instagram'), row('STATUS', '✅ Success')], true);

        for (let i = 0; i < mediaToDownload.length; i++) {
            try {
                const media = mediaToDownload[i];
                const mediaUrl = media.url;

                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || 
                              media.type === 'video' || 
                              text.includes('/reel/') || 
                              text.includes('/tv/');

                if (isVideo) {
                    await sock.sendMessage(chatId, {
                        video: { url: mediaUrl },
                        mimetype: "video/mp4",
                        caption: captionText,
                        ...channelInfo
                    }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, {
                        image: { url: mediaUrl },
                        caption: captionText,
                        ...channelInfo
                    }, { quoted: message });
                }
                
                // Optimized 2026 latency cooldown sync
                if (i < mediaToDownload.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                
            } catch (mediaError) {
                console.error(`Error downloading structural media chunk ${i + 1}:`, mediaError.message);
            }
        }

    } catch (error) {
        console.error('Error inside Instagram core module loop:', error.message);
        await sock.sendMessage(chatId, { 
            text: cardF('INSTAGRAM', ['❌ Something went wrong while downloading this media.']),
            ...channelInfo
        }, { quoted: message });
    }
}

