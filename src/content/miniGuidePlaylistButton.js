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

const PLAYLIST_ICON_PATH = 'M3 10h8v2H3v-2zm0-4h12v2H3V6zm0 8h8v2H3v-2zm10-2v-4l5 4-5 4v-4z';

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

    if (miniGuide.querySelector(`#${ENTRY_ID}`)) {
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

    const link = entry.querySelector('a');
    if (!link) {
        return null;
    }

    link.href = PLAYLIST_PATH;
    link.title = ENTRY_LABEL;
    link.setAttribute('aria-label', ENTRY_LABEL);

    const labelNode = entry.querySelector('.title, #text, yt-formatted-string, span');
    if (labelNode) {
        labelNode.textContent = ENTRY_LABEL;
    }

    const icon = entry.querySelector('yt-icon');
    if (icon) {
        icon.innerHTML = '';
        icon.appendChild(createIcon({
            path: PLAYLIST_ICON_PATH,
            width: '24',
            height: '24',
            fill: 'currentColor'
        }));
    }

    return entry;
}
