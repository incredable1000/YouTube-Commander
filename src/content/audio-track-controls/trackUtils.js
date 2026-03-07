/**
 * Track parsing/scoring helpers for audio-track controls.
 */

/**
 * Decode encoded metadata in YouTube audio track id.
 * @param {string} trackId
 * @returns {{language: string|null, type: string|null, isOriginal: boolean, isDubbed: boolean, decodedText: string}}
 */
function decodeTrackId(trackId) {
    const details = {
        language: null,
        type: null,
        isOriginal: false,
        isDubbed: false,
        decodedText: ''
    };

    if (typeof trackId !== 'string' || !trackId.includes(';')) {
        return details;
    }

    const encodedPart = trackId.split(';').slice(1).join(';');
    if (!encodedPart) {
        return details;
    }

    try {
        details.decodedText = atob(encodedPart);
    } catch (_error) {
        return details;
    }

    const lowered = details.decodedText.toLowerCase();

    if (lowered.includes('original')) {
        details.isOriginal = true;
        details.type = 'original';
    }

    if (lowered.includes('dubbed-auto') || lowered.includes('dubbed')) {
        details.isDubbed = true;
        details.type = 'dubbed-auto';
    }

    const languageMatch = details.decodedText.match(/([a-z]{2}(?:-[A-Z]{2})?)/);
    if (languageMatch) {
        details.language = languageMatch[1];
    }

    return details;
}

/**
 * Check whether track looks like original audio.
 * @param {any} track
 * @param {{isOriginal: boolean}} decodedInfo
 * @returns {boolean}
 */
function isTrackOriginal(track, decodedInfo) {
    if (track?.isOriginal === true || decodedInfo.isOriginal) {
        return true;
    }

    const text = `${track?.displayName || ''} ${track?.name || ''} ${track?.label || ''}`.toLowerCase();
    return /\boriginal\b/.test(text);
}

/**
 * Check whether track looks like dubbed/description audio.
 * @param {any} track
 * @param {{isDubbed: boolean}} decodedInfo
 * @returns {boolean}
 */
function isTrackDubbed(track, decodedInfo) {
    if (decodedInfo.isDubbed) {
        return true;
    }

    const text = `${track?.displayName || ''} ${track?.name || ''} ${track?.label || ''}`.toLowerCase();
    return text.includes('dubbed') || text.includes('audio description') || text.includes('descriptive');
}

/**
 * Normalize raw track info into internal model.
 * @param {any} track
 * @param {number} index
 * @param {string|null} currentTrackId
 * @returns {{id: string, label: string, language: string, kind: string, enabled: boolean, isOriginal: boolean, isDubbed: boolean}}
 */
function normalizeTrack(track, index, currentTrackId) {
    const decodedInfo = decodeTrackId(track?.id);
    const label = track?.displayName || track?.name || track?.label || `Track ${index + 1}`;

    return {
        id: track?.id || String(index),
        label,
        language: decodedInfo.language || track?.languageCode || track?.language || 'unknown',
        kind: track?.kind || 'main',
        enabled: !!currentTrackId && currentTrackId === track?.id,
        isOriginal: isTrackOriginal(track, decodedInfo),
        isDubbed: isTrackDubbed(track, decodedInfo)
    };
}

/**
 * Score one track for auto-selection.
 * @param {{label?: string, isOriginal?: boolean, isDubbed?: boolean, kind?: string}} track
 * @returns {number}
 */
function getTrackScore(track) {
    const loweredLabel = (track?.label || '').toLowerCase();
    let score = 0;

    if (track?.isOriginal) {
        score += 100;
    }

    if (!track?.isDubbed) {
        score += 25;
    }

    if (track?.kind === 'main') {
        score += 10;
    }

    if (loweredLabel.includes('original')) {
        score += 20;
    }

    if (loweredLabel.includes('dubbed') || loweredLabel.includes('descriptive')) {
        score -= 40;
    }

    return score;
}

/**
 * Pick preferred track using score model.
 * @param {Array<any>} tracks
 * @returns {any|null}
 */
function pickPreferredTrack(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
    }

    const scoredTracks = tracks
        .map((track) => ({ track, score: getTrackScore(track) }))
        .sort((left, right) => right.score - left.score);

    return scoredTracks[0]?.track || tracks[0] || null;
}

export {
    normalizeTrack,
    pickPreferredTrack
};
