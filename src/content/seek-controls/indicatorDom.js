/**
 * Seek indicator DOM helpers.
 * Uses YouTube's native seek overlay element.
 */

/**
 * Create default indicator state object.
 * @returns {{element: HTMLDivElement|null, player: Element|null, totalSeconds: number, hideTimer: number|null, removeTimer: number|null}}
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
 * Find YouTube's native seek overlay element, or create it if not present.
 * @param {'forward'|'backward'} direction
 * @returns {HTMLDivElement}
 */
export function createIndicatorElement(direction) {
    let overlay = document.querySelector('.ytp-seek-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'ytp-seek-overlay';
        overlay.dataset.layer = '4';
        overlay.style.display = 'none';

        overlay.innerHTML = `
            <div class="ytp-seek-overlay-animation ytp-seek-overlay-animation-back">
                <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                    <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
                </div>
                <div class="ytp-seek-overlay-duration">− 5</div>
            </div>
            <div class="ytp-seek-overlay-animation ytp-seek-overlay-animation-forward">
                <div class="ytp-seek-overlay-duration">+ 5</div>
                <div class="ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent">
                    <svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>
                </div>
            </div>
            <div class="ytp-seek-overlay-message">
                <div class="ytp-seek-overlay-message-icon"></div>
                <div class="ytp-seek-overlay-message-text"></div>
            </div>
        `;
    }

    updateIndicatorElement(overlay, direction, 0);
    return overlay;
}

/**
 * Update indicator text with custom seconds value.
 * @param {HTMLDivElement} element
 * @param {'forward'|'backward'} direction
 * @param {number} totalSeconds
 */
export function updateIndicatorElement(element, direction, totalSeconds) {
    const backwardDuration = element.querySelector('.ytp-seek-overlay-animation-back .ytp-seek-overlay-duration');
    const forwardDuration = element.querySelector('.ytp-seek-overlay-animation-forward .ytp-seek-overlay-duration');

    const prefix = direction === 'forward' ? '+' : '−';
    const text = `${prefix} ${totalSeconds}`;

    if (backwardDuration) {
        backwardDuration.textContent = text;
    }
    if (forwardDuration) {
        forwardDuration.textContent = text;
    }
}
