/**
 * Watched History - Refactored with DRY principles
 * Track and mark watched YouTube videos (Google Drive integration removed)
 */

import { getCurrentVideoId, isVideoPage } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
import { getLocalStorageData, setLocalStorageData } from './utils/storage.js';

// Create scoped logger
const logger = createLogger('WatchedHistory');

// IndexedDB setup
const DB_NAME = 'YouTubeCommanderDB';
const DB_VERSION = 1;
const STORE_NAME = 'watchedVideos';

// Module state
let db = null;
let isInitialized = false;
let observer = null;
let watchedVideosCache = new Set();

/**
 * Initialize IndexedDB
 */
async function initializeDB() {
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                logger.error('Failed to open IndexedDB', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                db = request.result;
                logger.info('IndexedDB initialized successfully');
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                
                // Create object store if it doesn't exist
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    logger.info('Created watched videos object store');
                }
            };
        } catch (error) {
            logger.error('Error initializing IndexedDB', error);
            reject(error);
        }
    });
}

/**
 * Add video to watched history
 */
async function addToWatchedHistory(videoId) {
    if (!videoId) return;
    
    try {
        if (!db || !isInitialized) {
            logger.warn('Database not initialized, reinitializing...');
            await initializeWatchedHistory();
        }
        
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                
                const videoData = {
                    videoId,
                    timestamp: Date.now(),
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    title: document.title || 'Unknown Title'
                };
                
                const request = store.put(videoData);
                
                request.onsuccess = () => {
                    logger.debug(`Added video to history: ${videoId}`);
                    watchedVideosCache.add(videoId);
                    
                    // Update markers on current page
                    setTimeout(() => {
                        markWatchedVideosOnPage();
                    }, 100);
                    
                    resolve();
                };
                
                request.onerror = () => {
                    logger.error('Failed to add video to history', request.error);
                    reject(request.error);
                };
            } catch (error) {
                logger.error('Error in database transaction', error);
                reject(error);
            }
        });
    } catch (error) {
        logger.error('Error in addToWatchedHistory', error);
    }
}

/**
 * Check if video is watched
 */
async function isVideoWatched(videoId) {
    if (!videoId || !db) return false;
    
    // Check cache first
    if (watchedVideosCache.has(videoId)) {
        return true;
    }
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(videoId);
            
            request.onsuccess = () => {
                const exists = !!request.result;
                if (exists) {
                    watchedVideosCache.add(videoId);
                }
                resolve(exists);
            };
            
            request.onerror = () => {
                logger.error('Error checking if video is watched', request.error);
                resolve(false);
            };
        } catch (error) {
            logger.error('Error in isVideoWatched', error);
            resolve(false);
        }
    });
}

/**
 * Get all watched videos
 */
async function getAllWatchedVideos() {
    if (!db) return [];
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const videos = request.result || [];
                logger.debug(`Retrieved ${videos.length} watched videos`);
                
                // Update cache
                watchedVideosCache.clear();
                videos.forEach(video => watchedVideosCache.add(video.videoId));
                
                resolve(videos);
            };
            
            request.onerror = () => {
                logger.error('Error getting all watched videos', request.error);
                resolve([]);
            };
        } catch (error) {
            logger.error('Error in getAllWatchedVideos', error);
            resolve([]);
        }
    });
}

/**
 * Get watched videos count
 */
async function getWatchedVideoCount() {
    if (!db) return 0;
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();
            
            request.onsuccess = () => {
                resolve(request.result || 0);
            };
            
            request.onerror = () => {
                logger.error('Error getting video count', request.error);
                resolve(0);
            };
        } catch (error) {
            logger.error('Error in getWatchedVideoCount', error);
            resolve(0);
        }
    });
}

/**
 * Clear all watched history
 */
async function clearWatchedHistory() {
    if (!db) return false;
    
    return new Promise((resolve) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            
            request.onsuccess = () => {
                watchedVideosCache.clear();
                logger.info('Cleared all watched history');
                markWatchedVideosOnPage(); // Refresh markers
                resolve(true);
            };
            
            request.onerror = () => {
                logger.error('Error clearing watched history', request.error);
                resolve(false);
            };
        } catch (error) {
            logger.error('Error in clearWatchedHistory', error);
            resolve(false);
        }
    });
}

