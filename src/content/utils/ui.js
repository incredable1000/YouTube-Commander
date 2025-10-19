/**
 * UI Components Utility
 * Reusable UI components and styling helpers
 */

import { isShortsPage } from './youtube.js';

/**
 * Create a styled button element
 * @param {object} options - Button options
 * @returns {HTMLElement} Button element
 */
export function createButton({
    text = '',
    className = '',
    onClick = null,
    title = '',
    style = {}
}) {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = className;
    button.title = title;
    
    // Apply default button styles
    const defaultStyles = {
        padding: '8px 12px',
        margin: '0 4px',
        border: 'none',
        borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '500',
        transition: 'all 0.2s ease',
        outline: 'none'
    };
    
    Object.assign(button.style, defaultStyles, style);
    
    // Add hover effects
    button.addEventListener('mouseover', () => {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    button.addEventListener('mouseout', () => {
        button.style.background = style.background || 'rgba(255, 255, 255, 0.1)';
    });
    
    if (onClick) {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick(e);
        });
    }
    
    return button;
}

/**
 * Create an SVG icon element
 * @param {object} options - Icon options
 * @returns {SVGElement} SVG element
 */
export function createIcon({
    viewBox = '0 0 24 24',
    width = '24',
    height = '24',
    path = '',
    fill = 'currentColor',
    className = ''
}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.fill = fill;
    if (className) {
        svg.setAttribute('class', className);
    }
    
    if (path) {
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttribute('d', path);
        svg.appendChild(pathElement);
    }
    
    return svg;
}

/**
 * Create a circular indicator overlay
 * @param {object} options - Indicator options
 * @returns {HTMLElement} Indicator element
 */
export function createIndicator({
    content = '',
    className = '',
    duration = 2000,
    position = 'center'
}) {
    // Skip showing indicator on Shorts pages if not explicitly allowed
    if (isShortsPage() && !className.includes('shorts-allowed')) {
        return null;
    }
    
    const indicator = document.createElement('div');
    indicator.className = `custom-indicator ${className}`;
    
    // Create circle background
    const circle = document.createElement('div');
    circle.className = 'indicator-circle';
    
    // Add content
    if (typeof content === 'string') {
        circle.innerHTML = content;
    } else {
        circle.appendChild(content);
    }
    
    indicator.appendChild(circle);
    
    // Apply positioning styles
    const positionStyles = {
        position: 'absolute',
        zIndex: '9999',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    };
    
    const centerStyles = {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '110px',
        height: '110px'
    };
    
    Object.assign(indicator.style, positionStyles);
    
    if (position === 'center') {
        Object.assign(indicator.style, centerStyles);
    }
    
    // Circle styles
    Object.assign(circle.style, {
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: '14px',
        fontWeight: '500',
        animation: 'fadeInOut 2s ease-in-out'
    });
    
    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, duration);
    }
    
    return indicator;
}

/**
 * Create seek indicator with arrows
 * @param {string} direction - 'forward' or 'backward'
 * @param {number} seconds - Number of seconds
 * @returns {HTMLElement} Seek indicator element
 */
export function createSeekIndicator(direction, seconds) {
    const iconsContainer = document.createElement('div');
    iconsContainer.className = 'seek-indicator-icons';
    iconsContainer.style.cssText = `
        display: flex;
        align-items: center;
        margin-bottom: 8px;
    `;
    
    // Create three arrows
    for (let i = 0; i < 3; i++) {
        const arrow = document.createElement('div');
        arrow.className = `seek-indicator-arrow ${direction}`;
        arrow.style.cssText = `
            width: 0;
            height: 0;
            margin: 0 2px;
            border-style: solid;
            ${direction === 'forward' 
                ? 'border-left: 8px solid #fff; border-top: 6px solid transparent; border-bottom: 6px solid transparent;'
                : 'border-right: 8px solid #fff; border-top: 6px solid transparent; border-bottom: 6px solid transparent;'
            }
        `;
        iconsContainer.appendChild(arrow);
    }
    
    const text = document.createElement('div');
    text.className = 'seek-indicator-text';
    text.textContent = `${seconds} seconds`;
    text.style.cssText = `
        font-size: 12px;
        text-align: center;
    `;
    
    const content = document.createElement('div');
    content.appendChild(iconsContainer);
    content.appendChild(text);
    
    return createIndicator({
        content: content,
        className: `seek-indicator ${direction}`,
        duration: 2000
    });
}

/**
 * Create rotation indicator
 * @param {number} angle - Rotation angle
 * @returns {HTMLElement} Rotation indicator element
 */
export function createRotationIndicator(angle) {
    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
    `;
    
    const rotationIcon = createIcon({
        viewBox: '0 0 24 24',
        width: '32',
        height: '32',
        path: 'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z',
        fill: 'white'
    });
    
    iconContainer.appendChild(rotationIcon);
    
    const text = document.createElement('div');
    text.textContent = `${angle}°`;
    text.style.cssText = `
        font-size: 14px;
        text-align: center;
        font-weight: bold;
    `;
    
    const content = document.createElement('div');
    content.appendChild(iconContainer);
    content.appendChild(text);
    
    return createIndicator({
        content: content,
        className: 'rotation-indicator',
        duration: 2000
    });
}

/**
 * Create a container for buttons
 * @param {object} options - Container options
 * @returns {HTMLElement} Container element
 */
export function createButtonContainer({
    className = '',
    style = {},
    flexDirection = 'row'
}) {
    const container = document.createElement('div');
    container.className = className;
    
    const defaultStyles = {
        display: 'flex',
        flexDirection: flexDirection,
        alignItems: 'center',
        gap: '4px',
        padding: '4px'
    };
    
    Object.assign(container.style, defaultStyles, style);
    
    return container;
}

/**
 * Show indicator on video player
 * @param {HTMLElement} indicator - Indicator element to show
 * @param {HTMLElement} player - Player element (optional, will auto-detect)
 */
export function showIndicatorOnPlayer(indicator, player = null) {
    if (!indicator) return;
    
    if (!player) {
        // Try to find player element directly to avoid circular imports
        player = document.querySelector('.html5-video-player');
        
        if (!player) {
            console.warn('No player found to show indicator');
            return;
        }
    }
    
    // Position indicator based on video player dimensions
    const video = player.querySelector('video');
    if (video) {
        const videoRect = video.getBoundingClientRect();
        const verticalCenter = (videoRect.height - 110) / 2;
        indicator.style.top = `${verticalCenter}px`;
    }
    
    player.appendChild(indicator);
}

/**
 * Add CSS animations to document if not already added
 */
export function ensureAnimations() {
    if (document.querySelector('#yt-commander-animations')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'yt-commander-animations';
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: scale(0.8); }
            20% { opacity: 1; transform: scale(1); }
            80% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.8); }
        }
        
        .custom-indicator {
            animation: fadeInOut 2s ease-in-out;
        }
        
        .seek-indicator-arrow {
            animation: pulse 0.5s ease-in-out infinite alternate;
        }
        
        @keyframes pulse {
            0% { opacity: 0.6; }
            100% { opacity: 1; }
        }
    `;
    
    document.head.appendChild(style);
}
