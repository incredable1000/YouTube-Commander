/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button using new Function in page context.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    
    var code = 'window._autoSkipInit = function() {' +
        'console.log("[AutoSkipAds] Injected: Starting");' +
        'var S=[".ytp-skip-ad-button","#skip-button\\\\:2",".ytp-ad-skip-button-modern"];' +
        'function isAd(){return!!(document.querySelector(".ad-showing")||document.querySelector(".ytp-ad-player-overlay"));}' +
        'function getBtn(){for(var i=0;i<S.length;i++){var b=document.querySelector(S[i]);if(b&&b.offsetParent!==null)return b;}return null;}' +
        'function skip(){if(!isAd())return;var btn=getBtn();if(btn){btn.click();console.log("[AutoSkipAds] Clicked!");}}' +
        'setInterval(skip,200);' +
        'new MutationObserver(function(){if(isAd())skip();}).observe(document.body,{childList:true,subtree:true});' +
        '};window._autoSkipInit();';
    
    console.log('[AutoSkipAds] Code length:', code.length);
    console.log('[AutoSkipAds] Before eval');
    
    try {
        var fn = new Function(code);
        console.log('[AutoSkipAds] Function created');
        fn();
        console.log('[AutoSkipAds] Function executed');
    } catch (e) {
        console.error('[AutoSkipAds] Error:', e.message);
    }
})();
