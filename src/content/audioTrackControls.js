/**
 * Audio Track Controls - Refactored with DRY principles
 * Enhanced audio track switching using YouTube's internal API (Main World)
 */

// Note: This runs in MAIN world to access YouTube's player API
// Cannot import ES modules here, so we'll use a simpler approach

// Set loading flag
window.ytCommanderAudioTracksLoading = true;

// YouTube Player API Manager
class YouTubeAudioTrackManager {
    constructor() {
        this.player = null;
        this.audioTracks = [];
        this.currentTrack = null;
        this.isInitialized = false;
        this.autoSwitchEnabled = true;
        this.hasAutoSwitched = false;
        this.observers = [];
        this.retryCount = 0;
        this.maxRetries = 30;
    }

    /**
     * Debug logging function
     */
    debugLog(message, data = null) {
        console.log(`[YT-Commander][AudioTracks] ${message}`, data || '');
    }

    /**
     * Initialize the manager
     */
    async initialize() {
        try {
            this.debugLog('Initializing Audio Track Manager');
            
            await this.findPlayer();
            await this.loadSettings();
            this.setupObservers();
            this.isInitialized = true;
            
            // Set loading complete
            this.setLoadingComplete();
            
            this.debugLog('Audio Track Manager initialized successfully');
            return true;
        } catch (error) {
            this.debugLog('Error initializing Audio Track Manager:', error);
            this.setLoadingComplete();
            return false;
        }
    }

    /**
     * Set loading complete flag
     */
    setLoadingComplete() {
        window.ytCommanderAudioTracksLoading = false;
        this.debugLog('Loading state set to complete');
    }

    /**
     * Find YouTube player
     */
    async findPlayer() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Player not found within timeout'));
            }, 10000);

            const checkPlayer = () => {
                const player = document.getElementById('movie_player') || 
                              document.querySelector('.html5-video-player');
                
                if (player && typeof player.getVideoData === 'function') {
                    this.player = player;
                    clearTimeout(timeout);
                    this.debugLog('Player found and ready');
                    resolve(player);
                } else {
                    setTimeout(checkPlayer, 200);
                }
            };

            checkPlayer();
        });
    }

    /**
     * Load settings from storage
     */
    async loadSettings() {
        try {
            // Since we're in main world, we'll use a simple approach
            this.autoSwitchEnabled = true; // Default setting
            this.debugLog('Settings loaded', { autoSwitchEnabled: this.autoSwitchEnabled });
        } catch (error) {
            this.debugLog('Failed to load settings:', error);
        }
    }

    /**
     * Analyze available audio tracks
     */
    async analyzeAudioTracks() {
        try {
            if (!this.player) {
                this.debugLog('No player available for audio track analysis');
                return [];
            }

            // Wait for video metadata to be ready
            const video = this.player.querySelector('video');
            if (!video || !video.duration || video.readyState < 1) {
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    this.debugLog(`Video not ready, retrying... (${this.retryCount}/${this.maxRetries})`);
                    
                    return new Promise((resolve) => {
                        setTimeout(async () => {
                            const tracks = await this.analyzeAudioTracks();
                            resolve(tracks);
                        }, 500);
                    });
                } else {
                    this.debugLog('Max retries reached, giving up on audio track analysis');
                    return [];
                }
            }

            this.retryCount = 0; // Reset retry count on success

            // Try to get audio tracks from HTML5 video element
            const audioTracks = video.audioTracks;
            const tracks = [];

            if (audioTracks && audioTracks.length > 0) {
                for (let i = 0; i < audioTracks.length; i++) {
                    const track = audioTracks[i];
                    tracks.push({
                        id: track.id || i.toString(),
                        label: track.label || `Track ${i + 1}`,
                        language: track.language || 'unknown',
                        enabled: track.enabled,
                        kind: track.kind || 'main'
                    });
                }
                
                this.debugLog('Audio tracks found:', tracks);
            } else {
                this.debugLog('No audio tracks available');
            }

            this.audioTracks = tracks;
            return tracks;
        } catch (error) {
            this.debugLog('Error analyzing audio tracks:', error);
            return [];
        }
    }

    /**
     * Switch to specific audio track
     */
    switchToTrack(trackId) {
        try {
            if (!this.player) {
                this.debugLog('No player available for track switching');
                return false;
            }

            const video = this.player.querySelector('video');
            if (!video || !video.audioTracks) {
                this.debugLog('No audio tracks available for switching');
                return false;
            }

            const audioTracks = video.audioTracks;
            let switched = false;

            // Disable all tracks first
            for (let i = 0; i < audioTracks.length; i++) {
                audioTracks[i].enabled = false;
            }

            // Enable the selected track
            for (let i = 0; i < audioTracks.length; i++) {
                const track = audioTracks[i];
                if ((track.id || i.toString()) === trackId) {
                    track.enabled = true;
                    this.currentTrack = trackId;
                    switched = true;
                    this.debugLog(`Switched to audio track: ${track.label || trackId}`);
                    break;
                }
            }

            if (!switched) {
                this.debugLog(`Audio track not found: ${trackId}`);
            }

            return switched;
        } catch (error) {
            this.debugLog('Error switching audio track:', error);
            return false;
        }
    }

    /**
     * Auto-switch to original language if available
     */
    async autoSwitchToOriginal() {
        try {
            if (!this.autoSwitchEnabled || this.hasAutoSwitched) {
                return;
            }

            const tracks = await this.analyzeAudioTracks();
            if (tracks.length <= 1) {
                return; // No need to switch if only one track
            }

            // Look for original language track (usually first or marked as 'main')
            const originalTrack = tracks.find(track => 
                track.kind === 'main' || 
                track.language === 'original' ||
                track.label.toLowerCase().includes('original')
            ) || tracks[0]; // Fallback to first track

            if (originalTrack && originalTrack.id !== this.currentTrack) {
                const success = this.switchToTrack(originalTrack.id);
                if (success) {
                    this.hasAutoSwitched = true;
                    this.debugLog('Auto-switched to original audio track');
                }
            }
        } catch (error) {
            this.debugLog('Error in auto-switch:', error);
        }
    }

    /**
     * Set up observers for video changes
     */
    setupObservers() {
        // Watch for video changes
        const observer = new MutationObserver(() => {
            // Reset auto-switch flag on video change
            this.hasAutoSwitched = false;
            
            // Analyze tracks after a delay
            setTimeout(() => {
                this.autoSwitchToOriginal();
            }, 2000);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(observer);
        this.debugLog('Observers set up');
    }

    /**
     * Check if manager is initialized
     */
    isReady() {
        return this.isInitialized && this.player !== null;
    }

    /**
     * Get current track info
     */
    getCurrentTrack() {
        return this.currentTrack;
    }

    /**
     * Get all available tracks
     */
    getAvailableTracks() {
        return this.audioTracks;
    }

    /**
     * Cleanup
     */
    cleanup() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
        this.isInitialized = false;
        this.debugLog('Audio Track Manager cleaned up');
    }
}

