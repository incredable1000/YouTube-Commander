// Get quality setting from storage and send to the page script
function sendQualityToPage(quality) {
    window.postMessage({ type: 'SET_QUALITY', quality: quality }, '*');
}

// Load initial quality setting
chrome.storage.sync.get({ maxQuality: 'hd1080' }, (settings) => {
    sendQualityToPage(settings.maxQuality);
});

// Listen for quality changes from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'QUALITY_CHANGED') {
        sendQualityToPage(message.quality);
    }
});
