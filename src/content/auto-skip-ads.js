/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button.
 */

(function() {
    'use strict';
    
    console.log('[AutoSkipAds] Loading...');
    
    try {
        var code = 'window._autoSkipInit = function() {' +
            'console.log("[AutoSkipAds] Injected: Starting");' +
            'var S=[".ytp-skip-ad-button","#skip-button\\\\:2",".ytp-ad-skip-button-modern"];' +
            'function isAd(){return!!(document.querySelector(".ad-showing")||document.querySelector(".ytp-ad-player-overlay"));} ' +
            'function getBtn(){for(var i=0;i<S.length;i++){var b=document.querySelector(S[i]);if(b&&b.offsetParent!==null)return b;}} ' +
            'function skip(){if(!isAd())return;var btn=getBtn();if(btn){btn.click();console.log("[AutoSkipAds] Clicked!");}} ' +
            'setInterval(skip,200);' +
            'new MutationObserver(function(){if(isAd())skip();}).observe(document.body,{childList:true,subtree:true});' +
            '};window._autoSkipInit();';
        
        console.log('[AutoSkipAds] code ready, length:', code.length);
        
        // Try different approaches
        var result;
        
        // Approach 1: new Function
        try {
            result = new Function(code);
            console.log('[AutoSkipAds] new Function() worked');
            result();
            console.log('[AutoSkipAds] result() called');
        } catch (e1) {
            console.error('[AutoSkipAds] new Function failed:', e1.message);
            
            // Approach 2: eval
            try {
                eval(code);
                console.log('[AutoSkipAds] eval worked');
            } catch (e2) {
                console.error('[AutoSkipAds] eval failed:', e2.message);
            }
        }
    } catch (err) {
        console.error('[AutoSkipAds] Outer error:', err.message);
    }
})();
