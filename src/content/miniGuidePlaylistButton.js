/**
 * Inject a Playlists shortcut into the collapsed YouTube mini guide.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
import { createIcon } from './utils/ui.js';

const logger = createLogger('MiniGuidePlaylist');

const ENTRY_ID = 'yt-commander-mini-guide-playlists';
const ENTRY_LABEL = 'Playlists';
const PLAYLIST_PATH = '/feed/playlists';
const OBSERVER_THROTTLE_MS = 650;

const PLAYLIST_ICON_PATH = 'M4 6h11v2H4V6zm0 4h11v2H4v-2zm0 4h7v2H4v-2zm10-2v6l5-3-5-3z';

let isInitialized = false;
let initPromise = null;
let domObserver = null;

/**
 * Initialize mini guide playlists entry injection.
 */
export async function initMiniGuidePlaylistButton() {
    if (isInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        logger.info('Initializing mini guide playlists entry');

        ensureMiniGuideEntry();

        domObserver = createThrottledObserver(() => {
            ensureMiniGuideEntry();
        }, OBSERVER_THROTTLE_MS);

        domObserver.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('yt-navigate-finish', ensureMiniGuideEntry);

        isInitialized = true;
        logger.info('Mini guide playlists entry initialized');
    })();

    try {
        await initPromise;
    } catch (error) {
        logger.error('Failed to initialize mini guide playlists entry', error);
        throw error;
    } finally {
        initPromise = null;
    }
}

function ensureMiniGuideEntry() {
    const miniGuide = document.querySelector('ytd-mini-guide-renderer');
    if (!miniGuide) {
        return;
    }

    const existingEntry = miniGuide.querySelector(`#${ENTRY_ID}`);
    if (existingEntry) {
        configureEntry(existingEntry);
        return;
    }

    const items = miniGuide.querySelector('#items') || miniGuide;
    const baseEntry = items.querySelector('ytd-mini-guide-entry-renderer');
    if (!baseEntry) {
        return;
    }

    const entry = buildPlaylistEntry(baseEntry);
    if (!entry) {
        return;
    }

    const subscriptionsAnchor = items.querySelector('a[href*="/feed/subscriptions"]');
    const subscriptionsEntry = subscriptionsAnchor?.closest('ytd-mini-guide-entry-renderer');
    if (subscriptionsEntry && subscriptionsEntry.parentElement === items) {
        subscriptionsEntry.insertAdjacentElement('afterend', entry);
    } else {
        items.appendChild(entry);
    }
}

function buildPlaylistEntry(baseEntry) {
    const entry = baseEntry.cloneNode(true);
    entry.id = ENTRY_ID;
    entry.classList.add('yt-commander-mini-guide-entry');

    if (!configureEntry(entry)) {
        return null;
    }

    return entry;
}

function configureEntry(entry) {
    const link = entry.querySelector('a');
    if (!link) {
        return false;
    }

    link.href = PLAYLIST_PATH;
    link.title = ENTRY_LABEL;
    link.setAttribute('aria-label', ENTRY_LABEL);

    updateEntryLabel(entry);
    updateEntryIcon(entry);
    updateEntryData(entry);
    wireNavigation(link);
    return true;
}

function updateEntryLabel(entry) {
    const labelNode = entry.querySelector('.title')
        || entry.querySelector('#text')
        || entry.querySelector('yt-formatted-string')
        || entry.querySelector('span');
    if (labelNode) {
        labelNode.textContent = ENTRY_LABEL;
    }
}

function updateEntryIcon(entry) {
    const icon = entry.querySelector('yt-icon');
    if (!icon) {
        return;
    }
    icon.innerHTML = '';
    icon.appendChild(createIcon({
        path: PLAYLIST_ICON_PATH,
        width: '24',
        height: '24',
        fill: 'currentColor'
    }));
}

function updateEntryData(entry) {
    const endpoint = resolvePlaylistEndpoint();
    if (!endpoint) {
        return;
    }
    const data = entry.data || entry.__data?.data || entry.__data;
    if (data && typeof data === 'object') {
        data.navigationEndpoint = endpoint;
        if (data.title) {
            if (Array.isArray(data.title.runs)) {
                data.title.runs = [{ text: ENTRY_LABEL }];
            } else {
                data.title.simpleText = ENTRY_LABEL;
            }
        }
        entry.data = data;
    }
}

function resolvePlaylistEndpoint() {
    const guideEndpoint = getGuidePlaylistEndpoint();
    if (guideEndpoint) {
        return guideEndpoint;
    }
    return {
        commandMetadata: {
            webCommandMetadata: {
                url: PLAYLIST_PATH,
                webPageType: 'WEB_PAGE_TYPE_BROWSE'
            }
        },
        browseEndpoint: {
            browseId: 'FEplaylists',
            canonicalBaseUrl: PLAYLIST_PATH
        }
    };
}

function getGuidePlaylistEndpoint() {
    const guideLink = document.querySelector('ytd-guide-entry-renderer a[href*="/feed/playlists"]');
    const guideEntry = guideLink?.closest('ytd-guide-entry-renderer');
    const data = guideEntry?.data || guideEntry?.__data?.data || guideEntry?.__data;
    if (data?.navigationEndpoint) {
        return data.navigationEndpoint;
    }
    return null;
}

function wireNavigation(link) {
    if (link.dataset.ytCommanderPlaylist) {
        return;
    }
    link.dataset.ytCommanderPlaylist = 'true';
    link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        navigateToPlaylists();
    });
}

function navigateToPlaylists() {
    const guideLink = document.querySelector('ytd-guide-entry-renderer a[href*="/feed/playlists"]');
    if (guideLink instanceof HTMLElement) {
        guideLink.click();
        return;
    }

    const app = document.querySelector('ytd-app');
    if (app && typeof app.navigate_ === 'function') {
        app.navigate_(PLAYLIST_PATH);
        return;
    }
    if (app && typeof app.navigateTo_ === 'function') {
        app.navigateTo_(PLAYLIST_PATH);
        return;
    }
    if (window.yt && typeof window.yt.navigate === 'function') {
        window.yt.navigate(PLAYLIST_PATH);
        return;
    }
    if (window.yt && typeof window.yt.navigateTo === 'function') {
        window.yt.navigateTo(PLAYLIST_PATH);
        return;
    }

    window.location.assign(PLAYLIST_PATH);
}
