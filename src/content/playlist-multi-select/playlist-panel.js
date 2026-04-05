/**
 * Playlist panel UI module for playlist multi-select.
 */

import { createCloseIcon, createPlusIcon } from './icons.js';

export function ensurePlaylistPanel(state, handlers) {
    if (state.playlistPanel && state.playlistPanel.isConnected) {
        return;
    }

    state.playlistPanel = document.createElement('div');
    state.playlistPanel.className = 'yt-commander-playlist-panel';
    state.playlistPanel.setAttribute('role', 'dialog');
    state.playlistPanel.setAttribute('aria-label', 'Save to playlist');

    const header = document.createElement('div');
    header.className = 'yt-commander-playlist-panel__header';

    const title = document.createElement('div');
    title.className = 'yt-commander-playlist-panel__title';
    title.textContent = 'Save to...';

    state.playlistPanelCloseButton = document.createElement('button');
    state.playlistPanelCloseButton.type = 'button';
    state.playlistPanelCloseButton.className = 'yt-commander-playlist-panel__close';
    state.playlistPanelCloseButton.setAttribute('aria-label', 'Close');
    state.playlistPanelCloseButton.appendChild(createCloseIcon());

    header.appendChild(title);
    header.appendChild(state.playlistPanelCloseButton);

    const subhead = document.createElement('div');
    subhead.className = 'yt-commander-playlist-panel__subhead';
    state.playlistPanelCount = document.createElement('span');
    state.playlistPanelCount.className = 'yt-commander-playlist-panel__count';
    state.playlistPanelCount.textContent = '0 selected';
    subhead.appendChild(state.playlistPanelCount);

    state.playlistPanelList = document.createElement('div');
    state.playlistPanelList.className = 'yt-commander-playlist-panel__list';
    state.playlistPanelList.setAttribute('role', 'listbox');
    state.playlistPanelList.setAttribute('aria-label', 'Playlists');

    state.playlistPanelStatus = document.createElement('div');
    state.playlistPanelStatus.className = 'yt-commander-playlist-panel__status';
    state.playlistPanelStatus.setAttribute('aria-live', 'polite');

    const footer = document.createElement('div');
    footer.className = 'yt-commander-playlist-panel__footer';

    state.playlistPanelNewButton = document.createElement('button');
    state.playlistPanelNewButton.type = 'button';
    state.playlistPanelNewButton.className = 'yt-commander-playlist-panel__new';
    const plus = document.createElement('span');
    plus.className = 'yt-commander-playlist-panel__new-icon';
    plus.appendChild(createPlusIcon());
    const newLabel = document.createElement('span');
    newLabel.textContent = 'New playlist';
    state.playlistPanelNewButton.appendChild(plus);
    state.playlistPanelNewButton.appendChild(newLabel);

    footer.appendChild(state.playlistPanelNewButton);

    state.playlistPanel.appendChild(header);
    state.playlistPanel.appendChild(subhead);
    state.playlistPanel.appendChild(state.playlistPanelList);
    state.playlistPanel.appendChild(state.playlistPanelStatus);
    state.playlistPanel.appendChild(footer);

    document.body.appendChild(state.playlistPanel);

    state.playlistPanelCloseButton.addEventListener('click', handlers.closePlaylistPanel);
    state.playlistPanelList.addEventListener('click', handlers.handlePlaylistListClick);
    state.playlistPanelNewButton.addEventListener('click', handlers.handlePlaylistNewButtonClick);

    state.cleanupCallbacks.push(() =>
        state.playlistPanelCloseButton?.removeEventListener('click', handlers.closePlaylistPanel)
    );
    state.cleanupCallbacks.push(() =>
        state.playlistPanelList?.removeEventListener('click', handlers.handlePlaylistListClick)
    );
    state.cleanupCallbacks.push(() =>
        state.playlistPanelNewButton?.removeEventListener(
            'click',
            handlers.handlePlaylistNewButtonClick
        )
    );
}
