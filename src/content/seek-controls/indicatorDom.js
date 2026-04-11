/**
 * Seek indicator DOM helpers.
 * Uses YouTube's native seek overlay when present, and falls back to an exact
 * structural clone with matching motion curves/timing.
 */

const LINGER_DURATION_MS = 1000;
const FADE_DURATION_MS = 200;
const ARROW_TRAVEL_DURATION_MS = 400;
const ARROW_MORPH_DURATION_MS = 333;
const DURATION_BUMP_DURATION_MS = 184;
const DURATION_BUMP_SCALE = 0.9;

const FADE_EASING = 'cubic-bezier(0.20, 0.00, 0.60, 1.00)';
const ARROW_EASING = 'cubic-bezier(0.05, 0.00, 0.00, 1.00)';
const MINUS_SIGN = '\u2212';

const overlayRuntime = {
    overlay: null,
    backwardAnimation: null,
    forwardAnimation: null,
    activeAnimation: null,
    directionSign: 0,
    totalSeconds: 0,
    state: 'hidden',
    activeFadeAnimation: null,
    lingerTimer: null,
    forcedContainerVisible: false,
    previousContainerDisplay: '',
    hadContainerHiddenAttribute: false
};

/**
 * Normalize direction string to native sign.
 * @param {'forward'|'backward'} direction
 * @returns {1|-1|null}
 */
function normalizeDirection(direction) {
    if (direction === 'forward') {
        return 1;
    }
    if (direction === 'backward') {
        return -1;
    }
    return null;
}

/**
 * Resolve active player root.
 * @returns {HTMLElement|null}
 */
function getPlayerRoot() {
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer instanceof HTMLElement) {
        return moviePlayer;
    }
    const html5Player = document.querySelector('.html5-video-player');
    return html5Player instanceof HTMLElement ? html5Player : null;
}

/**
 * Create one seek arrow block.
 * @param {-1|1} directionSign
 * @returns {HTMLDivElement}
 */
function createPersistentArrow(directionSign) {
    const arrow = document.createElement('div');
    arrow.className = 'ytp-seek-overlay-arrow ytp-seek-overlay-arrow-persistent';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 22 32');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', directionSign === -1 ? 'M 18 4 L 6 16 L 18 28' : 'M 4 4 L 16 16 L 4 28');
    path.setAttribute('stroke', 'white');
    path.setAttribute('stroke-width', '4');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('fill', 'none');

    svg.appendChild(path);
    arrow.appendChild(svg);

    return arrow;
}

/**
 * Create fallback seek animation block.
 * @param {-1|1} directionSign
 * @returns {HTMLDivElement}
 */
function createAnimationBlock(directionSign) {
    const block = document.createElement('div');
    block.className = `ytp-seek-overlay-animation ${
        directionSign === -1 ? 'ytp-seek-overlay-animation-back' : 'ytp-seek-overlay-animation-forward'
    }`;

    const duration = document.createElement('div');
    duration.className = 'ytp-seek-overlay-duration';
    duration.textContent = '';

    const arrow = createPersistentArrow(directionSign);

    if (directionSign === -1) {
        block.appendChild(arrow);
        block.appendChild(duration);
    } else {
        block.appendChild(duration);
        block.appendChild(arrow);
    }

    return block;
}

/**
 * Build an exact structural clone of the native seek overlay.
 * @returns {HTMLDivElement}
 */
function createFallbackOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'ytp-seek-overlay';
    overlay.dataset.ytcSeekOverlay = 'fallback';

    const back = createAnimationBlock(-1);
    const forward = createAnimationBlock(1);

    const message = document.createElement('div');
    message.className = 'ytp-seek-overlay-message';

    const messageIcon = document.createElement('div');
    messageIcon.className = 'ytp-seek-overlay-message-icon';
    const messageText = document.createElement('div');
    messageText.className = 'ytp-seek-overlay-message-text';

    message.appendChild(messageIcon);
    message.appendChild(messageText);

    overlay.appendChild(back);
    overlay.appendChild(forward);
    overlay.appendChild(message);

    return overlay;
}

/**
 * Validate whether overlay contains required native parts.
 * @param {Element|null} overlay
 * @returns {boolean}
 */
