/**
 * Status and progress UI module for playlist multi-select.
 */

export function setStatusMessage(state, message, kind = 'info') {
    if (state.statusTimer) {
        clearTimeout(state.statusTimer);
        state.statusTimer = null;
    }

    const text = typeof message === 'string' ? message : '';
    if (!state.playlistPanelStatus) {
        return;
    }

    state.playlistPanelStatus.textContent = text;
    state.playlistPanelStatus.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');
    if (text) {
        state.playlistPanelStatus.classList.add('is-visible', `is-${kind}`);
    }

    if (!text) {
        return;
    }

    state.statusTimer = window.setTimeout(() => {
        clearStatusMessage(state);
    }, 4500);
}

export function clearStatusMessage(state) {
    if (state.statusTimer) {
        clearTimeout(state.statusTimer);
        state.statusTimer = null;
    }

    [state.playlistPanelStatus, state.createStatus].forEach((node) => {
        if (!node) {
            return;
        }
        node.textContent = '';
        node.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');
    });
}

export function showSaveProgress(state, processed, total, label) {
    if (
        !state.progressBar ||
        !state.progressBarFill ||
        !state.progressBarLabel ||
        !state.progressBarCount
    ) {
        return;
    }

    const percentage = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    state.progressBar.hidden = false;
    state.progressBarLabel.textContent = label || 'Saving...';
    state.progressBarFill.style.width = `${percentage}%`;
    state.progressBarCount.textContent = `${processed} / ${total}`;
}

export function hideSaveProgress(state) {
    if (!state.progressBar) {
        return;
    }

    state.progressBar.hidden = true;
}
