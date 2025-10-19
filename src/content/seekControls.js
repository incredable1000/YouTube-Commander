/**
 * Seek Controls - Refactored with DRY principles
 * Enhanced video seeking functionality using shared utilities
 */

import {
    getActiveVideo,
    getActivePlayer,
    isVideoPage,
    isShortsPage,
    waitForVideo
} from './utils/youtube.js';

import {
    getStorageData,
    setStorageData,
    onStorageChanged
} from './utils/storage.js';

import {
    createLogger
} from './utils/logger.js';

import {
    createKeyboardShortcut,
    waitForElement,
    createThrottledObserver
} from './utils/events.js';

import {
    createButton,
    createSeekIndicator,
    showIndicatorOnPlayer,
    ensureAnimations
} from './utils/ui.js';

import {
    DEFAULT_SETTINGS,
    SELECTORS,
    CSS_CLASSES,
    STORAGE_KEYS
} from '../shared/constants.js';

// Create scoped logger
const logger = createLogger('SeekControls');

// Module state
let settings = { ...DEFAULT_SETTINGS };
let keyboardShortcuts = [];
let buttonsContainer = null;

/**
 * Initialize seek controls
 */
async function initSeekControls() {
    try {
        logger.info('Initializing seek controls');
        
        // Ensure animations are loaded
        ensureAnimations();
        
        // Load settings
        await loadSettings();
        
        // Set up keyboard shortcuts
        setupKeyboardShortcuts();
        
        // Create UI buttons
        await createSeekButtons();
        
        // Listen for settings changes
        onStorageChanged(handleSettingsChange);
        
        // Set up page navigation observer
        setupNavigationObserver();
        
        logger.info('Seek controls initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize seek controls', error);
    }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
    try {
        const data = await getStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
        settings = { ...DEFAULT_SETTINGS, ...data };
        logger.debug('Settings loaded', settings);
    } catch (error) {
        logger.error('Failed to load settings', error);
        settings = { ...DEFAULT_SETTINGS };
    }
}

/**
 * Handle settings changes
 */
function handleSettingsChange(changes) {
    if (changes[STORAGE_KEYS.SETTINGS]) {
        const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue;
        settings = { ...DEFAULT_SETTINGS, ...newSettings };
        logger.info('Settings updated', settings);
        
        // Recreate shortcuts and buttons
        setupKeyboardShortcuts();
        createSeekButtons();
    }
}

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    // Clean up existing shortcuts
    keyboardShortcuts.forEach(cleanup => cleanup());
    keyboardShortcuts = [];
    
    // Create new shortcuts
    const shortcuts = [
        { setting: 'shortSeekKey', amount: settings.shortSeek },
        { setting: 'mediumSeekKey', amount: settings.mediumSeek },
        { setting: 'longSeekKey', amount: settings.longSeek }
    ];
    
    shortcuts.forEach(({ setting, amount }) => {
        const shortcut = settings[setting];
        if (!shortcut) return;
        
        // Forward seek
        const forwardCleanup = createKeyboardShortcut(
            { ...shortcut, key: 'ArrowRight' },
            () => performSeek(amount, 'forward')
        );
        
        // Backward seek
        const backwardCleanup = createKeyboardShortcut(
            { ...shortcut, key: 'ArrowLeft' },
            () => performSeek(amount, 'backward')
        );
        
        keyboardShortcuts.push(forwardCleanup, backwardCleanup);
    });
    
    logger.debug('Keyboard shortcuts set up', shortcuts.length * 2);
}

/**
 * Perform seek operation
 */
async function performSeek(seconds, direction) {
    try {
        const video = getActiveVideo();
        if (!video) {
            logger.warn('No active video found for seeking');
            return;
        }
        
        const currentTime = video.currentTime;
        const seekAmount = direction === 'forward' ? seconds : -seconds;
        const newTime = Math.max(0, Math.min(video.duration || 0, currentTime + seekAmount));
        
        // Perform the seek
        video.currentTime = newTime;
        
        // Show visual indicator
        showSeekIndicator(direction, seconds);
        
        logger.debug(`Seeked ${direction} ${seconds}s: ${currentTime.toFixed(2)}s → ${newTime.toFixed(2)}s`);
    } catch (error) {
        logger.error('Failed to perform seek', error);
    }
}

