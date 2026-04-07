/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button when it appears.
 */

(function() {
    'use strict';
    
    const SKIP_BUTTON_SELECTORS = [
        '.ytp-skip-ad-button',
        '#skip-button\\:2',
        '.ytp-ad-skip-button-modern',
        '.ytp-ad-skip-button'
    ];
    
    function isAdShowing() {
        return !!document.querySelector('.ad-showing') || 
               !!document.querySelector('.ytp-ad-player-overlay');
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
            console.log('[AutoSkipAds] Clicked skip button!');
        }
    }
    
    function start() {
        console.log('[AutoSkipAds] Starting...');
        
        const observer = new MutationObserver(() => {
            if (isAdShowing()) {
                skipAd();
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        setInterval(skipAd, 200);
        
        document.addEventListener('yt-navigate-finish', () => {
            console.log('[AutoSkipAds] Navigation finished');
        });
        
        console.log('[AutoSkipAds] Started');
    }
    
    function waitForPlayer(callback) {
        const check = () => {
            if (document.querySelector('.html5-video-player') || document.querySelector('#movie_player')) {
                callback();
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    }
    
    waitForPlayer(start);
})();
