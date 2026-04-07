/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button by injecting script into page context.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    
    const code = `
        (function() {
            var SELECTORS = [
                '.ytp-skip-ad-button',
                '#skip-button\\\\:2',
                '.ytp-ad-skip-button-modern'
            ];
            
            function isAdShowing() {
                return !!(document.querySelector('.ad-showing') || 
                       document.querySelector('.ytp-ad-player-overlay'));
            }
            
            function getSkipButton() {
                for (var i = 0; i < SELECTORS.length; i++) {
                    var btn = document.querySelector(SELECTORS[i]);
                    if (btn && btn.offsetParent !== null) {
                        return btn;
                    }
                }
                return null;
            }
            
            function skipAd() {
                if (!isAdShowing()) return;
                
                var btn = getSkipButton();
                if (btn) {
                    btn.click();
                    console.log('[AutoSkipAds] Clicked!');
                }
            }
            
            function start() {
                console.log('[AutoSkipAds] Started');
                
                setInterval(skipAd, 200);
                
                var observer = new MutationObserver(function() {
                    if (isAdShowing()) {
                        skipAd();
                    }
                });
                
                observer.observe(document.body, { childList: true, subtree: true });
            }
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start);
            } else {
                start();
            }
        })();
    `;
    
    var script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    
    console.log('[AutoSkipAds] Script injected');
})();
