/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button by injecting script into page context.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    console.log('[AutoSkipAds] Document state:', document.readyState);
    
    var code = [
        '(function() {',
        '    "use strict";',
        '    console.log("[AutoSkipAds] Injected script running");',
        '    function isAdShowing() {',
        '        return !!(document.querySelector(".ad-showing") || document.querySelector(".ytp-ad-player-overlay"));',
        '    }',
        '    function getSkipButton() {',
        '        var s = [".ytp-skip-ad-button", "#skip-button\\\\:2", ".ytp-ad-skip-button-modern"];',
        '        for (var i = 0; i < s.length; i++) {',
        '            var b = document.querySelector(s[i]);',
        '            if (b && b.offsetParent !== null) return b;',
        '        }',
        '        return null;',
        '    }',
        '    function skip() {',
        '        if (!isAdShowing()) return;',
        '        var btn = getSkipButton();',
        '        if (btn) { btn.click(); console.log("[AutoSkipAds] Clicked!"); }',
        '    }',
        '    function init() {',
        '        console.log("[AutoSkipAds] Injected: Starting");',
        '        setInterval(skip, 200);',
        '        new MutationObserver(function() { if (isAdShowing()) skip(); })',
        '            .observe(document.body, { childList: true, subtree: true });',
        '    }',
        '    if (document.readyState === "loading") {',
        '        document.addEventListener("DOMContentLoaded", init);',
        '    } else { init(); }',
        '})();'
    ].join('\n');
    
    console.log('[AutoSkipAds] Creating script element');
    var script = document.createElement('script');
    script.textContent = code;
    console.log('[AutoSkipAds] Script text length:', code.length);
    
    var parent = document.head || document.documentElement;
    console.log('[AutoSkipAds] Parent element:', parent ? parent.tagName : 'null');
    
    parent.appendChild(script);
    console.log('[AutoSkipAds] Script appended');
    
    parent.removeChild(script);
    console.log('[AutoSkipAds] Script removed, injection complete');
    
    setTimeout(function() {
        window.__autoSkipInjected = true;
    }, 100);
})();
