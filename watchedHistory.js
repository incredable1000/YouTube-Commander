// IndexedDB setup and operations
const DB_NAME = 'YouTubeCommanderDB';
const DB_VERSION = 1;
const STORE_NAME = 'watchedVideos';
let db = null;
let isInitialized = false;
let initializationRetries = 0;
const MAX_RETRIES = 3;

// Debug logging function
function debugLog(category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[YT-Commander][${timestamp}][${category}] ${message}`;
    console.log(logMessage, data ? data : '');
}

// Add a video to watched history and trigger sync
async function addToWatchedHistory(videoId) {
    if (!videoId) return;
    
    try {
        if (!db || !isInitialized) {
            debugLog('Watch', 'Database not initialized, reinitializing...');
            await reinitializeExtension();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put({ videoId, timestamp: Date.now() });

                request.onsuccess = () => {
                    debugLog('Watch', `Added video to history: ${videoId}`);
                    // Notify background script about the change for potential sync
                    chrome.runtime.sendMessage({ type: 'HISTORY_UPDATED' });
                    resolve();
                };
                request.onerror = () => reject(request.error);
            } catch (error) {
                debugLog('Watch', 'Error adding to history:', error);
                reject(error);
            }
        });
    } catch (error) {
        debugLog('Watch', 'Error in addToWatchedHistory:', error);
    }
}

// Get all watched videos
async function getAllWatchedVideos() {
    try {
        if (!db || !isInitialized) {
            await reinitializeExtension();
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                debugLog('Watch', 'Error getting all videos:', error);
                reject(error);
            }
        });
    } catch (error) {
        debugLog('Watch', 'Error in getAllWatchedVideos:', error);
        return [];
    }
}

// Update watched history from sync data
async function updateWatchedHistoryFromSync(videos) {
    try {
        if (!db || !isInitialized) {
            await reinitializeExtension();
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                
                let completed = 0;
                videos.forEach(video => {
                    const request = store.put(video);
                    request.onsuccess = () => {
                        completed++;
                        if (completed === videos.length) {
                            debugLog('Sync', `Updated ${videos.length} videos from sync`);
                            markWatchedVideosOnPage();
                            resolve();
                        }
                    };
                    request.onerror = () => reject(request.error);
                });
            } catch (error) {
                debugLog('Sync', 'Error updating from sync:', error);
                reject(error);
            }
        });
    } catch (error) {
        debugLog('Sync', 'Error in updateWatchedHistoryFromSync:', error);
        throw error;
    }
}

// Reinitialize the extension
async function reinitializeExtension() {
    debugLog('Init', 'Reinitializing extension...');
    isInitialized = false;
    db = null;
    initializationRetries = 0;
    videoIdCache.clear();
    await initialize();
}

// Initialize IndexedDB
async function initDB() {
    debugLog('DB', 'Initializing IndexedDB...');
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                debugLog('DB', 'Error opening database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                debugLog('DB', 'Database opened successfully');
                
                db.onerror = (event) => {
                    debugLog('DB', 'Database error:', event.target.error);
                    reinitializeExtension();
                };
                
                db.onclose = () => {
                    debugLog('DB', 'Database connection closed');
                    reinitializeExtension();
                };
                
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                debugLog('DB', 'Database upgrade needed');
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
                    debugLog('DB', 'Created store:', STORE_NAME);
                }
            };
        } catch (error) {
            debugLog('DB', 'Error in initDB:', error);
            reject(error);
        }
    });
}

// Inject CSS for watched indicator
function injectStyles() {
    if (!document.querySelector('#yt-commander-styles')) {
        const style = document.createElement('style');
        style.id = 'yt-commander-styles';
        style.textContent = `
            /* Custom watched indicator with full overlay */
            .yt-commander-watched {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                pointer-events: none !important;
                z-index: 10 !important;
                border-radius: 12px !important;
                background: rgba(0, 0, 0, 0.6) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            
            /* Add green checkmark in center */
            .yt-commander-watched::after {
                content: '✓' !important;
                width: 32px !important;
                height: 32px !important;
                background-color: #4CAF50 !important;
                color: white !important;
                border-radius: 50% !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 18px !important;
                font-weight: bold !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
            }
            @keyframes yt-commander-swing {
                0%, 100% { 
                    transform: rotate(0deg) scale(1) !important;
                }
                25% { 
                    transform: rotate(3deg) scale(1.05) !important;
                }
                75% { 
                    transform: rotate(-3deg) scale(1.05) !important;
                }
            }
            /* Only add positioning when absolutely necessary and don't force it on all elements */
            
            /* Ensure hover overlays work properly with watched indicator */
            a#thumbnail[watched] #mouseover-overlay,
            a#thumbnail[watched] #hover-overlays {
                z-index: 500 !important;
            }
            
            /* Make sure the watched indicator doesn't block hover detection */
            .yt-commander-watched {
                pointer-events: none !important;
            }
            
            /* Ensure moving thumbnail (hover video) appears above watched indicator */
            ytd-moving-thumbnail-renderer {
                z-index: 600 !important;
            }
        `;
        document.head.appendChild(style);
        debugLog('Styles', 'CSS styles injected successfully');
    }
}

// Create watched indicator element template
const indicatorTemplate = document.createElement('div');
indicatorTemplate.className = 'yt-commander-watched';

// Extract video ID from URL
function getVideoId(url) {
    if (!url) return null;
    const videoMatch = url.match(/(?:v=|\/shorts\/)([^&\/]+)/);
    const videoId = videoMatch ? videoMatch[1] : null;
    debugLog('VideoID', `Extracted video ID from URL: ${url}`, { videoId });
    return videoId;
}

// Cache for video IDs to prevent repeated regex operations
const videoIdCache = new Map();
function getCachedVideoId(url) {
    if (!url) return null;
    if (videoIdCache.has(url)) {
        return videoIdCache.get(url);
    }
    const videoId = getVideoId(url);
    if (videoId) {
        videoIdCache.set(url, videoId);
    }
    return videoId;
}

// Check if a video is watched
async function isVideoWatched(videoId) {
    if (!videoId) return false;
    
    try {
        if (!db || !isInitialized) {
            debugLog('Watch', 'Database not initialized, reinitializing...');
            await reinitializeExtension();
        }
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(videoId);

                request.onsuccess = () => {
                    const isWatched = !!request.result;
                    debugLog('Watch', `Video ${videoId} watched status:`, isWatched);
                    resolve(isWatched);
                };
                request.onerror = () => reject(request.error);
            } catch (error) {
                debugLog('Watch', 'Error checking video watched status:', error);
                reject(error);
            }
        });
    } catch (error) {
        debugLog('Watch', 'Error in isVideoWatched:', error);
        return false;
    }
}

// Track processed videos to prevent duplicates
const processedVideos = new Set();

// Check if we're on a Shorts page
function isShortsPage() {
    return location.pathname.startsWith('/shorts');
}

// Get the active video element
function getActiveVideo() {
    if (isShortsPage()) {
        const renderer = getActiveShortsRenderer();
        if (renderer) {
            // Video inside the active Shorts renderer
            const v = renderer.querySelector('video.html5-main-video');
            if (v) return v;
        }
        // Last resort: any Shorts video (not ideal but better than null)
        return document.querySelector('ytd-shorts video.html5-main-video');
    }
    // Regular watch page
    return document.querySelector('video.html5-main-video');
}

// Get the active Shorts renderer
function getActiveShortsRenderer() {
    // First try YouTube's explicit marker
    let active = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (active) {
        debugLog('Shorts', 'Found active Shorts renderer with is-active attribute');
        return active;
    }

    // Then try finding the renderer in the viewport center
    const renderers = Array.from(document.querySelectorAll('ytd-reel-video-renderer'));
    const midY = window.innerHeight / 2;
    for (const renderer of renderers) {
        const rect = renderer.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) {
            debugLog('Shorts', 'Found active Shorts renderer in viewport center');
            return renderer;
        }
    }
    return null;
}

// Watch for video playback
function handleVideoPlayback() {
    debugLog('Video', 'Setting up video playback handler');
    const url = window.location.href;
    const videoId = getVideoId(url);
    
    if (!videoId || processedVideos.has(videoId)) {
        return;
    }

    // Function to set up video tracking
    const setupVideoTracking = (video) => {
        if (!video) return;
        
        debugLog('Video', `Found video element for ${videoId}`);
        let playTime = 0;
        let lastUpdateTime = 0;

        // Mark as watched when video plays for 2 seconds
        const timeUpdateHandler = async () => {
            const currentTime = video.currentTime;
            if (currentTime > lastUpdateTime) {
                playTime += currentTime - lastUpdateTime;
                if (playTime >= 2 && !processedVideos.has(videoId)) {
                    debugLog('Video', `Marking video as watched: ${videoId}`);
                    processedVideos.add(videoId);
                    await addToWatchedHistory(videoId);
                    await markWatchedVideosOnPage();
                    video.removeEventListener('timeupdate', timeUpdateHandler);
                }
            }
            lastUpdateTime = currentTime;
        };

        video.addEventListener('timeupdate', timeUpdateHandler);
    };

    // Try to find video element based on page type
    let video;
    if (url.includes('/shorts/')) {
        const renderer = getActiveShortsRenderer();
        video = renderer ? renderer.querySelector('video') : document.querySelector('ytd-shorts video');
    } else {
        video = document.querySelector('video');
    }

    if (video) {
        setupVideoTracking(video);
    }

    // Also watch for video element being added
    const videoObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes) {
                const newVideo = url.includes('/shorts/') ?
                    (getActiveShortsRenderer()?.querySelector('video') || document.querySelector('ytd-shorts video')) :
                    document.querySelector('video');
                    
                if (newVideo && !newVideo.hasAttribute('data-yt-commander-tracked')) {
                    newVideo.setAttribute('data-yt-commander-tracked', 'true');
                    setupVideoTracking(newVideo);
                    videoObserver.disconnect();
                    break;
                }
            }
        }
    });

    videoObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Create Intersection Observer for Shorts in feed
function createShortsObserver() {
    debugLog('Shorts', 'Creating Shorts observer');
    
    return new IntersectionObserver(
        async (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;

                const container = entry.target;
                const link = container.querySelector('a[href*="/shorts/"]');
                if (!link) continue;
                
                const videoId = getCachedVideoId(link.href);
                if (!videoId || processedVideos.has(videoId)) continue;

                const video = container.querySelector('video');
                if (!video) continue;

                debugLog('Shorts', `Found video element for Short in feed: ${videoId}`);
                let playTime = 0;
                let lastUpdateTime = 0;

                // Mark Short as watched when played for 2 seconds
                const timeUpdateHandler = async () => {
                    const currentTime = video.currentTime;
                    if (currentTime > lastUpdateTime) {
                        playTime += currentTime - lastUpdateTime;
                        if (playTime >= 2 && !processedVideos.has(videoId)) {
                            debugLog('Shorts', `Marking Short as watched: ${videoId}`);
                            processedVideos.add(videoId);
                            await addToWatchedHistory(videoId);
                            await markWatchedVideosOnPage();
                            video.removeEventListener('timeupdate', timeUpdateHandler);
                        }
                    }
                    lastUpdateTime = currentTime;
                };

                video.addEventListener('timeupdate', timeUpdateHandler);
            }
        },
        { threshold: 0.7 } // Require 70% visibility
    );
}

// Mark watched videos on the page
async function markWatchedVideosOnPage() {
    debugLog('Marker', 'Starting to mark watched videos on page');
    try {
        // Handle both regular videos and Shorts
        const containers = document.querySelectorAll(`
            ytd-rich-item-renderer:not([data-watched-checked]),
            ytd-compact-video-renderer:not([data-watched-checked]),
            ytd-grid-video-renderer:not([data-watched-checked]),
            ytd-video-renderer:not([data-watched-checked]),
            ytd-reel-item-renderer:not([data-watched-checked]),
            ytd-playlist-video-renderer:not([data-watched-checked]),
            ytd-playlist-panel-video-renderer:not([data-watched-checked]),
            ytd-compact-playlist-renderer:not([data-watched-checked]),
            ytd-guide-entry-renderer:not([data-watched-checked]),
            ytm-shorts-lockup-view-model:not([data-watched-checked])
        `);
        
        debugLog('Marker', `Found ${containers.length} unchecked video containers`);
        
        const shortsObserver = createShortsObserver();
        
        for (const container of containers) {
            try {
                container.setAttribute('data-watched-checked', 'true');
                
                // Handle both regular video links and Shorts links
                const link = container.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
                if (!link) {
                    debugLog('Marker', 'No video link found in container', container);
                    continue;
                }

                const videoId = getCachedVideoId(link.href);
                if (!videoId) {
                    debugLog('Marker', 'Could not extract video ID from link:', link.href);
                    continue;
                }

                // If it's a Short, observe it for scrolling
                if (link.href.includes('/shorts/')) {
                    debugLog('Shorts', `Observing Short: ${videoId}`);
                    shortsObserver.observe(container);
                }

                const isWatched = await isVideoWatched(videoId);
                if (isWatched) {
                    debugLog('Marker', `Adding marker for watched video: ${videoId}`);
                    
                    // Try multiple possible thumbnail containers
                    const thumbnail = container.querySelector(`
                        a#thumbnail, 
                        .ytd-thumbnail, 
                        .thumbnail-container,
                        .ytThumbnailViewModelHost,
                        .shortsLockupViewModelHostThumbnailContainer
                    `);

                    if (thumbnail) {
                        // Add watched attribute for the overlay
                        thumbnail.setAttribute('watched', 'true');
                        
                        // Add the corner marker if not already present
                        if (!thumbnail.querySelector('.yt-commander-watched')) {
                            // Only set position relative if it's not already positioned
                            const computedStyle = window.getComputedStyle(thumbnail);
                            if (computedStyle.position === 'static') {
                                thumbnail.style.position = 'relative';
                            }
                            
                            const marker = indicatorTemplate.cloneNode(true);
                            thumbnail.appendChild(marker);
                            debugLog('Marker', 'Added marker to thumbnail', { videoId, thumbnail });
                        } else {
                            debugLog('Marker', 'Marker already exists on thumbnail', { videoId, thumbnail });
                        }
                    } else {
                        debugLog('Marker', 'Could not find thumbnail', { videoId });
                    }
                }
            } catch (error) {
                debugLog('Marker', 'Error processing container:', error);
                continue;
            }
        }
    } catch (error) {
        debugLog('Marker', 'Error in markWatchedVideosOnPage:', error);
        if (error.message.includes('Extension context invalidated')) {
            await reinitializeExtension();
        }
    }
}

// Watch for new video elements
const pageObserver = new MutationObserver((mutations) => {
    try {
        // Always check for new videos on any DOM change for better reliability
        debugLog('Observer', 'DOM mutation detected, checking for new videos');
        
        // Use a small debounce to prevent excessive processing
        if (window.ytCommanderMarkingTimeout) {
            clearTimeout(window.ytCommanderMarkingTimeout);
        }
        
        window.ytCommanderMarkingTimeout = setTimeout(() => {
            requestIdleCallback(
                () => markWatchedVideosOnPage(),
                { timeout: 1000 } // Max wait time of 1 second
            );
        }, 300); // 300ms debounce
    } catch (error) {
        debugLog('Observer', 'Error in mutation observer:', error);
    }
});

// Initialize extension
async function initialize() {
    debugLog('Init', 'Starting initialization');
    try {
        if (!isInitialized) {
            if (initializationRetries >= MAX_RETRIES) {
                debugLog('Init', 'Max initialization retries reached');
                return;
            }
            
            initializationRetries++;
            debugLog('Init', `Initialization attempt ${initializationRetries}/${MAX_RETRIES}`);
            
            await initDB();
            injectStyles();
            
            // Start observers with more comprehensive configuration
            const observerConfig = {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false
            };
            
            // Observe both document and common YouTube containers
            const observeTargets = [
                document.documentElement || document.body,
                ...Array.from(document.querySelectorAll('ytd-page-manager, ytd-browse, ytd-rich-grid-renderer, ytd-item-section-renderer'))
            ];
            
            observeTargets.forEach(target => {
                try {
                    if (target && target.nodeType === 1) {  // Only observe element nodes
                        pageObserver.observe(target, observerConfig);
                        debugLog('Observer', 'Started observing target:', target);
                    }
                } catch (e) {
                    debugLog('Observer', 'Error observing target:', e);
                }
            });
            
            isInitialized = true;
            debugLog('Init', 'Page observers started');
            
            // Initial setup with retry logic
            const setupWithRetry = async (attempt = 1, maxAttempts = 3) => {
                try {
                    await handleVideoPlayback();
                    await markWatchedVideosOnPage();
                    debugLog('Init', 'Initial page marking complete');
                    initializationRetries = 0; // Reset on success
                } catch (error) {
                    if (attempt < maxAttempts) {
                        debugLog('Init', `Retrying setup (${attempt}/${maxAttempts}):`, error);
                        setTimeout(() => setupWithRetry(attempt + 1, maxAttempts), 1000 * attempt);
                    } else {
                        debugLog('Init', 'Max setup attempts reached, giving up');
                        throw error;
                    }
                }
            };
            
            await setupWithRetry();
            
            // Watch for navigation and content changes
            setupNavigationObserver();

            // More aggressive periodic check with visibility check
            const checkAndMarkVideos = () => {
                if (!document.hidden) {
                    debugLog('Periodic', 'Checking for new videos');
                    markWatchedVideosOnPage().catch(e => 
                        debugLog('Periodic', 'Error marking videos:', e)
                    );
                }
            };
            
            // Initial check with delay to catch any missed videos
            setTimeout(checkAndMarkVideos, 1000);
            
            // Periodic checks
            const checkInterval = setInterval(checkAndMarkVideos, 3000);
            
            // Clean up on page unload
            window.addEventListener('unload', () => {
                clearInterval(checkInterval);
                debugLog('Cleanup', 'Cleared intervals and observers');
            });
            
            debugLog('Init', 'Initialization successful');
        }
    } catch (error) {
        debugLog('Init', 'Error in initialization:', error);
        setTimeout(initialize, 1000);
    }
}

// Setup navigation observer
function setupNavigationObserver() {
    debugLog('Navigation', 'Setting up navigation observers');
    
    // Store the last processed URL and timestamp
    let lastProcessedUrl = '';
    let lastProcessedTime = 0;
    let navigationTimeout = null;
    
    // Function to handle page updates
    const handlePageUpdate = (source) => {
        const now = Date.now();
        const url = window.location.href;
        
        // Skip if we just processed this URL or if it's too soon since the last update
        if ((url === lastProcessedUrl && (now - lastProcessedTime) < 1000) || 
            !document.body) {
            return;
        }
        
        debugLog('Navigation', `Page update detected (${source}):`, url);
        lastProcessedUrl = url;
        lastProcessedTime = now;
        
        // Clear any pending timeouts
        if (navigationTimeout) {
            clearTimeout(navigationTimeout);
        }
        
        // Process the update with a small delay to allow DOM to settle
        navigationTimeout = setTimeout(() => {
            // Check if we're on a video page
            let videoId = null;
            if (url.includes('/shorts/')) {
                const match = url.match(/\/shorts\/([^/?]+)/);
                videoId = match ? match[1] : null;
                debugLog('Navigation', 'Shorts video detected, setting up tracking');
                
                // Special handling for Shorts
                const checkShortsVideo = () => {
                    const video = getActiveVideo();
                    if (video) {
                        debugLog('Navigation', 'Found Shorts video element, setting up tracking');
                        handleVideoPlayback();
                    } else {
                        debugLog('Navigation', 'Shorts video not found, retrying...');
                        setTimeout(checkShortsVideo, 300);
                    }
                };
                setTimeout(checkShortsVideo, 100);
            } else if (url.includes('/watch')) {
                const urlParams = new URLSearchParams(new URL(url).search);
                videoId = urlParams.get('v');
                debugLog('Navigation', 'Regular video detected, setting up tracking');
                handleVideoPlayback();
            }
            
            // Always mark watched videos, even if not on a video page
            markWatchedVideosOnPage().catch(e => 
                debugLog('Navigation', 'Error marking videos:', e)
            );
            
        }, 300); // 300ms delay to allow for DOM updates
    };
    
    // 1. Watch for YouTube's navigation events
    document.addEventListener('yt-navigate-start', () => 
        debugLog('Navigation', 'YouTube navigation started'));
    
    document.addEventListener('yt-navigate-finish', () => {
        debugLog('Navigation', 'YouTube navigation finished');
        handlePageUpdate('yt-navigate-finish');
    });
    
    // 2. Watch for history changes (back/forward)
    window.addEventListener('popstate', () => {
        debugLog('Navigation', 'History state changed (popstate)');
        handlePageUpdate('popstate');
    });
    
    // 3. Override pushState and replaceState to detect SPA navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        debugLog('Navigation', 'History pushState');
        handlePageUpdate('pushState');
    };
    
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        debugLog('Navigation', 'History replaceState');
        handlePageUpdate('replaceState');
    };
    
    // 4. Watch for YouTube's AJAX page updates
    const handleMutations = (mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                const hasNewContent = Array.from(mutation.addedNodes).some(node => 
                    node.nodeType === 1 && 
                    (node.matches?.('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer') ||
                     node.querySelector?.('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer'))
                );
                
                if (hasNewContent) {
                    debugLog('Navigation', 'New video content detected in DOM');
                    handlePageUpdate('mutation');
                    break;
                }
            }
        }
    };
    
    const mutationObserver = new MutationObserver(handleMutations);
    mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    
    // 5. Initial check
    handlePageUpdate('initial');
    urlObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
    });
    
    window.addEventListener('popstate', handleUrlChange);
    const pushState = history.pushState;
    history.pushState = function() {
        pushState.apply(history, arguments);
        handleUrlChange();
    };

    // Watch for navigation clicks
    document.addEventListener('click', async (e) => {
        // Check for YouTube logo click (home navigation)
        const logoButton = e.target.closest('a[aria-label="YouTube"]');
        if (logoButton) {
            debugLog('Navigation', 'YouTube logo clicked, scheduling marker update');
            setTimeout(async () => {
                await markWatchedVideosOnPage();
            }, 1000);
        }

        // Check for navigation menu clicks
        const menuItem = e.target.closest('a[href^="/"], ytd-guide-entry-renderer a');
        if (menuItem) {
            debugLog('Navigation', 'Navigation menu item clicked, scheduling marker update');
            setTimeout(async () => {
                await markWatchedVideosOnPage();
            }, 1000);
        }
    }, true);

    // Watch for main content changes with enhanced Shorts detection
    const contentObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                const hasNewContent = Array.from(mutation.addedNodes).some(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        return node.querySelector('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer');
                    }
                    return false;
                });

                if (hasNewContent) {
                    debugLog('Content', 'Main content changed, updating markers');
                    markWatchedVideosOnPage();
                    // Check if we're on a Shorts page
                    if (location.href.includes('/shorts/')) {
                        debugLog('Content', 'New Shorts content detected, updating video tracking');
                        handleVideoPlayback();
                    }
                    break;
                }
            }
        }
    });

    // Start observing main content area
    const mainContent = document.querySelector('ytd-page-manager');
    if (mainContent) {
        contentObserver.observe(mainContent, {
            childList: true,
            subtree: true
        });
        debugLog('Content', 'Main content observer started');
    }
}

// Import watched history
async function importWatchedHistory(videoIds) {
    debugLog('Import', 'Starting import of watched history');
    try {
        if (!db || !isInitialized) {
            debugLog('Import', 'Database not initialized, reinitializing...');
            await reinitializeExtension();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                // Get all existing entries first
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const existingEntries = getAllRequest.result;
                    const existingIds = new Set(existingEntries.map(entry => entry.videoId));
                    let importCount = 0;

                    // Process each video ID
                    videoIds.forEach(videoId => {
                        if (videoId && videoId.trim()) {
                            const trimmedId = videoId.trim();
                            store.put({ videoId: trimmedId });
                            if (!existingIds.has(trimmedId)) {
                                importCount++;
                            }
                        }
                    });

                    transaction.oncomplete = () => {
                        debugLog('Import', `Import completed. Added ${importCount} new entries`);
                        resolve(importCount);
                    };
                };

                transaction.onerror = () => {
                    debugLog('Import', 'Error during import:', transaction.error);
                    reject(transaction.error);
                };
            } catch (error) {
                debugLog('Import', 'Error in import transaction:', error);
                reject(error);
            }
        });
    } catch (error) {
        debugLog('Import', 'Error in importWatchedHistory:', error);
        throw error;
    }
}

// Clear all watched history
async function clearWatchedHistory() {
    debugLog('Clear', 'Starting to clear watched history');
    try {
        if (!db || !isInitialized) {
            debugLog('Clear', 'Database not initialized, reinitializing...');
            await reinitializeExtension();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                
                const clearRequest = store.clear();
                
                clearRequest.onsuccess = () => {
                    debugLog('Clear', 'Successfully cleared watched history');
                    videoIdCache.clear();
                    resolve();
                };
                
                clearRequest.onerror = () => {
                    debugLog('Clear', 'Error clearing history:', clearRequest.error);
                    reject(clearRequest.error);
                };
            } catch (error) {
                debugLog('Clear', 'Error in clear transaction:', error);
                reject(error);
            }
        });
    } catch (error) {
        debugLog('Clear', 'Error in clearWatchedHistory:', error);
        throw error;
    }
}

// Show export reminder overlay
function showExportReminder() {
    const reminder = document.createElement('div');
    reminder.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
    `;
    reminder.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px;">📥 Backup Reminder</div>
        <div style="margin-bottom: 10px;">Time to export your YouTube watch history!</div>
        <button onclick="this.parentElement.remove()" style="background: white; color: #4CAF50; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Got it!</button>
    `;
    document.body.appendChild(reminder);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (reminder.parentElement) {
            reminder.remove();
        }
    }, 10000);
}

// Add missing helper functions
function refreshWatchedBadges() {
    debugLog('Badge', 'Refreshing watched badges');
    markWatchedVideosOnPage().catch(e => 
        debugLog('Badge', 'Error refreshing badges:', e)
    );
}

// Listen for sync messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REFRESH_BADGE') {
        refreshWatchedBadges();
    }
    else if (message.type === 'GET_WATCHED_COUNT') {
        getAllWatchedVideos().then(videos => {
            sendResponse({ count: videos.length });
        });
        return true;
    }
    else if (message.type === 'SHOW_EXPORT_REMINDER') {
        showExportReminder();
    }
    else if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
        getAllWatchedVideos()
            .then(videos => sendResponse({ success: true, videos }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
    else if (message.type === 'UPDATE_FROM_SYNC') {
        // Handle sync updates if needed
        sendResponse({ success: true });
        return true;
    }
});

// Start initialization
debugLog('Start', 'Extension script loaded');
initialize();