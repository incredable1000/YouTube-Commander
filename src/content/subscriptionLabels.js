// Subscription labels for Home/Feed (Isolated World)
import { createLogger } from './utils/logger.js';
import {
    LABEL_CLASS,
    HOST_CLASS,
    CARD_SELECTOR,
    HOME_BROWSE_SELECTOR,
    SHORTS_CHANNEL_CACHE_KEY,
    CONTINUATION_RETRY_DELAY_MS,
} from './subscription-labels/constants.js';
import { isCardElement } from './subscription-labels/utils.js';
import { setDebugState, setDebugAttribute, setDebugMeta } from './subscription-labels/debug.js';
import { parseJsonSafe } from './subscription-labels/html-parse.js';
import { normalizeChannelPath } from './subscription-labels/channel-utils.js';
import {
    loadShortsChannelCache,
    saveShortsChannelCache,
    getShortsChannelCache,
} from './subscription-labels/shorts-cache.js';
import {
    enqueueShortsLookup,
    processShortsLookupQueue,
    setDecorateCardFn,
} from './subscription-labels/shorts-lookup.js';
import { fetchSubscribedChannels } from './subscription-labels/subscription-fetch.js';
import {
    loadSubscriptionCache,
    saveSubscriptionCache,
    resetSubscriptionCache,
    getSubscribedChannelIds,
    getSubscribedChannelPaths,
    setSubscribedChannelIds,
    setSubscribedChannelPaths,
    isDataReady,
    setDataReady,
    isDataInitialized,
    setDataInitialized,
    setContinuationRetryScheduled,
    isContinuationRetryScheduled,
} from './subscription-labels/subscription-cache.js';
import { injectStyles } from './subscription-labels/styles.js';
import {
    isHomeCard,
    clearLabelsFromCard,
    decorateCard,
    clearAllLabels,
    getHomeBrowseRoot,
} from './subscription-labels/card-utils.js';

const logger = createLogger('SubscriptionLabels');

let isHovering = false;
let hoverResumeTimer = null;
let mutationObserver = null;
let renderScheduled = false;
let pendingCards = new Set();
let renderedCount = 0;
let homeBootstrapped = false;
let scanIntervalId = null;

function onHoverStart() {
    if (isHovering) return;
    isHovering = true;
    if (hoverResumeTimer) {
        clearTimeout(hoverResumeTimer);
        hoverResumeTimer = null;
    }
}

function onHoverEnd() {
    if (hoverResumeTimer) return;
    hoverResumeTimer = setTimeout(() => {
        isHovering = false;
        hoverResumeTimer = null;
    }, 600);
}

function isEligiblePage() {
    return Boolean(getHomeBrowseRoot());
}

function scheduleRender() {
    if (renderScheduled) {
        return;
    }
    renderScheduled = true;

    window.requestAnimationFrame(() => {
        renderScheduled = false;
        if (!isEligiblePage()) {
            clearAllLabels();
            pendingCards.clear();
            return;
        }
        const cards = Array.from(pendingCards);
        pendingCards.clear();
        cards.forEach((card) => {
            decorateCard(
                card,
                isDataInitialized(),
                getSubscribedChannelIds(),
                getSubscribedChannelPaths(),
                getShortsChannelCache(),
                (videoId, cardEl) => {
                    enqueueShortsLookup(videoId, cardEl, getShortsChannelCache(), new Map());
                    processShortsLookupQueue(
                        getShortsChannelCache(),
                        saveShortsChannelCache,
                        logger
                    );
                },
                isHovering
            );
        });
    });
}

function queueCards(cards) {
    for (const card of cards) {
        if (!card) {
            continue;
        }
        pendingCards.add(card);
    }
    scheduleRender();
}

function scanVisibleCards() {
    const homeRoot = getHomeBrowseRoot();
    if (!homeRoot) {
        clearAllLabels();
        return;
    }
    if (!homeBootstrapped) {
        homeBootstrapped = true;
        ensureSubscriptionIndex()
            .then(() => {
                setDebugState('dataReady', isDataReady());
                setDebugState('subscriptionCounts', {
                    ids: getSubscribedChannelIds().size,
                    paths: getSubscribedChannelPaths().size,
                });
                setDebugMeta(
                    'data-counts',
                    `ids:${getSubscribedChannelIds().size};paths:${getSubscribedChannelPaths().size}`
                );
                scanVisibleCards();
            })
            .catch((error) => {
                logger.warn('Failed to load subscribed channels', error);
            });
    }

    const cards = homeRoot.querySelectorAll(CARD_SELECTOR);
    if (cards.length > 0) {
        try {
            document.documentElement.setAttribute(
                'data-yt-commander-subs-cards',
                String(cards.length)
            );
        } catch (_error) {
            // Ignore DOM errors.
        }
        queueCards(cards);
    }
}

