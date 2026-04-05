import {
    normalizeColorToHex,
    generateRandomCategoryColor,
    pickCategoryColor,
} from './data-utils.js';
import { setTooltip, clearTooltip } from './tooltip-utils.js';
import { createIcon } from './icon-utils.js';
import { ICONS } from './constants.js';

export function createCategory(name, colorOverride = '') {
    const trimmed = name.trim();
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const color =
        typeof colorOverride === 'string' && colorOverride.trim()
            ? colorOverride.trim()
            : generateRandomCategoryColor();
    return {
        id,
        name: trimmed,
        color,
    };
}

export function getCategoryLabel(categoryId, categories) {
    if (categoryId === 'all') {
        return 'All categories';
    }
    if (categoryId === 'uncategorized') {
        return 'Uncategorized';
    }
    const category = categories.find((item) => item.id === categoryId);
    return category ? category.name : 'category';
}

export function buildCategoryBadges(
    channelId,
    categories,
    readChannelAssignments,
    BADGE_CLASS,
    BADGE_REMOVE_CLASS
) {
    const wrapper = document.createElement('div');
    wrapper.className = 'yt-commander-sub-manager-categories';

    const assigned = readChannelAssignments(channelId);
    assigned.forEach((categoryId) => {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) {
            return;
        }
        const badge = document.createElement('span');
        badge.className = BADGE_CLASS;
        badge.style.backgroundColor = category.color;
        badge.textContent = category.name;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = BADGE_REMOVE_CLASS;
        remove.setAttribute('data-action', 'remove-category');
        remove.setAttribute('data-channel-id', channelId);
        remove.setAttribute('data-category-id', category.id);
        remove.setAttribute('aria-label', `Remove from ${category.name}`);
        remove.setAttribute('title', `Remove from ${category.name}`);
        remove.setAttribute('data-tooltip', `Remove from ${category.name}`);
        remove.classList.add('yt-commander-sub-manager-tooltip');
        remove.textContent = 'x';

        badge.appendChild(remove);
        wrapper.appendChild(badge);
    });

    return wrapper;
}

export function buildCard(
    channel,
    selectedChannelIds,
    resolveChannelCounts,
    setTooltip,
    createSubscriptionIcon
) {
    const card = document.createElement('div');
    card.className = 'yt-commander-sub-manager-card';
    card.setAttribute('data-channel-id', channel.channelId || '');
    if (selectedChannelIds.has(channel.channelId)) {
        card.classList.add('is-selected');
    }

    const media = document.createElement('div');
    media.className = 'yt-commander-sub-manager-card-media';
    const avatar = document.createElement('img');
    avatar.className = 'yt-commander-sub-manager-card-image';
    avatar.alt = channel.title || 'Channel';
    avatar.loading = 'lazy';
    if (channel.avatar) {
        avatar.src = channel.avatar;
    }
    media.appendChild(avatar);
    card.appendChild(media);

    const stats = document.createElement('div');
    stats.className = 'yt-commander-sub-manager-card-stats';
    const name = document.createElement('div');
    name.className = 'yt-commander-sub-manager-name yt-commander-sub-manager-card-name';
    name.setAttribute('data-field', 'name');
    name.textContent = channel.title || 'Untitled channel';
    setTooltip(name, channel.title || 'Untitled channel');
    const counts = resolveChannelCounts(channel);
    const subscribers = document.createElement('div');
    subscribers.className = 'yt-commander-sub-manager-card-metric';
    subscribers.setAttribute('data-field', 'subscribers');
    subscribers.textContent = counts.subscribers;
    const nameRow = document.createElement('div');
    nameRow.className = 'yt-commander-sub-manager-card-title-row';
    nameRow.appendChild(name);
    nameRow.appendChild(subscribers);

    stats.appendChild(nameRow);
    card.appendChild(stats);

    return card;
}

export function updateCard(card, channel, resolveChannelCounts, setTooltip) {
    const name = card.querySelector('[data-field="name"]');
    if (name) {
        name.textContent = channel.title || 'Untitled channel';
        setTooltip(name, channel.title || 'Untitled channel');
    }
    const handle = card.querySelector('[data-field="handle"]');
    if (handle) {
        handle.remove();
    }
    const avatar = card.querySelector('img.yt-commander-sub-manager-card-image');
    if (avatar && channel.avatar) {
        avatar.src = channel.avatar;
    }
    const counts = resolveChannelCounts(channel);
    const subscribers = card.querySelector('[data-field="subscribers"]');
    if (subscribers) {
        subscribers.textContent = counts.subscribers;
    }
}

export function setIconButton(button, iconPath, label) {
    if (!button) {
        return;
    }
    button.textContent = '';
    const icon = createIcon(iconPath);
    icon.classList.add('yt-commander-sub-manager-icon');
    button.appendChild(icon);
    button.classList.add('yt-commander-sub-manager-icon-btn');
    setTooltip(button, label);
}
