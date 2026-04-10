/**
 * Seek indicator DOM helpers.
 * Creates YouTube-style seek overlay with custom values.
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

export function createIndicatorElement(direction) {
    const overlay = document.createElement('div');
    overlay.className = 'ytc-seek-overlay';

    const container = document.createElement('div');
    container.className = `ytc-seek-indicator ${direction}`;

    const arrow = document.createElement('div');
    arrow.className = 'ytc-seek-arrow';
    arrow.innerHTML = direction === 'backward'
        ? '<svg viewBox="0 0 22 32" width="22" height="24"><path d="M 18 4 L 6 16 L 18 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>'
        : '<svg viewBox="0 0 22 32" width="22" height="24"><path d="M 4 4 L 16 16 L 4 28" stroke="white" stroke-width="4" stroke-linecap="round" fill="none"></path></svg>';

    const duration = document.createElement('div');
    duration.className = 'ytc-seek-duration';

    container.appendChild(arrow);
    container.appendChild(duration);
    overlay.appendChild(container);

    updateIndicatorElement(overlay, direction, 0);
    return overlay;
}

export function updateIndicatorElement(element, direction, totalSeconds) {
    const duration = element.querySelector('.ytc-seek-duration');
    if (duration) {
        const sign = direction === 'forward' ? '+' : '-';
        duration.textContent = `${sign} ${totalSeconds}`;
    }
}
