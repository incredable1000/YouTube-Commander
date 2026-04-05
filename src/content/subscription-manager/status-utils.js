/**
 * Status message utilities for subscription manager.
 */

import { state } from './state.js';

export function setStatus(message, kind = 'info') {
    if (!state.statusEl) return;
    state.statusEl.textContent = message;
    state.statusEl.setAttribute('data-status', kind);
    if (state.statusTimeoutId) {
        window.clearTimeout(state.statusTimeoutId);
        state.statusTimeoutId = 0;
    }
    if (message) {
        state.statusTimeoutId = window.setTimeout(() => {
            if (!state.statusEl) return;
            state.statusEl.textContent = '';
            state.statusEl.removeAttribute('data-status');
            state.statusTimeoutId = 0;
        }, 3000);
    }
}
