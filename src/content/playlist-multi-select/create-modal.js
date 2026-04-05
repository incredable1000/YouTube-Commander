/**
 * Create modal UI module for playlist multi-select.
 */

import { createChevronDownIcon } from './icons.js';

export function ensureCreateModal(state, handlers, visibilityLabel) {
    if (state.createBackdrop && state.createBackdrop.isConnected) {
        return;
    }

    state.createBackdrop = document.createElement('div');
    state.createBackdrop.className = 'yt-commander-playlist-create-backdrop';

    state.createModal = document.createElement('div');
    state.createModal.className = 'yt-commander-playlist-create-modal';
    state.createModal.setAttribute('role', 'dialog');
    state.createModal.setAttribute('aria-modal', 'true');
    state.createModal.setAttribute('aria-label', 'New playlist');

    const modalTitle = document.createElement('h3');
    modalTitle.className = 'yt-commander-playlist-create-modal__title';
    modalTitle.textContent = 'New playlist';

    state.createTitleInput = document.createElement('input');
    state.createTitleInput.type = 'text';
    state.createTitleInput.className = 'yt-commander-playlist-create-modal__input';
    state.createTitleInput.placeholder = 'Choose a title';
    state.createTitleInput.maxLength = 150;

    const visibilityWrap = document.createElement('div');
    visibilityWrap.className = 'yt-commander-playlist-create-modal__visibility';

    state.createVisibilityButton = document.createElement('button');
    state.createVisibilityButton.type = 'button';
    state.createVisibilityButton.className =
        'yt-commander-playlist-create-modal__visibility-button';
    state.createVisibilityButton.setAttribute('aria-haspopup', 'listbox');
    state.createVisibilityButton.setAttribute('aria-expanded', 'false');

    const visibilityTextWrap = document.createElement('span');
    visibilityTextWrap.className = 'yt-commander-playlist-create-modal__visibility-text';

    const visibilityLabelText = document.createElement('span');
    visibilityLabelText.className = 'yt-commander-playlist-create-modal__visibility-label';
    visibilityLabelText.textContent = 'Visibility';

    state.createVisibilityValue = document.createElement('span');
    state.createVisibilityValue.className = 'yt-commander-playlist-create-modal__visibility-value';
    state.createVisibilityValue.textContent = visibilityLabel(state.createVisibility);

    visibilityTextWrap.appendChild(visibilityLabelText);
    visibilityTextWrap.appendChild(state.createVisibilityValue);
    state.createVisibilityButton.appendChild(visibilityTextWrap);
    state.createVisibilityButton.appendChild(createChevronDownIcon());

    state.createVisibilityMenu = document.createElement('div');
    state.createVisibilityMenu.className = 'yt-commander-playlist-create-modal__visibility-menu';
    state.createVisibilityMenu.setAttribute('role', 'listbox');

    visibilityWrap.appendChild(state.createVisibilityButton);
    visibilityWrap.appendChild(state.createVisibilityMenu);

    const collaborateRow = document.createElement('div');
    collaborateRow.className = 'yt-commander-playlist-create-modal__collaborate';

    const collaborateLabel = document.createElement('span');
    collaborateLabel.className = 'yt-commander-playlist-create-modal__collaborate-label';
    collaborateLabel.textContent = 'Collaborate';

    const switchLabel = document.createElement('label');
    switchLabel.className = 'yt-commander-playlist-create-modal__switch';
    state.createCollaborateInput = document.createElement('input');
    state.createCollaborateInput.type = 'checkbox';
    state.createCollaborateInput.className = 'yt-commander-playlist-create-modal__switch-input';
    const slider = document.createElement('span');
    slider.className = 'yt-commander-playlist-create-modal__switch-slider';
    switchLabel.appendChild(state.createCollaborateInput);
    switchLabel.appendChild(slider);

    collaborateRow.appendChild(collaborateLabel);
    collaborateRow.appendChild(switchLabel);

    state.createStatus = document.createElement('div');
    state.createStatus.className = 'yt-commander-playlist-create-modal__status';
    state.createStatus.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'yt-commander-playlist-create-modal__actions';

    state.createCancelButton = document.createElement('button');
    state.createCancelButton.type = 'button';
    state.createCancelButton.className = 'yt-commander-playlist-create-modal__button';
    state.createCancelButton.textContent = 'Cancel';

    state.createCreateButton = document.createElement('button');
    state.createCreateButton.type = 'button';
    state.createCreateButton.className =
        'yt-commander-playlist-create-modal__button yt-commander-playlist-create-modal__button--primary';
    state.createCreateButton.textContent = 'Create';

    actions.appendChild(state.createCancelButton);
    actions.appendChild(state.createCreateButton);

    state.createModal.appendChild(modalTitle);
    state.createModal.appendChild(state.createTitleInput);
    state.createModal.appendChild(visibilityWrap);
    state.createModal.appendChild(collaborateRow);
    state.createModal.appendChild(state.createStatus);
    state.createModal.appendChild(actions);
    state.createBackdrop.appendChild(state.createModal);

    document.body.appendChild(state.createBackdrop);

    state.createBackdrop.addEventListener('mousedown', handlers.handleCreateBackdropMouseDown);
    state.createTitleInput.addEventListener('input', handlers.updateCreateModalState);
    state.createTitleInput.addEventListener('keydown', handlers.handleCreateTitleKeydown);
    state.createVisibilityButton.addEventListener(
        'click',
        handlers.handleCreateVisibilityButtonClick
    );
    state.createVisibilityMenu.addEventListener('click', handlers.handleCreateVisibilityMenuClick);
    state.createCancelButton.addEventListener('click', handlers.closeCreateModal);
    state.createCreateButton.addEventListener('click', handlers.handleCreateSubmitClick);

    state.cleanupCallbacks.push(() =>
        state.createBackdrop?.removeEventListener(
            'mousedown',
            handlers.handleCreateBackdropMouseDown
        )
    );
    state.cleanupCallbacks.push(() =>
        state.createTitleInput?.removeEventListener('input', handlers.updateCreateModalState)
    );
    state.cleanupCallbacks.push(() =>
        state.createTitleInput?.removeEventListener('keydown', handlers.handleCreateTitleKeydown)
    );
    state.cleanupCallbacks.push(() =>
        state.createVisibilityButton?.removeEventListener(
            'click',
            handlers.handleCreateVisibilityButtonClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.createVisibilityMenu?.removeEventListener(
            'click',
            handlers.handleCreateVisibilityMenuClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.createCancelButton?.removeEventListener('click', handlers.closeCreateModal)
    );
    state.cleanupCallbacks.push(() =>
        state.createCreateButton?.removeEventListener('click', handlers.handleCreateSubmitClick)
    );

    handlers.renderCreateVisibilityOptions(state, visibilityLabel);
    handlers.updateCreateModalState(state);
}