/**
 * Mark watched videos on current page
 */
async function markWatchedVideosOnPage() {
    try {
        // Remove existing markers
        const existingMarkers = document.querySelectorAll('.yt-commander-watched-marker');
        existingMarkers.forEach(marker => marker.remove());
        
        // Find video thumbnails and mark watched ones
        const videoElements = document.querySelectorAll('a[href*="/watch?v="]');
        
        for (const element of videoElements) {
            const href = element.getAttribute('href');
            const videoId = extractVideoId(href);
            
            if (videoId && await isVideoWatched(videoId)) {
                addWatchedMarker(element);
            }
        }
    } catch (error) {
        logger.error('Error marking watched videos', error);
    }
}

/**
 * Extract video ID from URL
 */
function extractVideoId(url) {
    try {
        const match = url.match(/[?&]v=([^&]+)/);
        return match ? match[1] : null;
    } catch (error) {
        return null;
    }
}

/**
 * Add watched marker to video element
 */
function addWatchedMarker(element) {
    try {
        // Avoid duplicate markers
        if (element.querySelector('.yt-commander-watched-marker')) {
            return;
        }
        
        const marker = document.createElement('div');
        marker.className = 'yt-commander-watched-marker';
        marker.innerHTML = '✓';
        
        // Style the marker
        Object.assign(marker.style, {
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'rgba(0, 150, 0, 0.9)',
            color: 'white',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            zIndex: '1000',
            pointerEvents: 'none'
        });
        
        // Find thumbnail container
        const thumbnail = element.querySelector('img, .yt-core-image');
        if (thumbnail && thumbnail.parentNode) {
            const container = thumbnail.parentNode;
            if (container.style.position !== 'relative') {
                container.style.position = 'relative';
            }
            container.appendChild(marker);
        }
    } catch (error) {
        logger.error('Error adding watched marker', error);
    }
}

/**
 * Track current video as watched
 */
function trackCurrentVideo() {
    try {
        if (!isVideoPage()) return;
        
        const videoId = getCurrentVideoId();
        if (videoId) {
            // Add to history after a short delay to ensure video actually started
            setTimeout(() => {
                addToWatchedHistory(videoId);
            }, 5000); // 5 second delay
        }
    } catch (error) {
        logger.error('Error tracking current video', error);
    }
}

/**
 * Set up page observers
 */
function setupPageObservers() {
    // Clean up existing observer
    if (observer) {
        observer.disconnect();
    }
    
    // Watch for page changes and new video elements
    observer = createThrottledObserver(() => {
        markWatchedVideosOnPage();
        trackCurrentVideo();
    }, 2000);
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also track navigation changes
    let lastUrl = location.href;
    const navigationObserver = createThrottledObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(() => {
                trackCurrentVideo();
                markWatchedVideosOnPage();
            }, 1000);
        }
    }, 500);
    
    navigationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Initialize watched history tracking
 */
async function initWatchedHistory() {
    try {
        logger.info('Initializing watched history tracking');
        
        // Initialize database
        await initializeDB();
        isInitialized = true;
        
        // Load initial cache
        await getAllWatchedVideos();
        
        // Set up page observers
        setupPageObservers();
        
        // Track current video if on video page
        trackCurrentVideo();
        
        // Mark watched videos on current page
        setTimeout(() => {
            markWatchedVideosOnPage();
        }, 1000);
        
        logger.info('Watched history tracking initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize watched history', error);
        isInitialized = false;
    }
}

/**
 * Cleanup function
 */
function cleanup() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    
    if (db) {
        db.close();
        db = null;
    }
    
    isInitialized = false;
    watchedVideosCache.clear();
    
    logger.info('Watched history cleaned up');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWatchedHistory);
} else {
    initWatchedHistory();
}

// Export for potential external use
export {
    initWatchedHistory,
    addToWatchedHistory,
    isVideoWatched,
    getAllWatchedVideos,
    getWatchedVideoCount,
    clearWatchedHistory,
    cleanup
};
