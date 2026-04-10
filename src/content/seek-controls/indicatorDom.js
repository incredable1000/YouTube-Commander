/**
 * Seek indicator DOM helpers.
 * Uses YouTube's native seek overlay structure with custom values.
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
 * Create YouTube-native seek overlay DOM structure.
 * Uses the same structure as YouTube's default seek indicator but allows custom values.
 * @param {'forward'|'backward'} direction
 * @returns {HTMLDivElement}
 */
export function createIndicatorElement(direction) {
    const root = document.createElement('div');
    root.className = 'ytp-seek-overlay';
    root.dataset.layer = '4';

    const backwardAnim = document.createElement('div');
    backwardAnim.className = 'ytp-seek-overlay-animation ytp-seek-overlay-animation-back';

    const backwardArrow = document.createElement('div');
    backwardArrow.className = 'ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent';
    backwardArrow.innerHTML = `<svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>`;

    const backwardDuration = document.createElement('div');
    backwardDuration.className = 'ytp-seek-overlay-duration';

    backwardAnim.appendChild(backwardArrow);
    backwardAnim.appendChild(backwardDuration);

    const forwardAnim = document.createElement('div');
    forwardAnim.className = 'ytp-seek-overlay-animation ytp-seek-overlay-animation-forward';

    const forwardDuration = document.createElement('div');
    forwardDuration.className = 'ytp-seek-overlay-duration';

    const forwardArrow = document.createElement('div');
    forwardArrow.className = 'ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent';
    forwardArrow.innerHTML = `<svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>`;

    forwardAnim.appendChild(forwardDuration);
    forwardAnim.appendChild(forwardArrow);

    const message = document.createElement('div');
    message.className = 'ytp-seek-overlay-message';
    message.innerHTML = '<div class="ytp-seek-overlay-message-icon"></div><div class="ytp-seek-overlay-message-text"></div>';

    root.appendChild(backwardAnim);
    root.appendChild(forwardAnim);
    root.appendChild(message);

    updateIndicatorElement(root, direction, 0);

    return root;
}

/**
 * Update indicator text with custom seconds value.
 * @param {HTMLDivElement} element
 * @param {'forward'|'backward'} direction
 * @param {number} totalSeconds
 */
export function updateIndicatorElement(element, direction, totalSeconds) {
    const durations = element.querySelectorAll('.ytp-seek-overlay-duration');
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

    const backwardAnim = element.querySelector('.ytp-seek-overlay-animation-back');
    const forwardAnim = element.querySelector('.ytp-seek-overlay-animation-forward');

    if (backwardAnim) {
        backwardAnim.classList.toggle('ytp-seek-overlay-hidden', direction !== 'backward');
    }
    if (forwardAnim) {
        forwardAnim.classList.toggle('ytp-seek-overlay-hidden', direction !== 'forward');
    }
}
