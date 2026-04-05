/**
 * Playlist Multi-Select utilities.
 */

import { VISIBILITY_OPTIONS } from './constants.js';

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function visibilityLabel(value) {
    const option = VISIBILITY_OPTIONS.find((item) => item.value === value);
    return option ? option.label : 'Private';
}

export function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return '';
    }
    return list[Math.floor(Math.random() * list.length)];
}

export function visibilityIconPath(value) {
    if (value === 'PUBLIC') {
        return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 9h-2.95a15.65 15.65 0 00-1.38-5.02A8.03 8.03 0 0118.93 11zM12 4.04c.83 1.2 1.5 2.95 1.9 4.96h-3.8c.4-2.01 1.07-3.76 1.9-4.96zM4.07 13h2.95c.12 1.83.59 3.56 1.38 5.02A8.03 8.03 0 014.07 13zm2.95-2H4.07a8.03 8.03 0 014.33-5.02A15.65 15.65 0 007.02 11zM12 19.96c-.83-1.2-1.5-2.95-1.9-4.96h3.8c-.4 2.01-1.07 3.76-1.9 4.96zM14.34 13H9.66c-.11-1.01-.16-2.01-.16-3s.05-1.99.16-3h4.68c.11 1.01.16 2.01.16 3s-.05 1.99-.16 3zm.26 5.02c.79-1.46 1.26-3.19 1.38-5.02h2.95a8.03 8.03 0 01-4.33 5.02z';
    }

    if (value === 'UNLISTED') {
        return 'M3.9 12a5 5 0 015-5h3v2h-3a3 3 0 000 6h3v2h-3a5 5 0 01-5-5zm7-1h2v2h-2v-2zm4.1-4h-3v2h3a3 3 0 010 6h-3v2h3a5 5 0 000-10z';
    }

    return 'M12 17a2 2 0 100-4 2 2 0 000 4zm6-8h-1V7a5 5 0 00-10 0v2H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2zm-9-2a3 3 0 116 0v2H9V7zm9 13H6v-9h12v9z';
}

export function extractVideoId(href) {
    if (!href) return '';
    try {
        const url = new URL(href, location.href);
        if (url.pathname === '/watch') {
            return url.searchParams.get('v') || '';
        }
        if (url.pathname.startsWith('/shorts/')) {
            const match = url.pathname.match(/\/shorts\/([^/?#]+)/);
            return match ? match[1] : '';
        }
        return '';
    } catch {
        const match = href.match(/[?&]v=([^&#]+)/);
        return match ? match[1] : '';
    }
}

export function parseVideoIds(text) {
    if (!text) return [];
    const ids = new Set();
    const patterns = [
        /(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/g,
        /([a-zA-Z0-9_-]{11})/g,
    ];

    patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            if (match[1] && match[1].length === 11) {
                ids.add(match[1]);
            }
        }
    });

    return Array.from(ids);
}
