/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button when it appears.
 */

(function() {
    'use strict';
    
    const SKIP_BUTTON_SELECTORS = [
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button', 
        '.ytp-ad-skip-button',
        '[aria-label*="Skip ad"]',
        'button.ytp-ad-skip-button'
    ];
    
    function isAdShowing() {
        return !!document.querySelector('.ytp-ad-player-overlay');
    }
    
    function getSkipButton() {
        const buttons = document.querySelectorAll(SKIP_BUTTON_SELECTORS.join(','));
        for (const btn of buttons) {
            if (btn && btn.offsetParent !== null && btn.getBoundingClientRect().width > 0) {
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
            console.log('[AutoSkipAds] Clicked!');
        }
    }
    
    function start() {
        console.log('[AutoSkipAds] Starting...');
        
        const observer = new MutationObserver(() => {
            if (isAdShowing()) {
                console.log('[AutoSkipAds] Ad detected, checking for skip button...');
                skipAd();
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        setInterval(skipAd, 300);
        
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
