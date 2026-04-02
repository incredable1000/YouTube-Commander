(async function() {
    const settings = window.__ytAutomationSettings__;
    const callback = window.__ytAutomationCallback__;
    
    const INNERTUBE_API = 'https://www.youtube.com/youtubei/v1';
    const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    
    function parsePublishedTime(publishedText) {
        if (!publishedText) return null;
        const now = new Date();
        const match = publishedText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        let ms;
        switch (unit) {
            case 'second': ms = value * 1000; break;
            case 'minute': ms = value * 60 * 1000; break;
            case 'hour': ms = value * 60 * 60 * 1000; break;
            case 'day': ms = value * 24 * 60 * 60 * 1000; break;
            case 'week': ms = value * 7 * 24 * 60 * 60 * 1000; break;
            case 'month': ms = value * 30 * 24 * 60 * 60 * 1000; break;
            case 'year': ms = value * 365 * 24 * 60 * 60 * 1000; break;
            default: return null;
        }
        return new Date(now.getTime() - ms);
    }
    
    async function sendRequest(endpoint, payload) {
        const response = await fetch(`${INNERTUBE_API}/${endpoint}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...payload,
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20240115.01.00',
                        visitorData: ytInitialData?.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData || ''
                    }
                }
            })
        });
        return response.json();
    }
    
    async function getWatchedVideoIds() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open('YouTubeCommanderDB');
                request.onsuccess = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('watchedVideos')) {
                        resolve([]);
                        return;
                    }
                    const tx = db.transaction(['watchedVideos'], 'readonly');
                    const store = tx.objectStore('watchedVideos');
                    const getAll = store.getAll();
                    getAll.onsuccess = () => resolve(getAll.result.map(v => v.videoId));
                    getAll.onerror = () => resolve([]);
                };
                request.onerror = () => resolve([]);
            } catch (e) {
                resolve([]);
            }
        });
    }
    
    try {
        const watchedIds = new Set(await getWatchedVideoIds());
        
        let lookbackDate = new Date();
        switch (settings?.lookback) {
            case 'yesterday':
                lookbackDate.setDate(lookbackDate.getDate() - 1);
                lookbackDate.setHours(0, 0, 0, 0);
                break;
            case '24h':
                lookbackDate.setHours(lookbackDate.getHours() - 24);
                break;
            case '48h':
                lookbackDate.setHours(lookbackDate.getHours() - 48);
                break;
            default:
                lookbackDate.setDate(lookbackDate.getDate() - 1);
                lookbackDate.setHours(0, 0, 0, 0);
        }
        
        const response = await sendRequest('browse', {
            browseId: 'FEsubscriptions'
        });
        
        const videos = [];
        const shorts = [];
        
        const items = response?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        
        for (const section of items) {
            const sectionItems = section?.itemSectionRenderer?.contents || [];
            
            for (const item of sectionItems) {
                const video = item?.richItemRenderer?.content?.videoRenderer;
                const short = item?.richItemRenderer?.content?.reelItemRenderer;
                
                if (video?.videoId && !watchedIds.has(video.videoId)) {
                    const publishedTime = video?.publishedTimeText?.simpleText || '';
                    const videoDate = parsePublishedTime(publishedTime);
                    if (!videoDate || videoDate >= lookbackDate) {
                        videos.push({
                            videoId: video.videoId,
                            title: video.title?.runs?.[0]?.text || 'Unknown'
                        });
                    }
                }
                
                if (short?.videoId && !watchedIds.has(short.videoId)) {
                    const publishedTime = short?.publishedTimeText?.simpleText || '';
                    const videoDate = parsePublishedTime(publishedTime);
                    if (!videoDate || videoDate >= lookbackDate) {
                        shorts.push({
                            videoId: short.videoId,
                            title: short.headline?.simpleText || 'Short'
                        });
                    }
                }
            }
        }
        
        callback({ success: true, videos, shorts });
    } catch (error) {
        callback({ success: false, error: error.message, videos: [], shorts: [] });
    }
})();
