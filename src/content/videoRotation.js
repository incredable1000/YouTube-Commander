/**
 * Video Rotation - Refactored with DRY principles
 * Enhanced video rotation functionality using shared utilities
 */

import { 
    getActiveVideo, 
    getActivePlayer, 
    isVideoPage, 
    isShortsPage 
} from './utils/youtube.js';

import { waitForElement } from './utils/events.js';

import { createLogger } from './utils/logger.js';
import { 
    createButton, 
    createIcon, 
    createRotationIndicator, 
    showIndicatorOnPlayer 
} from './utils/ui.js';
import { 
    createKeyboardShortcut, 
    createThrottledObserver 
} from './utils/events.js';
import { 
    getStorageData, 
    setStorageData, 
    onStorageChanged 
} from './utils/storage.js';
import { 
    ICONS, 
    CSS_CLASSES, 
    STORAGE_KEYS, 
    DEFAULT_SETTINGS 
} from '../shared/constants.js';

// Create scoped logger
const logger = createLogger('VideoRotation');

// Module state
let currentRotation = 0;
let rotationButton = null;
let keyboardShortcuts = [];
let settings = { ...DEFAULT_SETTINGS };

// Rotation angles
const ROTATION_ANGLES = [0, 90, 180, 270];

/**
 * Load settings and rotation state
 */
async function loadSettings() {
    try {
        const data = await getStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
        settings = { ...DEFAULT_SETTINGS, ...data };
        
        // Load saved rotation state
        const rotationData = await getStorageData('videoRotationState', { rotation: 0 });
        currentRotation = rotationData.rotation;
        
        logger.debug('Settings and rotation state loaded', { currentRotation });
    } catch (error) {
        logger.error('Failed to load settings', error);
    }
}

/**
 * Save rotation state
 */
async function saveRotationState() {
    try {
        await setStorageData('videoRotationState', { rotation: currentRotation });
        logger.debug('Rotation state saved', { currentRotation });
    } catch (error) {
        logger.error('Failed to save rotation state', error);
    }
}

/**
 * Create rotation button
 */
function createRotationButton() {
    // Create button with YouTube's standard button class
    const button = document.createElement('button');
    button.className = 'ytp-button custom-rotation-button';
    button.title = 'Rotate video 90°';
    button.setAttribute('aria-label', 'Rotate video');
    button.setAttribute('data-priority', '2');
    
    // Create SVG icon manually (like legacy version)
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.setAttribute('width', '24');
    svgIcon.setAttribute('height', '24');
    svgIcon.style.fill = 'white';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS.ROTATION);
    
    svgIcon.appendChild(path);
    button.appendChild(svgIcon);
    
    // Add click handler
    button.onclick = (e) => {
        e.stopPropagation();
        rotateVideo();
    };
    
    return button;
}

/**
 * Rotate video to next angle
 */
async function rotateVideo() {
    try {
        const video = getActiveVideo();
        if (!video) {
            logger.warn('No active video found for rotation');
            return;
        }
        
        // Calculate next rotation angle
        const currentIndex = ROTATION_ANGLES.indexOf(currentRotation);
        const nextIndex = (currentIndex + 1) % ROTATION_ANGLES.length;
        currentRotation = ROTATION_ANGLES[nextIndex];
        
        // Apply rotation
        video.style.transform = `rotate(${currentRotation}deg)`;
        
        // Show rotation indicator
        showRotationIndicator();
        
        // Save state
        await saveRotationState();
        
        logger.debug(`Video rotated to ${currentRotation}°`);
    } catch (error) {
        logger.error('Failed to rotate video', error);
    }
}

/**
 * Reset video rotation
 */
async function resetRotation() {
    try {
        const video = getActiveVideo();
        if (!video) return;
        
        currentRotation = 0;
        video.style.transform = 'rotate(0deg)';
        
        await saveRotationState();
        
        logger.debug('Video rotation reset');
    } catch (error) {
        logger.error('Failed to reset rotation', error);
    }
}

/**
 * Show rotation indicator
 */
function showRotationIndicator() {
    try {
        const player = getActivePlayer();
        if (!player) return;
        
        const indicator = createRotationIndicator(currentRotation);
        if (indicator) {
            showIndicatorOnPlayer(indicator, player);
        }
    } catch (error) {
        logger.error('Failed to show rotation indicator', error);
    }
}

