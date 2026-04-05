/**
 * Picker utilities for subscription manager.
 */

import { state } from './state.js';
import {
    ensurePickerElement,
    positionPickerElement,
    createPickerContextAnchorElement,
} from './picker-ui.js';
import { getQuickAddIdentityFromButton, resolveSubscribeRendererForQuickAdd } from './quick-add.js';
import {
    resolveChannelIdentityFromContext,
    resolveChannelIdFromIdentity,
    resolveAssignmentKeyForWrite,
} from './channel-identity.js';
import { setStatus } from './status-utils.js';

export function ensurePickerAll() {
    if (state.picker && state.picker.isConnected) return;
    state.picker = document.createElement('div');
    state.picker.addEventListener('click', handlePickerClick);
    ensurePickerElement(state.picker);
}

export function renderPickerAll() {
    return state.picker;
}

export function openPickerAll(anchor, mode, channelIds) {
    if (!state.picker) return;
    state.pickerMode = mode;
    state.pickerTargetIds = Array.isArray(channelIds) ? channelIds : [];
    state.pickerAnchorEl = anchor;
    state.picker.style.display = 'block';
    state.picker.style.visibility = 'hidden';
    requestAnimationFrame(() => {
        positionPickerElement(state.picker, state.pickerAnchorEl);
        state.picker.style.visibility = 'visible';
    });
}

export function closePickerAll() {
    if (!state.picker) return;
    state.picker.style.display = 'none';
    state.picker.style.visibility = '';
    const list = state.picker.querySelector('.yt-commander-sub-manager-picker-list');
    if (list) list.style.maxHeight = '';
    state.pickerAnchorEl = null;
    state.pickerTargetIds = [];
    state.pickerContextChannelId = '';
    if (state.pickerContextAnchor) {
        state.pickerContextAnchor.remove();
        state.pickerContextAnchor = null;
    }
}

export function createPickerContextAnchorAll(x, y) {
    state.pickerContextAnchor = createPickerContextAnchorElement(x, y, state.pickerContextAnchor);
    return state.pickerContextAnchor;
}

export function positionPickerAll() {
    positionPickerElement(state.picker, state.pickerAnchorEl);
}

export async function handlePickerClick(event) {
    const baseTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const target = baseTarget?.closest('[data-category-id]');
    if (target) {
        const categoryId = target.getAttribute('data-category-id') || '';
        let targetIds = state.pickerTargetIds;
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            const anchorKey = getQuickAddAssignmentKeyFromButton(state.pickerAnchorEl);
            if (anchorKey) targetIds = [anchorKey];
        }
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            const anchor = state.pickerAnchorEl;
            const renderer = resolveSubscribeRendererForQuickAdd(anchor);
            const anchorIdentity = anchor?.classList.contains('yt-commander-sub-manager-quick-add')
                ? getQuickAddIdentityFromButton(anchor)
                : null;
            const identity =
                anchorIdentity &&
                (anchorIdentity.channelId || anchorIdentity.handle || anchorIdentity.url)
                    ? anchorIdentity
                    : resolveChannelIdentityFromContext(renderer);
            let channelId = resolveChannelIdFromIdentity(
                identity,
                state.channelsById,
                state.channelsByHandle,
                state.channelsByUrl
            );
            if (!channelId && (identity.handle || identity.url)) {
                channelId = resolveChannelIdFromIdentity(
                    identity,
                    state.channelsById,
                    state.channelsByHandle,
                    state.channelsByUrl
                );
            }
            const assignmentKey = resolveAssignmentKeyForWrite(identity, channelId);
            if (assignmentKey) {
                if (anchor) anchor.setAttribute('data-channel-key', assignmentKey);
                targetIds = [assignmentKey];
            }
        }
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            setStatus('Unable to resolve channel for category.', 'error');
            closePickerAll();
            return;
        }
        window.dispatchEvent(
            new CustomEvent('ytc-apply-category-update', {
                detail: {
                    channelIds: targetIds,
                    categoryId,
                    mode: state.pickerMode === 'remove' ? 'remove' : 'toggle',
                },
            })
        );
        closePickerAll();
        return;
    }
    const action = baseTarget?.closest('[data-action]')?.getAttribute('data-action');
    if (action === 'open-channel') {
        window.dispatchEvent(
            new CustomEvent('ytc-open-channel', {
                detail: {
                    url:
                        baseTarget
                            ?.closest('[data-channel-url]')
                            ?.getAttribute('data-channel-url') || '',
                },
            })
        );
        closePickerAll();
        return;
    }
    if (action === 'picker-new-category') {
        closePickerAll();
        window.dispatchEvent(new CustomEvent('ytc-start-sidebar-create'));
    }
}
