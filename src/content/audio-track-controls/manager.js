/**
 * Audio track manager runtime.
 */

import { createLogger } from '../utils/logger.js';
import { isShortsPage, isVideoPage } from '../utils/youtube.js';
import { AUDIO_MESSAGE_TYPES, AUTO_SWITCH_DELAYS, RETRY_DELAYS_MS } from './constants.js';
import { normalizeTrack, pickPreferredTrack } from './trackUtils.js';

const logger = createLogger('AudioTracks');

/**
 * Main manager for tracking and switching YouTube audio tracks.
 */
class YouTubeAudioTrackManager {
    constructor() {
        this.player = null;
        this.audioTracks = [];
        this.currentTrackId = null;
        this.currentVideoKey = null;
        this.lastKnownUrl = location.href;
        this.autoSwitchEnabled = true;
        this.hasAutoSwitched = false;
        this.isInitialized = false;
        this.verboseLogging = false;

        this.observers = [];
        this.pendingAutoSwitchTimer = null;
        this.retryTimer = null;
        this.retryAttempt = 0;
        this.retrySessionId = 0;
    }

    debugLog(message, data = null) {
        if (!this.verboseLogging) {
            return;
        }
        logger.debug(message, data ?? '');
    }

    markLoadingComplete() {
        window.ytCommanderAudioTracksLoading = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        try {
            this.setupSettingsBridge();
            this.setupObservers();
            this.currentVideoKey = this.buildVideoKey();
            this.queueAutoSwitch('initial');
            this.isInitialized = true;
            this.markLoadingComplete();
            return true;
        } catch (error) {
            logger.error('Failed to initialize', error);
            this.markLoadingComplete();
            return false;
        }
    }

    setupSettingsBridge() {
        this.handleSettingsMessage = (event) => {
            if (event.source !== window || !event.data) {
                return;
            }

            if (event.data.type !== AUDIO_MESSAGE_TYPES.SETTINGS_UPDATED) {
                return;
            }

            if (typeof event.data.enabled === 'boolean') {
                this.autoSwitchEnabled = event.data.enabled;
                if (!this.autoSwitchEnabled) {
                    this.cancelPendingWork();
                    return;
                }

                this.queueAutoSwitch('fallback');
            }
        };

        window.addEventListener('message', this.handleSettingsMessage);
    }

    getPlayer() {
        return document.getElementById('movie_player')
            || document.querySelector('.html5-video-player');
    }

    refreshPlayerReference() {
        const player = this.getPlayer();
        if (player && player !== this.player) {
            this.player = player;
            this.debugLog('Player reference refreshed');
        }
        return this.player;
    }

    getVideoElement() {
        const player = this.refreshPlayerReference();
        if (player) {
            const scopedVideo = player.querySelector('video.html5-main-video, video');
            if (scopedVideo) {
                return scopedVideo;
            }
        }

        return document.querySelector('video.html5-main-video, video');
    }

    extractVideoId(url = location.href) {
        try {
            const urlObj = new URL(url);

            if (urlObj.pathname === '/watch') {
                return urlObj.searchParams.get('v');
            }

            if (urlObj.pathname.startsWith('/shorts/')) {
                const id = urlObj.pathname.split('/shorts/')[1] || '';
                return id.split('/')[0] || null;
            }
        } catch (_error) {
            return null;
        }

        return null;
    }

    buildVideoKey() {
        const videoId = this.extractVideoId();
        if (videoId) {
            return videoId;
        }

        const video = this.getVideoElement();
        if (video?.currentSrc) {
            return `${location.pathname}|${video.currentSrc}`;
        }

        return location.pathname;
    }

    isShortsPage() {
        return isShortsPage();
    }

    isValidPage() {
        return isVideoPage() || this.isShortsPage();
    }

