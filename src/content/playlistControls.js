/**
 * Playlist Controls - Refactored with DRY principles
 * Enhanced playlist functionality using shared utilities
 */

import { isPlaylistPage } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';
import { createIcon } from './utils/ui.js';
import { createThrottledObserver } from './utils/events.js';
import { ICONS, SELECTORS } from '../shared/constants.js';

// Create scoped logger
const logger = createLogger('PlaylistControls');

// Module state
let observer = null;

/**
 * Create open-in-new-tab icon
 */
function createOpenNewTabIcon() {
    const container = document.createElement('div');
    container.className = 'open-new-tab-icon';
    
    // Apply styling
    Object.assign(container.style, {
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        marginRight: '8px',
        cursor: 'pointer',
        padding: '8px',
        opacity: '0.7',
        transition: 'opacity 0.2s',
        color: '#808080',
        borderRadius: '4px'
    });
    
    // Create icon
    const icon = createIcon({
        viewBox: '0 0 24 24',
        width: '20',
        height: '20',
        path: ICONS.OPEN_NEW_TAB,
        fill: 'currentColor'
    });
    
    container.appendChild(icon);
    
    // Add hover effects
    container.addEventListener('mouseover', () => {
        container.style.opacity = '1';
        container.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    
    container.addEventListener('mouseout', () => {
        container.style.opacity = '0.7';
        container.style.background = 'transparent';
    });
    
    return container;
}

/**
 * Get video URL from playlist item
 */
function getVideoUrlFromPlaylistItem(row) {
    try {
        const thumbnailLink = row.querySelector('a#thumbnail');
        if (thumbnailLink && thumbnailLink.href) {
            return thumbnailLink.href;
        }
        
        // Fallback: try to find any video link
        const videoLink = row.querySelector('a[href*="/watch?v="]');
        if (videoLink && videoLink.href) {
            return videoLink.href;
        }
        
        logger.warn('Could not find video URL in playlist item');
        return null;
    } catch (error) {
        logger.error('Error extracting video URL', error);
        return null;
    }
}

/**
 * Open video in new tab
 */
function openVideoInNewTab(videoUrl) {
    try {
        if (!videoUrl) {
            logger.warn('No video URL provided');
            return;
        }
        
        // Send message to background script to open new tab
        chrome.runtime.sendMessage({
            type: 'OPEN_NEW_TAB',
            url: videoUrl
        });
        
        logger.debug('Opened video in new tab', { url: videoUrl });
    } catch (error) {
        logger.error('Failed to open video in new tab', error);
        
        // Fallback: use window.open
        try {
            window.open(videoUrl, '_blank');
        } catch (fallbackError) {
            logger.error('Fallback method also failed', fallbackError);
        }
    }
}

/**
 * Add open-in-new-tab icons to playlist videos
 */
function addOpenLinkIcons() {
    try {
        // Only run on playlist pages
        if (!isPlaylistPage()) {
            return;
        }
        
        // Select all video rows on the playlist page
        const videoRows = document.querySelectorAll(SELECTORS.PLAYLIST_VIDEO_RENDERER);
        let addedCount = 0;
        
        videoRows.forEach((row) => {
            // Skip rows that already have the icon
            if (row.querySelector('.open-new-tab-icon')) {
                return;
            }
            
            // Create icon container
            const iconContainer = createOpenNewTabIcon();
            
            // Get video URL
            const videoUrl = getVideoUrlFromPlaylistItem(row);
            if (!videoUrl) {
                return;
            }
            
            // Add click handler
            iconContainer.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openVideoInNewTab(videoUrl);
            });
            
            // Add tooltip
            iconContainer.title = 'Open in new tab';
            
            // Find the menu button and insert icon before it
            const menuButton = row.querySelector(SELECTORS.PLAYLIST_MENU);
            if (menuButton && menuButton.parentNode) {
                menuButton.parentNode.insertBefore(iconContainer, menuButton);
                addedCount++;
            } else {
                // Fallback: append to the row
                row.appendChild(iconContainer);
                addedCount++;
            }
        });
        
        if (addedCount > 0) {
            logger.debug(`Added ${addedCount} open-in-new-tab icons`);
        }
    } catch (error) {
        logger.error('Failed to add open link icons', error);
    }
}

/**
 * Set up playlist observer
 */
function setupPlaylistObserver() {
    // Clean up existing observer
    if (observer) {
        observer.disconnect();
    }
    
    observer = createThrottledObserver(() => {
        if (isPlaylistPage()) {
            addOpenLinkIcons();
        }
    }, 1000);
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Initialize playlist controls
 */
function initPlaylistControls() {
    try {
        logger.info('Initializing playlist controls');
        
        // Add initial icons
        addOpenLinkIcons();
        
        // Set up observer for dynamic content
        setupPlaylistObserver();
        
        logger.info('Playlist controls initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize playlist controls', error);
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
    
    // Remove all added icons
    const icons = document.querySelectorAll('.open-new-tab-icon');
    icons.forEach(icon => icon.remove());
    
    logger.info('Playlist controls cleaned up');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlaylistControls);
} else {
    initPlaylistControls();
}

// Export for potential external use
export {
    initPlaylistControls,
    cleanup
};
