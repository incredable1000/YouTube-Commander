// Subscription Labels Constants
export const LABEL_CLASS = 'yt-commander-subscription-label';
export const LABEL_KIND_ATTR = 'data-yt-commander-subscription-kind';
export const LABEL_KIND_SUBSCRIBED = 'subscribed';
export const HOST_CLASS = 'yt-commander-subscription-host';
export const CARD_SELECTOR = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer';
export const ROW_CLASS = 'yt-content-metadata-view-model__metadata-row';
export const METADATA_ROW_SELECTORS = [
    `.${ROW_CLASS}`,
    '.yt-content-metadata-view-model__metadata-row',
    '.yt-lockup-metadata-view-model__metadata-row',
    '.yt-lockup-metadata-view-model__metadata',
    '.shortsLockupViewModelHostOutsideMetadataSubhead',
    '.shortsLockupViewModelHostMetadataSubhead',
    '.shortsLockupViewModelHostInlineMetadata',
    '.shortsLockupViewModelHostOutsideMetadata'
];
export const SUBSCRIBE_PAGE_URL = 'https://www.youtube.com/feed/channels';
export const HOME_BROWSE_SELECTOR = 'ytd-browse[page-subtype="home"], ytd-browse[browse-id="FEwhat_to_watch"]';
export const MAX_CONTINUATION_PAGES = 500;
export const CONTINUATION_FETCH_DELAY_MS = 120;
export const CONTINUATION_RETRY_DELAY_MS = 4000;
export const BROWSE_SOURCE = 'browse';
export const SHORTS_CHANNEL_CACHE_KEY = 'ytCommanderShortsChannelCache';
export const SHORTS_CHANNEL_CACHE_LIMIT = 3000;
export const SHORTS_LOOKUP_CONCURRENCY = 3;
export const SHORTS_LOOKUP_FAIL_TTL_MS = 10 * 60 * 1000;
export const LOCAL_STORAGE_KEY = 'ytCommanderSubscribedChannelsCache';
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