function isUsableOverlay(overlay) {
    if (!(overlay instanceof HTMLElement)) {
        return false;
    }

    const back = overlay.querySelector('.ytp-seek-overlay-animation-back');
    const forward = overlay.querySelector('.ytp-seek-overlay-animation-forward');

    if (!(back instanceof HTMLElement) || !(forward instanceof HTMLElement)) {
        return false;
    }

    const backDuration = back.querySelector('.ytp-seek-overlay-duration');
    const forwardDuration = forward.querySelector('.ytp-seek-overlay-duration');
    const backArrow = back.querySelector('.ytp-seek-overlay-arrow-persistent path');
    const forwardArrow = forward.querySelector('.ytp-seek-overlay-arrow-persistent path');

    return Boolean(backDuration && forwardDuration && backArrow && forwardArrow);
}

/**
 * Ensure overlay and directional animation elements exist.
 * @returns {boolean}
 */
function ensureOverlayReferences() {
    const playerRoot = getPlayerRoot();
    if (!playerRoot) {
        return false;
    }

    let overlay = overlayRuntime.overlay;

    if (!(overlay instanceof HTMLElement) || !overlay.isConnected || !playerRoot.contains(overlay)) {
        const candidate = playerRoot.querySelector('.ytp-seek-overlay');
        overlay = isUsableOverlay(candidate) ? candidate : null;
    }

    if (!overlay) {
        overlay = createFallbackOverlay();
        playerRoot.appendChild(overlay);
    }

    const back = overlay.querySelector('.ytp-seek-overlay-animation-back');
    const forward = overlay.querySelector('.ytp-seek-overlay-animation-forward');

    if (!(back instanceof HTMLElement) || !(forward instanceof HTMLElement)) {
        return false;
    }

    overlayRuntime.overlay = overlay;
    overlayRuntime.backwardAnimation = back;
    overlayRuntime.forwardAnimation = forward;

    return true;
}

/**
 * Clear the tracked linger timer.
 */
function clearLingerTimer() {
    if (overlayRuntime.lingerTimer) {
        clearTimeout(overlayRuntime.lingerTimer);
        overlayRuntime.lingerTimer = null;
    }
}

/**
 * Cancel currently tracked fade animation.
 */
function cancelTrackedFade() {
    if (overlayRuntime.activeFadeAnimation) {
        try {
            overlayRuntime.activeFadeAnimation.cancel();
        } catch (_error) {
            // no-op
        }
        overlayRuntime.activeFadeAnimation = null;
    }
}

/**
 * Read current opacity of an animation element.
 * @param {HTMLElement|null} animationElement
 * @returns {number}
 */
function getOpacity(animationElement) {
    if (!(animationElement instanceof HTMLElement)) {
        return 1;
    }
    const opacity = Number.parseFloat(getComputedStyle(animationElement).opacity);
    return Number.isFinite(opacity) ? opacity : 1;
}

/**
 * Start/refresh linger timer.
 */
function startLingerTimer() {
    clearLingerTimer();
    overlayRuntime.lingerTimer = setTimeout(() => {
        fadeOutActiveOverlay(undefined, true);
    }, LINGER_DURATION_MS);
}

/**
 * Reset runtime state counters and active pointers.
 */
function resetRuntimeState() {
    clearLingerTimer();
    cancelTrackedFade();

    overlayRuntime.activeAnimation = null;
    overlayRuntime.directionSign = 0;
    overlayRuntime.totalSeconds = 0;
    overlayRuntime.state = 'hidden';
    restoreOverlayContainerVisibility();
}

/**
 * Force container visibility when native overlay is hidden by player internals.
 */
function ensureOverlayContainerVisible() {
    const overlay = overlayRuntime.overlay;
    if (!(overlay instanceof HTMLElement)) {
        return;
    }

    const isFallbackOverlay = overlay.dataset?.ytcSeekOverlay === 'fallback';
    if (isFallbackOverlay) {
        overlay.style.removeProperty('display');
        overlay.removeAttribute('hidden');
        return;
    }

    if (!overlayRuntime.forcedContainerVisible) {
        overlayRuntime.previousContainerDisplay = overlay.style.display;
        overlayRuntime.hadContainerHiddenAttribute = overlay.hasAttribute('hidden');
    }

    overlay.style.display = 'flex';
    overlay.removeAttribute('hidden');
    overlayRuntime.forcedContainerVisible = true;
}

