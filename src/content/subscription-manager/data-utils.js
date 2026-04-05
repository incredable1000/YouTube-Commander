export function normalizeHandle(handle) {
    if (typeof handle !== 'string') {
        return '';
    }
    const trimmed = handle.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.startsWith('@') ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

export function normalizeChannelUrl(url) {
    if (typeof url !== 'string') {
        return '';
    }
    const trimmed = url.trim();
    if (!trimmed) {
        return '';
    }
    try {
        const parsed = new URL(trimmed, location.origin);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length === 0) {
            return '';
        }
        const [first, second] = parts;
        if (first.startsWith('@')) {
            return `/${first.toLowerCase()}`;
        }
        if (first === 'channel' && second) {
            return `/channel/${second.toLowerCase()}`;
        }
        if ((first === 'c' || first === 'user') && second) {
            return `/${first}/${second.toLowerCase()}`;
        }
        return '';
    } catch (_error) {
        return '';
    }
}

export function resolveChannelUrl(channel) {
    if (!channel) return '';
    const rawUrl = typeof channel.url === 'string' ? channel.url.trim() : '';
    if (rawUrl) {
        try {
            return new URL(rawUrl, location.origin).toString();
        } catch (_error) {
            return rawUrl;
        }
    }
    const handle = normalizeHandle(channel.handle);
    if (handle) return `https://www.youtube.com/${handle}`;
    if (channel.channelId) return `https://www.youtube.com/channel/${channel.channelId}`;
    return '';
}

export function normalizeColorToHex(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
        return '#64748b';
    }
    if (/^#([0-9a-f]{3}){1,2}$/i.test(trimmed)) {
        if (trimmed.length === 4) {
            return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
        }
        return trimmed.toLowerCase();
    }
    if (!document?.body) {
        return '#64748b';
    }
    const sample = document.createElement('span');
    sample.style.color = trimmed;
    sample.style.position = 'absolute';
    sample.style.opacity = '0';
    sample.style.pointerEvents = 'none';
    document.body.appendChild(sample);
    const computed = getComputedStyle(sample).color || '';
    sample.remove();
    const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) {
        return '#64748b';
    }
    const [r, g, b] = match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))));
    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeCategories(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }
            const id = typeof item.id === 'string' ? item.id : '';
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const color = typeof item.color === 'string' ? item.color : '';
            if (!id || !name) {
                return null;
            }
            return {
                id,
                name,
                color: color || pickCategoryColor(name),
            };
        })
        .filter(Boolean);
}

export function normalizeAssignments(raw) {
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    const next = {};
    Object.entries(raw).forEach(([channelId, value]) => {
        if (typeof channelId !== 'string' || !channelId) {
            return;
        }
        const list = Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : [];
        if (list.length > 0) {
            const unique = Array.from(new Set(list));
            next[channelId] = unique.length > 0 ? [unique[0]] : [];
        }
    });
    return next;
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

export function parseHexColor(hex) {
    if (typeof hex !== 'string') {
        return null;
    }
    const clean = hex.replace('#', '');
    if (clean.length !== 6 || !/^[0-9a-f]{6}$/i.test(clean)) {
        return null;
    }
    const value = parseInt(clean, 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
    };
}

export function computeLuminance(rgb) {
    const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeCategoryContrast(color) {
    const hex = normalizeColorToHex(color);
    const rgb = parseHexColor(hex);
    if (!rgb) {
        return {
            text: '#e8edf5',
            pillBg: 'rgba(255, 255, 255, 0.18)',
            pillBorder: 'rgba(255, 255, 255, 0.32)',
        };
    }
    const luminance = computeLuminance(rgb);
    const isLight = luminance >= 0.6;
    return {
        text: isLight ? '#0f141d' : '#f7f9ff',
        pillBg: isLight ? 'rgba(15, 20, 29, 0.2)' : 'rgba(255, 255, 255, 0.22)',
        pillBorder: isLight ? 'rgba(15, 20, 29, 0.32)' : 'rgba(255, 255, 255, 0.38)',
    };
}

export function applyCategoryItemColors(item, color) {
    if (!item || !color) {
        return;
    }
    const contrast = computeCategoryContrast(color);
    item.classList.add('is-colored');
    item.style.setProperty('--ytc-category-bg', color);
    item.style.setProperty('--ytc-category-text', contrast.text);
    item.style.setProperty('--ytc-category-pill-bg', contrast.pillBg);
    item.style.setProperty('--ytc-category-pill-border', contrast.pillBorder);
}

export function clearCategoryItemColors(item) {
    if (!item) {
        return;
    }
    item.classList.remove('is-colored');
    item.style.removeProperty('--ytc-category-bg');
    item.style.removeProperty('--ytc-category-text');
    item.style.removeProperty('--ytc-category-pill-bg');
    item.style.removeProperty('--ytc-category-pill-border');
}

export function generateRandomCategoryColor(existingColors = []) {
    const existing = new Set(existingColors.map((item) => normalizeColorToHex(item.color)));
    for (let i = 0; i < 12; i += 1) {
        const hue = Math.floor(Math.random() * 360);
        const color = `hsl(${hue} 65% 45%)`;
        if (!existing.has(normalizeColorToHex(color))) {
            return color;
        }
    }
    return `hsl(${Math.floor(Math.random() * 360)} 65% 45%)`;
}
