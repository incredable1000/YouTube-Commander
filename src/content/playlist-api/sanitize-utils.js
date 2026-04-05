/**
 * Sanitization utilities for playlist operations.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{10,15}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,120}$/;

export function sanitizeVideoIds(rawVideoIds) {
    if (!Array.isArray(rawVideoIds)) {
        return [];
    }
    return rawVideoIds
        .filter((id) => typeof id === 'string' && VIDEO_ID_PATTERN.test(id.trim()))
        .map((id) => id.trim());
}

export function sanitizeChannelIds(rawChannelIds) {
    if (!Array.isArray(rawChannelIds)) {
        return [];
    }
    return rawChannelIds
        .filter((id) => typeof id === 'string' && id.startsWith('UC'))
        .map((id) => id.trim());
}

export function sanitizePlaylistIds(rawPlaylistIds) {
    if (!Array.isArray(rawPlaylistIds)) {
        return [];
    }
    return rawPlaylistIds.map((id) => sanitizePlaylistId(id)).filter((id) => id !== '');
}

export function sanitizePlaylistId(rawPlaylistId) {
    if (typeof rawPlaylistId !== 'string') {
        return '';
    }
    const playlistId = rawPlaylistId.trim();
    return PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : '';
}