/**
 * Restore container visibility fields after overlay lifecycle ends.
 */
function restoreOverlayContainerVisibility() {
    if (!overlayRuntime.forcedContainerVisible) {
        return;
    }

    const overlay = overlayRuntime.overlay;
    if (overlay instanceof HTMLElement) {
        if (overlayRuntime.previousContainerDisplay) {
            overlay.style.display = overlayRuntime.previousContainerDisplay;
        } else {
            overlay.style.removeProperty('display');
        }

        if (overlayRuntime.hadContainerHiddenAttribute) {
            overlay.setAttribute('hidden', '');
        } else {
            overlay.removeAttribute('hidden');
        }
    }

    overlayRuntime.forcedContainerVisible = false;
    overlayRuntime.previousContainerDisplay = '';
    overlayRuntime.hadContainerHiddenAttribute = false;
}

/**
 * Format accumulated seek label.
 * @param {-1|1} directionSign
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDurationLabel(directionSign, totalSeconds) {
    const sign = directionSign === -1 ? MINUS_SIGN : '+';
    return `${sign} ${totalSeconds}`;
}

/**
 * Update current duration text.
 * @param {HTMLElement|null} animationElement
 * @param {string} label
 */
function setDurationLabel(animationElement, label) {
    if (!(animationElement instanceof HTMLElement)) {
        return;
    }
    const duration = animationElement.querySelector('.ytp-seek-overlay-duration');
    if (duration instanceof HTMLElement) {
        duration.textContent = label;
    }
}

/**
 * Add the extra burst arrow used for repeated seeks.
 * @param {HTMLElement} animationElement
 * @param {-1|1} directionSign
 */
function addAdditionalArrow(animationElement, directionSign) {
    const persistent = animationElement.querySelector('.ytp-seek-overlay-arrow-persistent');
    if (!(persistent instanceof HTMLElement)) {
        return;
    }

    const additionalArrow = persistent.cloneNode(true);
    if (!(additionalArrow instanceof HTMLElement)) {
        return;
    }

    additionalArrow.classList.add('ytp-seek-overlay-arrow-additional');
    additionalArrow.classList.remove('ytp-seek-overlay-arrow-persistent');
    additionalArrow.style.position = 'absolute';
    additionalArrow.style.top = '50%';
    additionalArrow.style.transform = 'translateY(-50%)';
    additionalArrow.style.left = directionSign === -1 ? '0' : '';
    additionalArrow.style.right = directionSign === 1 ? '0' : '';

    animationElement.appendChild(additionalArrow);
    const travelAnimation = animateArrow(additionalArrow, directionSign, true, true);
    if (travelAnimation) {
        travelAnimation.addEventListener('finish', () => {
            additionalArrow.remove();
        });
    } else {
        additionalArrow.remove();
    }
}

/**
 * Animate one arrow (travel + path morph) like native YouTube.
 * @param {HTMLElement} arrowElement
 * @param {-1|1} directionSign
 * @param {boolean} startHidden
 * @param {boolean} fadePathShadow
 * @returns {Animation|null}
 */
