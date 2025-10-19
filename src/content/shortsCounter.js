/**
 * Shorts Counter - Refactored with DRY principles
 * Track and display count of watched YouTube Shorts
 */

import { isShortsPage, getCurrentVideoId } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
import { getLocalStorageData, setLocalStorageData } from './utils/storage.js';

// Create scoped logger
const logger = createLogger('ShortsCounter');

// Module state
let countedVideos = new Set();
let counter = 0;
let counterLabel = null;
let observer = null;

// Storage key for persisting counter data
const STORAGE_KEY = 'shortsCounterData';

/**
 * Load counter data from storage
 */
async function loadCounterData() {
    try {
        const data = await getLocalStorageData(STORAGE_KEY, { 
            countedVideos: [], 
            counter: 0 
        });
        
        countedVideos = new Set(data.countedVideos);
        counter = data.counter;
        
        logger.debug('Counter data loaded', { counter, videosCount: countedVideos.size });
    } catch (error) {
        logger.error('Failed to load counter data', error);
        countedVideos = new Set();
        counter = 0;
    }
}

/**
 * Save counter data to storage
 */
async function saveCounterData() {
    try {
        await setLocalStorageData(STORAGE_KEY, {
            countedVideos: Array.from(countedVideos),
            counter: counter
        });
        
        logger.debug('Counter data saved', { counter, videosCount: countedVideos.size });
    } catch (error) {
        logger.error('Failed to save counter data', error);
    }
}

/**
 * Create and style the counter label
 */
function createCounterLabel() {
    // Avoid duplicates
    if (counterLabel || document.getElementById('shorts-counter-label')) {
        return;
    }
    
    counterLabel = document.createElement('div');
    counterLabel.id = 'shorts-counter-label';
    
    // Apply modern styling
    Object.assign(counterLabel.style, {
        position: 'fixed',
        top: '80px',
        right: '20px',
        width: '60px',
        height: '60px',
        background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        fontSize: '18px',
        fontWeight: 'bold',
        textAlign: 'center',
        zIndex: '99999',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        backdropFilter: 'blur(10px)',
        border: '2px solid rgba(255, 255, 255, 0.2)'
    });
    
    // Add hover effects
    counterLabel.addEventListener('mouseenter', () => {
        counterLabel.style.transform = 'scale(1.1)';
        counterLabel.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
    });
    
    counterLabel.addEventListener('mouseleave', () => {
        counterLabel.style.transform = 'scale(1)';
        counterLabel.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    });
    
    // Add click handler to reset counter
    counterLabel.addEventListener('click', resetCounter);
    counterLabel.title = 'Click to reset counter';
    
    updateCounterDisplay();
    document.body.appendChild(counterLabel);
    
    logger.debug('Counter label created');
}

/**
 * Update the counter display
 */
function updateCounterDisplay() {
    if (counterLabel) {
        counterLabel.textContent = counter.toString();
        
        // Add animation for new count
        counterLabel.style.animation = 'none';
        requestAnimationFrame(() => {
            counterLabel.style.animation = 'pulse 0.3s ease-in-out';
        });
    }
}

/**
 * Remove counter label
 */
function removeCounterLabel() {
    if (counterLabel) {
        counterLabel.remove();
        counterLabel = null;
        logger.debug('Counter label removed');
    }
}

/**
 * Reset counter
 */
async function resetCounter() {
    try {
        countedVideos.clear();
        counter = 0;
        updateCounterDisplay();
        await saveCounterData();
        
        logger.info('Counter reset');
        
        // Visual feedback
        if (counterLabel) {
            const originalBg = counterLabel.style.background;
            counterLabel.style.background = '#27ae60';
            setTimeout(() => {
                if (counterLabel) {
                    counterLabel.style.background = originalBg;
                }
            }, 500);
        }
    } catch (error) {
        logger.error('Failed to reset counter', error);
    }
}

/**
 * Get current Shorts video ID from URL
 */
function getCurrentShortsId() {
    try {
        if (!isShortsPage()) return null;
        
        const url = new URL(window.location.href);
        const pathParts = url.pathname.split('/');
        const shortsIndex = pathParts.indexOf('shorts');
        
        if (shortsIndex !== -1 && pathParts[shortsIndex + 1]) {
            return pathParts[shortsIndex + 1];
        }
        
        // Fallback to query parameter
        return getCurrentVideoId();
    } catch (error) {
        logger.error('Failed to get Shorts ID', error);
        return null;
    }
}

/**
 * Check for new Shorts video and update counter
 */
async function checkForNewShorts() {
    try {
        const currentId = getCurrentShortsId();
        
        if (currentId && isShortsPage()) {
            // Create label if on Shorts page but no label exists
            if (!counterLabel) {
                createCounterLabel();
            }
            
            // Count unique video IDs
            if (!countedVideos.has(currentId)) {
                countedVideos.add(currentId);
                counter++;
                updateCounterDisplay();
                await saveCounterData();
                
                logger.debug(`New Shorts video counted: ${currentId}`, { totalCount: counter });
            }
        } else {
            // Not on Shorts page - remove label
            removeCounterLabel();
        }
    } catch (error) {
        logger.error('Failed to check for new Shorts', error);
    }
}

/**
 * Set up navigation observer
 */
function setupNavigationObserver() {
    // Clean up existing observer
    if (observer) {
        observer.disconnect();
    }
    
    let lastUrl = location.href;
    
    observer = createThrottledObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkForNewShorts();
        }
    }, 500);
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Add CSS animations
 */
function addAnimations() {
    if (document.querySelector('#shorts-counter-animations')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'shorts-counter-animations';
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Initialize Shorts counter
 */
async function initShortsCounter() {
    try {
        logger.info('Initializing Shorts counter');
        
        // Add CSS animations
        addAnimations();
        
        // Load saved counter data
        await loadCounterData();
        
        // Set up navigation observer
        setupNavigationObserver();
        
        // Initial check
        await checkForNewShorts();
        
        logger.info('Shorts counter initialized successfully', { counter });
    } catch (error) {
        logger.error('Failed to initialize Shorts counter', error);
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
    
    removeCounterLabel();
    
    logger.info('Shorts counter cleaned up');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShortsCounter);
} else {
    initShortsCounter();
}

// Export for potential external use
export {
    initShortsCounter,
    resetCounter,
    cleanup
};
