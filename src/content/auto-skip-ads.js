/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button by injecting script into page context.
 */

(function() {
    'use strict';
    
    const SKIP_BUTTON_SELECTORS = [
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button', 
        '.ytp-ad-skip-button',
        '[aria-label*="Skip"][aria-label*="ad"]'
    ];
    
    function isAdShowing() {
        return !!document.querySelector('.ytp-ad-player-overlay');
    }
    
    function getSkipButton() {
        for (const selector of SKIP_BUTTON_SELECTORS) {
            const btn = document.querySelector(selector);
            if (btn && btn.offsetParent !== null) {
                return btn;
            }
        }
        return null;
    }
    
    function skipAd() {
        if (!isAdShowing()) return;
        
        const btn = getSkipButton();
        if (btn) {
            btn.click();
            console.log('[AutoSkipAds] Clicked skip button');
        }
    }
    
    function start() {
        setInterval(skipAd, 200);
        document.addEventListener('yt-navigate-finish', skipAd);
        console.log('[AutoSkipAds] Started');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