function animateArrow(arrowElement, directionSign, startHidden = false, fadePathShadow = false) {
    if (!(arrowElement instanceof HTMLElement)) {
        return null;
    }

    let travelAnimation = null;

    try {
        const travelFrames = [
            {
                offset: 0,
                transform: `translateX(${directionSign === -1 ? 20 : -20}px)`,
                opacity: startHidden ? '0' : '1'
            }
        ];

        if (startHidden) {
            travelFrames.push({ offset: 0.5, opacity: '1' });
        }

        travelFrames.push({ offset: 1, transform: 'translateX(0)', opacity: '1' });

        travelAnimation = arrowElement.animate(travelFrames, {
            duration: ARROW_TRAVEL_DURATION_MS,
            easing: ARROW_EASING
        });
    } catch (_error) {
        // no-op
    }

    const pathElement = arrowElement.querySelector('path');
    if (pathElement instanceof SVGPathElement) {
        try {
            const morphFrames = [];
            const startPath = directionSign === -1
                ? 'path("M 18 4 L 18 16 L 18 28")'
                : 'path("M 4 4 L 4 16 L 4 28")';
            const endPath = directionSign === -1
                ? 'path("M 18 4 L 6 16 L 18 28")'
                : 'path("M 4 4 L 16 16 L 4 28")';

            const startFrame = { offset: 0, d: startPath };
            if (fadePathShadow) {
                startFrame.filter = 'drop-shadow(0 0 0.5px rgba(0, 0, 0, 0.8))';
            }
            morphFrames.push(startFrame);

            if (fadePathShadow) {
                morphFrames.push({
                    offset: 0.8,
                    filter: 'drop-shadow(0 0 0.5px rgba(0, 0, 0, 0.8))'
                });
            }

            const endFrame = { offset: 1, d: endPath };
            if (fadePathShadow) {
                endFrame.filter = 'drop-shadow(0 0 0.5px rgba(0, 0, 0, 0))';
            }
            morphFrames.push(endFrame);

            pathElement.animate(morphFrames, {
                duration: ARROW_MORPH_DURATION_MS,
                easing: ARROW_EASING,
                fill: 'forwards'
            });
        } catch (_error) {
            // no-op
        }
    }

    return travelAnimation;
}

/**
 * Fade active side in.
 * @param {HTMLElement} animationElement
 * @param {number} fromOpacity
 */
function fadeInActiveOverlay(animationElement, fromOpacity) {
    cancelTrackedFade();

    try {
        const animation = animationElement.animate(
            [
                { offset: 0, easing: FADE_EASING, opacity: fromOpacity },
                { offset: 1, opacity: 1 }
            ],
            {
                duration: FADE_DURATION_MS,
                fill: 'forwards'
            }
        );

        overlayRuntime.activeFadeAnimation = animation;
        animation.addEventListener('finish', () => {
            if (overlayRuntime.activeFadeAnimation !== animation) {
                return;
            }
            overlayRuntime.activeFadeAnimation = null;
            overlayRuntime.state = 'lingering';
            startLingerTimer();
        });
    } catch (_error) {
        overlayRuntime.state = 'lingering';
        startLingerTimer();
    }
}

/**
 * Fade active side out.
 * @param {number|undefined} fromOpacity
 * @param {boolean} cleanupAfterFinish
 */
function fadeOutActiveOverlay(fromOpacity, cleanupAfterFinish) {
    const animationElement = overlayRuntime.activeAnimation;
    if (!(animationElement instanceof HTMLElement)) {
        if (cleanupAfterFinish) {
            resetRuntimeState();
        }
        return;
    }

    cancelTrackedFade();
    clearLingerTimer();

    const safeOpacity = Number.isFinite(fromOpacity) ? fromOpacity : getOpacity(animationElement);

    try {
        const animation = animationElement.animate(
            [
                { offset: 0, opacity: safeOpacity },
                { offset: 1, opacity: 0 }
            ],
            {
                duration: FADE_DURATION_MS,
                fill: 'forwards',
                easing: FADE_EASING
            }
        );

        if (!cleanupAfterFinish) {
            return;
        }

        overlayRuntime.state = 'fading-out';
        overlayRuntime.activeFadeAnimation = animation;
        animation.addEventListener('finish', () => {
            if (overlayRuntime.activeFadeAnimation !== animation) {
                return;
            }
            overlayRuntime.activeFadeAnimation = null;
            resetRuntimeState();
        });
    } catch (_error) {
        if (cleanupAfterFinish) {
            resetRuntimeState();
        }
    }
}

/**
 * Apply the short text scale bump for repeated seeks.
 * @param {HTMLElement} animationElement
 */
