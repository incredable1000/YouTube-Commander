/**
 * Seek indicator DOM helpers.
 * Uses injected CSS with separate container fade and arrow slide animations.
 */

let cleanupTimer = null;
let injectedCSS = false;

/**
 * Inject CSS with separate container fade and arrow slide animations.
 */
function injectSeekCSS() {
    if (injectedCSS) return;
    injectedCSS = true;

    const style = document.createElement('style');
    style.id = 'ytc-seek-overlay-styles';
    style.textContent = `
        .ytp-seek-overlay {
            display: none !important;
        }
        .ytp-seek-overlay.ytc-seek-container {
            display: flex !important;
            animation: ytc-native-fade 600ms linear forwards !important;
        }
        .ytp-seek-overlay.ytc-seek-container .ytp-seek-overlay-animation {
            display: none !important;
        }
        .ytp-seek-overlay.ytc-seek-container.ytc-seek-active .ytp-seek-overlay-animation-forward,
        .ytp-seek-overlay.ytc-seek-container.ytc-seek-active-back .ytp-seek-overlay-animation-back {
            display: flex !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-animation.ytc-seek-hide {
            display: none !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-duration {
            animation: none !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-animation-forward.ytc-seek-active .ytp-seek-overlay-arrow {
            animation: ytc-arrow-slide-forward 600ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-animation-back.ytc-seek-active-back .ytp-seek-overlay-arrow {
            animation: ytc-arrow-slide-back 600ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards !important;
        }
        @keyframes ytc-native-fade {
            0% { opacity: 0; }
            10% { opacity: 1; }
            80% { opacity: 1; }
            100% { opacity: 0; }
        }
        @keyframes ytc-arrow-slide-forward {
            0% { transform: translateX(-15px); opacity: 0; }
            20% { opacity: 1; }
            100% { transform: translateX(10px); opacity: 0; }
        }
        @keyframes ytc-arrow-slide-back {
            0% { transform: translateX(15px); opacity: 0; }
            20% { opacity: 1; }
            100% { transform: translateX(-10px); opacity: 0; }
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

/**
 * Create default indicator state object.
 */
export function createIndicatorState() {
    return {
        element: null,
        player: null,
        totalSeconds: 0,
        hideTimer: null,
        removeTimer: null
    };
}

/**
 * Get or create the seek overlay container.
 */
export function createIndicatorElement(direction) {
    let overlay = document.querySelector('.ytp-seek-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'ytp-seek-overlay';
        overlay.setAttribute('data-layer', '4');

        // Backward animation (left side, forward arrow)
        const backAnim = document.createElement('div');
        backAnim.className = 'ytp-seek-overlay-animation ytp-seek-overlay-animation-back';
        backAnim.innerHTML = `
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-duration">- 5</div>
        `;

        // Forward animation (right side, backward arrow)
        const fwdAnim = document.createElement('div');
        fwdAnim.className = 'ytp-seek-overlay-animation ytp-seek-overlay-animation-forward';
        fwdAnim.innerHTML = `
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-duration">+ 5</div>
        `;

        const message = document.createElement('div');
        message.className = 'ytp-seek-overlay-message';
        message.innerHTML = `
            <div class="ytp-seek-overlay-message-icon"></div>
            <div class="ytp-seek-overlay-message-text"></div>
        `;

        overlay.appendChild(backAnim);
        overlay.appendChild(fwdAnim);
        overlay.appendChild(message);

        const player = document.querySelector('.html5-video-player');
        if (player) {
            player.appendChild(overlay);
        }
    }

    return overlay;
}

/**
 * Update indicator (no-op).
 */
export function updateIndicatorElement(element, direction, totalSeconds) {
    // Handled by triggerNativeSeekOverlay
}

/**
 * Update arrow count based on seconds.
 */
function updateArrowCount(animEl, seconds) {
    const arrows = animEl.querySelectorAll('.ytp-seek-overlay-arrow');
    const count = seconds >= 15 ? 3 : (seconds >= 10 ? 2 : 1);
    
    arrows.forEach((arrow, index) => {
        arrow.style.display = index < count ? 'flex' : 'none';
    });
}

/**
 * Trigger seek overlay with separate container fade and arrow slide animations.
 * @param {number} seconds - Total seconds to display
 * @param {'forward'|'backward'} direction - Seek direction
 */
export function triggerNativeSeekOverlay(seconds, direction) {
    injectSeekCSS();

    let overlay = document.querySelector('.ytp-seek-overlay');

    if (!overlay) {
        overlay = createIndicatorElement(direction);
    }

    const sign = direction === 'forward' ? '+' : '-';
    const text = `${sign} ${seconds}`;

    const backAnim = overlay.querySelector('.ytp-seek-overlay-animation-back');
    const fwdAnim = overlay.querySelector('.ytp-seek-overlay-animation-forward');
    const backDuration = overlay.querySelector('.ytp-seek-overlay-animation-back .ytp-seek-overlay-duration');
    const fwdDuration = overlay.querySelector('.ytp-seek-overlay-animation-forward .ytp-seek-overlay-duration');

    // Update duration text (stays static)
    if (backDuration) backDuration.textContent = text;
    if (fwdDuration) fwdDuration.textContent = text;

    // Update arrow count
    if (backAnim) updateArrowCount(backAnim, seconds);
    if (fwdAnim) updateArrowCount(fwdAnim, seconds);

    // Clear previous cleanup timer
    if (cleanupTimer) {
        clearTimeout(cleanupTimer);
    }

    // Remove all custom classes
    overlay.classList.remove('ytc-seek-container', 'ytc-seek-active', 'ytc-seek-active-back');
    if (backAnim) {
        backAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back', 'ytc-seek-hide');
    }
    if (fwdAnim) {
        fwdAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back', 'ytc-seek-hide');
    }

    // Force reflow
    void overlay.offsetWidth;

    // Apply container fade class
    overlay.classList.add('ytc-seek-container');

    // Show correct direction, hide the other
    if (direction === 'forward') {
        overlay.classList.add('ytc-seek-active');
        if (fwdAnim) {
            fwdAnim.classList.add('ytc-seek-active');
        }
        if (backAnim) {
            backAnim.classList.add('ytc-seek-hide');
        }
    } else {
        overlay.classList.add('ytc-seek-active-back');
        if (backAnim) {
            backAnim.classList.add('ytc-seek-active-back');
        }
        if (fwdAnim) {
            fwdAnim.classList.add('ytc-seek-hide');
        }
    }

    // Schedule cleanup
    cleanupTimer = setTimeout(() => {
        overlay.classList.remove('ytc-seek-container', 'ytc-seek-active', 'ytc-seek-active-back');
        if (backAnim) {
            backAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back', 'ytc-seek-hide');
        }
        if (fwdAnim) {
            fwdAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back', 'ytc-seek-hide');
        }
        cleanupTimer = null;
    }, 650);
}