/**
 * Set up keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    // Clean up existing shortcuts
    keyboardShortcuts.forEach(cleanup => cleanup());
    keyboardShortcuts = [];
    
    // Rotation shortcut (R key)
    const rotationCleanup = createKeyboardShortcut(
        { key: 'r', ctrl: false, shift: false, alt: false },
        rotateVideo
    );
    
    // Reset rotation shortcut (Shift + R)
    const resetCleanup = createKeyboardShortcut(
        { key: 'R', shift: true },
        resetRotation
    );
    
    keyboardShortcuts.push(rotationCleanup, resetCleanup);
    
    logger.debug('Keyboard shortcuts set up');
}

/**
 * Create and insert rotation controls
 */
async function createRotationControls() {
    try {
        // Only show controls on video pages, not Shorts
        if (!isVideoPage() || isShortsPage()) {
            logger.debug('Skipping rotation controls - not on video page or on Shorts');
            return;
        }
        
        logger.debug('Attempting to create rotation controls');
        
        // Wait for right controls to be available (like legacy version)
        const rightControls = await waitForElement('.ytp-right-controls', 5000);
        const rightControlsLeft = await waitForElement('.ytp-right-controls-left', 5000);
        
        if (!rightControls || !rightControlsLeft) {
            logger.warn('Right controls not found', { rightControls: !!rightControls, rightControlsLeft: !!rightControlsLeft });
            return;
        }
        
        logger.debug('Right controls found, creating button');
        
        // Remove existing button
        if (rotationButton) {
            try {
                rotationButton.remove();
                logger.debug('Removed existing rotation button');
            } catch (removeError) {
                logger.warn('Failed to remove existing button', removeError);
            }
        }
        
        // Create new button
        try {
            rotationButton = createRotationButton();
            logger.debug('Rotation button created successfully');
        } catch (buttonError) {
            logger.error('Failed to create rotation button', buttonError);
            return;
        }
        
        // Insert button in the right position (like legacy version)
        try {
            // Insert as the first button in the right controls left section
            rightControlsLeft.insertBefore(rotationButton, rightControlsLeft.firstChild);
            logger.debug('Button inserted as first child in right controls left');
        } catch (insertError) {
            logger.error('Failed to insert rotation button into DOM', insertError);
            return;
        }
        
        // Apply current rotation if any
        try {
            const video = getActiveVideo();
            if (video && currentRotation !== 0) {
                video.style.transform = `rotate(${currentRotation}deg)`;
                logger.debug('Applied saved rotation', { currentRotation });
            }
        } catch (rotationError) {
            logger.warn('Failed to apply saved rotation', rotationError);
        }
        
        logger.debug('Rotation controls created and inserted successfully');
    } catch (error) {
        logger.error('Failed to create rotation controls', error);
    }
}

/**
 * Set up navigation observer
 */
function setupNavigationObserver() {
    const observer = createThrottledObserver(() => {
        if (isVideoPage() && !isShortsPage()) {
            createRotationControls();
        }
    }, 1000);
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Handle settings changes
 */
function handleSettingsChange(changes) {
    if (changes[STORAGE_KEYS.SETTINGS]) {
        const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue;
        settings = { ...DEFAULT_SETTINGS, ...newSettings };
        logger.info('Settings updated', settings);
    }
}

/**
 * Initialize video rotation
 */
async function initVideoRotation() {
    try {
        logger.info('Initializing video rotation');
        
        // Load settings and state
        await loadSettings();
        
        // Set up keyboard shortcuts
        setupKeyboardShortcuts();
        
        // Create rotation controls
        await createRotationControls();
        
        // Listen for settings changes
        onStorageChanged(handleSettingsChange);
        
        // Set up navigation observer
        setupNavigationObserver();
        
        logger.info('Video rotation initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize video rotation', error);
    }
}

/**
 * Cleanup function
 */
function cleanup() {
    keyboardShortcuts.forEach(cleanup => cleanup());
    keyboardShortcuts = [];
    
    if (rotationButton) {
        rotationButton.remove();
        rotationButton = null;
    }
    
    // Reset any rotated videos
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        video.style.transform = '';
    });
    
    logger.info('Video rotation cleaned up');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoRotation);
} else {
    initVideoRotation();
}

// Export for potential external use
export {
    initVideoRotation,
    rotateVideo,
    resetRotation,
    cleanup
};
