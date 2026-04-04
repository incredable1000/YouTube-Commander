// Shorts Counter Auto-Advance Module
import { advanceToNextShort } from './pageContext.js';

export function createAutoAdvanceController(config) {
    const {
        getAutoAdvanceEnabled,
        setAutoAdvanceEnabled,
        isShortsWatchPage,
        getCurrentShortsId,
        getActiveShortsVideoElement,
        scheduleContextCheck,
        logger,
        AUTO_SCROLL_END_THRESHOLD_S,
        AUTO_SCROLL_LOOP_RESTART_THRESHOLD_S,
        AUTO_SCROLL_RETRY_MS,
        AUTO_SCROLL_MAX_RETRIES
    } = config;

    let autoAdvanceBinding = null;
    let autoAdvanceAttempt = null;

    function clearAutoAdvanceBinding() {
        if (!autoAdvanceBinding) {
            return;
        }
        autoAdvanceBinding.video.removeEventListener('ended', autoAdvanceBinding.onEnded);
        autoAdvanceBinding.video.removeEventListener('timeupdate', autoAdvanceBinding.onTimeUpdate);
        autoAdvanceBinding.video.removeEventListener('seeking', autoAdvanceBinding.onSeeking);
        autoAdvanceBinding.video.removeEventListener('seeked', autoAdvanceBinding.onSeeked);
        autoAdvanceBinding = null;
    }

    function clearAutoAdvanceAttempt() {
        if (!autoAdvanceAttempt) {
            return;
        }
        if (autoAdvanceAttempt.timerId) {
            window.clearTimeout(autoAdvanceAttempt.timerId);
        }
        autoAdvanceAttempt = null;
    }

    function triggerAutoAdvance(reason, options = {}) {
        if (!getAutoAdvanceEnabled() || !isShortsWatchPage()) {
            return false;
        }

        const currentShortId = getCurrentShortsId();
        if (!currentShortId) {
            return false;
        }

        const expectedShortId = options.expectedShortId || currentShortId;
        if (expectedShortId !== currentShortId) {
            return false;
        }

        if (autoAdvanceAttempt && autoAdvanceAttempt.shortId === currentShortId) {
            return false;
        }

        if (options.sourceVideo instanceof HTMLVideoElement) {
            const activeVideo = getActiveShortsVideoElement();
            if (activeVideo && activeVideo !== options.sourceVideo) {
                return false;
            }
        }

        const attempt = {
            shortId: currentShortId,
            expectedShortId,
            sourceVideo: options.sourceVideo || null,
            retries: 0,
            timerId: null,
            reason
        };
        autoAdvanceAttempt = attempt;

        const scheduleRetry = () => {
            if (!autoAdvanceAttempt || autoAdvanceAttempt.shortId !== attempt.shortId) {
                return;
            }
            if (attempt.retries >= AUTO_SCROLL_MAX_RETRIES) {
                clearAutoAdvanceAttempt();
                return;
            }
            attempt.timerId = window.setTimeout(() => {
                if (!getAutoAdvanceEnabled() || !isShortsWatchPage()) {
                    clearAutoAdvanceAttempt();
                    return;
                }
                if (getCurrentShortsId() !== attempt.shortId) {
                    clearAutoAdvanceAttempt();
                    return;
                }
                attempt.retries += 1;
                runAttempt(true);
            }, AUTO_SCROLL_RETRY_MS);
        };

        const runAttempt = (isRetry = false) => {
            if (!getAutoAdvanceEnabled() || !isShortsWatchPage()) {
                clearAutoAdvanceAttempt();
                return;
            }
            const activeShortId = getCurrentShortsId();
            if (!activeShortId || activeShortId !== attempt.shortId) {
                clearAutoAdvanceAttempt();
                return;
            }
            if (attempt.expectedShortId && attempt.expectedShortId !== activeShortId) {
                clearAutoAdvanceAttempt();
                return;
            }
            if (attempt.sourceVideo instanceof HTMLVideoElement) {
                const activeVideo = getActiveShortsVideoElement();
                if (activeVideo && activeVideo !== attempt.sourceVideo) {
                    clearAutoAdvanceAttempt();
                    return;
                }
            }

            const advanced = advanceToNextShort();
            if (advanced) {
                logger.debug('Auto-advanced to next short', {
                    shortId: attempt.shortId,
                    reason,
                    retry: isRetry
                });
                scheduleContextCheck();
            }
            scheduleRetry();
        };

        runAttempt(false);
        return true;
    }

    function bindAutoAdvanceHandler(video, shortId) {
        if (!(video instanceof HTMLVideoElement) || !shortId || !getAutoAdvanceEnabled()) {
            return;
        }

        if (autoAdvanceBinding && autoAdvanceBinding.video === video && autoAdvanceBinding.shortId === shortId) {
            return;
        }

        clearAutoAdvanceBinding();
        let lastPlaybackTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        let pendingSeekToEnd = false;

        const onEnded = () => {
            triggerAutoAdvance('ended', { expectedShortId: shortId, sourceVideo: video });
        };

        const onTimeUpdate = () => {
            const currentTime = video.currentTime;
            if (!getAutoAdvanceEnabled() || !isShortsWatchPage()) {
                lastPlaybackTime = currentTime;
                return;
            }

            const activeVideo = getActiveShortsVideoElement();
            if (activeVideo && activeVideo !== video) {
                lastPlaybackTime = currentTime;
                return;
            }

            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                lastPlaybackTime = currentTime;
                return;
            }

            if (video.seeking) {
                lastPlaybackTime = currentTime;
                return;
            }

            const endThreshold = Math.min(1, Math.max(AUTO_SCROLL_END_THRESHOLD_S, video.duration * 0.04));
            const loopThreshold = Math.min(0.8, Math.max(AUTO_SCROLL_LOOP_RESTART_THRESHOLD_S, video.duration * 0.04));
            const endWindow = Math.min(1.5, endThreshold * 1.6);
            const remaining = video.duration - currentTime;
            const isNearEnd = !video.paused && remaining <= endThreshold;
            const jumpedBack = lastPlaybackTime > (currentTime + 0.15);
            const wasNearEnd = lastPlaybackTime >= (video.duration - endWindow);
            const loopRestarted = jumpedBack && wasNearEnd && currentTime <= loopThreshold;

            if (isNearEnd || loopRestarted) {
                triggerAutoAdvance(isNearEnd ? 'near-end' : 'loop-restart', {
                    expectedShortId: shortId,
                    sourceVideo: video
                });
            }

            lastPlaybackTime = currentTime;
        };

        const onSeeking = () => {
            pendingSeekToEnd = false;
            if (!getAutoAdvanceEnabled() || !isShortsWatchPage()) {
                return;
            }
            if (!Number.isFinite(video.duration) || video.duration <= 0) {
                return;
            }

            if (video.currentTime >= video.duration - 0.5) {
                pendingSeekToEnd = true;
            }
        };

        const onSeeked = () => {
            if (!getAutoAdvanceEnabled() || !isShortsWatchPage()) {
                return;
            }
            if (pendingSeekToEnd && Number.isFinite(video.duration) && video.duration > 0) {
                if (video.currentTime >= video.duration - 0.5) {
                    triggerAutoAdvance('seeked-to-end', {
                        expectedShortId: shortId,
                        sourceVideo: video
                    });
                }
            }
            pendingSeekToEnd = false;
        };

        video.addEventListener('ended', onEnded);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('seeking', onSeeking);
        video.addEventListener('seeked', onSeeked);

        autoAdvanceBinding = { video, shortId, onEnded, onTimeUpdate, onSeeking, onSeeked };
    }

    function cleanup() {
        clearAutoAdvanceBinding();
        clearAutoAdvanceAttempt();
    }

    return { bindAutoAdvanceHandler, clearAutoAdvanceBinding, clearAutoAdvanceAttempt, triggerAutoAdvance, cleanup };
}
