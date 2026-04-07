/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button by injecting script into page context.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            'use strict';
            
            const SELECTORS = [
                '.ytp-skip-ad-button',
                '#skip-button\\:2',
                '.ytp-ad-skip-button-modern'
            ];
            
            function isAdShowing() {
                return !!document.querySelector('.ad-showing') || 
                       !!document.querySelector('.ytp-ad-player-overlay');
            }
            
            function getSkipButton() {
                for (const selector of SELECTORS) {
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
                    console.log('[AutoSkipAds] Clicked!');
                }
            }
            
            function start() {
                console.log('[AutoSkipAds] Started');
                
                setInterval(skipAd, 200);
                
                const observer = new MutationObserver(() => {
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
    
    script.id = 'yt-commander-auto-skip';
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    
    console.log('[AutoSkipAds] Script injected');
})();
