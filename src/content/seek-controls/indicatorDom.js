/**
 * Seek indicator DOM helpers.
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
 * Create indicator DOM structure.
 * @param {'forward'|'backward'} direction
 * @returns {HTMLDivElement}
 */
export function createIndicatorElement(direction) {
    const root = document.createElement('div');
    root.className = 'ytp-seek-overlay yt-commander-seek-overlay';
    root.dataset.layer = '4';

    root.appendChild(createSeekOverlayAnimation('back'));
    root.appendChild(createSeekOverlayAnimation('forward'));
    root.appendChild(createSeekOverlayMessage());

    updateIndicatorElement(root, direction, 0);

    return root;
}

/**
 * Update indicator label text.
 * @param {HTMLDivElement} element
 * @param {'forward'|'backward'} direction
 * @param {number} totalSeconds
 */
export function updateIndicatorElement(element, direction, totalSeconds) {
    const overlayDirection = direction === 'backward' ? 'back' : 'forward';
    const animation = element.querySelector(`.ytp-seek-overlay-animation-${overlayDirection}`);
    if (!animation) {
        return;
    }

    const refreshed = animation.cloneNode(true);
    const duration = refreshed.querySelector('.ytp-seek-overlay-duration');
    if (duration) {
        const prefix = direction === 'forward' ? '+' : '-';
        duration.textContent = `${prefix} ${totalSeconds}`;
    }

    animation.parentNode.replaceChild(refreshed, animation);

    const persistentArrow = refreshed.querySelector('.ytp-seek-overlay-arrow-persistent');
    if (persistentArrow && persistentArrow.parentNode) {
        const burst = persistentArrow.cloneNode(true);
        burst.classList.remove('ytp-seek-overlay-arrow-persistent');
        burst.classList.add('yt-commander-seek-overlay-burst');
        persistentArrow.parentNode.insertBefore(burst, persistentArrow);

        const cleanup = () => {
            if (burst.parentNode) {
                burst.remove();
            }
        };

        burst.addEventListener('animationend', cleanup, { once: true });
        window.setTimeout(cleanup, 850);
    }

    const otherDirection = overlayDirection === 'forward' ? 'back' : 'forward';
    const otherDuration = element.querySelector(`.ytp-seek-overlay-animation-${otherDirection} .ytp-seek-overlay-duration`);
    if (otherDuration) {
        otherDuration.textContent = '';
    }
}

/**
 * Create seek overlay animation container.
 * @param {'back'|'forward'} direction
 * @returns {HTMLDivElement}
 */
function createSeekOverlayAnimation(direction) {
    const container = document.createElement('div');
    container.className = `ytp-seek-overlay-animation ytp-seek-overlay-animation-${direction}`;

    const duration = document.createElement('div');
    duration.className = 'ytp-seek-overlay-duration';

    const arrow = document.createElement('div');
    arrow.className = 'ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent';
    arrow.appendChild(createSeekOverlayArrowSvg(direction));

    if (direction === 'forward') {
        container.appendChild(duration);
        container.appendChild(arrow);
    } else {
        container.appendChild(arrow);
        container.appendChild(duration);
    }

    return container;
}

/**
 * Create seek overlay message container.
 * @returns {HTMLDivElement}
 */
function createSeekOverlayMessage() {
    const message = document.createElement('div');
    message.className = 'ytp-seek-overlay-message';

    const icon = document.createElement('div');
    icon.className = 'ytp-seek-overlay-message-icon';

    const text = document.createElement('div');
    text.className = 'ytp-seek-overlay-message-text';

    message.appendChild(icon);
    message.appendChild(text);

    return message;
}

/**
 * Create arrow SVG matching YouTube seek overlay.
 * @param {'back'|'forward'} direction
 * @returns {SVGSVGElement}
 */
function createSeekOverlayArrowSvg(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 22 32');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'forward' ? 'M 4 4 L 16 16 L 4 28' : 'M 18 4 L 6 16 L 18 28');
    path.setAttribute('stroke', 'white');
    path.setAttribute('stroke-width', '4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('fill', 'none');

    svg.appendChild(path);
    return svg;
}
