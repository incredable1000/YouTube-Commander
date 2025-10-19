/**
 * Events Utility
 * Centralized event handling and DOM observation utilities
 */

import { logDebug } from './logger.js';

/**
 * Create a throttled mutation observer
 * @param {function} callback - Callback function to execute
 * @param {number} delay - Throttle delay in milliseconds
 * @param {object} options - MutationObserver options
 * @returns {MutationObserver} Configured observer
 */
export function createThrottledObserver(callback, delay = 1000, options = {}) {
    let timeout = null;
    
    const defaultOptions = {
        childList: true,
        subtree: true,
        ...options
    };
    
    return new MutationObserver((mutations) => {
        if (timeout) return;
        
        timeout = setTimeout(() => {
            timeout = null;
            callback(mutations);
        }, delay);
    });
}

/**
 * Wait for element to appear in DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds
 * @param {Element} root - Root element to search in
 * @returns {Promise<Element>} Found element
 */
export function waitForElement(selector, timeout = 10000, root = document) {
    return new Promise((resolve, reject) => {
        const element = root.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        
        const observer = new MutationObserver((mutations, obs) => {
            const element = root.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(root, {
            childList: true,
            subtree: true
        });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

/**
 * Wait for multiple elements to appear
 * @param {string[]} selectors - Array of CSS selectors
 * @param {number} timeout - Timeout in milliseconds
 * @param {Element} root - Root element to search in
 * @returns {Promise<Element[]>} Array of found elements
 */
export function waitForElements(selectors, timeout = 10000, root = document) {
    return Promise.all(
        selectors.map(selector => waitForElement(selector, timeout, root))
    );
}

/**
 * Debounce function calls
 * @param {function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {function} Debounced function
 */
export function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Throttle function calls
 * @param {function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {function} Throttled function
 */
export function throttle(func, delay) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            return func.apply(this, args);
        }
    };
}

/**
 * Add event listener with automatic cleanup
 * @param {Element} element - Element to add listener to
 * @param {string} event - Event name
 * @param {function} handler - Event handler
 * @param {object} options - Event listener options
 * @returns {function} Cleanup function
 */
export function addEventListenerWithCleanup(element, event, handler, options = {}) {
    element.addEventListener(event, handler, options);
    
    return () => {
        element.removeEventListener(event, handler, options);
    };
}

/**
 * Check if element is in viewport
 * @param {Element} element - Element to check
 * @param {number} threshold - Visibility threshold (0-1)
 * @returns {boolean} True if element is visible
 */
export function isElementInViewport(element, threshold = 0.5) {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    const verticalVisible = (rect.top + rect.height * threshold) < windowHeight && 
                           (rect.bottom - rect.height * threshold) > 0;
    const horizontalVisible = (rect.left + rect.width * threshold) < windowWidth && 
                             (rect.right - rect.width * threshold) > 0;
    
    return verticalVisible && horizontalVisible;
}

/**
 * Wait for page navigation to complete
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
export function waitForNavigation(timeout = 5000) {
    return new Promise((resolve) => {
        let resolved = false;
        
        const resolveOnce = () => {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        };
        
        // Listen for various navigation completion events
        if (document.readyState === 'complete') {
            resolveOnce();
        } else {
            document.addEventListener('DOMContentLoaded', resolveOnce, { once: true });
            window.addEventListener('load', resolveOnce, { once: true });
        }
        
        // Fallback timeout
        setTimeout(resolveOnce, timeout);
    });
}

/**
 * Create a keyboard shortcut handler
 * @param {object} shortcut - Shortcut definition {ctrl, shift, alt, key}
 * @param {function} handler - Handler function
 * @param {Element} target - Target element (default: document)
 * @returns {function} Cleanup function
 */
export function createKeyboardShortcut(shortcut, handler, target = document) {
    const keyHandler = (event) => {
        // Check if any input element is focused
        if (document.activeElement.tagName === 'INPUT' || 
            document.activeElement.tagName === 'TEXTAREA' || 
            document.activeElement.isContentEditable) {
            return;
        }
        
        const matches = (
            (shortcut.ctrl === undefined || shortcut.ctrl === event.ctrlKey) &&
            (shortcut.shift === undefined || shortcut.shift === event.shiftKey) &&
            (shortcut.alt === undefined || shortcut.alt === event.altKey) &&
            (shortcut.key === event.key)
        );
        
        if (matches) {
            event.preventDefault();
            event.stopPropagation();
            handler(event);
        }
    };
    
    target.addEventListener('keydown', keyHandler, true);
    
    return () => {
        target.removeEventListener('keydown', keyHandler, true);
    };
}
