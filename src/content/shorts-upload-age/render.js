// Shorts Upload Age - Label Management
import { LABEL_CLASS, LABEL_ATTR, FEED_RENDERER_SELECTOR } from './constants.js';
import { resolveShortCardData } from './pageContext.js';
import { formatRelativeAge, extractRelativeFromText } from './time.js';

const INLINE_HOST_CLASS = 'yt-commander-short-upload-age-inline-host';

export function removeAllRenderedLabels() {
    document.querySelectorAll(`.${LABEL_CLASS}`).forEach((el) => el.remove());
    document.querySelectorAll(`.${INLINE_HOST_CLASS}`).forEach((el) => el.classList.remove(INLINE_HOST_CLASS));
}

export function cleanupStaleLabels() {
    const labels = document.querySelectorAll(`.${LABEL_CLASS}`);
    for (const label of labels) {
        const host = label.parentElement;
        if (!host || !host.isConnected) {
            label.remove();
            continue;
        }
        const container = host.closest(FEED_RENDERER_SELECTOR);
        if (!container) {
            label.remove();
            continue;
        }
        const resolved = resolveShortCardData(container);
        const shortId = resolved?.shortId || '';
        const labelShortId = label.getAttribute(LABEL_ATTR) || '';
        if (!shortId || shortId !== labelShortId) {
            label.remove();
            host.classList.remove(INLINE_HOST_CLASS);
        }
    }
}

export function ensureCardLabel(card) {
    const { host, shortId, mode } = card;
    if (!host || !host.isConnected) {
        return null;
    }
    let label = host.querySelector(`.${LABEL_CLASS}`);
    if (label && label.getAttribute(LABEL_ATTR) !== shortId) {
        label.remove();
        label = null;
    }
    if (!label) {
        label = document.createElement('span');
        label.className = LABEL_CLASS;
        label.textContent = '';
        host.appendChild(label);
    }
    label.setAttribute(LABEL_ATTR, shortId);
    label.setAttribute('data-layout', mode);
    label.setAttribute('title', 'Short upload age');
    if (mode === 'inline') {
        host.classList.add(INLINE_HOST_CLASS);
    } else {
        host.classList.remove(INLINE_HOST_CLASS);
    }
    return label;
}

export function setLabelText(label, text) {
    if (!(label instanceof HTMLElement) || typeof text !== 'string') {
        return;
    }
    if (label.textContent !== text) {
        label.textContent = text;
    }
}

export function setLoadingStateIfEmpty(label) {
    if (!(label instanceof HTMLElement)) {
        return;
    }
    const hasText = Boolean((label.textContent || '').trim());
    if (!hasText) {
        label.classList.add('is-loading');
    }
}

export function extractRelativeFromCard(card) {
    const hostText = extractRelativeFromText(card.host?.textContent || '');
    if (hostText) {
        return hostText;
    }
    return extractRelativeFromText(card.container?.textContent || '');
}

export function refreshRenderedLabels(resolver) {
    const labels = document.querySelectorAll(`.${LABEL_CLASS}`);
    if (labels.length === 0) {
        return;
    }
    const nowMs = Date.now();
    for (const label of labels) {
        const shortId = label.getAttribute(LABEL_ATTR) || '';
        const timestampMs = resolver?.getCachedTimestamp(shortId);
        if (!Number.isFinite(timestampMs)) {
            continue;
        }
        const text = formatRelativeAge(timestampMs, nowMs);
        if (text) {
            setLabelText(label, text);
            label.classList.remove('is-loading');
        }
    }
}

export function renderCard(card, resolver, nowMs) {
    const label = ensureCardLabel(card);
    if (!label) {
        return null;
    }
    const visibleRelative = extractRelativeFromCard(card);
    if (visibleRelative) {
        setLabelText(label, visibleRelative);
        label.classList.remove('is-loading');
    } else {
        const timestampMs = resolver.getCachedTimestamp(card.shortId);
        if (Number.isFinite(timestampMs)) {
            setLabelText(label, formatRelativeAge(timestampMs, nowMs));
            label.classList.remove('is-loading');
        } else {
            setLoadingStateIfEmpty(label);
        }
    }
    return { shortId: card.shortId, label, host: card.host };
}

export { INLINE_HOST_CLASS };
