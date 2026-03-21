/**
 * DOM and URL helpers for Shorts upload-age labels.
 */

import {
    FEED_RENDERER_SELECTOR,
    SHORT_LINK_SELECTOR,
    VIDEO_ID_PATTERN
} from './constants.js';

const INLINE_HOST_SELECTORS = [
    '#metadata-line',
    'ytd-video-meta-block #metadata-line',
    'ytd-rich-grid-media #metadata-line',
    'yt-content-metadata-view-model #metadata-line',
    'yt-lockup-metadata-view-model #metadata-line',
    '.shortsLockupViewModelHostOutsideMetadataSubhead',
    '[class*="OutsideMetadataSubhead"]',
    '[class*="MetadataSubhead"]'
];

const BLOCK_HOST_SELECTORS = [
    '#metadata',
    '#video-info',
    'ytd-video-meta-block',
    'yt-content-metadata-view-model',
    'yt-lockup-metadata-view-model',
    '#details',
    '#meta',
    '#dismissible #details',
    '#text',
    '#content',
    '.shortsLockupViewModelHostOutsideMetadata',
    '[class*="OutsideMetadata"]'
];

const CONTAINER_FALLBACK_SELECTOR = [
    'ytd-rich-grid-media',
    'ytd-grid-video-renderer',
    'ytd-video-renderer',
    'ytd-rich-item-renderer',
    'ytd-reel-item-renderer',
    'ytd-shorts-lockup-view-model',
    'yt-lockup-view-model'
].join(', ');

const SHORTS_CONTAINER_HINT_SELECTOR = [
    'ytd-reel-item-renderer',
    'ytd-reel-shelf-renderer',
    'ytd-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytd-shorts'
].join(', ');

const THUMBNAIL_SELECTORS = [
    'a#thumbnail',
    '#thumbnail',
    'ytd-thumbnail',
    'yt-thumbnail-view-model',
    '#thumbnail-container',
    'img'
];

/**
 * Extract Shorts id from href.
 * @param {string} href
 * @returns {string|null}
 */
