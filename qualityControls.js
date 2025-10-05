// ==UserScript==
// @name         YouTube Video Quality Controller
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.youtube.com/*
// @grant        storage
// @run-at       document-start
// @world        MAIN
// ==/UserScript==

// Keep track of user's preferred quality
let userPreferredQuality = 'hd1080';

// Function to set video quality
const lockQuality = (preferredQuality = 'hd1080') => {
    // Update user's preferred quality
    userPreferredQuality = preferredQuality;
    
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');

    if (player && typeof player.getAvailableQualityLevels === 'function') {
        const qualityLevels = player.getAvailableQualityLevels();
        console.log('Available quality levels:', qualityLevels);
        console.log('Setting quality to:', preferredQuality);

        if (qualityLevels.includes(preferredQuality)) {
            player.setPlaybackQualityRange(preferredQuality, preferredQuality);
            player.setPlaybackQuality(preferredQuality);
            console.log('Quality locked at:', preferredQuality);

            // Try to disable adaptive streaming
            try {
                const config = player.getPlayerResponse()?.streamingData;
                if (config && config.adaptiveFormats) {
                    config.adaptiveFormats = config.adaptiveFormats.filter(format =>
                        format.qualityLabel === preferredQuality
                    );
                    console.log('Adaptive streaming disabled');
                }
            } catch (e) {
                console.log('Could not disable adaptive streaming');
            }
        } else if (qualityLevels.length > 0) {
            // Find the highest available quality that's not higher than preferred
            const qualityOrder = ['highres', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
            const preferredIndex = qualityOrder.indexOf(preferredQuality);
            let bestQuality = qualityLevels[0];
            
            for (const quality of qualityLevels) {
                const qualityIndex = qualityOrder.indexOf(quality);
                if (qualityIndex >= preferredIndex) {
                    bestQuality = quality;
                    break;
                }
            }
            
            player.setPlaybackQualityRange(bestQuality, bestQuality);
            player.setPlaybackQuality(bestQuality);
            console.log('Preferred quality not available. Using quality:', bestQuality);
        }
    } else {
        console.log('Player or quality functions not available yet');
    }
};

// Function to check if we're on a video page
function isVideoPage() {
    return window.location.pathname.includes('/watch');
}

// Function to handle quality control with retry
function handleQualityControl(quality = null) {
    if (!isVideoPage()) return;

    // Use provided quality or fall back to user's preferred quality
    const targetQuality = quality || userPreferredQuality;
    console.log('Handling quality control. Target quality:', targetQuality);

    let attempts = 0;
    const maxAttempts = 10;
    
    const attemptSetQuality = () => {
        if (attempts >= maxAttempts) {
            console.log('Max attempts reached, giving up');
            return;
        }
        
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getAvailableQualityLevels === 'function') {
            console.log('Player ready, setting quality to:', targetQuality);
            lockQuality(targetQuality);
        } else {
            console.log('Player not ready, attempt:', attempts + 1);
            attempts++;
            setTimeout(() => attemptSetQuality(), 1000);
        }
    };
    
    attemptSetQuality();
}

// Set up mutation observer to detect video changes
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            // Use the stored preferred quality
            handleQualityControl();
        }
    }
});

// Start observing
observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Handle YouTube's navigation events
document.addEventListener('yt-navigate-finish', () => handleQualityControl());

// Initial quality control
handleQualityControl();

// Also try when the page loads
window.addEventListener('load', () => handleQualityControl());

// Listen for messages from the content script
window.addEventListener('message', (event) => {
    if (event.data.type === 'SET_QUALITY') {
        console.log('Received quality change message:', event.data.quality);
        handleQualityControl(event.data.quality);
    }
});