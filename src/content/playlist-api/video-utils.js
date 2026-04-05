/**
 * Video and playlist data extraction utilities.
 */

import {
    parseJsonSafe,
    readTextValue,
    parseRelativeAgeToTimestamp,
    parseDateLikeValue,
} from './parse-utils.js';
import { VIDEO_ID_PATTERN } from './playlistApi.js';

export function readVideoIdFromRenderer(renderer) {
    if (!renderer || typeof renderer !== 'object') {
        return '';
    }
    let videoId = '';
    if (renderer.videoId && VIDEO_ID_PATTERN.test(renderer.videoId)) {
        videoId = renderer.videoId;
    }
    if (!videoId && renderer.targetId) {
        const match = String(renderer.targetId).match(/^(.{10,15})$/);
        if (match) {
            videoId = match[1];
        }
    }
    return videoId;
}

export function buildVideoThumbnailUrl(videoId, quality = 'default') {
    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
        return '';
    }
    return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function normalizeThumbnailUrl(url) {
    if (!url) {
        return '';
    }
    return url.replace(/\?.*$/, '').replace('/default.', '/mqdefault.');
}

export function pickThumbnailUrl(thumbnail) {
    if (!thumbnail) {
        return '';
    }
    const url = thumbnail.url || '';
    if (url.includes('ytstatic.com')) {
        return '';
    }
    const updated = thumbnail.thumbnailDetails?.thumbnails?.[0]?.url || '';
    return updated || normalizeThumbnailUrl(url);
}

export function readText(renderer, key) {
    if (!renderer || typeof renderer !== 'object') {
        return '';
    }
    const target = renderer[key];
    if (!target) {
        return '';
    }
    if (typeof target === 'string') {
        return target.trim();
    }
    return readTextValue(target);
}

export function findPlaylistIdInNode(node, visited = new WeakSet()) {
    if (!node || typeof node !== 'object' || visited.has(node)) {
        return null;
    }
    visited.add(node);
    if (node.playlistId && /^[A-Za-z0-9_-]{2,120}$/.test(node.playlistId)) {
        return node.playlistId;
    }
    if (node.setVideoId && /^[A-Za-z0-9_-]{2,120}$/.test(node.setVideoId)) {
        return node.setVideoId;
    }
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (typeof value === 'object' && value !== null) {
            const result = findPlaylistIdInNode(value, visited);
            if (result) {
                return result;
            }
        }
    }
    return null;
}

export function normalizePrivacyStatus(raw) {
    if (!raw) {
        return 'PRIVATE';
    }
    const normalized = String(raw).toUpperCase().trim();
    if (['PUBLIC', 'UNLISTED', 'PRIVATE'].includes(normalized)) {
        return normalized;
    }
    return 'PRIVATE';
}

export function collectPlaylistOptions(node, output = []) {
    if (!node || typeof node !== 'object') {
        return output;
    }
    if (node.playlistId && /^[A-Za-z0-9_-]{2,120}$/.test(node.playlistId)) {
        const existing = output.find((p) => p.id === node.playlistId);
        if (!existing) {
            output.push({
                id: node.playlistId,
                title: readText(node, 'title') || 'Untitled playlist',
                thumbnailUrl: readPlaylistThumbnailUrl(node) || '',
                videoCount: Number(node.videoCount) || 0,
                isSelected: Boolean(node.selected),
                privacyStatus: normalizePrivacyStatus(node.privacyStatus),
            });
        }
    }
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
            value.forEach((item) => collectPlaylistOptions(item, output));
        } else if (typeof value === 'object' && value !== null) {
            collectPlaylistOptions(value, output);
        }
    }
    return output;
}

export function readPlaylistThumbnailUrl(node) {
    if (!node || typeof node !== 'object') {
        return '';
    }
    return pickThumbnailUrl(node.thumbnailDetails || node.thumbnail);
}

export function readPlaylistThumbnailFromBrowse(node) {
    if (!node || typeof node !== 'object') {
        return '';
    }
    const thumbnails = node.thumbnail?.thumbnails;
    if (Array.isArray(thumbnails) && thumbnails.length > 0) {
        return pickThumbnailUrl({ thumbnailDetails: { thumbnails } });
    }
    return '';
}

export function readPlaylistFirstVideoThumbnail(node) {
    if (!node || typeof node !== 'object') {
        return '';
    }
    const items = node.items || node.contents || [];
    for (const item of items) {
        if (item.playlistVideoListRenderer?.thumbnail?.thumbnails) {
            return pickThumbnailUrl({ thumbnailDetails: item.playlistVideoListRenderer.thumbnail });
        }
    }
    return '';
}

export function readPlaylistFirstVideoId(node) {
    if (!node || typeof node !== 'object') {
        return '';
    }
    const items = node.items || node.contents || [];
    for (const item of items) {
        const renderer = item.playlistVideoListRenderer || item.playlistVideoRenderer;
        if (renderer) {
            const videoId = readVideoIdFromRenderer(renderer);
            if (videoId) {
                return videoId;
            }
        }
    }
    return '';
}
