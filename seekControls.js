// Default settings
const defaultSettings = {
    shortSeek: 3,
    mediumSeek: 10,
    longSeek: 30,
    shortSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: true, shift: false, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' }
};

// Current settings
let settings = { ...defaultSettings };

// Load settings
function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (result) => {
        settings = result;
        // Recreate buttons with new settings
        createSeekButtons();
    });
}

// Define keydown handler as a named function so we can add/remove it
function handleKeydown(event) {
    const video = getActiveVideo();
    if (!video) return;

    // Check if any input element is focused
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.isContentEditable) {
        return;
    }

    // Only handle arrow keys
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
    }

    let seekAmount = 0;
    let direction = event.key === 'ArrowRight' ? 'forward' : 'backward';

    // Check which shortcut matches
    const currentKey = {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        key: 'ArrowRight' // We'll normalize to ArrowRight for matching
    };

    const matchesShortcut = (shortcut) => {
        return shortcut.ctrl === currentKey.ctrl &&
               shortcut.shift === currentKey.shift &&
               shortcut.key === 'ArrowRight'; // All shortcuts are defined with ArrowRight
    };

    if (matchesShortcut(settings.shortSeekKey)) {
        seekAmount = settings.shortSeek;
    } else if (matchesShortcut(settings.mediumSeekKey)) {
        seekAmount = settings.mediumSeek;
    } else if (matchesShortcut(settings.longSeekKey)) {
        seekAmount = settings.longSeek;
    } else {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (direction === 'backward') {
        // Ensure we don't seek before the start of the video
        video.currentTime = Math.max(0, video.currentTime - seekAmount);
    } else {
        // Ensure we don't seek beyond the end of the video
        video.currentTime = Math.min(video.duration, video.currentTime + seekAmount);
    }

    const player = getActivePlayer();

    if (player) {
        // Store current playback state
        const wasPlaying = !video.paused;
        
        // Briefly pause and play to reset internal state
        if (wasPlaying) {
            video.pause();
            setTimeout(() => {
                video.play();
            }, 50);
        }
    }

    showSeekIndicator(direction, seekAmount);
}

// Attach the keydown event listener
function attachKeydownListener() {
    document.removeEventListener('keydown', handleKeydown, true);
window.removeEventListener('keydown', handleKeydown, true);

document.addEventListener('keydown', handleKeydown, true);
window.addEventListener('keydown', handleKeydown, true);

    console.log('Keydown listener attached for seek controls');
}

// Function to create seek buttons
function createSeekButtons() {
    if (isShortsPage()) {
    // Shorts UI doesn't have standard controls, skip buttons
    return;
}

    const totalTime = document.querySelector('.ytp-time-duration');
    if (!totalTime) return;

    // Remove existing buttons if any
    const existingButtons = document.querySelector('.custom-seek-buttons');
    if (existingButtons) {
        existingButtons.remove();
    }

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'custom-seek-buttons';

    const seekTimes = [
        { seconds: settings.shortSeek, label: `${settings.shortSeek}s` },
        { seconds: settings.mediumSeek, label: `${settings.mediumSeek}s` },
        { seconds: settings.longSeek, label: `${settings.longSeek}s` }
    ];

    seekTimes.forEach(({ seconds, label }) => {
        const backButton = document.createElement('button');
        backButton.className = 'custom-seek-button';
        backButton.textContent = `-${label}`;
        backButton.onclick = (e) => {
            e.stopPropagation();
            const video = document.querySelector('.html5-main-video');
            if (video) {
                video.currentTime = Math.max(0, video.currentTime - seconds);
                showSeekIndicator('backward', seconds);
            }
        };

        const forwardButton = document.createElement('button');
        forwardButton.className = 'custom-seek-button';
        forwardButton.textContent = `+${label}`;
        forwardButton.onclick = (e) => {
            e.stopPropagation();
            const video = document.querySelector('.html5-main-video');
            if (video) {
                video.currentTime = Math.min(video.duration, video.currentTime + seconds);
                showSeekIndicator('forward', seconds);
            }
        };

        buttonsContainer.appendChild(backButton);
        buttonsContainer.appendChild(forwardButton);
    });

    // Insert after the total time element
    const timeDisplay = totalTime.parentElement;
    timeDisplay.appendChild(buttonsContainer);
}