function extractShortIdFromHref(href) {
    if (!href || typeof href !== 'string') {
        return null;
    }

    try {
        const parsed = new URL(href, window.location.origin);
        const pathMatch = parsed.pathname.match(/\/shorts\/([^/?#]+)/);
        const shortId = pathMatch?.[1] || '';
        return VIDEO_ID_PATTERN.test(shortId) ? shortId : null;
    } catch (_error) {
        return null;
    }
}

/**
 * Determine whether a container likely represents a Shorts card.
 * @param {Element} container
 * @returns {boolean}
 */
function isLikelyShortsContainer(container) {
    if (!(container instanceof Element)) {
        return false;
    }

    const tagName = (container.tagName || '').toLowerCase();
    if (tagName.includes('reel') || tagName.includes('shorts')) {
        return true;
    }

    if (container.closest(SHORTS_CONTAINER_HINT_SELECTOR)) {
        return true;
    }

    return Boolean(container.querySelector(SHORT_LINK_SELECTOR));
}

/**
 * Read video ID from common container attributes.
 * @param {Element} container
 * @returns {string|null}
 */
function extractShortIdFromAttributes(container) {
    const candidates = [
        container.getAttribute('video-id'),
        container.getAttribute('data-video-id'),
        container.dataset?.videoId
    ];

    const nestedWithVideoId = container.querySelector('[video-id], [data-video-id]');
    if (nestedWithVideoId) {
        candidates.push(
            nestedWithVideoId.getAttribute('video-id'),
            nestedWithVideoId.getAttribute('data-video-id'),
            nestedWithVideoId.dataset?.videoId
        );
    }

    for (const candidate of candidates) {
        const id = typeof candidate === 'string' ? candidate.trim() : '';
        if (VIDEO_ID_PATTERN.test(id)) {
            return id;
        }
    }

    return null;
}

/**
 * Resolve Shorts id + best matching link from one container.
 * @param {Element} container
 * @returns {{shortId: string, shortLink: HTMLAnchorElement|null}|null}
 */
function resolveShortCardData(container) {
    if (!(container instanceof Element)) {
        return null;
    }

    const shortLink = container.querySelector(SHORT_LINK_SELECTOR);
    if (shortLink instanceof HTMLAnchorElement) {
        const byLink = extractShortIdFromHref(shortLink.getAttribute('href') || shortLink.href || '');
        if (byLink) {
            return { shortId: byLink, shortLink };
        }
    }

    if (!isLikelyShortsContainer(container)) {
        return null;
    }

    const byAttr = extractShortIdFromAttributes(container);
    if (byAttr) {
        return { shortId: byAttr, shortLink: shortLink instanceof HTMLAnchorElement ? shortLink : null };
    }

    const html = container.innerHTML || '';
    const htmlMatch = html.match(/\/shorts\/([A-Za-z0-9_-]{10,15})/);
    if (htmlMatch?.[1]) {
        return {
            shortId: htmlMatch[1],
            shortLink: shortLink instanceof HTMLAnchorElement ? shortLink : null
        };
    }

    return null;
}

/**
 * Inline-metadata Shorts cards render the views row over the thumbnail.
 * Use that row directly when outside metadata does not exist.
 * @param {Element} container
 * @returns {Element|null}
 */
function findInlineOverlayViewsHost(container) {
    const hostCandidates = container.querySelectorAll(
        '.shortsLockupViewModelHostInlineMetadata .shortsLockupViewModelHostMetadataSubhead, .shortsLockupViewModelHostInlineMetadata [class*="MetadataSubhead"]'
    );

    for (const host of hostCandidates) {
        if (!(host instanceof Element)) {
            continue;
        }

        const text = (host.textContent || '').replace(/\s+/g, ' ').trim();
        if (/\bview(s)?\b/i.test(text)) {
            return host;
        }
    }

    return null;
}

/**
 * True when the candidate element belongs to the thumbnail/image layer.
 * @param {Element|null} element
 * @returns {boolean}
 */
function isThumbnailLayerElement(element) {
    if (!(element instanceof Element)) {
        return false;
    }

    return Boolean(
        element.closest(
            '#thumbnail, a#thumbnail, ytd-thumbnail, yt-thumbnail-view-model, #thumbnail-container, .ytd-thumbnail'
        )
    );
}

/**
 * Resolve a host near the view-count text for inline placement.
 * @param {Element} container
 * @returns {{host: Element, mode: 'inline'|'block'}|null}
 */
function findViewsRowHost(container) {
    const inlineOverlayHost = findInlineOverlayViewsHost(container);
    if (inlineOverlayHost) {
        return { host: inlineOverlayHost, mode: 'inline' };
    }

    const thumbnailBottom = getThumbnailBottom(container);
    const candidates = container.querySelectorAll('span, yt-formatted-string, div');
    for (const node of candidates) {
        if (!(node instanceof Element)) {
            continue;
        }

        if (isThumbnailLayerElement(node)) {
            continue;
        }

        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/\bview(s)?\b/i.test(text)) {
            continue;
        }

        if (!isBelowThumbnail(node, thumbnailBottom)) {
            continue;
        }

        const subheadHost = node.closest(
            '.shortsLockupViewModelHostOutsideMetadataSubhead, [class*="OutsideMetadataSubhead"], [class*="MetadataSubhead"]'
        );
        if (subheadHost && !isThumbnailLayerElement(subheadHost) && isBelowThumbnail(subheadHost, thumbnailBottom)) {
            return { host: subheadHost, mode: 'inline' };
        }

        const lineHost = node.closest(
            '#metadata-line, ytd-video-meta-block #metadata-line, yt-content-metadata-view-model #metadata-line, yt-lockup-metadata-view-model #metadata-line, .shortsLockupViewModelHostOutsideMetadataSubhead, [class*="OutsideMetadataSubhead"], [class*="MetadataSubhead"]'
        );
        if (lineHost && !isThumbnailLayerElement(lineHost) && isBelowThumbnail(lineHost, thumbnailBottom)) {
            return { host: lineHost, mode: 'inline' };
        }

        const rowHost = node.closest(
            '#video-info, #metadata, #details, #meta, ytd-video-meta-block, yt-content-metadata-view-model, yt-lockup-metadata-view-model, .shortsLockupViewModelHostOutsideMetadata, [class*="OutsideMetadata"]'
        );
        if (rowHost && !isThumbnailLayerElement(rowHost) && isBelowThumbnail(rowHost, thumbnailBottom)) {
            return { host: rowHost, mode: 'block' };
        }
    }

    return null;
}

/**
 * Bottom coordinate of the visible thumbnail area in a card.
 * @param {Element} container
 * @returns {number}
 */
function getThumbnailBottom(container) {
    let bottom = Number.NEGATIVE_INFINITY;

    for (const selector of THUMBNAIL_SELECTORS) {
        const nodes = container.querySelectorAll(selector);
        for (const node of nodes) {
            if (!(node instanceof Element)) {
                continue;
            }

            if (node instanceof HTMLImageElement && !node.currentSrc && !node.src) {
                continue;
            }

            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                continue;
            }

            if (rect.bottom > bottom) {
                bottom = rect.bottom;
            }
        }
    }

    return bottom;
}

/**
 * Whether an element is located below the thumbnail visual area.
 * @param {Element} element
 * @param {number} thumbnailBottom
 * @returns {boolean}
 */
function isBelowThumbnail(element, thumbnailBottom) {
    if (!(element instanceof Element)) {
        return false;
    }

    if (!Number.isFinite(thumbnailBottom)) {
        return true;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }

    return rect.top >= thumbnailBottom - 2;
}

/**
 * Resolve the best host where the "x ago" label should be inserted.
 * @param {Element} container
 * @returns {{host: Element|null, mode: 'inline'|'block'}}
 */
function findLabelHost(container) {
    const explicitOutsideSubhead = container.querySelector(
        '.shortsLockupViewModelHostOutsideMetadataSubhead, [class*="OutsideMetadataSubhead"]'
    );
    if (explicitOutsideSubhead instanceof Element) {
        return { host: explicitOutsideSubhead, mode: 'inline' };
    }

    const thumbnailBottom = getThumbnailBottom(container);
    const viewsRowHost = findViewsRowHost(container);
    if (viewsRowHost) {
        return viewsRowHost;
    }

    for (const selector of INLINE_HOST_SELECTORS) {
        const host = container.querySelector(selector);
        if (host && !isThumbnailLayerElement(host) && isBelowThumbnail(host, thumbnailBottom)) {
            return { host, mode: 'inline' };
        }
    }

    for (const selector of BLOCK_HOST_SELECTORS) {
        const host = container.querySelector(selector);
        if (host && !isThumbnailLayerElement(host) && isBelowThumbnail(host, thumbnailBottom)) {
            return { host, mode: 'block' };
        }
    }

    return { host: null, mode: 'block' };
}

/**
 * Collect Shorts cards from current page.
 * @param {ParentNode} [root=document]
 * @returns {Array<{container: Element, host: Element, shortId: string, mode: 'inline'|'block'}>}
 */
function collectShortCards(root = document) {
    const containers = root.querySelectorAll(`${FEED_RENDERER_SELECTOR}, ${CONTAINER_FALLBACK_SELECTOR}`);
    const seenContainers = new Set();
    const seenShortIds = new Set();
    const cards = [];

    for (const container of containers) {
        if (!(container instanceof Element) || seenContainers.has(container)) {
            continue;
        }

        const resolved = resolveShortCardData(container);
        if (!resolved || seenShortIds.has(resolved.shortId)) {
            continue;
        }

        const { host, mode } = findLabelHost(container);
        if (!host) {
            continue;
        }

        seenContainers.add(container);
        seenShortIds.add(resolved.shortId);
        cards.push({ container, host, shortId: resolved.shortId, mode });
    }

    return cards;
}

export {
    extractShortIdFromHref,
    collectShortCards,
    findLabelHost,
    resolveShortCardData
};
