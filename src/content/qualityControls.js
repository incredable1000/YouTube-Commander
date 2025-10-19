/**
 * Quality Controls - Refactored with DRY principles
 * Main world script for YouTube quality control using YouTube's internal API
 */

// Note: This runs in MAIN world to access YouTube's player API
// Cannot import ES modules here, so we'll use a simpler approach

// Keep track of user's preferred quality
let userPreferredQuality = 'hd1080';
let isInitialized = false;

// Quality levels in order of preference (highest to lowest)
const QUALITY_ORDER = [
    'highres',   // 4K
    'hd1440',    // 1440p
    'hd1080',    // 1080p
    'hd720',     // 720p
    'large',     // 480p
    'medium',    // 360p
    'small',     // 240p
    'tiny'       // 144p
];

/**
 * Debug logging function
 */
function debugLog(message, data = null) {
    console.log(`[YT-Commander][QualityControls] ${message}`, data || '');
}

/**
 * Get YouTube player instance
 */
function getPlayer() {
    return document.getElementById('movie_player') || 
           document.querySelector('.html5-video-player');
}

/**
 * Set video quality using YouTube's internal API
 */
function setVideoQuality(preferredQuality = 'hd1080') {
    try {
        // Update user's preferred quality
        userPreferredQuality = preferredQuality;
        
        const player = getPlayer();
        
        if (!player || typeof player.getAvailableQualityLevels !== 'function') {
            debugLog('Player not ready or API not available');
            return false;
        }
        
        const availableQualities = player.getAvailableQualityLevels();
        debugLog('Available qualities:', availableQualities);
        
        if (availableQualities.length === 0) {
            debugLog('No quality levels available');
            return false;
        }
        
        let targetQuality = preferredQuality;
        
        // If preferred quality is available, use it
        if (availableQualities.includes(preferredQuality)) {
            targetQuality = preferredQuality;
        } else {
            // Find the best available quality within the limit
            targetQuality = findBestAvailableQuality(preferredQuality, availableQualities);
        }
        
        // Set the quality
        if (targetQuality) {
            player.setPlaybackQualityRange(targetQuality, targetQuality);
            player.setPlaybackQuality(targetQuality);
            
            debugLog(`Quality set to: ${targetQuality} (requested: ${preferredQuality})`);
            return true;
        }
        
        return false;
    } catch (error) {
        debugLog('Error setting video quality:', error);
        return false;
    }
}

/**
 * Find the best available quality within the preferred limit
 */
function findBestAvailableQuality(preferredQuality, availableQualities) {
    const preferredIndex = QUALITY_ORDER.indexOf(preferredQuality);
    
    if (preferredIndex === -1) {
        // Unknown quality, return highest available
        return availableQualities[0];
    }
    
    // Find the highest quality that's not higher than preferred
    for (let i = preferredIndex; i < QUALITY_ORDER.length; i++) {
        const quality = QUALITY_ORDER[i];
        if (availableQualities.includes(quality)) {
            return quality;
        }
    }
    
    // If no quality found within limit, return highest available
    return availableQualities[0];
}

/**
 * Monitor for quality changes and reapply if needed
 */
function monitorQualityChanges() {
    const player = getPlayer();
    if (!player) return;
    
    // Check current quality periodically
    const checkInterval = setInterval(() => {
        try {
            if (typeof player.getPlaybackQuality === 'function') {
                const currentQuality = player.getPlaybackQuality();
                const availableQualities = player.getAvailableQualityLevels();
                
                // If quality changed unexpectedly, reapply preferred quality
                if (currentQuality && currentQuality !== userPreferredQuality) {
                    const expectedQuality = findBestAvailableQuality(userPreferredQuality, availableQualities);
                    
                    if (currentQuality !== expectedQuality) {
                        debugLog(`Quality drift detected: ${currentQuality} -> ${expectedQuality}`);
                        setVideoQuality(userPreferredQuality);
                    }
                }
            }
        } catch (error) {
            // Player might not be ready, ignore errors
        }
    }, 5000); // Check every 5 seconds
    
    // Clean up interval after 5 minutes to avoid memory leaks
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 300000);
}

/**
 * Handle messages from content script
 */
function handleMessages() {
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        if (event.data.type === 'SET_QUALITY') {
            const quality = event.data.quality;
            debugLog('Received quality change request:', quality);
            
            // Apply quality immediately and retry if needed
            const success = setVideoQuality(quality);
            
            if (!success) {
                // Retry after a short delay
                setTimeout(() => {
                    setVideoQuality(quality);
                }, 1000);
            }
            
            // Send confirmation back
            window.postMessage({
                type: 'QUALITY_CHANGED',
                quality: quality,
                success: success
            }, '*');
        }
    });
    
    debugLog('Message listeners set up');
}

/**
 * Wait for YouTube player to be ready
 */
function waitForPlayer() {
    return new Promise((resolve) => {
        const checkPlayer = () => {
            const player = getPlayer();
            if (player && typeof player.getAvailableQualityLevels === 'function') {
                resolve(player);
            } else {
                setTimeout(checkPlayer, 500);
            }
        };
        checkPlayer();
    });
}

/**
 * Initialize quality controls
 */
async function initQualityControls() {
    if (isInitialized) return;
    
    try {
        debugLog('Initializing quality controls (main world)');
        
        // Wait for player to be ready
        await waitForPlayer();
        
        // Set up message handling
        handleMessages();
        
        // Start monitoring quality changes
        monitorQualityChanges();
        
        // Apply default quality
        setVideoQuality(userPreferredQuality);
        
        isInitialized = true;
        debugLog('Quality controls initialized successfully');
    } catch (error) {
        debugLog('Failed to initialize quality controls:', error);
    }
}

/**
 * Handle page navigation in YouTube SPA
 */
function handleNavigation() {
    let lastUrl = location.href;
    
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            
            // Reinitialize on navigation
            if (location.pathname.includes('/watch')) {
                setTimeout(() => {
                    setVideoQuality(userPreferredQuality);
                }, 2000);
            }
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initQualityControls();
        handleNavigation();
    });
} else {
    initQualityControls();
    handleNavigation();
}

// Export for potential external use (in main world)
window.ytCommanderQualityControls = {
    setVideoQuality,
    getPlayer,
    init: initQualityControls
};
