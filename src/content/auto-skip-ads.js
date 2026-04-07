/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button.
 */

console.log('[AutoSkipAds] 1 - start');

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] 2 - IIFE start');
    
    var code = 'window._autoSkipInit = function() {' +
        'console.log("[AutoSkipAds] Injected: Starting");' +
        'var S=[".ytp-skip-ad-button","#skip-button\\\\:2",".ytp-ad-skip-button-modern"];' +
        'function isAd(){return!!(document.querySelector(".ad-showing")||document.querySelector(".ytp-ad-player-overlay"));} ' +
        'function getBtn(){for(var i=0;i<S.length;i++){var b=document.querySelector(S[i]);if(b&&b.offsetParent!==null)return b;}} ' +
        'function skip(){if(!isAd())return;var btn=getBtn();if(btn){btn.click();console.log("[AutoSkipAds] Clicked!");}} ' +
        'setInterval(skip,200);' +
        'new MutationObserver(function(){if(isAd())skip();}).observe(document.body,{childList:true,subtree:true});' +
        '};window._autoSkipInit();';
    
    console.log('[AutoSkipAds] 3 - code defined');
    console.log('[AutoSkipAds] code length:', code.length);
    
    console.log('[AutoSkipAds] 4 - before try');
    
    try {
        console.log('[AutoSkipAds] 5 - in try');
        var ie = eval;
        console.log('[AutoSkipAds] 6 - got eval');
        (ie)(code);
        console.log('[AutoSkipAds] 7 - eval done');
    } catch (e) {
        console.log('[AutoSkipAds] 8 - in catch');
        console.error('[AutoSkipAds] Error:', e.name, e.message);
    }
    
    console.log('[AutoSkipAds] 9 - after try/catch');
})();

console.log('[AutoSkipAds] 10 - IIFE done');