    async analyzeAudioTracks() {
        try {
            if (!this.isValidPage()) {
                this.audioTracks = [];
                return [];
            }

            const player = this.refreshPlayerReference();
            if (!player || typeof player.getAvailableAudioTracks !== 'function') {
                this.audioTracks = [];
                return [];
            }

            let currentTrackId = null;
            if (typeof player.getAudioTrack === 'function') {
                try {
                    const current = player.getAudioTrack();
                    currentTrackId = current?.id || null;
                } catch (_error) {
                    currentTrackId = null;
                }
            }

            const availableTracks = player.getAvailableAudioTracks() || [];
            const normalizedTracks = availableTracks.map((track, index) =>
                normalizeTrack(track, index, currentTrackId)
            );

            this.audioTracks = normalizedTracks;
            this.currentTrackId = currentTrackId;
            return normalizedTracks;
        } catch (error) {
            this.debugLog('Error analyzing tracks', error);
            this.audioTracks = [];
            return [];
        }
    }

    switchToTrack(trackId) {
        try {
            if (!this.isValidPage()) {
                return false;
            }

            const player = this.refreshPlayerReference();
            if (!player) {
                return false;
            }

            if (typeof player.setAudioTrack === 'function' && typeof player.getAvailableAudioTracks === 'function') {
                const availableTracks = player.getAvailableAudioTracks() || [];
                const targetTrack = availableTracks.find((track) => track.id === trackId);
                if (!targetTrack) {
                    return false;
                }

                player.setAudioTrack(targetTrack);
                this.currentTrackId = trackId;
                return true;
            }

            const video = this.getVideoElement();
            if (video?.audioTracks?.length > 0) {
                let switched = false;
                for (let i = 0; i < video.audioTracks.length; i += 1) {
                    const track = video.audioTracks[i];
                    const isTarget = (track.id || String(i)) === trackId;
                    track.enabled = isTarget;
                    if (isTarget) {
                        switched = true;
                    }
                }

                if (switched) {
                    this.currentTrackId = trackId;
                }

                return switched;
            }
        } catch (error) {
            this.debugLog('Failed to switch track', error);
        }

        return false;
    }

    verifyCurrentTrack(targetTrackId) {
        const player = this.refreshPlayerReference();
        if (!player) {
            return false;
        }

        if (typeof player.getAudioTrack !== 'function') {
            return true;
        }

        try {
            const currentTrack = player.getAudioTrack();
            if (!currentTrack?.id) {
                return true;
            }
            return currentTrack.id === targetTrackId;
        } catch (_error) {
            return true;
        }
    }

    async runAutoSwitchAttempt(reason) {
        try {
            if (!this.autoSwitchEnabled || !this.isValidPage()) {
                return 'no-op';
            }

            const currentVideoKey = this.buildVideoKey();
            if (currentVideoKey && currentVideoKey !== this.currentVideoKey) {
                this.currentVideoKey = currentVideoKey;
                this.hasAutoSwitched = false;
            }

            if (this.hasAutoSwitched) {
                return 'no-op';
            }

            const player = this.refreshPlayerReference();
            if (!player) {
                return 'retry';
            }

            const video = this.getVideoElement();
            if (!video || video.readyState < 1) {
                return 'retry';
            }

            const tracks = await this.analyzeAudioTracks();
            if (!tracks.length) {
                return 'retry';
            }

            if (tracks.length === 1) {
                this.hasAutoSwitched = true;
                this.currentTrackId = tracks[0].id;
                return 'no-op';
            }

            const currentTrack = tracks.find((track) => track.enabled) || null;
            const targetTrack = pickPreferredTrack(tracks);

            if (!targetTrack) {
                this.hasAutoSwitched = true;
                return 'no-op';
            }

            if (currentTrack && currentTrack.id === targetTrack.id) {
                this.hasAutoSwitched = true;
                this.currentTrackId = currentTrack.id;
                return 'no-op';
            }

            const switched = this.switchToTrack(targetTrack.id);
            if (!switched) {
                return 'retry';
            }

            if (!this.verifyCurrentTrack(targetTrack.id)) {
                return 'retry';
            }

            this.hasAutoSwitched = true;
            this.currentTrackId = targetTrack.id;
            this.debugLog(`Auto-switched (${reason})`, {
                track: targetTrack.label,
                videoKey: this.currentVideoKey
            });
            return 'success';
        } catch (error) {
            this.debugLog('Auto-switch attempt failed', { reason, error });
            return 'retry';
        }
    }

