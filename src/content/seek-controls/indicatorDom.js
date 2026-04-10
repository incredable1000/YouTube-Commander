/**
 * Seek indicator DOM helpers.
 * Intercepts and modifies YouTube's native seek overlay.
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
 * Get or create the seek overlay container.
 * Uses YouTube's native overlay element.
 * @param {'forward'|'backward'} direction
 * @returns {HTMLDivElement}
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
    const backDuration = element.querySelector('.ytp-seek-overlay-animation-back .ytp-seek-overlay-duration');
    const fwdDuration = element.querySelector('.ytp-seek-overlay-animation-forward .ytp-seek-overlay-duration');

    const sign = direction === 'forward' ? '+' : '-';
    const text = `${sign} ${totalSeconds}`;

    if (backDuration) {
        backDuration.textContent = text;
    }
    if (fwdDuration) {
        fwdDuration.textContent = text;
    }
}
