/**
 * Thumbnail utilities for playlist operations.
 */

export function readVideoIdFromRenderer(renderer) {
    if (!renderer || typeof renderer !== 'object') {
        return '';
    }

    const videoId = renderer.videoId || renderer.primaryRenderer?.videoId || '';
    return typeof videoId === 'string' ? videoId.trim() : '';
}

export function buildVideoThumbnailUrl(videoId) {
    if (!videoId || typeof videoId !== 'string') {
        return '';
    }
    return `https://i.ytimg.com/vi/${videoId}/default.jpg`;
}

export function normalizeThumbnailUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }

    if (url.startsWith('//')) {
        return `https:${url}`;
    }

    if (url.startsWith('/')) {
        return `https://www.youtube.com${url}`;
    }

    return url;
}

export function pickThumbnailUrl(thumbnails) {
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
        return '';
    }

    const sorted = [...thumbnails].sort((a, b) => {
        const widthA = Number(a.width) || 0;
        const widthB = Number(b.width) || 0;
        return widthB - widthA;
    });

    for (const entry of sorted) {
        const url = normalizeThumbnailUrl(entry.url || entry.thumbnail?.url || '');
        if (url) {
            return url;
        }
    }

    return '';
}
