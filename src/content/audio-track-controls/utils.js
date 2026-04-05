export function extractVideoId(url = location.href) {
    try {
        const urlObj = new URL(url);

        if (urlObj.pathname === '/watch') {
            return urlObj.searchParams.get('v');
        }

        if (urlObj.pathname.startsWith('/shorts/')) {
            const id = urlObj.pathname.split('/shorts/')[1] || '';
            return id.split('/')[0] || null;
        }
    } catch (_error) {
        return null;
    }

    return null;
}

export function buildVideoKey(videoId, video, pathname = location.pathname) {
    if (videoId) {
        return videoId;
    }

    if (video?.currentSrc) {
        return `${pathname}|${video.currentSrc}`;
    }

    return pathname;
}
