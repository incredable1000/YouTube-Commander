/**
 * Playlist data utilities for extracting structured data from YouTube API responses.
 */

export function readText(field) {
    if (!field) {
        return '';
    }

    if (typeof field.simpleText === 'string') {
        return field.simpleText;
    }

    if (Array.isArray(field.runs)) {
        return field.runs
            .map((run) => run?.text || '')
            .join('')
            .trim();
    }

    return '';
}

export function findPlaylistIdInNode(node, visited = new WeakSet()) {
    if (!node || typeof node !== 'object') {
        return null;
    }

    if (visited.has(node)) {
        return null;
    }
    visited.add(node);

    if (typeof node.playlistId === 'string' && node.playlistId.length > 2) {
        return node.playlistId;
    }

    if (typeof node.setVideoId === 'string' && node.setVideoId.length > 2) {
        return node.setVideoId;
    }

    for (const key of Object.keys(node)) {
        const result = findPlaylistIdInNode(node[key], visited);
        if (result) {
            return result;
        }
    }

    return null;
}

export function normalizePrivacyStatus(raw) {
    if (typeof raw !== 'string') {
        return 'PRIVATE';
    }
    const upper = raw.toUpperCase();
    if (upper === 'PUBLIC' || upper === 'UNLISTED' || upper === 'PRIVATE') {
        return upper;
    }
    return 'PRIVATE';
}

export function collectPlaylistOptions(node, output, visited) {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (visited.has(node)) {
        return;
    }
    visited.add(node);

    if (Array.isArray(node)) {
        node.forEach((item) => collectPlaylistOptions(item, output, visited));
        return;
    }

    const playlistId = node.playlistId || findPlaylistIdInNode(node);
    const title = readText(node.title) || readText(node.displayName) || readText(node.titleText);
    const privacy = normalizePrivacyStatus(node.privacy);

    if (playlistId && title) {
        output.push({
            id: playlistId,
            title,
            privacy,
            thumbnailUrl: '',
            videoCount: 0,
        });
        return;
    }

    Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') {
            collectPlaylistOptions(value, output, visited);
        }
    });
}

export function readPlaylistThumbnailUrl(renderer) {
    if (!renderer) {
        return '';
    }

    const thumbnails =
        renderer.thumbnail?.thumbnails || renderer.thumbnailRenderer?.thumbnail?.thumbnails || [];
    return thumbnails[0]?.url || '';
}

export function readPlaylistThumbnailFromBrowse(body) {
    if (!body || typeof body !== 'object') {
        return '';
    }

    const thumbnails =
        body?.metadata?.playlistMetadataRenderer?.thumbnail?.thumbnails ||
        body?.microformat?.playlistMicroformatRenderer?.thumbnail?.thumbnails ||
        [];
    return thumbnails[0]?.url || '';
}

export function readPlaylistFirstVideoThumbnail(body) {
    if (!body || typeof body !== 'object') {
        return '';
    }

    const thumbnails =
        body?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
            ?.playlistVideoListRenderer?.contents?.[0]?.playlistVideoRenderer?.thumbnail
            ?.thumbnails ||
        body?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
            ?.playlistVideoListRenderer?.continuations?.[0]?.nextContinuationData?.continuation ||
        [];
    return thumbnails[0]?.url || '';
}

export function readPlaylistFirstVideoId(body) {
    if (!body || typeof body !== 'object') {
        return '';
    }

    const contents =
        body?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
            ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
            ?.playlistVideoListRenderer?.contents || [];
    for (const item of contents) {
        const videoId = item?.playlistVideoRenderer?.videoId;
        if (typeof videoId === 'string' && videoId.length >= 10) {
            return videoId;
        }
    }
    return '';
}
