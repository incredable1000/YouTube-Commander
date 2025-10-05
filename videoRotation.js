// Video rotation control for YouTube Commander
// Rotates video 90 degrees on each click

let currentRotation = 0; // Track current rotation angle (0, 90, 180, 270)

// Function to create rotation button
function createRotationButton() {
    if (isShortsPage()) {
        // Shorts UI doesn't have standard controls, skip button
        return;
    }

    // Look for the right controls container
    const rightControls = document.querySelector('.ytp-right-controls');
    const rightControlsLeft = document.querySelector('.ytp-right-controls-left');
    
    if (!rightControls || !rightControlsLeft) return;

    // Remove existing rotation button if any
    const existingButton = document.querySelector('.custom-rotation-button');
    if (existingButton) {
        existingButton.remove();
    }

    // Create rotation button
    const rotationButton = document.createElement('button');
    rotationButton.className = 'ytp-button custom-rotation-button';
    rotationButton.title = 'Rotate video 90°';
    rotationButton.setAttribute('aria-label', 'Rotate video');
    rotationButton.setAttribute('data-priority', '2'); // Set priority between expand button (1) and autoplay (3)
    
    // Create SVG icon for rotation
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.setAttribute('width', '24');
    svgIcon.setAttribute('height', '24');
    svgIcon.style.fill = 'white';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z');
    
    svgIcon.appendChild(path);
    rotationButton.appendChild(svgIcon);

    // Add click handler
    rotationButton.onclick = (e) => {
        e.stopPropagation();
        rotateVideo();
    };

    // Insert as the first button in the right controls left section
    rightControlsLeft.insertBefore(rotationButton, rightControlsLeft.firstChild);
}

// Function to rotate the video
function rotateVideo() {
    // Don't allow rotation on Shorts pages
    if (isShortsPage()) {
        console.log('Video rotation is disabled on Shorts pages');
        return;
    }

    const video = getActiveVideo();
    if (!video) return;

    // Increment rotation by 90 degrees
    currentRotation = (currentRotation + 90) % 360;
    
    // Calculate scaling for rotated video to fit in container
    const scale = calculateVideoScale(video, currentRotation);
    
    // Apply rotation and scaling transform
    if (currentRotation === 0) {
        video.style.transform = '';
        video.style.transformOrigin = '';
    } else {
        video.style.transform = `rotate(${currentRotation}deg) scale(${scale})`;
        video.style.transformOrigin = 'center center';
    }
    
    // Show rotation indicator
    showRotationIndicator(currentRotation);
    
    console.log(`Video rotated to ${currentRotation} degrees with scale ${scale}`);
}

// Function to calculate appropriate scale for rotated video
function calculateVideoScale(video, rotation) {
    if (rotation === 0 || rotation === 180) {
        return 1; // No scaling needed for 0° and 180°
    }
    
    // For 90° and 270° rotations, we need to scale the video to fit within the container
    const player = getActivePlayer();
    if (!player) return 1;
    
    // Get the player container dimensions
    const playerRect = player.getBoundingClientRect();
    const containerWidth = playerRect.width;
    const containerHeight = playerRect.height;
    
    // Get video's current display dimensions
    const videoRect = video.getBoundingClientRect();
    const currentVideoWidth = videoRect.width;
    const currentVideoHeight = videoRect.height;
    
    if (!currentVideoWidth || !currentVideoHeight) {
        // Fallback calculation
        return Math.min(containerWidth / containerHeight, containerHeight / containerWidth);
    }
    
    // When rotated 90° or 270°, the video dimensions are swapped
    // We need to fit the rotated video (height becomes width, width becomes height) into the container
    
    // Calculate what the video dimensions would be after rotation
    const rotatedVideoWidth = currentVideoHeight;
    const rotatedVideoHeight = currentVideoWidth;
    
    // Calculate scale factors to fit the rotated video within the container
    const scaleX = containerWidth / rotatedVideoWidth;
    const scaleY = containerHeight / rotatedVideoHeight;
    
    // Use the smaller scale to ensure the video fits completely within the container (contain behavior)
    const scale = Math.min(scaleX, scaleY);
    
    // Ensure scale is reasonable and doesn't make video too small or too large
    return Math.max(0.3, Math.min(scale, 1.5));
}

