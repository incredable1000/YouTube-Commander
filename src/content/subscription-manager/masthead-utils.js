/**
 * Masthead UI utilities for subscription manager.
 */

import {
    MASTHEAD_SLOT_CLASS,
    MASTHEAD_BUTTON_CLASS,
    SUBSCRIPTION_BUTTON_CLASS,
} from './constants.js';
import { isEligiblePage } from '../playlist-multi-select/pageContext.js';
import { createSubscriptionIcon } from './icon-utils.js';
import { state } from './state.js';

export function ensureMastheadSlot() {
    if (state.mastheadSlot && state.mastheadSlot.isConnected) {
        return;
    }
    state.mastheadSlot = document.querySelector(`.${MASTHEAD_SLOT_CLASS}`);
    if (!state.mastheadSlot) {
        state.mastheadSlot = document.createElement('div');
        state.mastheadSlot.className = MASTHEAD_SLOT_CLASS;
    }
    const mountPoint = resolveMastheadMountPoint();
    if (mountPoint && state.mastheadSlot.parentElement !== mountPoint.parent) {
        mountPoint.parent.insertBefore(state.mastheadSlot, mountPoint.anchor);
    } else if (!mountPoint && !state.mastheadSlot.isConnected) {
        document.body.appendChild(state.mastheadSlot);
    }
}

export function ensureMastheadButton(onClick) {
    ensureMastheadSlot();
    if (!state.mastheadButton) {
        state.mastheadButton = document.createElement('button');
        state.mastheadButton.type = 'button';
        state.mastheadButton.className = `${MASTHEAD_BUTTON_CLASS} ${SUBSCRIPTION_BUTTON_CLASS}`;
        state.mastheadButton.setAttribute('aria-label', 'Subscription manager');
        state.mastheadButton.setAttribute('title', 'Subscription manager');
        state.mastheadButton.setAttribute('data-tooltip', 'Subscription manager');
        state.mastheadButton.appendChild(createSubscriptionIcon());
        state.mastheadButton.addEventListener('click', onClick);
    }
    if (
        !state.mastheadButton.parentElement ||
        state.mastheadButton.parentElement !== state.mastheadSlot
    ) {
        state.mastheadSlot.appendChild(state.mastheadButton);
    }
    updateMastheadVisibility();
}

export function updateMastheadVisibility() {
    if (!state.mastheadSlot) {
        return;
    }
    state.mastheadSlot.style.display = isEligiblePage() ? '' : 'none';
}

export function updateMastheadButtonState() {
    if (!state.mastheadButton) {
        return;
    }
    const hasSelection = state.selectedChannelIds.size > 0;
    state.mastheadButton.classList.toggle('has-selection', hasSelection);
}
