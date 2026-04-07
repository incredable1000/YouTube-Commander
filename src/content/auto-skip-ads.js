/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] 1 - start');
    
    var code = 'window._autoSkipInit = function() {' +
        'console.log("[AutoSkipAds] Injected: Starting");' +
        'var S=[".ytp-skip-ad-button","#skip-button\\\\:2",".ytp-ad-skip-button-modern"];' +
        'function isAd(){return!!(document.querySelector(".ad-showing")||document.querySelector(".ytp-ad-player-overlay"));} ' +
        'function getBtn(){for(var i=0;i<S.length;i++){var b=document.querySelector(S[i]);if(b&&b.offsetParent!==null)return b;}} ' +
        'function skip(){if(!isAd())return;var btn=getBtn();if(btn){btn.click();console.log("[AutoSkipAds] Clicked!");}} ' +
        'setInterval(skip,200);' +
        'new MutationObserver(function(){if(isAd())skip();}).observe(document.body,{childList:true,subtree:true});' +
        '};window._autoSkipInit();';
    
    console.log('[AutoSkipAds] 2 - code length:', code.length);
    
    try {
        var ie = eval;
        (ie)(code);
        console.log('[AutoSkipAds] 3 - SUCCESS');
    } catch (e) {
        console.log('[AutoSkipAds] 4 - ERROR: ' + e.name + ': ' + e.message);
    }
})();
