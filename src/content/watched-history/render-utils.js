/**
 * Watched History render utilities.
 */

import { createLogger } from '../utils/logger.js';
import {
    FEED_RENDERER_SELECTOR,
    HIDDEN_CLASS,
    MARKER_CLASS,
    MAX_PENDING_NODES,
    RENDER_DEBOUNCE_MS,
    VIDEO_LINK_SELECTOR,
    WATCHED_ATTR,
} from './constants.js';
import { extractVideoId, isValidVideoId } from './videoId.js';

const logger = createLogger('WatchedHistory');

let isEnabled = true;
let watchedIds = new Set();
let deleteVideosEnabled = false;
let fullScanRequested = false;
let flushing = false;
let flushAgain = false;
let pendingContainers = new Set();
let renderTimer = null;
let lastUrl = location.href;

export function setWatchedIds(ids) {
    watchedIds = ids;
}

export function setDeleteVideosEnabled(enabled) {
    deleteVideosEnabled = enabled;
}

export function setIsEnabled(enabled) {
    isEnabled = enabled;
}

export function getPendingContainers() {
    return pendingContainers;
}

export function setFullScanRequested(requested) {
    fullScanRequested = requested;
}

function nextAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function findThumbnailAnchor(container, fallbackLink) {
    const ytThumb = container.querySelector(
        'ytd-thumbnail, ytd-playlist-thumbnail, yt-thumbnail-view-model'
    );
    if (ytThumb) {
        return ytThumb;
    }
    const direct = container.querySelector('a#thumbnail');
    if (direct) {
        return direct;
    }
    const richThumb = container.querySelector('#thumbnail');
    if (richThumb) {
        return richThumb;
    }
    return fallbackLink || null;
}

export function decorateContainer(container) {
    if (!container || !container.isConnected) {
        return;
    }

    const link = container.querySelector(VIDEO_LINK_SELECTOR);
    if (!link || !link.href) {
        return;
    }

    const videoId = extractVideoId(link.href);
    if (!isValidVideoId(videoId)) {
        return;
    }

    const isWatched = watchedIds.has(videoId);

    if (isWatched && deleteVideosEnabled) {
        container.classList.add(HIDDEN_CLASS);
    } else {
        container.classList.remove(HIDDEN_CLASS);
    }

    const thumbnail = findThumbnailAnchor(container, link);
    if (!thumbnail) {
        return;
    }

    if (isWatched && !deleteVideosEnabled) {
        thumbnail.setAttribute(WATCHED_ATTR, 'true');

        if (!thumbnail.querySelector(`.${MARKER_CLASS}`)) {
            const marker = document.createElement('div');
            marker.className = MARKER_CLASS;
            thumbnail.appendChild(marker);
        }
    } else {
        thumbnail.removeAttribute(WATCHED_ATTR);
        const marker = thumbnail.querySelector(`.${MARKER_CLASS}`);
        if (marker) {
            marker.remove();
        }
    }
}

function collectCandidateContainers(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }

    const element = node;
    let found = false;

    if (element.matches(FEED_RENDERER_SELECTOR)) {
        pendingContainers.add(element);
        found = true;
    }

    if (typeof element.querySelectorAll === 'function') {
        const matches = element.querySelectorAll(FEED_RENDERER_SELECTOR);
        if (matches.length > 0) {
            found = true;
            for (const match of matches) {
                pendingContainers.add(match);
            }
        }
    }

    if (pendingContainers.size > MAX_PENDING_NODES) {
        pendingContainers.clear();
        fullScanRequested = true;
        found = true;
    }

    return found;
}

function flushRenderQueue() {
    if (!isEnabled) {
        return Promise.resolve();
    }

    if (flushing) {
        flushAgain = true;
        return Promise.resolve();
    }

    flushing = true;

    try {
        const toProcess = new Set();

        if (fullScanRequested) {
            fullScanRequested = false;
            const allContainers = document.querySelectorAll(FEED_RENDERER_SELECTOR);
            for (const container of allContainers) {
                toProcess.add(container);
            }
        }

        if (pendingContainers.size > 0) {
            for (const container of pendingContainers) {
                toProcess.add(container);
            }
            pendingContainers.clear();
        }

        if (toProcess.size === 0) {
            flushing = false;
            return Promise.resolve();
        }

        const batch = Array.from(toProcess);
        const chunkSize = 120;

        const processBatch = async () => {
            for (let i = 0; i < batch.length; i += chunkSize) {
                const slice = batch.slice(i, i + chunkSize);
                for (const container of slice) {
                    decorateContainer(container);
                }
                await nextAnimationFrame();
            }
        };

        return processBatch().finally(() => {
            flushing = false;
            if (flushAgain) {
                flushAgain = false;
                scheduleRender('flush-again');
            }
        });
    } catch (error) {
        flushing = false;
        throw error;
    }
}

export function scheduleRender(reason, forceFullScan = false, setFullScan) {
    if (!isEnabled) {
        return;
    }

    if (forceFullScan) {
        fullScanRequested = true;
        if (setFullScan) setFullScan(true);
    }

    if (renderTimer) {
        return;
    }

    renderTimer = setTimeout(() => {
        renderTimer = null;
        flushRenderQueue().catch((error) => {
            logger.error(`Render flush failed (${reason})`, error);
        });
    }, RENDER_DEBOUNCE_MS);
}

export function startMutationObserver() {
    if (!document.body) {
        return null;
    }

    const observer = new MutationObserver((mutations) => {
        if (!isEnabled) {
            return;
        }

        if (location.href !== lastUrl) {
            lastUrl = location.href;
            fullScanRequested = true;
        }

        let foundCandidate = false;

        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
                continue;
            }

            for (const node of mutation.addedNodes) {
                foundCandidate = collectCandidateContainers(node) || foundCandidate;
            }
        }

        if (foundCandidate || fullScanRequested) {
            scheduleRender('mutation');
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    return observer;
}

export function handleNavigation(onNavigate) {
    if (location.href === lastUrl) {
        return;
    }

    lastUrl = location.href;
    if (onNavigate) onNavigate();
}
