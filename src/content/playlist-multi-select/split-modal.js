/**
 * Split modal UI module for playlist multi-select.
 */

export function ensureSplitModal(state, handlers) {
    if (state.splitBackdrop && state.splitBackdrop.isConnected) {
        return;
    }

    state.splitBackdrop = document.createElement('div');
    state.splitBackdrop.className = 'yt-commander-split-backdrop';

    state.splitModal = document.createElement('div');
    state.splitModal.className = 'yt-commander-split-modal';
    state.splitModal.setAttribute('role', 'dialog');
    state.splitModal.setAttribute('aria-modal', 'true');
    state.splitModal.setAttribute('aria-label', 'Split into playlists');

    const modalTitle = document.createElement('h3');
    modalTitle.className = 'yt-commander-split-modal__title';
    modalTitle.textContent = 'Split into playlists';

    const infoText = document.createElement('p');
    infoText.className = 'yt-commander-split-modal__info';
    infoText.textContent = 'Videos per playlist:';

    state.splitCountInput = document.createElement('input');
    state.splitCountInput.type = 'number';
    state.splitCountInput.className = 'yt-commander-split-modal__input';
    state.splitCountInput.min = '1';
    state.splitCountInput.placeholder = 'e.g. 20';
    state.splitCountInput.addEventListener('input', handlers.updateSplitModalState);
    state.splitCountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handlers.submitSplit();
        }
    });

    state.splitStatus = document.createElement('div');
    state.splitStatus.className = 'yt-commander-split-modal__status';
    state.splitStatus.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'yt-commander-split-modal__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'yt-commander-split-modal__button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', handlers.closeSplitModal);

    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className =
        'yt-commander-split-modal__button yt-commander-split-modal__button--primary';
    splitBtn.textContent = 'Split';
    splitBtn.addEventListener('click', handlers.submitSplit);

    actions.appendChild(cancelBtn);
    actions.appendChild(splitBtn);

    state.splitModal.appendChild(modalTitle);
    state.splitModal.appendChild(infoText);
    state.splitModal.appendChild(state.splitCountInput);
    state.splitModal.appendChild(state.splitStatus);
    state.splitModal.appendChild(actions);

    state.splitBackdrop.appendChild(state.splitModal);
    document.body.appendChild(state.splitBackdrop);

    state.splitBackdrop.addEventListener('click', (e) => {
        if (e.target === state.splitBackdrop) {
            handlers.closeSplitModal();
        }
    });
}

export function closeSplitModal(state) {
    if (state.splitBackdrop) {
        state.splitBackdrop.classList.remove('is-visible');
    }
    if (state.splitStatus) {
        state.splitStatus.textContent = '';
        state.splitStatus.className = 'yt-commander-split-modal__status';
    }
    state.splitSubmitting = false;
}

export function updateSplitModalState(state) {
    const videoIds = Array.from(state.selectedVideoIds);
    const count = parseInt(state.splitCountInput?.value, 10) || 0;
    const canSplit = videoIds.length > 0 && count > 0 && !state.splitSubmitting;
    const modal = state.splitModal?.querySelector('.yt-commander-split-modal__button--primary');
    if (modal) {
        modal.disabled = !canSplit;
    }
}

export function setSplitStatus(state, message, kind = 'info') {
    if (!state.splitStatus) {
        return;
    }
    state.splitStatus.textContent = message;
    state.splitStatus.className = `yt-commander-split-modal__status is-${kind}`;
}
