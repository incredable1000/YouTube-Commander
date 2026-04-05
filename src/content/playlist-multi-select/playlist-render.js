/**
 * Playlist panel rendering module for playlist multi-select.
 */

import { createBookmarkIcon } from './icons.js';

export function renderPlaylistLoading(state, positionPlaylistPanel) {
    if (!state.playlistPanelList) {
        return;
    }

    state.playlistPanelList.innerHTML =
        '<div class="yt-commander-playlist-panel__empty">Loading playlists...</div>';
    positionPlaylistPanel();
}

export function renderPlaylistEmpty(state, positionPlaylistPanel, message) {
    if (!state.playlistPanelList) {
        return;
    }

    state.playlistPanelList.innerHTML = `<div class="yt-commander-playlist-panel__empty">${message}</div>`;
    positionPlaylistPanel();
}

export function readPlaylistInitial(title) {
    const safe = typeof title === 'string' ? title.trim() : '';
    if (!safe) {
        return 'P';
    }
    return safe.charAt(0).toUpperCase();
}

export function renderPlaylistOptions(state, positionPlaylistPanel, syncPlaylistSelectionVisuals) {
    if (!state.playlistPanelList) {
        return;
    }

    if (!Array.isArray(state.playlistOptions) || state.playlistOptions.length === 0) {
        renderPlaylistEmpty(state, positionPlaylistPanel, 'No playlists found.');
        return;
    }

    state.playlistPanelList.innerHTML = '';

    state.playlistOptions.forEach((playlist) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'yt-commander-playlist-panel__item';
        row.setAttribute('role', 'option');
        row.setAttribute('data-playlist-id', playlist.id);

        const thumb = document.createElement('span');
        thumb.className = 'yt-commander-playlist-panel__item-thumb';
        const thumbnailUrl = typeof playlist.thumbnailUrl === 'string' ? playlist.thumbnailUrl : '';
        const titleInitial = readPlaylistInitial(playlist.title);
        if (thumbnailUrl) {
            const image = document.createElement('img');
            image.src = thumbnailUrl;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                image.remove();
                thumb.textContent = titleInitial;
            });
            thumb.appendChild(image);
        } else {
            thumb.textContent = titleInitial;
        }

        const body = document.createElement('span');
        body.className = 'yt-commander-playlist-panel__item-body';

        const rowTitle = document.createElement('span');
        rowTitle.className = 'yt-commander-playlist-panel__item-title';
        rowTitle.textContent = playlist.title || 'Untitled playlist';

        const meta = document.createElement('span');
        meta.className = 'yt-commander-playlist-panel__item-meta';
        meta.textContent = playlist.privacy || 'Private';

        body.appendChild(rowTitle);
        body.appendChild(meta);

        const bookmark = document.createElement('span');
        bookmark.className = 'yt-commander-playlist-panel__item-bookmark';
        bookmark.appendChild(createBookmarkIcon());

        row.appendChild(thumb);
        row.appendChild(body);
        row.appendChild(bookmark);
        state.playlistPanelList.appendChild(row);
    });

    syncPlaylistSelectionVisuals();
    positionPlaylistPanel();
}

export function updatePlaylistRowThumbnail(state, playlistId, thumbnailUrl) {
    if (!state.playlistPanelList || !playlistId || !thumbnailUrl) {
        return;
    }

    const row = state.playlistPanelList.querySelector(
        `.yt-commander-playlist-panel__item[data-playlist-id="${playlistId}"]`
    );
    if (!row) {
        return;
    }

    const thumb = row.querySelector('.yt-commander-playlist-panel__item-thumb');
    if (!(thumb instanceof Element)) {
        return;
    }

    const titleNode = row.querySelector('.yt-commander-playlist-panel__item-title');
    const titleInitial = readPlaylistInitial(titleNode?.textContent || '');

    while (thumb.firstChild) {
        thumb.removeChild(thumb.firstChild);
    }

    const image = document.createElement('img');
    image.src = thumbnailUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
        image.remove();
        thumb.textContent = titleInitial;
    });
    thumb.appendChild(image);
}

export function closePlaylistPanel(state) {
    state.playlistPanelVisible = false;
    state.playlistPanel?.classList.remove('is-visible');
    state.lastPlaylistProbeVideoId = '';
    state.playlistOptions = [];
    state.playlistMap.clear();
    state.selectedPlaylistIds.clear();
}
