/**
 * YouTube Detection Utilities
 * Centralized functions for detecting YouTube page types and finding elements
 */

/**
 * Check if current page is a video watch page
 */
export function isVideoPage() {
    return window.location.pathname.includes('/watch');
}

/**
 * Check if current page is YouTube Shorts
 */
export function isShortsPage() {
    return window.location.pathname.includes('/shorts');
}

/**
 * Check if current page is a playlist
 */
export function isPlaylistPage() {
    return window.location.href.includes('/playlist?');
}

/**
 * Get current video ID from URL
 */
export function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

/**
 * Get the active Shorts renderer element
 */
export function getActiveShortsRenderer() {
    // Prefer YouTube's explicit marker for the on-screen short
    let active = document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
    if (active) return active;

    // Fallback: pick the renderer intersecting the viewport center
    const renderers = Array.from(document.querySelectorAll('ytd-shorts ytd-reel-video-renderer'));
    const midY = window.innerHeight / 2;
    for (const r of renderers) {
        const rect = r.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) return r;
    }
    return null;
}

/**
 * Get the active video element (works for both regular videos and Shorts)
 */
export function getActiveVideo() {
    if (isShortsPage()) {
        const renderer = getActiveShortsRenderer();
        if (renderer) {
            const video = renderer.querySelector('video.html5-main-video');
            if (video) return video;
        }
        // Last resort: any Shorts video
        return document.querySelector('ytd-shorts video.html5-main-video');
    }
    // Regular watch page
    return document.querySelector('video.html5-main-video');
}

/**
 * Get the active player element (works for both regular videos and Shorts)
 */
export function getActivePlayer() {
    if (isShortsPage()) {
        const renderer = getActiveShortsRenderer();
        if (renderer) {
            const player = renderer.querySelector('.html5-video-player');
            if (player) return player;
        }
        return document.querySelector('ytd-shorts .html5-video-player');
    }
    return document.querySelector('.html5-video-player');
}

/**
 * Get YouTube player API (movie_player)
 */
export function getYouTubePlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
}

/**
 * Wait for YouTube player to be ready
 */
export function waitForPlayer(timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkPlayer = () => {
            const player = getYouTubePlayer();
            if (player) {
                resolve(player);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error('Player not found within timeout'));
                return;
            }
            
            setTimeout(checkPlayer, 100);
        };
        
        checkPlayer();
    });
}

/**
 * Wait for video element to be ready
 */
export function waitForVideo(timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkVideo = () => {
            const video = getActiveVideo();
            if (video) {
                resolve(video);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error('Video not found within timeout'));
                return;
            }
            
            setTimeout(checkVideo, 100);
        };
        
        checkVideo();
    });
}