/**
 * Show seek indicator (like legacy version)
 */
function showSeekIndicator(direction, seconds) {
    try {
        // Skip showing seek indicator on Shorts pages
        if (isShortsPage()) {
            return;
        }
        
        const video = getActiveVideo();
        const player = getActivePlayer();
        if (!video || !player) return;

        // Remove existing indicator if any
        const existingIndicator = document.querySelector('.modern-seek-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Create modern YouTube-style indicator
        const indicator = document.createElement('div');
        indicator.className = `modern-seek-indicator ${direction}`;
        
        // Create the seek amount text (like YouTube's new style)
        const seekText = document.createElement('div');
        seekText.className = 'seek-amount';
        seekText.textContent = `${direction === 'forward' ? '+' : '-'}${seconds}`;
        
        indicator.appendChild(seekText);

        // Position indicator based on video player dimensions
        const videoRect = video.getBoundingClientRect();
        
        // Calculate vertical center relative to video (110px is indicator height)
        const verticalCenter = (videoRect.height - 110) / 2;
        indicator.style.top = `${verticalCenter}px`;

        // Add to video player
        player.appendChild(indicator);
        
        // Remove the indicator after animation
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 2000); // Match 2s animation duration
        
        logger.debug(`Showed ${direction} seek indicator for ${seconds}s`);
    } catch (error) {
        logger.error('Failed to show seek indicator', error);
    }
}

/**
 * Create seek buttons UI
 */
async function createSeekButtons() {
    try {
        // Only show buttons on video pages, not Shorts
        if (!isVideoPage() || isShortsPage()) {
            logger.debug('Skipping seek buttons - not on video page or on Shorts');
            return;
        }
        
        // Wait for time duration element (like legacy version)
        const totalTime = await waitForElement('.ytp-time-duration', 5000);
        if (!totalTime) {
            logger.warn('Time duration element not found');
            return;
        }
        
        logger.debug('Time duration found, creating seek buttons');
        
        // Remove existing buttons
        if (buttonsContainer) {
            buttonsContainer.remove();
        }
        
        // Create container (like legacy version)
        buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'custom-seek-buttons';
        
        const seekTimes = [
            { seconds: settings.shortSeek, label: `${settings.shortSeek}s` },
            { seconds: settings.mediumSeek, label: `${settings.mediumSeek}s` },
            { seconds: settings.longSeek, label: `${settings.longSeek}s` }
        ];
        
        seekTimes.forEach(({ seconds, label }) => {
            // Backward button - clean number only
            const backButton = document.createElement('button');
            backButton.className = 'custom-seek-button backward';
            backButton.textContent = seconds.toString();
            backButton.title = `Seek backward ${seconds} seconds`;
            backButton.onclick = (e) => {
                e.stopPropagation();
                performSeek(seconds, 'backward');
            };
            
            // Forward button - clean number only
            const forwardButton = document.createElement('button');
            forwardButton.className = 'custom-seek-button forward';
            forwardButton.textContent = seconds.toString();
            forwardButton.title = `Seek forward ${seconds} seconds`;
            forwardButton.onclick = (e) => {
                e.stopPropagation();
                performSeek(seconds, 'forward');
            };
            
            buttonsContainer.appendChild(backButton);
            buttonsContainer.appendChild(forwardButton);
        });
        
        // Insert after the time display (like legacy version)
        const timeDisplay = totalTime.parentElement;
        if (timeDisplay) {
            timeDisplay.appendChild(buttonsContainer);
            logger.debug('Seek buttons created and inserted');
        }
    } catch (error) {
        logger.error('Failed to create seek buttons', error);
    }
}

/**
 * Set up navigation observer to recreate buttons on page changes
 */
function setupNavigationObserver() {
    const observer = createThrottledObserver(() => {
        if (isVideoPage()) {
            createSeekButtons();
        }
    }, 1000);
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Cleanup function
 */
function cleanup() {
    keyboardShortcuts.forEach(cleanup => cleanup());
    keyboardShortcuts = [];
    
    if (buttonsContainer) {
        buttonsContainer.remove();
        buttonsContainer = null;
    }
    
    logger.info('Seek controls cleaned up');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeekControls);
} else {
    initSeekControls();
}

// Export for potential external use
export {
    initSeekControls,
    performSeek,
    cleanup
};