// Function to show rotation indicator
function showRotationIndicator(angle) {
    // Skip showing indicator on Shorts pages
    if (isShortsPage()) {
        return;
    }
    
    const video = getActiveVideo();
    const player = getActivePlayer();
    if (!video || !player) return;

    // Remove existing indicator if any
    const existingIndicator = document.querySelector('.custom-rotation-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    // Create indicator container
    const indicator = document.createElement('div');
    indicator.className = 'custom-rotation-indicator';
    
    // Create circle background
    const circle = document.createElement('div');
    circle.className = 'rotation-indicator-circle';

    // Create rotation icon
    const iconContainer = document.createElement('div');
    iconContainer.className = 'rotation-indicator-icon';
    
    // Create SVG rotation icon
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.setAttribute('width', '32');
    svgIcon.setAttribute('height', '32');
    svgIcon.style.fill = 'white';
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z');
    
    svgIcon.appendChild(path);
    iconContainer.appendChild(svgIcon);
    
    // Create text for angle
    const text = document.createElement('div');
    text.className = 'rotation-indicator-text';
    text.textContent = `${angle}°`;

    // Assemble the indicator
    circle.appendChild(iconContainer);
    circle.appendChild(text);
    indicator.appendChild(circle);

    // Position indicator at center of video
    const videoRect = video.getBoundingClientRect();
    const verticalCenter = (videoRect.height - 110) / 2;
    indicator.style.top = `${verticalCenter}px`;

    // Add to video player
    player.appendChild(indicator);
    
    // Remove the indicator after animation
    setTimeout(() => {
        indicator.remove();
    }, 2000);
}

// Function to reset rotation when video changes
function resetRotation() {
    // Don't manipulate videos on Shorts pages
    if (isShortsPage()) {
        console.log('Skipping reset rotation on Shorts page');
        currentRotation = 0;
        return;
    }
    
    currentRotation = 0;
    const video = getActiveVideo();
    if (video) {
        video.style.transform = '';
        video.style.transformOrigin = '';
        // Remove any inline styles that might interfere
        video.style.width = '';
        video.style.height = '';
    }
}

// Initialize rotation button when video player is ready
function initializeRotationButton() {
    // Try to create button immediately
    createRotationButton();
    
    // If button wasn't created, try again after a short delay
    setTimeout(() => {
        if (!document.querySelector('.custom-rotation-button')) {
            createRotationButton();
        }
    }, 1000);
}

// Watch for player changes (only on regular video pages)
const rotationObserver = new MutationObserver((mutations) => {
    // Don't run observer logic on Shorts pages
    if (isShortsPage()) {
        return;
    }
    
    const hasButton = document.querySelector('.custom-rotation-button');
    const hasPlayer = document.querySelector('.html5-main-video');
    
    if (!hasButton && hasPlayer) {
        createRotationButton();
    }
});

// Only start observing if not on Shorts page
if (!isShortsPage()) {
    rotationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Function to initialize everything
function initializeRotation() {
    if (isShortsPage()) {
        // Remove rotation button if it exists and we're on Shorts
        const existingButton = document.querySelector('.custom-rotation-button');
        if (existingButton) {
            existingButton.remove();
        }
        resetRotation(); // Reset any existing rotation
        return;
    }
    
    createRotationButton();
    resetRotation(); // Reset rotation on page load
}

// Utility functions (reused from seekControls.js)
function isShortsPage() {
    const isShorts = location.pathname.startsWith("/shorts") || 
                     location.pathname.includes("/shorts/") ||
                     document.querySelector('ytd-shorts') !== null;
    
    if (isShorts) {
        console.log('Detected Shorts page:', location.pathname);
    }
    
    return isShorts;
}

function getActiveShortsRenderer() {
    // Prefer YouTube's explicit marker for the on-screen short
    let active = document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
    if (active) return active;

    // Fallback: pick the renderer intersecting the viewport center
    const renderers = Array.from(document.querySelectorAll('ytd-shorts ytd-reel-video-renderer'));
    const midY = window.innerHeight / 2;
    for (const r of renderers) {
        const rect = r.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) return r;
    }
    return null;
}

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

function getActivePlayer() {
    if (isShortsPage()) {
        const renderer = getActiveShortsRenderer();
        if (renderer) {
            const p = renderer.querySelector('.html5-video-player');
            if (p) return p;
        }
        return document.querySelector('ytd-shorts .html5-video-player');
    }
    return document.querySelector('.html5-video-player');
}

// Handle YouTube SPA navigation
document.addEventListener('yt-navigate-finish', function() {
    console.log('YouTube navigation detected, reinitializing rotation controls');
    setTimeout(() => {
        // Stop observer if we're navigating to Shorts
        if (isShortsPage()) {
            rotationObserver.disconnect();
            console.log('Disconnected rotation observer on Shorts page');
        } else {
            // Restart observer if we're on regular video page
            rotationObserver.disconnect(); // Disconnect first to avoid duplicates
            rotationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('Reconnected rotation observer on regular video page');
        }
        
        initializeRotation();
    }, 500);
});

// Initialize on page load (only if not on Shorts)
window.addEventListener('load', () => {
    if (!isShortsPage()) {
        initializeRotation();
    }
});

// Initial load (only if not on Shorts)
if (!isShortsPage()) {
    initializeRotation();
}
