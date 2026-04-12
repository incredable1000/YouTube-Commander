/**
 * UI controller for Shorts counter floating label.
 */

import { addEventListenerWithCleanup } from '../utils/events.js';
import { getActiveShortsRenderer } from './pageContext.js';

/**
 * Create Shorts counter UI controller.
 * @param {{labelId: string, onReset: () => void}} options
 * @returns {{
 *   mount: () => void,
 *   unmount: () => void,
 *   syncHost: () => void,
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
    let lastRenderedCount = null;

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
        if (counterLabel.parentElement) {
            counterLabel.remove();
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
        counterLabel.setAttribute('aria-label', 'Shorts session counter. Click to reset.');
        counterLabel.title = 'Session counter (click to reset)';
        counterLabel.innerHTML = [
            '<span class="yt-commander-shorts-counter__icon" aria-hidden="true">',
            '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">',
            '<path d="M15 1H9v2h6V1zm5.03 5.39-1.42-1.42-1.41 1.42A7.93 7.93 0 0 0 12 4a8 8 0 1 0 8 8c0-2.21-.9-4.21-2.34-5.61L20.03 6.39zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm1-9h-2v4.2l3.6 2.1 1-1.64-2.6-1.56V9z"></path>',
            '</svg>',
            '</span>',
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
    /**
     * Update displayed count.
     * @param {number} count
     * @param {{animate?: boolean, delta?: number}} [options]
     */
    function setCount(count, options = {}) {
        if (!counterLabel || !counterValue) {
            return;
        }

        const nextCount = Number(count || 0);
        if (lastRenderedCount === nextCount && !options.animate) {
            return;
        }

        counterValue.textContent = nextCount.toLocaleString();
        lastRenderedCount = nextCount;

        if (animationTimer) {
            window.clearTimeout(animationTimer);
            animationTimer = null;
        }
    }

    /**
     * Animate reset feedback.
     */
    function animateReset() {
        return;
    }

    return {
        mount,
        unmount,
        setCount,
        animateReset,
        isMounted: () => Boolean(counterLabel && counterValue),
        syncHost: attachToHost
    };
}

/**
 * Create Shorts auto-advance toggle UI controller.
 * @param {{
 *  labelId?: string,
 *  counterLabelId?: string,
 *  onToggle?: (nextValue: boolean) => void
 * }} options
 * @returns {{
 *  mount: () => void,
 *  unmount: () => void,
 *  syncHost: () => void,
 *  setEnabled: (value: boolean) => void,
 *  isMounted: () => boolean
 * }}
 */
function createShortsAutoAdvanceToggleUi(options) {
    const labelId = options?.labelId || 'shorts-auto-advance-toggle';
    const counterLabelId = options?.counterLabelId || 'shorts-counter-label';
    const onToggle = typeof options?.onToggle === 'function' ? options.onToggle : () => {};

    let toggleButton = null;
    let toggleLabel = null;
    let clickCleanup = null;
    let lastHost = null;
    let enabled = true;

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

    function applyEnabledState() {
        if (!toggleButton || !toggleLabel) {
            return;
        }

        toggleButton.classList.toggle('is-disabled', !enabled);
        toggleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggleButton.setAttribute(
            'aria-label',
            enabled ? 'Auto-advance on. Click to disable.' : 'Auto-advance off. Click to enable.'
        );
        toggleButton.title = enabled ? 'Auto-advance on (click to disable)' : 'Auto-advance off (click to enable)';
        toggleLabel.textContent = enabled ? 'Auto' : 'Off';
    }

    function attachToHost() {
        if (!toggleButton) {
            return;
        }

        const host = resolveDockHost();
        if (host) {
            toggleButton.classList.add('is-docked');
            const counterLabel = host.querySelector(`#${counterLabelId}`);
            if (counterLabel instanceof HTMLElement && counterLabel.parentElement === host) {
                if (counterLabel.nextSibling !== toggleButton || toggleButton.parentElement !== host) {
                    host.insertBefore(toggleButton, counterLabel.nextSibling);
                }
            } else if (toggleButton.parentElement !== host || lastHost !== host) {
                host.insertBefore(toggleButton, host.firstChild);
            }
            lastHost = host;
            return;
        }

        toggleButton.classList.remove('is-docked');
        if (toggleButton.parentElement) {
            toggleButton.remove();
        }
        lastHost = null;
    }

    function unmount() {
        if (clickCleanup) {
            clickCleanup();
            clickCleanup = null;
        }

        if (toggleButton) {
            toggleButton.remove();
        }

        toggleButton = null;
        toggleLabel = null;
        lastHost = null;
    }

    function mount() {
        const existing = document.getElementById(labelId);
        if (existing) {
            existing.remove();
        }

        toggleButton = document.createElement('button');
        toggleButton.id = labelId;
        toggleButton.type = 'button';
        toggleButton.className = 'yt-commander-shorts-auto-toggle';
        toggleButton.innerHTML = [
            '<span class="yt-commander-shorts-auto-toggle__icon" aria-hidden="true">',
            '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">',
            '<path d="M6 6h7a5 5 0 0 1 0 10H8.7l1.8 1.8-1.4 1.4L4.9 15l4.2-4.2 1.4 1.4L8.7 14H13a3 3 0 0 0 0-6H6V6z"></path>',
            '</svg>',
            '</span>',
            '<span class="yt-commander-shorts-auto-toggle__label">Auto</span>'
        ].join('');

        toggleLabel = toggleButton.querySelector('.yt-commander-shorts-auto-toggle__label');

        if (clickCleanup) {
            clickCleanup();
            clickCleanup = null;
        }

        clickCleanup = addEventListenerWithCleanup(toggleButton, 'click', () => {
            onToggle(!enabled);
        });

        applyEnabledState();
        attachToHost();
    }

    function setEnabled(nextValue) {
        const normalized = Boolean(nextValue);
        if (enabled === normalized) {
            return;
        }

        enabled = normalized;
        applyEnabledState();
    }

    return {
        mount,
        unmount,
        setEnabled,
        isMounted: () => Boolean(toggleButton),
        syncHost: attachToHost
    };
}

export {
    createShortsCounterUi,
    createShortsAutoAdvanceToggleUi
};