// Create and show seek indicator
function showSeekIndicator(direction, seconds) {
    const video = getActiveVideo();
    const player = getActivePlayer();
    if (!video || !player) return;

    // Remove existing indicator if any
    const existingIndicator = document.querySelector('.custom-seek-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    // Create indicator container
    const indicator = document.createElement('div');
    indicator.className = `custom-seek-indicator ${direction}`;
    
    // Create circle background
    const circle = document.createElement('div');
    circle.className = 'seek-indicator-circle';

    // Create icons container
    const iconsContainer = document.createElement('div');
    iconsContainer.className = 'seek-indicator-icons';

    // Create three arrows
    for (let i = 0; i < 3; i++) {
        const arrow = document.createElement('div');
        arrow.className = `seek-indicator-arrow ${direction}`;
        iconsContainer.appendChild(arrow);
    }
    
    // Create text for seconds
    const text = document.createElement('div');
    text.className = 'seek-indicator-text';
    text.textContent = `${seconds} seconds`;

    // Assemble the indicator
    circle.appendChild(iconsContainer);
    circle.appendChild(text);
    indicator.appendChild(circle);

    // Position indicator based on video player dimensions
    const videoRect = video.getBoundingClientRect();
    
    // Calculate vertical center relative to video (110px is indicator height)
    const verticalCenter = (videoRect.height - 110) / 2;
    indicator.style.top = `${verticalCenter}px`;

    // Add to video player
    player.appendChild(indicator);
    
    // Remove the indicator after animation
    setTimeout(() => {
        indicator.remove();
    }, 2000); // Match 2s animation duration
}

// Initialize seek buttons when video player is ready
function initializeSeekButtons() {
    // Try to create buttons immediately
    createSeekButtons();
    
    // If buttons weren't created, try again after a short delay
    setTimeout(() => {
        if (!document.querySelector('.custom-seek-buttons')) {
            createSeekButtons();
        }
    }, 1000);
}

// Watch for settings changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.shortSeek || changes.mediumSeek || changes.longSeek || 
        changes.shortSeekKey || changes.mediumSeekKey || changes.longSeekKey) {
        loadSettings();
    }
});

// Watch for player changes
const seekObserver = new MutationObserver((mutations) => {
    const hasButtons = document.querySelector('.custom-seek-buttons');
    const hasPlayer = document.querySelector('.html5-main-video');
    
    if (!hasButtons && hasPlayer) {
        createSeekButtons();
    }
});

seekObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Shorts-specific video observer
const shortsObserver = new MutationObserver(() => {
    if (isShortsPage()) {
        const video = document.querySelector('.html5-main-video');
        if (video) {
            console.log("Shorts video detected, attaching seek controls");
            attachKeydownListener();
            shortsObserver.disconnect(); // stop once attached
        }
    }
});

function observeShortsVideo() {
    if (isShortsPage()) {
        shortsObserver.observe(document.body, { childList: true, subtree: true });
    }
}


// Function to initialize everything
function initializeAll() {
    loadSettings();
    createSeekButtons();
    attachKeydownListener();
}

function isShortsPage() {
    return location.pathname.startsWith("/shorts");
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
    console.log('YouTube navigation detected, reinitializing seek controls');
    setTimeout(() => {
        initializeAll();

        if (isShortsPage()) {
            observeShortsVideo(); // wait for Shorts video to load
        }
    }, 500);

});

// Initialize on page load
window.addEventListener('load', initializeAll);

// Initial load
initializeAll();
