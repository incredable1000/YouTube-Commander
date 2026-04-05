export function parseCountValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const text = String(value ?? '').trim();
    if (!text || text === '-' || text.startsWith('@')) {
        return 0;
    }
    const cleaned = text
        .replace(/,/g, '')
        .replace(/subscribers?/i, '')
        .trim();
    const match = cleaned.match(/([\d.]+)\s*([kmb])?/i);
    if (!match) {
        return 0;
    }
    let numberValue = parseFloat(match[1]);
    if (!Number.isFinite(numberValue)) {
        return 0;
    }
    const suffix = (match[2] || '').toLowerCase();
    if (suffix === 'k') {
        numberValue *= 1000;
    } else if (suffix === 'm') {
        numberValue *= 1000000;
    } else if (suffix === 'b') {
        numberValue *= 1000000000;
    }
    return numberValue;
}

export function formatCountLabel(value, kind) {
    if (value === null || value === undefined) {
        return '-';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toLocaleString();
    }
    let text = String(value).trim();
    if (!text) {
        return '-';
    }
    if (text.startsWith('@')) {
        return '-';
    }
    if (kind === 'subscribers') {
        text = text.replace(/subscribers?/i, '').trim();
    } else if (kind === 'videos') {
        text = text.replace(/videos?/i, '').trim();
    }
    return text || '-';
}

export function extractChannelIdFromUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }
    try {
        const parsed = new URL(url, location.origin);
        if (parsed.pathname.startsWith('/channel/')) {
            return parsed.pathname.split('/')[2] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

export function extractHandleFromUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }
    try {
        const parsed = new URL(url, location.origin);
        if (parsed.pathname.startsWith('/@')) {
            return parsed.pathname.split('/')[1] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

export function formatSubscriptionError(error) {
    const raw = typeof error?.message === 'string' ? error.message : '';
    if (!raw) {
        return 'Failed to load subscriptions.';
    }
    if (/precondition check failed/i.test(raw)) {
        return 'YouTube blocked this request. Make sure you are signed in, open a normal YouTube page, then try again.';
    }
    if (/api key is unavailable/i.test(raw)) {
        return 'YouTube API key is unavailable on this page. Open a standard YouTube page and retry.';
    }
    if (/timed out/i.test(raw)) {
        return 'Subscription request timed out. Please try again.';
    }
    return raw;
}

export function createVirtualSpacer(height) {
    const spacer = document.createElement('div');
    spacer.className = 'yt-commander-sub-manager-virtual-spacer';
    spacer.style.height = `${height}px`;
    spacer.style.flexShrink = '0';
    spacer.style.gridColumn = '1 / -1';
    return spacer;
}

export function generateCategoryId() {
    return 'cat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

export function pickCategoryColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
        hash = (hash << 5) - hash + name.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 65% 42%)`;
}
