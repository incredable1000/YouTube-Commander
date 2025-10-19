/**
 * Scroll To Top - Refactored with DRY principles
 * Enhanced scroll-to-top functionality using shared utilities
 */

import { createLogger } from './utils/logger.js';
import { createIcon, createButton } from './utils/ui.js';
import { throttle, addEventListenerWithCleanup } from './utils/events.js';
import { ICONS } from '../shared/constants.js';

// Create scoped logger
const logger = createLogger('ScrollToTop');

// Module state
let scrollButton = null;
let cleanupFunctions = [];

/**
 * Create scroll-to-top button with modern styling
 */
function createScrollToTopButton() {
    // Create icon
    const icon = createIcon({
        viewBox: '0 0 24 24',
        width: '20',
        height: '20',
        path: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
        fill: 'currentColor'
    });
    
    // Apply rotation for up arrow
    icon.style.transform = 'rotate(-90deg)';
    
    // Create button with icon
    const button = document.createElement('button');
    button.id = 'yt-scroll-to-top';
    button.setAttribute('aria-label', 'Scroll to top');
    button.appendChild(icon);
    
    // Apply modern styling
    Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        cursor: 'pointer',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: '0',
        transition: 'all 0.3s ease',
        zIndex: '9999',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)'
    });
    
    // Add hover effects
    button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
        button.style.transform = 'scale(1.1)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(0, 0, 0, 0.8)';
        button.style.transform = 'scale(1)';
    });
    
    return button;
}

/**
 * Toggle button visibility based on scroll position
 */
function toggleButtonVisibility() {
    if (!scrollButton) return;
    
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const shouldShow = scrollTop > 200; // Show after scrolling 200px
    
    if (shouldShow) {
        scrollButton.style.display = 'flex';
        // Small delay to ensure display: flex is applied before opacity transition
        requestAnimationFrame(() => {
            scrollButton.style.opacity = '1';
        });
    } else {
        scrollButton.style.opacity = '0';
        setTimeout(() => {
            if (scrollButton && scrollTop <= 200) {
                scrollButton.style.display = 'none';
            }
        }, 300);
    }
}

/**
 * Smooth scroll to top
 */
function scrollToTop() {
    try {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        logger.debug('Scrolled to top');
    } catch (error) {
        // Fallback for older browsers
        window.scrollTo(0, 0);
        logger.warn('Used fallback scroll method', error);
    }
}

/**
 * Initialize scroll-to-top functionality
 */
function initScrollToTop() {
    try {
        logger.info('Initializing scroll-to-top functionality');
        
        // Create button
        scrollButton = createScrollToTopButton();
        document.body.appendChild(scrollButton);
        
        // Set up throttled scroll listener for better performance
        const throttledToggle = throttle(toggleButtonVisibility, 100);
        const scrollCleanup = addEventListenerWithCleanup(
            window, 
            'scroll', 
            throttledToggle,
            { passive: true }
        );
        cleanupFunctions.push(scrollCleanup);
        
        // Set up click handler
        const clickCleanup = addEventListenerWithCleanup(
            scrollButton,
            'click',
            scrollToTop
        );
        cleanupFunctions.push(clickCleanup);
        
        // Initial visibility check
        toggleButtonVisibility();
        
        logger.info('Scroll-to-top initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize scroll-to-top', error);
    }
}

/**
 * Enable the scroll-to-top feature
 */
function enable() {
    if (!scrollButton) {
        initScrollToTop();
    } else if (scrollButton.style.display === 'none') {
        scrollButton.style.display = '';
        toggleButtonVisibility();
    }
    logger.info('Scroll-to-top enabled');
}

/**
 * Disable the scroll-to-top feature
 */
function disable() {
    if (scrollButton) {
        scrollButton.style.display = 'none';
    }
    logger.info('Scroll-to-top disabled');
}

/**
 * Cleanup function
 */
function cleanup() {
    cleanupFunctions.forEach(cleanup => cleanup());
    cleanupFunctions = [];
    
    if (scrollButton) {
        scrollButton.remove();
        scrollButton = null;
    }
    
    logger.info('Scroll-to-top cleaned up');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollToTop);
} else {
    initScrollToTop();
}

// Export for potential external use
export {
    initScrollToTop,
    enable,
    disable,
    cleanup
};
