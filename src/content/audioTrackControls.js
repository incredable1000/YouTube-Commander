/**
 * Audio Track Controls
 * Main-world bootstrap for auto-switching to original audio tracks.
 */

import { YouTubeAudioTrackManager, logger } from './audio-track-controls/manager.js';

window.ytCommanderAudioTracksLoading = true;

let audioTrackManager = null;

async function initAudioTrackControls() {
    try {
        if (audioTrackManager) {
            return audioTrackManager;
        }

        audioTrackManager = new YouTubeAudioTrackManager();
        await audioTrackManager.initialize();
        return audioTrackManager;
    } catch (error) {
        logger.error('Initialization error', error);
        window.ytCommanderAudioTracksLoading = false;
        return null;
    }
}

function handleNavigation() {
    if (audioTrackManager) {
        audioTrackManager.handlePossibleContextChange('yt-navigate', { force: true });
    }
}

window.ytCommanderAudioTracks = {
    getManager: () => audioTrackManager,
    isLoading: () => window.ytCommanderAudioTracksLoading,
    isInitialized: () => audioTrackManager?.isReady() || false,
    switchToTrack: (trackId) => audioTrackManager?.switchToTrack(trackId),
    getAvailableTracks: () => audioTrackManager?.getAvailableTracks() || [],
    getCurrentTrack: () => audioTrackManager?.getCurrentTrack(),
    analyzeTracks: async () => {
        if (!audioTrackManager) {
            return [];
        }

        const previousVerbose = audioTrackManager.verboseLogging;
        audioTrackManager.verboseLogging = true;
        const result = await audioTrackManager.analyzeAudioTracks();
        audioTrackManager.verboseLogging = previousVerbose;
        return result;
    },
    testAutoSwitch: async () => {
        if (!audioTrackManager) {
            return false;
        }

        const previousVerbose = audioTrackManager.verboseLogging;
        audioTrackManager.verboseLogging = true;
        audioTrackManager.hasAutoSwitched = false;
        const result = await audioTrackManager.autoSwitchToOriginal('manual-test');
        audioTrackManager.verboseLogging = previousVerbose;
        return result;
    },
    enableVerboseLogging: () => {
        if (audioTrackManager) {
            audioTrackManager.verboseLogging = true;
        }
    },
    disableVerboseLogging: () => {
        if (audioTrackManager) {
            audioTrackManager.verboseLogging = false;
        }
    },
    enableAutoSwitch: () => {
        if (audioTrackManager) {
            audioTrackManager.autoSwitchEnabled = true;
            audioTrackManager.queueAutoSwitch('fallback');
        }
    },
    disableAutoSwitch: () => {
        if (audioTrackManager) {
            audioTrackManager.autoSwitchEnabled = false;
            audioTrackManager.cancelPendingWork();
        }
    },
    init: initAudioTrackControls
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAudioTrackControls().catch((error) => {
            logger.error('Failed during DOMContentLoaded', error);
        });
        handleNavigation();
    });
} else {
    initAudioTrackControls().catch((error) => {
        logger.error('Failed to initialize', error);
    });
    handleNavigation();
}

export {
    initAudioTrackControls
};
