/**
 * UI controller for Shorts counter floating label.
 */

import { addEventListenerWithCleanup } from '../utils/events.js';
import { getActiveShortsRenderer } from './pageContext.js';
import {
    BUMP_RESET_MS,
    DELTA_LIFETIME_MS,
    RESET_FEEDBACK_MS
} from './constants.js';

/**
 * Create Shorts counter UI controller.
 * @param {{labelId: string, onReset: () => void}} options
 * @returns {{
 *   mount: () => void,
 *   unmount: () => void,
 *   setCount: (count: number, options?: {animate?: boolean, delta?: number}) => void,
 *   animateReset: () => void,
 *   isMounted: () => boolean
 * }}
 */
function createShortsCounterUi(options) {
    const labelId = options?.labelId || 'shorts-counter-label';
    const onReset = typeof options?.onReset === 'function' ? options.onReset : () => {};

    let counterLabel = null;
    let counterValue = null;
    let clickCleanup = null;
    let animationTimer = null;
    let lastHost = null;

    const hostSelectors = [
        'ytd-reel-player-overlay-renderer #actions',
        'ytd-reel-player-overlay-renderer .actions',
        'ytd-reel-player-overlay-renderer ytd-reel-player-actions-renderer',
        '#actions'
    ];

    function resolveDockHost() {
        const activeRenderer = getActiveShortsRenderer();
        if (!activeRenderer) {
            return null;
        }

        for (const selector of hostSelectors) {
            const host = activeRenderer.querySelector(selector);
            if (host instanceof HTMLElement) {
                return host;
            }
        }

        return null;
    }

    function attachToHost() {
        if (!counterLabel) {
            return;
        }

        const host = resolveDockHost();
        if (host) {
            counterLabel.classList.add('is-docked');
            if (counterLabel.parentElement !== host || lastHost !== host) {
                host.insertBefore(counterLabel, host.firstChild);
            }
            lastHost = host;
            return;
        }

        counterLabel.classList.remove('is-docked');
        if (counterLabel.parentElement !== document.body) {
            document.body.appendChild(counterLabel);
        }
        lastHost = null;
    }

    /**
     * Remove counter element and related handlers.
     */
    function unmount() {
        if (clickCleanup) {
            clickCleanup();
            clickCleanup = null;
        }

        if (animationTimer) {
            window.clearTimeout(animationTimer);
            animationTimer = null;
        }

        if (counterLabel) {
            counterLabel.remove();
        }

        counterLabel = null;
        counterValue = null;
        lastHost = null;
    }

    /**
     * Create or recreate the floating counter element.
     */
    function mount() {
        const existing = document.getElementById(labelId);
        if (existing) {
            existing.remove();
        }

        counterLabel = document.createElement('button');
        counterLabel.id = labelId;
        counterLabel.type = 'button';
        counterLabel.className = 'yt-commander-shorts-counter';
        counterLabel.setAttribute('aria-label', 'Shorts watched this tab. Click to reset.');
        counterLabel.title = 'Watched this tab (click to reset)';
        counterLabel.innerHTML = [
            '<span class="yt-commander-shorts-counter__badge" aria-hidden="true"></span>',
            '<span class="yt-commander-shorts-counter__count">0</span>'
        ].join('');

        counterValue = counterLabel.querySelector('.yt-commander-shorts-counter__count');

        if (clickCleanup) {
            clickCleanup();
            clickCleanup = null;
        }

        clickCleanup = addEventListenerWithCleanup(counterLabel, 'click', () => {
            onReset();
        });

        attachToHost();
    }

    /**
     * Show animated +N chip for count increments.
     * @param {number} delta
     */
    function showDelta(delta) {
        if (!counterLabel || delta <= 0) {
            return;
        }

        const deltaChip = document.createElement('span');
        deltaChip.className = 'yt-commander-shorts-counter__delta';
        deltaChip.textContent = `+${delta}`;
        counterLabel.appendChild(deltaChip);

        window.requestAnimationFrame(() => {
            deltaChip.classList.add('yt-commander-shorts-counter__delta--visible');
        });

        window.setTimeout(() => {
            deltaChip.remove();
        }, DELTA_LIFETIME_MS);
    }

    /**
     * Trigger count increase animation.
     * @param {number} delta
     */
    function animateIncrease(delta) {
        if (!counterLabel || !counterValue) {
            return;
        }

        counterLabel.classList.remove('yt-commander-shorts-counter--bump');
        counterValue.classList.remove('yt-commander-shorts-counter__count--jump');
        void counterLabel.offsetWidth;

        counterLabel.classList.add('yt-commander-shorts-counter--bump');
        counterValue.classList.add('yt-commander-shorts-counter__count--jump');
        showDelta(delta);

        if (animationTimer) {
            window.clearTimeout(animationTimer);
        }

        animationTimer = window.setTimeout(() => {
            if (counterLabel) {
                counterLabel.classList.remove('yt-commander-shorts-counter--bump');
            }
            if (counterValue) {
                counterValue.classList.remove('yt-commander-shorts-counter__count--jump');
            }
            animationTimer = null;
        }, BUMP_RESET_MS);
    }

    /**
     * Update displayed count.
     * @param {number} count
     * @param {{animate?: boolean, delta?: number}} [options]
     */
    function setCount(count, options = {}) {
        if (!counterLabel || !counterValue) {
            return;
        }

        attachToHost();
        counterValue.textContent = Number(count || 0).toLocaleString();

        if (options.animate) {
            animateIncrease(Number.isFinite(options.delta) ? options.delta : 1);
        }
    }

    /**
     * Animate reset feedback.
     */
    function animateReset() {
        if (!counterLabel) {
            return;
        }

        counterLabel.classList.remove('yt-commander-shorts-counter--reset');
        void counterLabel.offsetWidth;
        counterLabel.classList.add('yt-commander-shorts-counter--reset');

        window.setTimeout(() => {
            if (counterLabel) {
                counterLabel.classList.remove('yt-commander-shorts-counter--reset');
            }
        }, RESET_FEEDBACK_MS);
    }

    return {
        mount,
        unmount,
        setCount,
        animateReset,
        isMounted: () => Boolean(counterLabel && counterValue)
    };
}

export {
    createShortsCounterUi
};
