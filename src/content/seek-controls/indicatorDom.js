/**
 * Seek indicator DOM helpers.
 * Uses data attributes and injected CSS to force show YouTube's seek overlay.
 */

let cleanupTimer = null;
let injectedCSS = false;

/**
 * Inject CSS that forces the seek overlay to show.
 */
function injectForceCSS() {
    if (injectedCSS) return;
    injectedCSS = true;

    const style = document.createElement('style');
    style.id = 'ytc-seek-overlay-force';
    style.textContent = `
        .ytp-seek-overlay[data-custom-show="true"] {
            display: block !important;
            opacity: 1 !important;
        }
        .ytp-seek-overlay[data-custom-show="true"] .ytp-seek-overlay-animation {
            display: flex !important;
            animation: ytc-seek-bezel-fade 0.7s ease-out forwards;
        }
        @keyframes ytc-seek-bezel-fade {
            0% { opacity: 0; transform: scale(0.8); }
            15% { opacity: 1; transform: scale(1.05); }
            25% { transform: scale(1); }
            85% { opacity: 1; }
            100% { opacity: 0; }
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

        const backAnim = document.createElement('div');
        backAnim.className = 'ytp-seek-overlay-animation ytp-seek-overlay-animation-back';
        backAnim.innerHTML = `
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
            <div class="ytp-seek-overlay-duration">- 5</div>
        `;

        const fwdAnim = document.createElement('div');
        fwdAnim.className = 'ytp-seek-overlay-animation ytp-seek-overlay-animation-forward';
        fwdAnim.innerHTML = `
            <div class="ytp-seek-overlay-duration">+ 5</div>
            <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
            </div>
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
 * Show seek overlay with custom seconds value.
 * Uses data attribute and injected CSS to force visibility.
 * @param {number} seconds - Total seconds to display
 * @param {'forward'|'backward'} direction - Seek direction
 */
export function triggerNativeSeekOverlay(seconds, direction) {
    injectForceCSS();

    let overlay = document.querySelector('.ytp-seek-overlay');

    if (!overlay) {
        overlay = createIndicatorElement(direction);
    }

    const sign = direction === 'forward' ? '+' : '-';
    const text = `${sign} ${seconds}`;

    // Update duration text
    const animClass = direction === 'backward'
        ? 'ytp-seek-overlay-animation-back'
        : 'ytp-seek-overlay-animation-forward';
    const durationEl = overlay.querySelector(`.${animClass} .ytp-seek-overlay-duration`);
    if (durationEl) {
        durationEl.textContent = text;
    }

    // Clear previous cleanup timer
    if (cleanupTimer) {
        clearTimeout(cleanupTimer);
    }

    // Force show overlay using data attribute
    overlay.setAttribute('data-custom-show', 'true');

    // Schedule cleanup
    cleanupTimer = setTimeout(() => {
        overlay.removeAttribute('data-custom-show');
        cleanupTimer = null;
    }, 700);
}