    async runAutoSwitchAttemptWithRetry(reason, sessionId) {
        if (sessionId !== this.retrySessionId) {
            return;
        }

        const result = await this.runAutoSwitchAttempt(reason);
        if (sessionId !== this.retrySessionId) {
            return;
        }

        if (result !== 'retry') {
            return;
        }

        if (this.retryAttempt >= RETRY_DELAYS_MS.length) {
            this.debugLog('Retry budget exhausted', { reason, videoKey: this.currentVideoKey });
            return;
        }

        const delay = RETRY_DELAYS_MS[this.retryAttempt];
        this.retryAttempt += 1;
        this.retryTimer = window.setTimeout(() => {
            this.runAutoSwitchAttemptWithRetry(reason, sessionId);
        }, delay);
    }

    startRetryPipeline(reason) {
        if (!this.autoSwitchEnabled || !this.isValidPage()) {
            return;
        }

        if (this.pendingAutoSwitchTimer) {
            window.clearTimeout(this.pendingAutoSwitchTimer);
            this.pendingAutoSwitchTimer = null;
        }

        if (this.retryTimer) {
            window.clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        this.retryAttempt = 0;
        this.retrySessionId += 1;
        const sessionId = this.retrySessionId;
        this.runAutoSwitchAttemptWithRetry(reason, sessionId);
    }

    queueAutoSwitch(reason) {
        if (!this.autoSwitchEnabled || !this.isValidPage()) {
            return;
        }

        const delay = AUTO_SWITCH_DELAYS[reason] ?? AUTO_SWITCH_DELAYS.fallback;
        if (this.pendingAutoSwitchTimer) {
            window.clearTimeout(this.pendingAutoSwitchTimer);
        }

        this.pendingAutoSwitchTimer = window.setTimeout(() => {
            this.pendingAutoSwitchTimer = null;
            this.startRetryPipeline(reason);
        }, delay);
    }

    scheduleAutoSwitch(reason) {
        this.queueAutoSwitch(reason);
    }

    resetForNewVideo(videoKey) {
        this.currentVideoKey = videoKey;
        this.hasAutoSwitched = false;
        this.retryAttempt = 0;
        this.cancelPendingWork();
    }

    handlePossibleContextChange(reason, options = {}) {
        const { force = false } = options;

        if (!this.isValidPage()) {
            this.lastKnownUrl = location.href;
            this.currentVideoKey = null;
            this.hasAutoSwitched = false;
            this.cancelPendingWork();
            return;
        }

        const currentUrl = location.href;
        const nextVideoKey = this.buildVideoKey();
        const urlChanged = currentUrl !== this.lastKnownUrl;
        const videoChanged = force || nextVideoKey !== this.currentVideoKey;

        if (urlChanged) {
            this.lastKnownUrl = currentUrl;
        }

        if (videoChanged) {
            this.resetForNewVideo(nextVideoKey);
            this.queueAutoSwitch('video-context-change');
            return;
        }

        if (!this.hasAutoSwitched) {
            this.queueAutoSwitch(reason);
        }
    }

    setupObservers() {
        this.setupNavigationObservers();
        this.setupShortsObserver();
        this.setupVideoLifecycleObservers();
        this.setupFocusObservers();
    }

    setupNavigationObservers() {
        this.handleYtNavigateFinish = () => {
            this.handlePossibleContextChange('yt-navigate', { force: true });
        };
        document.addEventListener('yt-navigate-finish', this.handleYtNavigateFinish);

        this.handleYtPageDataUpdated = () => {
            this.handlePossibleContextChange('yt-navigate');
        };
        document.addEventListener('yt-page-data-updated', this.handleYtPageDataUpdated);

        this.handlePopState = () => {
            this.handlePossibleContextChange('yt-navigate', { force: true });
        };
        window.addEventListener('popstate', this.handlePopState);

        let mutationQueued = false;
        const navigationObserver = new MutationObserver(() => {
            if (mutationQueued) {
                return;
            }

            mutationQueued = true;
            window.setTimeout(() => {
                mutationQueued = false;
                this.handlePossibleContextChange('yt-navigate');
            }, 100);
        });

        navigationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(navigationObserver);
    }

    setupShortsObserver() {
        const shortsObserver = new MutationObserver((mutations) => {
            if (!this.isShortsPage()) {
                return;
            }

            const hasActiveShortChange = mutations.some((mutation) => {
                if (mutation.type === 'attributes') {
                    return mutation.attributeName === 'is-active';
                }

                return mutation.type === 'childList'
                    && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
            });

            if (hasActiveShortChange) {
                this.handlePossibleContextChange('shorts-scroll', { force: true });
            }
        });

        shortsObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['is-active']
        });

