// ==UserScript==
// @name         YouTube Video Quality Controller
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.youtube.com/*
// @grant        storage
// @run-at       document-start
// @world        MAIN
// ==/UserScript==

// Keep track of user's preferred quality
let userPreferredQuality = 'hd1080';

// Function to set video quality
const lockQuality = (preferredQuality = 'hd1080') => {
    // Update user's preferred quality
    userPreferredQuality = preferredQuality;
    
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');

    if (player && typeof player.getAvailableQualityLevels === 'function') {
        const qualityLevels = player.getAvailableQualityLevels();

        if (qualityLevels.includes(preferredQuality)) {
            player.setPlaybackQualityRange(preferredQuality, preferredQuality);
            player.setPlaybackQuality(preferredQuality);
        } else if (qualityLevels.length > 0) {
            // Find the highest available quality that's not higher than preferred
            const qualityOrder = ['highres', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
            const preferredIndex = qualityOrder.indexOf(preferredQuality);
            let bestQuality = qualityLevels[0];
            
            // If preferred quality is 4K (highres), try to find it or the closest
            if (preferredQuality === 'highres') {
                // Look for 4K variants
                const fourKQualities = qualityLevels.filter(q => 
                    q === 'highres' || q.includes('2160') || q.includes('4K')
                );
                if (fourKQualities.length > 0) {
                    bestQuality = fourKQualities[0];
                } else {
                    // Fallback to highest available
                    bestQuality = qualityLevels[0];
                }
            } else {
                // Find best quality within the limit
                for (const quality of qualityLevels) {
                    const qualityIndex = qualityOrder.indexOf(quality);
                    if (qualityIndex >= preferredIndex) {
                        bestQuality = quality;
                        break;
                    }
                }
            }
            
            player.setPlaybackQualityRange(bestQuality, bestQuality);
            player.setPlaybackQuality(bestQuality);
        }
    }
};

// Function to check if we're on a video page
function isVideoPage() {
    return window.location.pathname.includes('/watch');
}

// Track last processed video to avoid redundant quality setting
let lastVideoId = null;

// Function to handle quality control with retry
function handleQualityControl(quality = null) {
    if (!isVideoPage()) return;

    // Check if this is the same video to avoid redundant processing
    const currentVideoId = new URLSearchParams(window.location.search).get('v');
    if (currentVideoId === lastVideoId && !quality) {
        return; // Same video, no need to reprocess unless explicitly requested
    }
    lastVideoId = currentVideoId;

    // Use provided quality or fall back to user's preferred quality
    const targetQuality = quality || userPreferredQuality;

    let attempts = 0;
    const maxAttempts = 30; // Increased for very slow connections (60+ seconds total)
    let lastAttemptTime = Date.now();
    
    const attemptSetQuality = () => {
        if (attempts >= maxAttempts) {
            return;
        }
        
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getAvailableQualityLevels === 'function') {
            // Check if quality levels are actually available (player fully loaded)
            const qualityLevels = player.getAvailableQualityLevels();
            if (qualityLevels && qualityLevels.length > 0) {
                lockQuality(targetQuality);
                return; // Success, stop retrying
            }
        }
        
        attempts++;
        const currentTime = Date.now();
        const timeSinceLastAttempt = currentTime - lastAttemptTime;
        lastAttemptTime = currentTime;
        
        // Adaptive delay: start with 1s, increase to 4s for very slow connections
        const delay = Math.min(1000 + (attempts * 100), 4000);
        setTimeout(() => attemptSetQuality(), delay);
    };
    
    attemptSetQuality();
    
    // Also listen for video events that indicate the player is ready
    const video = document.querySelector('video');
    if (video) {
        const onVideoReady = () => {
            // Give a small delay for player API to be fully ready
            setTimeout(() => {
                const player = document.querySelector('#movie_player');
                if (player && typeof player.getAvailableQualityLevels === 'function') {
                    const qualityLevels = player.getAvailableQualityLevels();
                    if (qualityLevels && qualityLevels.length > 0) {
                        lockQuality(targetQuality);
                    }
                }
            }, 500);
        };
        
        // Listen for multiple video events that indicate readiness
        video.addEventListener('loadedmetadata', onVideoReady, { once: true });
        video.addEventListener('canplay', onVideoReady, { once: true });
        video.addEventListener('playing', onVideoReady, { once: true });
    }
}

// Set up mutation observer to detect video changes (throttled)
let observerTimeout = null;
const observer = new MutationObserver((mutations) => {
    // Throttle the observer to prevent excessive calls
    if (observerTimeout) return;
    
    observerTimeout = setTimeout(() => {
        observerTimeout = null;
        // Only process if we're on a video page and there are significant changes
        if (isVideoPage()) {
            const hasVideoElement = mutations.some(mutation => 
                Array.from(mutation.addedNodes).some(node => 
                    node.nodeType === 1 && (
                        node.id === 'movie_player' || 
                        node.querySelector && node.querySelector('#movie_player')
                    )
                )
            );
            
            if (hasVideoElement) {
                handleQualityControl();
            }
        }
    }, 1000); // Throttle to once per second
});

// Start observing with reduced scope
observer.observe(document.body, {
    childList: true,
    subtree: false // Reduced scope to prevent excessive triggering
});

// Handle YouTube's navigation events
document.addEventListener('yt-navigate-finish', () => handleQualityControl());

// Initial quality control
handleQualityControl();

// Also try when the page loads
window.addEventListener('load', () => handleQualityControl());

// No fallback - just use the quality from settings

// Listen for messages from the content script
window.addEventListener('message', (event) => {
    if (event.data.type === 'SET_QUALITY') {
        // Force quality change by resetting lastVideoId
        lastVideoId = null;
        handleQualityControl(event.data.quality);
    }
});