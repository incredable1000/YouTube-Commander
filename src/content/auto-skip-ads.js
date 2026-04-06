/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button by injecting script into page context.
 */

const SKIP_BUTTON_SELECTORS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '[aria-label*="Skip"][aria-label*="ad"]',
    'button.ytp-ad-skip-button'
];

let checkIntervalId = null;

function injectScript() {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            let intervalId = null;
            
            function isAdShowing() {
                return !!document.querySelector('.ytp-ad-player-overlay');
            }
            
            function getSkipButton() {
                const selectors = ${JSON.stringify(SKIP_BUTTON_SELECTORS)};
                for (const selector of selectors) {
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
                if (intervalId) return;
                intervalId = setInterval(skipAd, 200);
                document.addEventListener('yt-navigate-finish', skipAd);
                console.log('[AutoSkipAds] Started');
            }
            
            function stop() {
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            }
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start);
            } else {
                start();
            }
        })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
}

injectScript();
