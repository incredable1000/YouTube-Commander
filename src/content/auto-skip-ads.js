/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button by injecting script into page context.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    
    function inject() {
        try {
            var code = [
                '(function() {',
                '    function isAdShowing() {',
                '        return !!(document.querySelector(".ad-showing") || document.querySelector(".ytp-ad-player-overlay"));',
                '    }',
                '    function getSkipButton() {',
                '        var selectors = [".ytp-skip-ad-button", "#skip-button\\\\:2", ".ytp-ad-skip-button-modern"];',
                '        for (var i = 0; i < selectors.length; i++) {',
                '            var btn = document.querySelector(selectors[i]);',
                '            if (btn && btn.offsetParent !== null) return btn;',
                '        }',
                '        return null;',
                '    }',
                '    function skipAd() {',
                '        if (!isAdShowing()) return;',
                '        var btn = getSkipButton();',
                '        if (btn) { btn.click(); console.log("[AutoSkipAds] Clicked!"); }',
                '    }',
                '    function start() {',
                '        console.log("[AutoSkipAds] Started");',
                '        setInterval(skipAd, 200);',
                '        new MutationObserver(function(m) { if (isAdShowing()) skipAd(); })',
                '            .observe(document.body, { childList: true, subtree: true });',
                '    }',
                '    if (document.readyState === "loading") {',
                '        document.addEventListener("DOMContentLoaded", start);',
                '    } else { start(); }',
                '})();'
            ].join('\n');
            
            var script = document.createElement('script');
            script.textContent = code;
            var parent = document.head || document.documentElement;
            parent.appendChild(script);
            parent.removeChild(script);
            
            console.log('[AutoSkipAds] Injected successfully');
        } catch (e) {
            console.error('[AutoSkipAds] Injection failed:', e);
        }
    }
    
    // Try immediately
    inject();
    
    // Also try after a short delay as fallback
    setTimeout(function() {
        if (!window.__autoSkipInjected) {
            inject();
            window.__autoSkipInjected = true;
        }
    }, 1000);
})();
