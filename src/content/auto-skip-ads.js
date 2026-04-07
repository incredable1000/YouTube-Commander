/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button using window.eval in page context.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    
    var code = [
        'window._autoSkipInit = function() {',
        '    console.log("[AutoSkipAds] Injected: Starting");',
        '    var SELECTORS = [".ytp-skip-ad-button", "#skip-button\\\\:2", ".ytp-ad-skip-button-modern"];',
        '    function isAdShowing() {',
        '        return !!(document.querySelector(".ad-showing") || document.querySelector(".ytp-ad-player-overlay"));',
        '    }',
        '    function getSkipButton() {',
        '        for (var i = 0; i < SELECTORS.length; i++) {',
        '            var btn = document.querySelector(SELECTORS[i]);',
        '            if (btn && btn.offsetParent !== null) return btn;',
        '        }',
        '        return null;',
        '    }',
        '    function skip() {',
        '        if (!isAdShowing()) return;',
        '        var btn = getSkipButton();',
        '        if (btn) { btn.click(); console.log("[AutoSkipAds] Clicked!"); }',
        '    }',
        '    setInterval(skip, 200);',
        '    new MutationObserver(function() { if (isAdShowing()) skip(); })',
        '        .observe(document.body, { childList: true, subtree: true });',
        '};',
        'window._autoSkipInit();'
    ].join('\n');
    
    console.log('[AutoSkipAds] Code length:', code.length);
    
    try {
        window.eval(code);
        console.log('[AutoSkipAds] eval completed');
    } catch (e) {
        console.error('[AutoSkipAds] eval error:', e);
    }
})();