// Global instance
let audioTrackManager = null;

/**
 * Initialize audio track controls
 */
async function initAudioTrackControls() {
    try {
        if (audioTrackManager) {
            return audioTrackManager;
        }

        audioTrackManager = new YouTubeAudioTrackManager();
        await audioTrackManager.initialize();
        
        // Initial auto-switch attempt
        setTimeout(() => {
            audioTrackManager.autoSwitchToOriginal();
        }, 3000);

        return audioTrackManager;
    } catch (error) {
        console.error('[YT-Commander] Failed to initialize audio track controls:', error);
        window.ytCommanderAudioTracksLoading = false;
        return null;
    }
}

/**
 * Handle page navigation
 */
function handleNavigation() {
    let lastUrl = location.href;
    
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            
            // Reinitialize on video page navigation
            if (location.pathname.includes('/watch')) {
                setTimeout(() => {
                    if (audioTrackManager) {
                        audioTrackManager.hasAutoSwitched = false;
                        audioTrackManager.autoSwitchToOriginal();
                    }
                }, 2000);
            }
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Global API for external access
window.ytCommanderAudioTracks = {
    getManager: () => audioTrackManager,
    isLoading: () => window.ytCommanderAudioTracksLoading,
    isInitialized: () => audioTrackManager?.isReady() || false,
    switchToTrack: (trackId) => audioTrackManager?.switchToTrack(trackId),
    getAvailableTracks: () => audioTrackManager?.getAvailableTracks() || [],
    getCurrentTrack: () => audioTrackManager?.getCurrentTrack(),
    init: initAudioTrackControls
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAudioTrackControls();
        handleNavigation();
    });
} else {
    initAudioTrackControls();
    handleNavigation();
}
