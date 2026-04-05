/**
 * Action bar UI module for playlist multi-select.
 */

import { ICONS } from '../../shared/constants.js';
import {
    createSvgIcon,
    createBookmarkIcon,
    createWatchLaterIcon,
    createCloseIcon,
    createPlaylistAddIcon,
    createSelectAllIcon,
    createUnselectAllIcon,
    createSplitIcon,
    createRemoveIcon,
} from './icons.js';
import { getRemoveActionLabel } from './pageContext.js';

export function createActionIconButton(icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yt-commander-playlist-action-button';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('data-tooltip', label);
    button.appendChild(icon);
    return button;
}

export function ensureActionBar(state, handlers) {
    if (state.actionBar && state.actionBar.isConnected) {
        return;
    }

    state.actionBar = document.createElement('div');
    state.actionBar.className = 'yt-commander-playlist-action-bar';

    const dragHandle = document.createElement('div');
    dragHandle.className = 'yt-commander-playlist-action-drag-handle';
    dragHandle.setAttribute('title', 'Drag to move');
    dragHandle.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4h1v1H6V4zm3 0h1v1H9V4zm3 0h1v1h-1V4zM6 7h1v1H6V7zm3 0h1v1H9V7zm3 0h1v1h-1V7zM6 10h1v1H6v-1zm3 0h1v1H9v-1zm3 0h1v1h-1v-1z"/></svg>';

    const countWrap = document.createElement('div');
    countWrap.className = 'yt-commander-playlist-action-count';

    const countLabel = document.createElement('span');
    countLabel.className = 'yt-commander-playlist-action-count-label';
    countLabel.textContent = 'Selected';

    state.actionCount = document.createElement('span');
    state.actionCount.className = 'yt-commander-playlist-action-count-value';
    state.actionCount.textContent = '0';

    const totalLabel = document.createElement('span');
    totalLabel.className = 'yt-commander-playlist-action-count-label';
    totalLabel.textContent = 'of';

    state.actionTotalCount = document.createElement('span');
    state.actionTotalCount.className = 'yt-commander-playlist-action-count-total';
    state.actionTotalCount.textContent = '0';

    countWrap.appendChild(countLabel);
    countWrap.appendChild(state.actionCount);
    countWrap.appendChild(totalLabel);
    countWrap.appendChild(state.actionTotalCount);

    dragHandle.addEventListener('mousedown', handlers.handleDragStart);
    document.addEventListener('mousemove', handlers.handleDragMove);
    document.addEventListener('mouseup', handlers.handleDragEnd);

    state.actionWatchLaterButton = createActionIconButton(
        createWatchLaterIcon(),
        'Save to Watch later'
    );
    state.actionSaveButton = createActionIconButton(createBookmarkIcon(), 'Save to playlist');
    state.actionQuickCreateButton = createActionIconButton(
        createPlaylistAddIcon(),
        'Save to new playlist'
    );
    state.actionSplitButton = createActionIconButton(createSplitIcon(), 'Split into playlists');
    state.actionRemoveButton = createActionIconButton(createRemoveIcon(), getRemoveActionLabel());
    state.actionRemoveWatchedButton = createActionIconButton(createRemoveIcon(), 'Remove watched');
    state.actionDeletePlaylistsButton = createActionIconButton(
        createRemoveIcon(),
        'Remove selected playlist'
    );
    state.actionSelectAllButton = createActionIconButton(createSelectAllIcon(), 'Select all');
    state.actionUnselectAllButton = createActionIconButton(createUnselectAllIcon(), 'Unselect all');

    state.actionOpenAllButton = document.createElement('button');
    state.actionOpenAllButton.type = 'button';
    state.actionOpenAllButton.className = 'yt-commander-playlist-action-button';
    state.actionOpenAllButton.setAttribute('aria-label', 'Open all in new tab');
    state.actionOpenAllButton.setAttribute('title', 'Open all in new tab');
    state.actionOpenAllButton.setAttribute('data-tooltip', 'Open all in new tab');
    state.actionOpenAllButton.appendChild(createSvgIcon(ICONS.OPEN_NEW_TAB));

    state.actionExitButton = document.createElement('button');
    state.actionExitButton.type = 'button';
    state.actionExitButton.className =
        'yt-commander-playlist-action-button yt-commander-playlist-action-exit';
    state.actionExitButton.setAttribute('aria-label', 'Exit selection mode');
    state.actionExitButton.setAttribute('title', 'Exit selection mode');
    state.actionExitButton.setAttribute('data-tooltip', 'Exit selection mode');
    state.actionExitButton.appendChild(createCloseIcon());

    state.actionBar.appendChild(dragHandle);
    state.actionBar.appendChild(countWrap);
    state.actionBar.appendChild(state.actionWatchLaterButton);
    state.actionBar.appendChild(state.actionSaveButton);
    state.actionBar.appendChild(state.actionQuickCreateButton);
    state.actionBar.appendChild(state.actionSplitButton);
    state.actionBar.appendChild(state.actionRemoveButton);
    state.actionBar.appendChild(state.actionRemoveWatchedButton);
    state.actionBar.appendChild(state.actionDeletePlaylistsButton);
    state.actionBar.appendChild(state.actionSelectAllButton);
    state.actionBar.appendChild(state.actionUnselectAllButton);
    state.actionBar.appendChild(state.actionOpenAllButton);
    state.actionBar.appendChild(state.actionExitButton);

    state.progressBar = document.createElement('div');
    state.progressBar.className = 'yt-commander-playlist-progress';
    state.progressBar.hidden = true;

    state.progressBarLabel = document.createElement('div');
    state.progressBarLabel.className = 'yt-commander-playlist-progress__label';
    state.progressBarLabel.textContent = 'Saving...';

    state.progressBarElement = document.createElement('div');
    state.progressBarElement.className = 'yt-commander-playlist-progress__bar';

    state.progressBarFill = document.createElement('div');
    state.progressBarFill.className = 'yt-commander-playlist-progress__fill';

    state.progressBarCount = document.createElement('div');
    state.progressBarCount.className = 'yt-commander-playlist-progress__count';
    state.progressBarCount.textContent = '0 / 0';

    state.progressBarElement.appendChild(state.progressBarFill);
    state.progressBar.appendChild(state.progressBarLabel);
    state.progressBar.appendChild(state.progressBarElement);
    state.progressBar.appendChild(state.progressBarCount);

    document.body.appendChild(state.actionBar);
    document.body.appendChild(state.progressBar);

    state.actionWatchLaterButton.addEventListener('click', handlers.handleActionWatchLaterClick);
    state.actionSaveButton.addEventListener('click', handlers.handleActionSaveClick);
    state.actionQuickCreateButton.addEventListener('click', handlers.handleActionQuickCreateClick);
    state.actionSplitButton.addEventListener('click', handlers.handleSplitClick);
    state.actionRemoveButton.addEventListener('click', handlers.handleActionRemoveClick);
    state.actionRemoveWatchedButton.addEventListener(
        'click',
        handlers.handleActionRemoveWatchedClick
    );
    state.actionDeletePlaylistsButton.addEventListener(
        'click',
        handlers.handleActionDeletePlaylistsClick
    );
    state.actionSelectAllButton.addEventListener('click', handlers.handleActionSelectAllClick);
    state.actionUnselectAllButton.addEventListener('click', handlers.handleActionUnselectAllClick);
    state.actionOpenAllButton.addEventListener('click', handlers.handleOpenInNewTab);
    state.actionExitButton.addEventListener('click', handlers.handleActionExitButtonClick);

    state.cleanupCallbacks.push(() =>
        state.actionWatchLaterButton?.removeEventListener(
            'click',
            handlers.handleActionWatchLaterClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.actionSaveButton?.removeEventListener('click', handlers.handleActionSaveClick)
    );
    state.cleanupCallbacks.push(() =>
        state.actionQuickCreateButton?.removeEventListener(
            'click',
            handlers.handleActionQuickCreateClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.actionSplitButton?.removeEventListener('click', handlers.handleSplitClick)
    );
    state.cleanupCallbacks.push(() =>
        state.actionRemoveButton?.removeEventListener('click', handlers.handleActionRemoveClick)
    );
    state.cleanupCallbacks.push(() =>
        state.actionRemoveWatchedButton?.removeEventListener(
            'click',
            handlers.handleActionRemoveWatchedClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.actionDeletePlaylistsButton?.removeEventListener(
            'click',
            handlers.handleActionDeletePlaylistsClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.actionSelectAllButton?.removeEventListener(
            'click',
            handlers.handleActionSelectAllClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.actionUnselectAllButton?.removeEventListener(
            'click',
            handlers.handleActionUnselectAllClick
        )
    );
    state.cleanupCallbacks.push(() =>
        state.actionOpenAllButton?.removeEventListener('click', handlers.handleOpenInNewTab)
    );
    state.cleanupCallbacks.push(() =>
        state.actionExitButton?.removeEventListener('click', handlers.handleActionExitButtonClick)
    );
}
