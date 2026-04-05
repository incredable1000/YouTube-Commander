/**
 * Quick-add module for subscription manager.
 */

import { setTooltip } from './tooltip-utils.js';
import { applyCategoryItemColors, clearCategoryItemColors } from './data-utils.js';
import { createQuickAddIcon } from './icon-utils.js';
import {
    ICONS,
    QUICK_ADD_CLASS,
    SUBSCRIBE_RENDERER_SELECTOR,
    QUICK_ADD_CONTEXT_SELECTOR,
    QUICK_ADD_HOST_SELECTOR,
} from './constants.js';

export function buildQuickAddButton(identity, params) {
    const { setQuickAddIcon, updateQuickAddButtonState, createIcon } = params;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = QUICK_ADD_CLASS;
    button.setAttribute('aria-label', 'Add to category');
    button.setAttribute('title', 'Add to category');

    const iconWrap = document.createElement('span');
    iconWrap.className = 'yt-commander-sub-manager-quick-add-icon';
    iconWrap.setAttribute('data-role', 'quick-add-icon');
    iconWrap.appendChild(createQuickAddIcon());

    const label = document.createElement('span');
    label.className = 'yt-commander-sub-manager-quick-add-label';
    label.setAttribute('data-role', 'quick-add-label');

    const caret = createIcon(ICONS.chevronDown);
    caret.classList.add('yt-commander-sub-manager-icon');
    caret.classList.add('yt-commander-sub-manager-quick-add-caret');

    button.appendChild(iconWrap);
    button.appendChild(label);
    button.appendChild(caret);

    if (identity.channelId) button.setAttribute('data-channel-id', identity.channelId);
    if (identity.handle) button.setAttribute('data-channel-handle', identity.handle);
    if (identity.url) button.setAttribute('data-channel-url', identity.url);

    button.addEventListener('click', params.handleQuickAddClick);
    updateQuickAddButtonState(button, identity, params);

    return button;
}

export function getQuickAddIdentityFromButton(button) {
    if (!button) return { channelId: '', handle: '', url: '' };
    return {
        channelId: button.getAttribute('data-channel-id') || '',
        handle: button.getAttribute('data-channel-handle') || '',
        url: button.getAttribute('data-channel-url') || '',
    };
}

export function getQuickAddAssignmentKeyFromButton(button) {
    if (!button) return '';
    return button.getAttribute('data-channel-key') || '';
}

export function setQuickAddIcon(button, assigned, color) {
    const iconWrap = button?.querySelector('[data-role="quick-add-icon"]');
    if (!iconWrap) return;
    iconWrap.textContent = '';

    if (assigned && color) {
        const dot = document.createElement('span');
        dot.className = 'yt-commander-sub-manager-quick-add-dot';
        dot.style.backgroundColor = color;
        iconWrap.appendChild(dot);
        return;
    }
    iconWrap.appendChild(createQuickAddIcon());
}

export function updateQuickAddButtonState(button, identityOverride, params) {
    if (!button) return;

    const {
        DEFAULT_QUICK_ADD_LABEL,
        resolveSubscribeRendererForQuickAdd,
        resolveChannelIdentityFromContext,
        resolveChannelIdFromIdentity,
        migrateAssignmentKeyIfNeeded,
        resolveAssignmentKeyForRead,
        readChannelAssignments,
        categories,
        setQuickAddIcon,
        applyCategoryItemColors,
        clearCategoryItemColors,
    } = params;

    const identity = identityOverride || getQuickAddIdentityFromButton(button);
    let channelId = identity.channelId;
    let handle = identity.handle;
    let url = identity.url;

    if (!channelId) {
        const renderer = resolveSubscribeRendererForQuickAdd(button);
        const resolved = resolveChannelIdentityFromContext(renderer);
        channelId = resolveChannelIdFromIdentity(resolved);
        if (channelId) {
            button.setAttribute('data-channel-id', channelId);
        }
        if (!handle && resolved.handle) {
            handle = resolved.handle;
            button.setAttribute('data-channel-handle', resolved.handle);
        }
        if (!url && resolved.url) {
            url = resolved.url;
            button.setAttribute('data-channel-url', resolved.url);
        }
    }

    const labelEl = button.querySelector('[data-role="quick-add-label"]');
    migrateAssignmentKeyIfNeeded(channelId, { channelId, handle, url });
    const assignmentKey = resolveAssignmentKeyForRead({ channelId, handle, url }, channelId);

    if (assignmentKey) {
        button.setAttribute('data-channel-key', assignmentKey);
    } else {
        button.removeAttribute('data-channel-key');
    }

    const assignedId = assignmentKey ? readChannelAssignments(assignmentKey)[0] : '';
    const category = assignedId ? categories.find((item) => item.id === assignedId) : null;

    if (category) {
        applyCategoryItemColors(button, category.color);
        button.classList.add('is-assigned');
        button.classList.remove('is-empty');
        button.setAttribute('data-category-id', category.id);
        if (labelEl) labelEl.textContent = category.name;
        setQuickAddIcon(button, true, category.color);
        button.setAttribute('aria-label', `Category: ${category.name}`);
        button.setAttribute('title', `Change category (${category.name})`);
        return;
    }

    clearCategoryItemColors(button);
    button.classList.remove('is-assigned');
    button.classList.add('is-empty');
    button.removeAttribute('data-category-id');
    if (labelEl) labelEl.textContent = DEFAULT_QUICK_ADD_LABEL;
    setQuickAddIcon(button, false);
    button.setAttribute('aria-label', 'Add to category');
    button.setAttribute('title', 'Add to category');
}

