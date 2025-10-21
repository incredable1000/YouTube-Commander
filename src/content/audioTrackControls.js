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
        this.verboseLogging = false; // Disable verbose logging by default
        this.lastAutoSwitchAttempt = 0;
        this.autoSwitchCooldown = 5000; // 5 second cooldown between attempts
    }

    /**
     * Debug logging function
     */
    debugLog(message, data = null) {
        // Only log if verbose mode is enabled or it's an important message
        if (this.verboseLogging || message.includes('ERROR') || message.includes('✅') || message.includes('❌')) {
            console.log(`[YT-Commander][AudioTracks] ${message}`, data || '');
        }
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
     * Decode YouTube track ID to extract language and type information
     */
    decodeTrackId(trackId) {
        try {
            if (!trackId || typeof trackId !== 'string') {
                return { language: null, type: null, isOriginal: false };
            }

            // Track ID format: "251;base64encodeddata"
            const parts = trackId.split(';');
            if (parts.length < 2) {
                return { language: null, type: null, isOriginal: false };
            }

            const base64Part = parts[1];
            
            // Decode base64
            let decoded = '';
            try {
                decoded = atob(base64Part);
            } catch (e) {
                this.debugLog('Failed to decode base64 part:', e);
                return { language: null, type: null, isOriginal: false };
            }

            this.debugLog('Decoded track data:', { trackId, decoded, bytes: Array.from(decoded).map(c => c.charCodeAt(0)) });

            // Look for language patterns in the decoded data
            let language = null;
            let type = null;
            let isOriginal = false;

            // Check for "original" in the decoded data
            if (decoded.includes('original')) {
                isOriginal = true;
                type = 'original';
            } else if (decoded.includes('dubbed-auto')) {
                type = 'dubbed-auto';
            }

            // Extract language codes (common patterns)
            const langPatterns = [
                /lang..(en-US)/,
                /lang..(fr-FR)/,
                /lang..(de-DE)/,
                /lang..(es-US)/,
                /lang..(pt-BR)/,
                /lang..([a-z]{2})/,  // Two letter codes like 'hi', 'ja', 'it'
            ];

            for (const pattern of langPatterns) {
                const match = decoded.match(pattern);
                if (match) {
                    language = match[1];
                    break;
                }
            }

            this.debugLog('Decoded track info:', { language, type, isOriginal, trackId });

            return { language, type, isOriginal };
        } catch (error) {
            this.debugLog('Error decoding track ID:', error);
            return { language: null, type: null, isOriginal: false };
        }
    }

    /**
     * Analyze available audio tracks
     */
    async analyzeAudioTracks() {
        try {
            const tracks = [];
            
            // Only analyze on valid pages (/watch or /shorts)
            if (!this.isValidPage()) {
                this.debugLog('Skipping track analysis - not on valid page (watch/shorts)');
                return tracks;
            }
            
            if (!this.player) {
                this.debugLog('No player available for track analysis');
                return tracks;
            }

            this.debugLog('=== DETAILED VIDEO ELEMENT INVESTIGATION ===');
            
            // Check multiple video element selectors
            const videoSelectors = [
                'video',
                '.html5-main-video',
                'video.html5-main-video',
                '.video-stream',
                'video.video-stream'
            ];
            
            let video = null;
            for (const selector of videoSelectors) {
                const foundVideo = this.player.querySelector(selector);
                if (foundVideo) {
                    this.debugLog(`Found video element with selector: ${selector}`);
                    this.debugLog('Video element properties:', {
                        tagName: foundVideo.tagName,
                        className: foundVideo.className,
                        id: foundVideo.id,
                        src: foundVideo.src,
                        currentSrc: foundVideo.currentSrc,
                        readyState: foundVideo.readyState,
                        duration: foundVideo.duration,
                        hasAudioTracks: !!foundVideo.audioTracks,
                        audioTracksLength: foundVideo.audioTracks?.length || 0,
                        audioTracksType: typeof foundVideo.audioTracks,
                        videoWidth: foundVideo.videoWidth,
                        videoHeight: foundVideo.videoHeight
                    });
                    
                    if (!video) video = foundVideo; // Use first found video
                }
            }
            
            if (!video) {
                this.debugLog('No video element found with any selector');
                return tracks;
            }

            // Check YouTube's internal player API for audio tracks
            this.debugLog('=== YOUTUBE PLAYER API INVESTIGATION ===');
            
            // Check if player has getAvailableAudioTracks method
            if (typeof this.player.getAvailableAudioTracks === 'function') {
                try {
                    const ytAudioTracks = this.player.getAvailableAudioTracks();
                    this.debugLog('YouTube getAvailableAudioTracks():', ytAudioTracks);
                } catch (e) {
                    this.debugLog('Error calling getAvailableAudioTracks():', e);
                }
            }
            
            // Check if player has getAudioTrack method
            if (typeof this.player.getAudioTrack === 'function') {
                try {
                    const currentAudioTrack = this.player.getAudioTrack();
                    this.debugLog('YouTube getAudioTrack():', currentAudioTrack);
                } catch (e) {
                    this.debugLog('Error calling getAudioTrack():', e);
                }
            }
            
            // Check player object properties
            this.debugLog('Player object methods:', Object.getOwnPropertyNames(this.player).filter(prop => 
                typeof this.player[prop] === 'function' && prop.toLowerCase().includes('audio')
            ));
            
            // Wait for video metadata to be ready
            if (!video.duration || video.readyState < 1) {
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    this.debugLog(`Video not ready, retrying... (${this.retryCount}/${this.maxRetries})`);
                    
                    return new Promise((resolve) => {
                        setTimeout(async () => {
                            const result = await this.analyzeAudioTracks();
                            resolve(result);
                        }, 1000);
                    });
                } else {
                    this.debugLog('Max retries reached, video metadata not ready');
                    return tracks;
                }
            }

            // Reset retry count on successful analysis
            this.retryCount = 0;

            this.debugLog('=== YOUTUBE AUDIO TRACKS ANALYSIS ===');
            
            // Use YouTube's internal API instead of standard video.audioTracks
            if (typeof this.player.getAvailableAudioTracks === 'function') {
                try {
                    const ytAudioTracks = this.player.getAvailableAudioTracks();
                    const currentTrack = this.player.getAudioTrack();
                    
                    this.debugLog(`Found ${ytAudioTracks.length} audio tracks via YouTube API`);
                    this.debugLog('Current track:', currentTrack);
                    
                    for (let i = 0; i < ytAudioTracks.length; i++) {
                        const track = ytAudioTracks[i];
                        
                        // Decode track ID to extract language and type information
                        const decodedInfo = this.decodeTrackId(track.id);
                        
                        // Create detailed track info
                        const trackInfo = {
                            id: track.id || i.toString(),
                            label: track.displayName || track.name || `Track ${i + 1}`,
                            language: decodedInfo.language || track.languageCode || track.language || 'unknown',
                            kind: track.kind || 'main',
                            enabled: currentTrack && currentTrack.id === track.id,
                            isOriginal: decodedInfo.isOriginal || track.isOriginal || false,
                            index: i,
                            // Additional YouTube-specific properties
                            displayName: track.displayName,
                            languageCode: track.languageCode,
                            audioQuality: track.audioQuality,
                            bitrate: track.bitrate,
                            // Decoded information
                            decodedType: decodedInfo.type,
                            decodedLanguage: decodedInfo.language,
                            rawId: track.id
                        };
                        
                        // Log all available properties for debugging
                        this.debugLog(`Track ${i}:`, {
                            ...trackInfo,
                            rawTrack: {
                                ...track,
                                allProperties: Object.getOwnPropertyNames(track),
                                prototype: Object.getPrototypeOf(track),
                                constructor: track.constructor?.name
                            }
                        });
                        
                        tracks.push(trackInfo);
                    }
                    
                    // Check which track is currently playing
                    const currentlyEnabled = tracks.filter(track => track.enabled);
                    this.debugLog('Currently enabled tracks:', currentlyEnabled);
                    
                    // Check for original tracks
                    const originalTracks = tracks.filter(track => track.isOriginal);
                    this.debugLog('Original tracks found:', originalTracks);
                    
                    // If no explicit original tracks, check for patterns
                    if (originalTracks.length === 0) {
                        const possibleOriginals = tracks.filter(track => 
                            track.language === 'original' ||
                            track.languageCode === 'original' ||
                            track.label.toLowerCase().includes('original') ||
                            track.displayName?.toLowerCase().includes('original') ||
                            track.kind === 'main'
                        );
                        this.debugLog('Possible original tracks (by pattern):', possibleOriginals);
                    }
                    
                } catch (error) {
                    this.debugLog('Error using YouTube audio tracks API:', error);
                }
            } else {
                this.debugLog('YouTube getAvailableAudioTracks method not available');
            }
            
            // Also check standard API for comparison
            if (video && video.audioTracks && video.audioTracks.length > 0) {
                this.debugLog(`Also found ${video.audioTracks.length} tracks via standard API (for comparison)`);
            } else {
                this.debugLog('Standard video.audioTracks API not available or empty');
            }
            
            this.debugLog('=== END INVESTIGATION ===');

            this.audioTracks = tracks;
            return tracks;
        } catch (error) {
            this.debugLog('Error analyzing audio tracks:', error);
            return [];
        }
    }

    /**
     * Switch to specific audio track using YouTube's API
     */
    switchToTrack(trackId) {
        try {
            // Only switch on valid pages (/watch or /shorts)
            if (!this.isValidPage()) {
                this.debugLog('Skipping track switch - not on valid page (watch/shorts)');
                return false;
            }
            
            if (!this.player) {
                this.debugLog('No player available for track switching');
                return false;
            }

            // Use YouTube's setAudioTrack method
            if (typeof this.player.setAudioTrack === 'function') {
                try {
                    // Get available tracks to find the one with matching ID
                    const availableTracks = this.player.getAvailableAudioTracks();
                    const targetTrack = availableTracks.find(track => track.id === trackId);
                    
                    if (targetTrack) {
                        this.player.setAudioTrack(targetTrack);
                        this.currentTrack = trackId;
                        this.debugLog(`✅ Switched to audio track: ${targetTrack.displayName || targetTrack.name || trackId}`);
                        return true;
                    } else {
                        this.debugLog(`❌ Audio track not found: ${trackId}`);
                        return false;
                    }
                } catch (ytError) {
                    this.debugLog('Error using YouTube setAudioTrack:', ytError);
                }
            }

            // Fallback to standard API if YouTube API fails
            const video = this.player.querySelector('video');
            if (video && video.audioTracks && video.audioTracks.length > 0) {
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
                        this.debugLog(`Switched to audio track (fallback): ${track.label || trackId}`);
                        break;
                    }
                }

                return switched;
            }

            this.debugLog('No audio track switching method available');
            return false;
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
            // Only work on video pages (/watch) or Shorts (/shorts)
            if (!this.isValidPage()) {
                this.debugLog('Skipping auto-switch - not on valid page (watch/shorts)');
                return;
            }
            
            // Check cooldown to prevent spam
            const now = Date.now();
            if (now - this.lastAutoSwitchAttempt < this.autoSwitchCooldown) {
                return;
            }
            this.lastAutoSwitchAttempt = now;
            
            this.debugLog('=== AUTO-SWITCH TO ORIGINAL ANALYSIS ===');
            
            if (!this.autoSwitchEnabled) {
                this.debugLog('Auto-switch disabled');
                return;
            }
            
            if (this.hasAutoSwitched) {
                this.debugLog('Already auto-switched for this video');
                return;
            }

            const tracks = await this.analyzeAudioTracks();
            if (tracks.length <= 1) {
                this.debugLog('Only one track available, no need to switch');
                return;
            }

            // Check currently enabled track
            const currentlyEnabled = tracks.find(track => track.enabled);
            this.debugLog('Currently enabled track:', currentlyEnabled);
            
            // Check if current track is already original
            if (currentlyEnabled && currentlyEnabled.isOriginal) {
                this.debugLog('Current track is already original, no switch needed');
                this.hasAutoSwitched = true;
                return;
            }

            // Look for original language track using isOriginal property first
            let originalTrack = tracks.find(track => track.isOriginal === true);
            
            if (!originalTrack) {
                // Fallback: Look for tracks with 'original' indicators
                originalTrack = tracks.find(track => 
                    track.kind === 'main' || 
                    track.language === 'original' ||
                    track.label.toLowerCase().includes('original')
                );
            }
            
            if (!originalTrack) {
                // Final fallback: Use first track
                originalTrack = tracks[0];
                this.debugLog('No explicit original track found, using first track as fallback');
            }

            this.debugLog('Selected original track:', originalTrack);

            if (originalTrack && originalTrack.id !== currentlyEnabled?.id) {
                this.debugLog(`Switching from track "${currentlyEnabled?.label}" to original track "${originalTrack.label}"`);
                const success = this.switchToTrack(originalTrack.id);
                if (success) {
                    this.hasAutoSwitched = true;
                    this.debugLog('✅ Successfully auto-switched to original audio track');
                } else {
                    this.debugLog('❌ Failed to switch to original audio track');
                }
            } else {
                this.debugLog('Original track is already active or same as current');
            }
            
            this.debugLog('=== END AUTO-SWITCH ANALYSIS ===');
        } catch (error) {
            this.debugLog('Error in auto-switch:', error);
        }
    }

    /**
     * Set up observers for video changes (DRY approach)
     */
    setupObservers() {
        // 1. URL change observer (for navigation between videos)
        this.setupUrlChangeObserver();
        
        // 2. Video element observer (for when video element changes)
        this.setupVideoElementObserver();
        
        // 3. Shorts-specific observer (for scrolling through shorts)
        this.setupShortsObserver();
        
        // 4. Video play event observer (for when video actually starts playing)
        this.setupVideoPlayObserver();
        
        // 5. Tab focus observer (for when tab gains focus)
        this.setupTabFocusObserver();
        
        this.debugLog('All observers set up');
    }

    /**
     * Set up URL change observer for navigation detection
     */
    setupUrlChangeObserver() {
        let lastUrl = location.href;
        let lastVideoId = this.extractVideoId(location.href);
        
        const urlObserver = new MutationObserver(() => {
            const currentUrl = location.href;
            const currentVideoId = this.extractVideoId(currentUrl);
            
            if (currentUrl !== lastUrl || currentVideoId !== lastVideoId) {
                this.debugLog('Navigation detected', { 
                    from: lastUrl, 
                    to: currentUrl,
                    fromVideoId: lastVideoId,
                    toVideoId: currentVideoId
                });
                
                lastUrl = currentUrl;
                lastVideoId = currentVideoId;
                
                // Only proceed if we're on a valid page
                if (this.isValidPage()) {
                    // Reset auto-switch flag for new video
                    this.resetAutoSwitchState();
                    
                    // Auto-switch after navigation
                    this.scheduleAutoSwitch('navigation');
                } else {
                    this.debugLog('Navigation to non-video page, skipping auto-switch');
                }
            }
        });

        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(urlObserver);
        this.debugLog('URL change observer set up');
    }

    /**
     * Set up video element observer for video changes
     */
    setupVideoElementObserver() {
        const videoObserver = new MutationObserver((mutations) => {
            let videoChanged = false;
            
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        const videos = node.tagName === 'VIDEO' ? [node] : 
                                     node.querySelectorAll ? node.querySelectorAll('video') : [];
                        
                        if (videos.length > 0) {
                            videoChanged = true;
                            this.debugLog('New video element detected');
                        }
                    }
                });
            });
            
            if (videoChanged) {
                this.resetAutoSwitchState();
                this.scheduleAutoSwitch('video-element-change');
            }
        });

        videoObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(videoObserver);
        this.debugLog('Video element observer set up');
    }

    /**
     * Set up Shorts-specific observer for scrolling (using same approach as shorts counter)
     */
    setupShortsObserver() {
        let lastShortsUrl = location.href;
        
        // Use the same reliable URL-based detection as shorts counter
        const shortsObserver = new MutationObserver(() => {
            // Only check if we're on Shorts page
            if (!this.isShortsPage()) return;
            
            const currentUrl = location.href;
            if (currentUrl !== lastShortsUrl) {
                this.debugLog('Shorts URL changed - new video detected', { 
                    from: lastShortsUrl, 
                    to: currentUrl 
                });
                
                lastShortsUrl = currentUrl;
                
                // Reset auto-switch state for new Shorts video
                this.resetAutoSwitchState();
                
                // Schedule auto-switch with shorter delay for Shorts scrolling
                this.scheduleAutoSwitch('shorts-scroll');
            }
        });

        // Use throttled observation like shorts counter (500ms delay)
        shortsObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(shortsObserver);
        this.debugLog('Shorts observer set up (URL-based detection)');
    }

    /**
     * Set up video play event observer to detect when video starts playing
     */
    setupVideoPlayObserver() {
        this.handleVideoPlay = () => {
            if (!this.isValidPage()) return;
            
            this.debugLog('Video play event detected - checking for audio track switch');
            
            // Only auto-switch if we haven't done it yet for this video
            if (!this.hasAutoSwitched) {
                this.scheduleAutoSwitch('video-play');
            }
        };

        // Listen for play events on the document (event delegation)
        document.addEventListener('play', this.handleVideoPlay, true);
        
        this.debugLog('Video play observer set up');
    }

    /**
     * Set up tab focus observer to handle tab switching scenarios
     */
    setupTabFocusObserver() {
        this.handleTabFocus = () => {
            if (!this.isValidPage()) return;
            
            this.debugLog('Tab gained focus - checking for audio track switch');
            
            // Check if there's a video and it's playing or about to play
            const video = document.querySelector('video');
            if (video && !this.hasAutoSwitched) {
                // Small delay to let YouTube initialize
                setTimeout(() => {
                    if (!this.hasAutoSwitched) {
                        this.scheduleAutoSwitch('tab-focus');
                    }
                }, 500);
            }
        };

        // Listen for window focus events
        window.addEventListener('focus', this.handleTabFocus);
        
        this.debugLog('Tab focus observer set up');
    }

    /**
     * Extract video ID from URL (DRY utility)
     */
    extractVideoId(url) {
        try {
            const urlObj = new URL(url);
            
            // Regular video page
            if (urlObj.pathname === '/watch') {
                return urlObj.searchParams.get('v');
            }
            
            // Shorts page
            if (urlObj.pathname.startsWith('/shorts/')) {
                return urlObj.pathname.split('/shorts/')[1];
            }
            
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Check if current page is Shorts (DRY utility)
     */
    isShortsPage() {
        return location.pathname.startsWith('/shorts/');
    }

    /**
     * Check if current page is valid for audio track controls (DRY utility)
     */
    isValidPage() {
        const pathname = location.pathname;
        return pathname === '/watch' || pathname.startsWith('/shorts/');
    }

    /**
     * Reset auto-switch state (DRY utility)
     */
    resetAutoSwitchState() {
        this.hasAutoSwitched = false;
        this.lastAutoSwitchAttempt = 0;
        this.retryCount = 0;
    }

    /**
     * Schedule auto-switch with appropriate delay (DRY utility)
     */
    scheduleAutoSwitch(reason) {
        // Different delays for different scenarios
        const delays = {
            'navigation': 2000,        // Regular navigation
            'video-element-change': 1500, // Video element change
            'shorts-scroll': 500,      // Shorts scrolling (very fast)
            'initial': 3000,          // Initial load
            'video-play': 100,        // Video started playing (immediate)
            'tab-focus': 800          // Tab gained focus (quick)
        };
        
        const delay = delays[reason] || 2000;
        
        this.debugLog(`Scheduling auto-switch in ${delay}ms (reason: ${reason})`);
        
        setTimeout(() => {
            if (this.autoSwitchEnabled && !this.hasAutoSwitched) {
                this.autoSwitchToOriginal();
            }
        }, delay);
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
        
        // Remove event listeners
        document.removeEventListener('play', this.handleVideoPlay, true);
        window.removeEventListener('focus', this.handleTabFocus);
        
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
        
        // Initial auto-switch attempt using DRY scheduling
        audioTrackManager.scheduleAutoSwitch('initial');

        return audioTrackManager;
    } catch (error) {
        console.error('[YT-Commander] Failed to initialize audio track controls:', error);
        window.ytCommanderAudioTracksLoading = false;
        return null;
    }
}

/**
 * Handle page navigation (legacy - now handled by setupObservers)
 * Keeping for backward compatibility but functionality moved to setupObservers
 */
function handleNavigation() {
    // This function is now handled by the setupObservers method in the manager
    // The new system provides better detection for both regular videos and Shorts
    console.log('[YT-Commander][AudioTracks] Legacy handleNavigation called - functionality moved to setupObservers');
}

// Global API for external access
window.ytCommanderAudioTracks = {
    getManager: () => audioTrackManager,
    isLoading: () => window.ytCommanderAudioTracksLoading,
    isInitialized: () => audioTrackManager?.isReady() || false,
    switchToTrack: (trackId) => audioTrackManager?.switchToTrack(trackId),
    getAvailableTracks: () => audioTrackManager?.getAvailableTracks() || [],
    getCurrentTrack: () => audioTrackManager?.getCurrentTrack(),
    
    // Testing and debugging functions
    analyzeTracks: async () => {
        if (audioTrackManager) {
            audioTrackManager.verboseLogging = true;
            const result = await audioTrackManager.analyzeAudioTracks();
            audioTrackManager.verboseLogging = false;
            return result;
        }
        return [];
    },
    
    testAutoSwitch: async () => {
        if (audioTrackManager) {
            audioTrackManager.verboseLogging = true;
            audioTrackManager.lastAutoSwitchAttempt = 0; // Reset cooldown
            const result = await audioTrackManager.autoSwitchToOriginal();
            audioTrackManager.verboseLogging = false;
            return result;
        }
    },
    
    // Control functions
    enableVerboseLogging: () => {
        if (audioTrackManager) audioTrackManager.verboseLogging = true;
        console.log('[YT-Commander][AudioTracks] Verbose logging enabled');
    },
    
    disableVerboseLogging: () => {
        if (audioTrackManager) audioTrackManager.verboseLogging = false;
        console.log('[YT-Commander][AudioTracks] Verbose logging disabled');
    },
    
    enableAutoSwitch: () => {
        if (audioTrackManager) audioTrackManager.autoSwitchEnabled = true;
        console.log('[YT-Commander][AudioTracks] Auto-switch enabled');
    },
    
    disableAutoSwitch: () => {
        if (audioTrackManager) audioTrackManager.autoSwitchEnabled = false;
        console.log('[YT-Commander][AudioTracks] Auto-switch disabled');
    },
    
    init: initAudioTrackControls
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAudioTrackControls().catch(error => {
            console.error('[YT-Commander][AudioTracks] Failed to initialize during DOMContentLoaded:', error);
        });
        handleNavigation();
    });
} else {
    initAudioTrackControls().catch(error => {
        console.error('[YT-Commander][AudioTracks] Failed to initialize:', error);
    });
    handleNavigation();
}