async function ensureSubscriptionIndex() {
    const cacheState = loadSubscriptionCache(
        setSubscribedChannelIds,
        setSubscribedChannelPaths,
        setDataReady
    );
    const hasContinuations =
        Array.isArray(cacheState.continuations) && cacheState.continuations.length > 0;
    if (
        cacheState.fresh &&
        cacheState.complete &&
        cacheState.source === 'browse' &&
        !hasContinuations
    ) {
        setDataInitialized(true);
        setDebugMeta('data-ready', isDataReady());
        scanVisibleCards();
        return;
    }

    try {
        const seed = cacheState.hasData
            ? {
                  channelIds: getSubscribedChannelIds(),
                  channelPaths: getSubscribedChannelPaths(),
                  continuations: cacheState.continuations,
              }
            : null;
        const result = await fetchSubscribedChannels(seed, setDebugState, setDebugMeta, logger);
        setSubscribedChannelIds(result.channelIds);
        setSubscribedChannelPaths(result.channelPaths);
        setDataReady(result.channelIds.size > 0 || result.channelPaths.size > 0);
        saveSubscriptionCache(
            result.channelIds,
            result.channelPaths,
            result.continuations || [],
            result.complete === true,
            result.source || null
        );
        setDataInitialized(true);
        setDebugMeta('data-ready', isDataReady());
        setDebugMeta(
            'data-counts',
            `ids:${result.channelIds.size};paths:${result.channelPaths.size};remaining:${(result.continuations || []).length}`
        );
        logger.info('Subscribed channels loaded', {
            ids: result.channelIds.size,
            paths: result.channelPaths.size,
        });
        scanVisibleCards();

        if (!isContinuationRetryScheduled() && (result.continuations || []).length > 0) {
            setContinuationRetryScheduled(true);
            window.setTimeout(() => {
                setContinuationRetryScheduled(false);
                ensureSubscriptionIndex().catch((error) => {
                    logger.debug('Continuation retry failed', error);
                });
            }, CONTINUATION_RETRY_DELAY_MS);
        }
    } catch (error) {
        if (cacheState.hasData) {
            logger.warn('Using stale subscribed channel cache', error);
        } else {
            logger.warn('Failed to load subscribed channels', error);
        }
        setDataInitialized(true);
        setDebugMeta('data-ready', isDataReady());
        scanVisibleCards();
    }
}

function startObserver() {
    if (mutationObserver) {
        return;
    }

    mutationObserver = new MutationObserver((mutations) => {
        if (!isEligiblePage()) {
            clearAllLabels();
            return;
        }
        const found = [];
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) {
                    return;
                }
                if (node.matches && node.matches(CARD_SELECTOR)) {
                    found.push(node);
                } else {
                    node.querySelectorAll?.(CARD_SELECTOR).forEach((card) => found.push(card));
                }
            });
        }
        if (found.length > 0) {
            queueCards(found);
        }
    });

    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function startScanLoop() {
    if (scanIntervalId) {
        return;
    }
    scanIntervalId = window.setInterval(() => {
        scanVisibleCards();
    }, 1000);
}

async function init() {
    injectStyles();
    loadShortsChannelCache();
    setDataInitialized(true);
    setDebugState('initializedAt', Date.now());
    setDebugAttribute('initialized');

    setDecorateCardFn((card) => {
        decorateCard(
            card,
            isDataInitialized(),
            getSubscribedChannelIds(),
            getSubscribedChannelPaths(),
            getShortsChannelCache(),
            (videoId, cardEl) => {
                enqueueShortsLookup(videoId, cardEl, getShortsChannelCache(), new Map());
                processShortsLookupQueue(getShortsChannelCache(), saveShortsChannelCache, logger);
            },
            isHovering
        );
    });

    startObserver();
    startScanLoop();
    scanVisibleCards();
    window.addEventListener('yt-navigate-finish', scanVisibleCards);
    document.addEventListener('yt-navigate-finish', scanVisibleCards);
    window.addEventListener('yt-page-data-updated', scanVisibleCards);
    document.addEventListener('yt-page-data-updated', scanVisibleCards);

    let lastHoverCheck = 0;
    document.addEventListener(
        'mousemove',
        (e) => {
            const now = Date.now();
            if (now - lastHoverCheck < 100) return;
            lastHoverCheck = now;

            if (isCardElement(e.target)) {
                onHoverStart();
            } else {
                onHoverEnd();
            }
        },
        { passive: true }
    );

    document.addEventListener('mouseleave', onHoverEnd);
}

export async function initSubscriptionLabels() {
    try {
        await init();
    } catch (error) {
        setDebugAttribute('init-error');
        logger.error('Failed to initialize subscription labels', error);
    }
}

window.addEventListener('message', (event) => {
    if (!event || event.source !== window) {
        return;
    }
    if (event.data?.type === 'YT_COMMANDER_SUBS_RESET') {
        resetSubscriptionCache();
        try {
            window.localStorage.removeItem(SHORTS_CHANNEL_CACHE_KEY);
        } catch (_error) {
            // Ignore
        }
        ensureSubscriptionIndex().catch((error) => {
            logger.debug('Reset refresh failed', error);
        });
    }
});