export function refreshQuickAddButtons(QUICK_ADD_CLASS, updateQuickAddButtonState) {
    const buttons = document.querySelectorAll(`.${QUICK_ADD_CLASS}`);
    buttons.forEach((button) => updateQuickAddButtonState(button));
}

export function resolveSubscribeRendererForQuickAdd(button) {
    if (!button) return null;
    const sibling = button.previousElementSibling;
    if (sibling && sibling.matches(SUBSCRIBE_RENDERER_SELECTOR)) return sibling;
    const parent = button.parentElement;
    if (parent) {
        const candidate = parent.querySelector(SUBSCRIBE_RENDERER_SELECTOR);
        if (candidate) return candidate;
    }
    return button.closest(SUBSCRIBE_RENDERER_SELECTOR);
}

export function ensureQuickAddButtons(params) {
    const {
        QUICK_ADD_CONTEXT_SELECTOR,
        QUICK_ADD_HOST_SELECTOR,
        buildQuickAddButton,
        resolveChannelIdentityFromContext,
        updateQuickAddButtonState,
    } = params;

    const renderers = Array.from(document.querySelectorAll(SUBSCRIBE_RENDERER_SELECTOR));
    renderers.forEach((renderer) => {
        if (!renderer.closest(QUICK_ADD_CONTEXT_SELECTOR)) return;
        const parent = renderer.closest(QUICK_ADD_HOST_SELECTOR) || renderer.parentElement;
        if (!parent) return;

        const existing = parent.querySelector(`.${QUICK_ADD_CLASS}`);
        if (existing) {
            parent.classList.add('yt-commander-sub-manager-quick-add-host');
            updateQuickAddButtonState(
                existing,
                resolveChannelIdentityFromContext(renderer),
                params
            );
            renderer.dataset.ytcQuickAdd = 'true';
            return;
        }

        const identity = resolveChannelIdentityFromContext(renderer);
        const button = buildQuickAddButton(identity, params);
        renderer.insertAdjacentElement('afterend', button);
        parent.classList.add('yt-commander-sub-manager-quick-add-host');
        renderer.dataset.ytcQuickAdd = 'true';
    });
}

export function scheduleQuickAddScan(quickAddPending, ensureQuickAddButtons) {
    if (quickAddPending) return;
    quickAddPending = true;
    window.requestAnimationFrame(() => {
        quickAddPending = false;
        ensureQuickAddButtons();
    });
}

export function startQuickAddObserver(params, scheduleQuickAddScan) {
    if (params.quickAddObserver) return;
    params.quickAddObserver = new MutationObserver(() => scheduleQuickAddScan(params));
    params.quickAddObserver.observe(document.body, { childList: true, subtree: true });
    scheduleQuickAddScan(params);
}

export function isQuickAddPage() {
    const href = String(location.href || '');
    return [
        /^https?:\/\/(www\.)?youtube\.com\/watch/i,
        /^https?:\/\/(www\.)?youtube\.com\/shorts/i,
        /^https?:\/\/(www\.)?youtube\.com\/@/i,
        /^https?:\/\/(www\.)?youtube\.com\/channel\//i,
        /^https?:\/\/(www\.)?youtube\.com\/c\//i,
        /^https?:\/\/(www\.)?youtube\.com\/user\//i,
    ].some((pattern) => pattern.test(href));
}

export {
    QUICK_ADD_CLASS,
    SUBSCRIBE_RENDERER_SELECTOR,
    QUICK_ADD_CONTEXT_SELECTOR,
    QUICK_ADD_HOST_SELECTOR,
};
