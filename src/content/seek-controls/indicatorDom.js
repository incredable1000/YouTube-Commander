/**
 * Seek indicator DOM helpers.
 * Uses injected CSS and YouTube's native seek overlay structure.
 */

let cleanupTimer = null;
let injectedCSS = false;

/**
 * Inject CSS for the seek overlay animation.
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
        .ytp-seek-overlay.ytc-seek-visible {
            display: block !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-animation {
            display: none !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-animation.ytc-seek-active {
            display: flex !important;
            animation: ytc-seek-slide-forward 500ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards !important;
        }
        .ytp-seek-overlay .ytp-seek-overlay-animation.ytc-seek-active-back {
            display: flex !important;
            animation: ytc-seek-slide-back 500ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards !important;
        }
        @keyframes ytc-seek-slide-forward {
            0% { opacity: 0; transform: translateY(-50%) translateX(-40px); }
            20% { opacity: 1; transform: translateY(-50%) translateX(0); }
            100% { opacity: 0; transform: translateY(-50%) translateX(40px); }
        }
        @keyframes ytc-seek-slide-back {
            0% { opacity: 0; transform: translateY(-50%) translateX(40px); }
            20% { opacity: 1; transform: translateY(-50%) translateX(0); }
            100% { opacity: 0; transform: translateY(-50%) translateX(-40px); }
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
 * Trigger seek overlay with custom seconds value.
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

    // Update duration text
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
    overlay.classList.remove('ytc-seek-visible');
    if (backAnim) {
        backAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back');
    }
    if (fwdAnim) {
        fwdAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back');
    }

    // Force reflow
    void overlay.offsetWidth;

    // Show overlay and add animation class to the correct direction
    overlay.classList.add('ytc-seek-visible');

    if (direction === 'forward') {
        if (fwdAnim) {
            fwdAnim.classList.add('ytc-seek-active');
        }
    } else {
        if (backAnim) {
            backAnim.classList.add('ytc-seek-active-back');
        }
    }

    // Schedule cleanup
    cleanupTimer = setTimeout(() => {
        overlay.classList.remove('ytc-seek-visible');
        if (backAnim) backAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back');
        if (fwdAnim) fwdAnim.classList.remove('ytc-seek-active', 'ytc-seek-active-back');
        cleanupTimer = null;
    }, 500);
}