function animateDurationBump(animationElement) {
    const durationElement = animationElement.querySelector('.ytp-seek-overlay-duration');
    if (!(durationElement instanceof HTMLElement)) {
        return;
    }

    try {
        durationElement.animate(
            [
                { offset: 0, easing: FADE_EASING, transform: 'scale(1)' },
                {
                    offset: 0.64,
                    easing: FADE_EASING,
                    transform: `scale(${DURATION_BUMP_SCALE})`
                },
                { offset: 1, transform: 'scale(1)' }
            ],
            { duration: DURATION_BUMP_DURATION_MS }
        );
    } catch (_error) {
        // no-op
    }
}

/**
 * Trigger native-like seek overlay with custom seconds accumulation.
 * @param {number} seconds
 * @param {'forward'|'backward'} direction
 * @param {number} currentTime
 */
export function triggerNativeSeekOverlay(seconds, direction, currentTime = 0) {
    const directionSign = normalizeDirection(direction);
    if (!directionSign) {
        return;
    }

    const stepSeconds = Math.max(0, Number.parseInt(seconds, 10) || 0);
    if (stepSeconds <= 0) {
        return;
    }

    if (!ensureOverlayReferences()) {
        return;
    }

    ensureOverlayContainerVisible();

    if (overlayRuntime.directionSign && directionSign !== overlayRuntime.directionSign) {
        const startOpacity = getOpacity(overlayRuntime.activeAnimation);
        fadeOutActiveOverlay(startOpacity, false);
        resetRuntimeState();
    }

    overlayRuntime.directionSign = directionSign;
    overlayRuntime.activeAnimation = directionSign === -1
        ? overlayRuntime.backwardAnimation
        : overlayRuntime.forwardAnimation;

    if (!(overlayRuntime.activeAnimation instanceof HTMLElement)) {
        return;
    }

    if (directionSign === -1 && Number.isFinite(currentTime) && currentTime <= stepSeconds) {
        overlayRuntime.totalSeconds = stepSeconds;
    } else {
        overlayRuntime.totalSeconds += stepSeconds;
    }

    setDurationLabel(
        overlayRuntime.activeAnimation,
        formatDurationLabel(directionSign, overlayRuntime.totalSeconds)
    );

    const previousState = overlayRuntime.state;

    if (previousState === 'hidden' || previousState === 'fading-out') {
        let fadeStartOpacity = 0;

        if (previousState === 'fading-out') {
            fadeStartOpacity = getOpacity(overlayRuntime.activeAnimation);
            cancelTrackedFade();
            addAdditionalArrow(overlayRuntime.activeAnimation, directionSign);
        } else {
            const persistentArrow = overlayRuntime.activeAnimation.querySelector('.ytp-seek-overlay-arrow-persistent');
            if (persistentArrow instanceof HTMLElement) {
                animateArrow(persistentArrow, directionSign);
            }
        }

        overlayRuntime.state = 'fading-in';
        fadeInActiveOverlay(overlayRuntime.activeAnimation, fadeStartOpacity);
        return;
    }

    if (previousState === 'fading-in' || previousState === 'lingering') {
        animateDurationBump(overlayRuntime.activeAnimation);
        addAdditionalArrow(overlayRuntime.activeAnimation, directionSign);

        if (previousState === 'lingering') {
            startLingerTimer();
        }
    }
}

/**
 * Reset seek overlay and accumulated state immediately.
 */
export function clearNativeSeekOverlay() {
    if (ensureOverlayReferences()) {
        const isFallbackOverlay = overlayRuntime.overlay?.dataset?.ytcSeekOverlay === 'fallback';
        const animations = [overlayRuntime.backwardAnimation, overlayRuntime.forwardAnimation];

        animations.forEach((animationElement) => {
            if (!(animationElement instanceof HTMLElement)) {
                return;
            }

            const duration = animationElement.querySelector('.ytp-seek-overlay-duration');
            if (duration instanceof HTMLElement) {
                duration.textContent = '';
            }

            animationElement.querySelectorAll('.ytp-seek-overlay-arrow-additional').forEach((node) => {
                node.remove();
            });

            try {
                animationElement.getAnimations().forEach((animation) => animation.cancel());
            } catch (_error) {
                // no-op
            }

            if (isFallbackOverlay) {
                animationElement.style.opacity = '0';
            }
        });
    }

    resetRuntimeState();
}