        this.observers.push(shortsObserver);
    }

    setupVideoLifecycleObservers() {
        this.handleVideoPlay = (event) => {
            if (!event?.target || event.target.nodeName !== 'VIDEO') {
                return;
            }
            this.handlePossibleContextChange('play');
        };
        document.addEventListener('play', this.handleVideoPlay, true);

        this.handleLoadedMetadata = (event) => {
            if (!event?.target || event.target.nodeName !== 'VIDEO') {
                return;
            }
            this.handlePossibleContextChange('loadedmetadata');
        };
        document.addEventListener('loadedmetadata', this.handleLoadedMetadata, true);

        this.handleCanPlay = (event) => {
            if (!event?.target || event.target.nodeName !== 'VIDEO') {
                return;
            }
            this.handlePossibleContextChange('canplay');
        };
        document.addEventListener('canplay', this.handleCanPlay, true);
    }

    setupFocusObservers() {
        this.handleWindowFocus = () => {
            this.handlePossibleContextChange('focus');
        };
        window.addEventListener('focus', this.handleWindowFocus);

        this.handleVisibilityChange = () => {
            if (!document.hidden) {
                this.handlePossibleContextChange('visibility');
            }
        };
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        this.handlePageShow = () => {
            this.handlePossibleContextChange('initial', { force: true });
        };
        window.addEventListener('pageshow', this.handlePageShow);
    }

    cancelPendingWork() {
        if (this.pendingAutoSwitchTimer) {
            window.clearTimeout(this.pendingAutoSwitchTimer);
            this.pendingAutoSwitchTimer = null;
        }

        if (this.retryTimer) {
            window.clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        this.retrySessionId += 1;
    }

    async autoSwitchToOriginal(reason = 'manual') {
        const result = await this.runAutoSwitchAttempt(reason);
        if (result === 'retry') {
            this.startRetryPipeline(reason);
            return false;
        }

        return result === 'success' || result === 'no-op';
    }

    isReady() {
        return this.isInitialized;
    }

    getCurrentTrack() {
        return this.currentTrackId;
    }

    getAvailableTracks() {
        return this.audioTracks;
    }

    cleanup() {
        this.cancelPendingWork();

        this.observers.forEach((observer) => observer.disconnect());
        this.observers = [];

        document.removeEventListener('yt-navigate-finish', this.handleYtNavigateFinish);
        document.removeEventListener('yt-page-data-updated', this.handleYtPageDataUpdated);
        window.removeEventListener('popstate', this.handlePopState);

        document.removeEventListener('play', this.handleVideoPlay, true);
        document.removeEventListener('loadedmetadata', this.handleLoadedMetadata, true);
        document.removeEventListener('canplay', this.handleCanPlay, true);

        window.removeEventListener('focus', this.handleWindowFocus);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('pageshow', this.handlePageShow);

        window.removeEventListener('message', this.handleSettingsMessage);

        this.isInitialized = false;
    }
}

export {
    YouTubeAudioTrackManager,
    logger
};
