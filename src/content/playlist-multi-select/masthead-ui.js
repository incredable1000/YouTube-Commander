/**
 * Masthead UI module for playlist multi-select.
 */

import { createMastheadIcon } from './icons.js';
import { MASTHEAD_SLOT_CLASS, MASTHEAD_BUTTON_CLASS, MASTHEAD_BADGE_CLASS } from './constants.js';
import { resolveMastheadMountPoint } from './pageContext.js';

export function ensureMastheadButton(state, handleMastheadButtonClick) {
    if (!state.mastheadButton) {
        state.mastheadButton = document.createElement('button');
        state.mastheadButton.type = 'button';
        state.mastheadButton.className = MASTHEAD_BUTTON_CLASS;
        state.mastheadButton.title = 'Select videos';
        state.mastheadButton.setAttribute('aria-label', 'Select videos');
        state.mastheadButton.appendChild(createMastheadIcon());
        state.mastheadButton.addEventListener('click', handleMastheadButtonClick);
        state.cleanupCallbacks.push(() =>
            state.mastheadButton?.removeEventListener('click', handleMastheadButtonClick)
        );
    }

    if (!state.mastheadBadge) {
        state.mastheadBadge = document.createElement('span');
        state.mastheadBadge.className = MASTHEAD_BADGE_CLASS;
        state.mastheadBadge.textContent = '0';
        state.mastheadButton.appendChild(state.mastheadBadge);
    }

    if (!state.mastheadSlot) {
        state.mastheadSlot = document.createElement('div');
        state.mastheadSlot.className = MASTHEAD_SLOT_CLASS;
    }

    if (
        !state.mastheadButton.parentElement ||
        state.mastheadButton.parentElement !== state.mastheadSlot
    ) {
        state.mastheadSlot.appendChild(state.mastheadButton);
    }

    const mountPoint = resolveMastheadMountPoint();
    if (mountPoint && state.mastheadSlot.parentElement !== mountPoint.parent) {
        mountPoint.parent.insertBefore(state.mastheadSlot, mountPoint.anchor);
    } else if (!mountPoint && !state.mastheadSlot.isConnected) {
        document.body.appendChild(state.mastheadSlot);
    }

    updateMastheadButtonState(state);
    updateMastheadVisibility(state);
}

export function updateMastheadVisibility(state, isEligiblePage) {
    const visible = state.isEnabled && isEligiblePage();
    if (state.mastheadSlot) {
        state.mastheadSlot.style.display = visible ? '' : 'none';
    }
}

export function updateMastheadButtonState(state) {
    if (!state.mastheadButton || !state.mastheadBadge) {
        return;
    }

    const selectedCount = state.selectedVideoIds.size;
    state.mastheadButton.classList.toggle('is-active', state.selectionMode);
    state.mastheadBadge.textContent = selectedCount > 99 ? '99+' : String(selectedCount);
    state.mastheadBadge.classList.toggle('is-visible', selectedCount > 0);
    state.mastheadButton.title = state.selectionMode ? 'Exit selection mode' : 'Select videos';
}
