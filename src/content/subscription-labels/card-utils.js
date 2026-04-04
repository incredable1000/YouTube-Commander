/**
 * Subscription Labels card decoration utilities.
 */

import {
    LABEL_CLASS,
    HOST_CLASS,
    ROW_CLASS,
    LABEL_KIND_ATTR,
    LABEL_KIND_SUBSCRIBED,
    METADATA_ROW_SELECTORS,
    HOME_BROWSE_SELECTOR,
} from './constants.js';
import { getShortsVideoIdFromCard } from './channel-utils.js';
import { isElementHidden } from './debug.js';
import { extractChannelInfo, findChannelAnchor } from './link-utils.js';

export function clearLabelsFromCard(card) {
    if (!card) {
        return;
    }
    card.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => label.remove());
    card.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => host.classList.remove(HOST_CLASS));
}

export function findLabelHost(card) {
    const selector = METADATA_ROW_SELECTORS.join(',');
    const host = card.querySelector(selector);
    return host || null;
}

export function ensureLabel(anchor, hostOverride = null) {
    const host =
        hostOverride ||
        anchor?.closest(`.${ROW_CLASS}`) ||
        anchor?.closest('ytd-channel-name, #channel-name, ytd-video-owner-renderer') ||
        anchor?.parentElement ||
        anchor;
    if (!host) {
        return null;
    }
    host.classList.add(HOST_CLASS);
    const existing = host.querySelector(`.${LABEL_CLASS}`);
    if (existing) {
        return existing;
    }

    const label = document.createElement('span');
    label.className = LABEL_CLASS;
    if (anchor && (host === anchor || host === anchor.parentElement)) {
        anchor.insertAdjacentElement('afterend', label);
    } else {
        host.appendChild(label);
    }
    return label;
}

export function getHomeBrowseRoot() {
    const roots = document.querySelectorAll(HOME_BROWSE_SELECTOR);
    for (const root of roots) {
        if (!root || !root.isConnected) {
            continue;
        }
        if (isElementHidden(root)) {
            continue;
        }
        return root;
    }
    return null;
}

export function isHomeCard(card) {
    const root = card?.closest?.(HOME_BROWSE_SELECTOR);
    if (!root) {
        return false;
    }
    if (!root.isConnected) {
        return false;
    }
    return !isElementHidden(root);
}

export function decorateCard(
    card,
    dataInitialized,
    subscribedChannelIds,
    subscribedChannelPaths,
    shortsChannelCache,
    enqueueShortsLookup,
    isHovering
) {
    if (!isHomeCard(card)) {
        clearLabelsFromCard(card);
        return;
    }
    if (!dataInitialized) {
        return;
    }

    if (card.matches(':hover') || card.contains(document.activeElement)) {
        return;
    }

    if (isHovering) {
        return;
    }

    const { channelId, channelPath, anchor, host } = extractChannelInfo(card);
    if ((!anchor && !host) || (!channelId && !channelPath)) {
        const existing = card.querySelector(`.${LABEL_CLASS}`);
        if (existing) {
            existing.remove();
        }
        const shortsVideoId = getShortsVideoIdFromCard(card);
        if (shortsVideoId) {
            const cachedChannelId = shortsChannelCache.get(shortsVideoId);
            if (cachedChannelId) {
                const subscribed = subscribedChannelIds.has(cachedChannelId);
                if (subscribed) {
                    const label = ensureLabel(anchor, host);
                    if (label) {
                        label.setAttribute(LABEL_KIND_ATTR, LABEL_KIND_SUBSCRIBED);
                        label.textContent = 'Subscribed';
                    }
                }
                return;
            }
            enqueueShortsLookup(shortsVideoId, card);
        }
        return;
    }

    const isSubscribed =
        (channelId && subscribedChannelIds.has(channelId)) ||
        (channelPath && subscribedChannelPaths.has(channelPath));

    if (!isSubscribed) {
        const existing = card.querySelector(`.${LABEL_CLASS}`);
        if (existing) {
            existing.remove();
        }
        const shortsVideoId = getShortsVideoIdFromCard(card);
        if (shortsVideoId && !shortsChannelCache.has(shortsVideoId)) {
            enqueueShortsLookup(shortsVideoId, card);
        }
        return;
    }

    const label = ensureLabel(anchor, host);
    if (!label) {
        return;
    }
    label.setAttribute(LABEL_KIND_ATTR, LABEL_KIND_SUBSCRIBED);
    label.textContent = 'Subscribed';
}

export function clearAllLabels() {
    document.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => label.remove());
    document
        .querySelectorAll(`.${HOST_CLASS}`)
        .forEach((host) => host.classList.remove(HOST_CLASS));
}
