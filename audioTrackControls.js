// Audio Track Controls for YouTube Commander (MAIN World Version)
// Uses YouTube's internal player API instead of HTML5 audioTracks

console.log('[YT-Commander] Loading audioTrackControls.js in MAIN world...');

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
    }

    // Initialize the manager
    async initialize() {
        console.log('[YT-Commander] Initializing YouTube Audio Track Manager...');
        
        try {
            await this.findPlayer();
            await this.loadSettings();
            this.setupObservers();
            this.isInitialized = true;
            
            console.log('[YT-Commander] Audio Track Manager initialized successfully');
            return true;
        } catch (error) {
            console.error('[YT-Commander] Error initializing Audio Track Manager:', error);
            return false;
        }
    }

    // Find YouTube player instance
    async findPlayer() {
        // The player element IS the YouTube player API
        const playerElement = document.getElementById('movie_player');
        
        if (!playerElement) {
            throw new Error('Could not find movie_player element');
        }
        
        // Verify it has the audio track methods
        const hasAudioMethods = typeof playerElement.getAudioTrack === 'function' && 
                               typeof playerElement.setAudioTrack === 'function';
        
        if (!hasAudioMethods) {
            console.warn('[YT-Commander] Player element found but missing audio track methods');
        }
        
        this.player = playerElement;
        console.log('[YT-Commander] Found YouTube player element');
        console.log('[YT-Commander] Player has getAudioTrack:', typeof playerElement.getAudioTrack === 'function');
        console.log('[YT-Commander] Player has setAudioTrack:', typeof playerElement.setAudioTrack === 'function');
        console.log('[YT-Commander] Player has getAvailableAudioTracks:', typeof playerElement.getAvailableAudioTracks === 'function');
        
        return playerElement;
    }

    // Get available audio tracks from YouTube's player response
    getAvailableAudioTracks() {
        try {
            // Check for audio tracks in captions section (this is where they actually are!)
            if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.audioTracks) {
                const audioTracksData = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.audioTracks;
                const defaultIndex = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.defaultAudioTrackIndex || 0;

                const tracks = audioTracksData.map((track, index) => {
                    // Parse language from audioTrackId (e.g., "en-US.10" -> "en-US", "ja.4" -> "ja")
                    const languageCode = track.audioTrackId.split('.')[0];
                    const isDefault = index === defaultIndex;
                    
                    // Determine if this is the original track
                    // The original track is usually:
                    // 1. The default track (what YouTube selects by default)
                    // 2. NOT English (unless it's actually an English video)
                    // 3. The track that matches the video's original language
                    const isOriginal = this.determineIfOriginalTrack(track, index, defaultIndex, audioTracksData);
                    
                    return {
                        id: track.audioTrackId,
                        label: this.getLanguageDisplayName(languageCode),
                        language: languageCode,
                        isOriginal: isOriginal,
                        isDefault: isDefault,
                        index: index
                    };
                });

                console.log('[YT-Commander] Found audio tracks in captions:', tracks);
                console.log('[YT-Commander] Default audio track index:', defaultIndex);
                return tracks;
            }

            // Fallback: check adaptiveFormats (less reliable)
            if (window.ytInitialPlayerResponse?.streamingData?.adaptiveFormats) {
                const audioFormats = window.ytInitialPlayerResponse.streamingData.adaptiveFormats
                    .filter(format => format.mimeType?.includes('audio'))
                    .filter(format => format.audioTrack || format.language);

                if (audioFormats.length > 0) {
                    const tracks = audioFormats.map((format, index) => ({
                        id: format.itag || index,
                        label: format.audioTrack?.displayName || format.language || `Audio ${index + 1}`,
                        language: format.audioTrack?.id || format.language || 'unknown',
                        isOriginal: format.audioTrack?.audioIsDefault || false,
                        index: index
                    }));

                    console.log('[YT-Commander] Found audio tracks in adaptiveFormats:', tracks);
                    return tracks;
                }
            }

            console.log('[YT-Commander] No audio tracks found');
            return [];
        } catch (error) {
            console.error('[YT-Commander] Error getting audio tracks:', error);
            return [];
        }
    }

    // Determine if a track is the original track
    determineIfOriginalTrack(track, index, defaultIndex, allTracks) {
        const languageCode = track.audioTrackId.split('.')[0];
        
        // Strategy 1: Check video metadata for original language
        const videoDetails = window.ytInitialPlayerResponse?.videoDetails;
        if (videoDetails) {
            // Check if video title/description contains non-English characters
            const title = videoDetails.title || '';
            const description = videoDetails.shortDescription || '';
            
            // Detect if content is likely Japanese, Korean, etc.
            const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(title + description);
            const hasKorean = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(title + description);
            const hasChinese = /[\u4E00-\u9FFF]/.test(title + description);
            
            // If we detect specific languages in the content, prefer those
            if (hasJapanese && languageCode === 'ja') return true;
            if (hasKorean && languageCode === 'ko') return true;
            if (hasChinese && (languageCode === 'zh' || languageCode.startsWith('zh-'))) return true;
        }
        
        // Strategy 2: Use YouTube's default selection as a hint
        // The default track is usually the original, unless it's English and there are other options
        if (index === defaultIndex) {
            // If default is English but there are non-English options, it might be dubbed
            if (languageCode.startsWith('en') && allTracks.length > 1) {
                const hasNonEnglish = allTracks.some(t => !t.audioTrackId.startsWith('en'));
                if (hasNonEnglish) {
                    // English is default but there are other languages - might be dubbed
                    return false;
                }
            }
            // Default track and either no other options or no non-English options
            return true;
        }
        
        // Strategy 3: If there are only 2 tracks and one is English, the other is likely original
        if (allTracks.length === 2) {
            const englishTrack = allTracks.find(t => t.audioTrackId.startsWith('en'));
            if (englishTrack && !languageCode.startsWith('en')) {
                return true; // This is the non-English track, likely original
            }
        }
        
        // Strategy 4: Fallback - non-English tracks are more likely to be original
        return !languageCode.startsWith('en');
    }

    // Get display name for language code
    getLanguageDisplayName(languageCode) {
        const languageNames = {
            'en': 'English',
            'en-US': 'English (US)',
            'ja': 'Japanese',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ko': 'Korean',
            'zh': 'Chinese'
        };
        
        return languageNames[languageCode] || languageCode.toUpperCase();
    }

    // Try to switch audio track using YouTube's internal methods
    switchToTrack(trackIndex) {
        try {
            console.log('[YT-Commander] Attempting to switch to track:', trackIndex);
            
            const tracks = this.getAvailableAudioTracks();
            const targetTrack = tracks[trackIndex];
            
            if (!targetTrack) {
                console.log('[YT-Commander] Invalid track index:', trackIndex);
                return false;
            }

            console.log('[YT-Commander] Target track:', targetTrack);

            // Method 1: Try YouTube's internal player API
            if (this.player && typeof this.player.setAudioTrack === 'function') {
                console.log('[YT-Commander] Using player.setAudioTrack method');
                
                // First, let's see what the current audio track looks like
                const currentTrack = this.player.getAudioTrack();
                console.log('[YT-Commander] Current audio track:', currentTrack);
                
                // Get available tracks from the player
                const availableTracks = this.player.getAvailableAudioTracks();
                console.log('[YT-Commander] Available tracks from player:', availableTracks);
                
                // Try to find the matching track in the player's format
                let playerTrack = null;
                if (availableTracks && availableTracks.length > 0) {
                    // Try to match by language or index
                    playerTrack = availableTracks.find(track => 
                        track.language === targetTrack.language || 
                        track.id === targetTrack.id
                    );
                    
                    // If no match found, try by index
                    if (!playerTrack && availableTracks[trackIndex]) {
                        playerTrack = availableTracks[trackIndex];
                    }
                }
                
                console.log('[YT-Commander] Target player track:', playerTrack);
                
                if (playerTrack) {
                    // Try different parameter formats
                    console.log('[YT-Commander] Attempting setAudioTrack with player track...');
                    
                    // Method 1a: Use the track object from player
                    let result = this.player.setAudioTrack(playerTrack);
                    console.log('[YT-Commander] setAudioTrack with track object result:', result);
                    
                    if (!result) {
                        // Method 1b: Use track ID
                        result = this.player.setAudioTrack(playerTrack.id);
                        console.log('[YT-Commander] setAudioTrack with track ID result:', result);
                    }
                    
                    if (!result) {
                        // Method 1c: Use track index
                        result = this.player.setAudioTrack(trackIndex);
                        console.log('[YT-Commander] setAudioTrack with index result:', result);
                    }
                    
                    // Check if the track actually changed
                    setTimeout(() => {
                        const newTrack = this.player.getAudioTrack();
                        console.log('[YT-Commander] Audio track after switch attempt:', newTrack);
                        const changed = newTrack.id !== currentTrack.id;
                        console.log('[YT-Commander] Track actually changed:', changed);
                    }, 500);
                    
                    return result || false;
                } else {
                    console.log('[YT-Commander] Could not find matching track in player format');
                }
            }

            // Method 2: Try accessing the player's internal state
            if (window.ytplayer?.config?.args?.player_response) {
                console.log('[YT-Commander] Trying ytplayer config method');
                const playerResponse = JSON.parse(window.ytplayer.config.args.player_response);
                if (playerResponse.captions?.playerCaptionsTracklistRenderer) {
                    playerResponse.captions.playerCaptionsTracklistRenderer.defaultAudioTrackIndex = trackIndex;
                    window.ytplayer.config.args.player_response = JSON.stringify(playerResponse);
                    
                    // Try to reload the player
                    if (this.player?.loadVideoById) {
                        const videoData = this.player.getVideoData();
                        this.player.loadVideoById(videoData.video_id);
                        return true;
                    }
                }
            }

            // Method 3: Try using YouTube's settings API
            if (window.yt?.player?.Application?.create) {
                console.log('[YT-Commander] Trying YouTube settings API');
                const app = window.yt.player.Application.create();
                if (app?.setAudioTrack) {
                    app.setAudioTrack(targetTrack.id);
                    return true;
                }
            }

            // Method 4: Programmatically interact with settings menu
            console.log('[YT-Commander] Falling back to UI interaction');
            return this.switchViaUI(trackIndex);

        } catch (error) {
            console.error('[YT-Commander] Error switching audio track:', error);
            return false;
        }
    }

    // Switch audio track by interacting with YouTube's UI
    switchViaUI(trackIndex) {
        try {
            console.log('[YT-Commander] Attempting UI-based track switching');
            
            // Click settings button
            const settingsButton = document.querySelector('.ytp-settings-button');
            if (!settingsButton) {
                console.log('[YT-Commander] Settings button not found');
                return false;
            }

            settingsButton.click();
            
            setTimeout(() => {
                // Look for audio track menu item
                const menuItems = document.querySelectorAll('.ytp-menuitem');
                let audioMenuItem = null;
                
                for (const item of menuItems) {
                    const text = item.textContent.toLowerCase();
                    if (text.includes('audio track') || text.includes('audio') || text.includes('language')) {
                        audioMenuItem = item;
                        break;
                    }
                }
                
                if (audioMenuItem) {
                    console.log('[YT-Commander] Found audio menu item:', audioMenuItem.textContent);
                    audioMenuItem.click();
                    
                    setTimeout(() => {
                        // Look for the specific track option
                        const trackItems = document.querySelectorAll('.ytp-menuitem');
                        const tracks = this.getAvailableAudioTracks();
                        const targetTrack = tracks[trackIndex];
                        
                        for (const item of trackItems) {
                            const text = item.textContent.toLowerCase();
                            const targetLabel = targetTrack.label.toLowerCase();
                            
                            if (text.includes(targetLabel) || text.includes(targetTrack.language)) {
                                console.log('[YT-Commander] Clicking track option:', item.textContent);
                                item.click();
                                return true;
                            }
                        }
                        
                        console.log('[YT-Commander] Target track option not found in UI');
                    }, 200);
                } else {
                    console.log('[YT-Commander] Audio track menu item not found');
                    // Close settings menu
                    settingsButton.click();
                }
            }, 200);
            
            return false;
        } catch (error) {
            console.error('[YT-Commander] Error in UI-based switching:', error);
            return false;
        }
    }

    // Open YouTube's audio track settings menu
    openAudioTrackSettings() {
        try {
            // Click on settings button
            const settingsButton = document.querySelector('.ytp-settings-button');
            if (settingsButton) {
                settingsButton.click();
                
                setTimeout(() => {
                    // Look for audio track option in menu
                    const menuItems = document.querySelectorAll('.ytp-menuitem');
                    for (const item of menuItems) {
                        if (item.textContent.includes('Audio track') || 
                            item.textContent.includes('Audio') ||
                            item.textContent.includes('Language')) {
                            console.log('[YT-Commander] Found audio track menu item:', item);
                            item.click();
                            return;
                        }
                    }
                }, 100);
            }
        } catch (error) {
            console.error('[YT-Commander] Error opening audio track settings:', error);
        }
    }

    // Switch to original audio track
    switchToOriginal() {
        const tracks = this.getAvailableAudioTracks();
        
        if (tracks.length === 0) {
            console.log('[YT-Commander] No tracks available to switch to');
            return false;
        }
        
        // Find the track marked as original by our detection logic
        let originalTrack = tracks.find(track => track.isOriginal);
        
        if (originalTrack) {
            console.log('[YT-Commander] Switching to detected original track:', originalTrack);
            return this.switchToTrack(originalTrack.index);
        }
        
        // Fallback strategies if no track is marked as original
        console.log('[YT-Commander] No track marked as original, using fallback detection...');
        
        // Strategy 1: If there are 2 tracks, prefer the non-English one
        if (tracks.length === 2) {
            const nonEnglishTrack = tracks.find(track => !track.language.startsWith('en'));
            if (nonEnglishTrack) {
                console.log('[YT-Commander] Using non-English track as original:', nonEnglishTrack);
                return this.switchToTrack(nonEnglishTrack.index);
            }
        }
        
        // Strategy 2: Use the default track
        const defaultTrack = tracks.find(track => track.isDefault);
        if (defaultTrack) {
            console.log('[YT-Commander] Using default track as original:', defaultTrack);
            return this.switchToTrack(defaultTrack.index);
        }
        
        // Final fallback: use first track
        console.log('[YT-Commander] Using first track as fallback:', tracks[0]);
        return this.switchToTrack(0);
    }

    // Load settings from storage
    async loadSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const result = await chrome.storage.local.get(['autoSwitchToOriginal']);
                this.autoSwitchEnabled = result.autoSwitchToOriginal !== false;
            }
            console.log('[YT-Commander] Auto-switch enabled:', this.autoSwitchEnabled);
        } catch (error) {
            console.log('[YT-Commander] Could not load settings, using defaults');
            this.autoSwitchEnabled = true;
        }
    }

    // Setup observers for video changes
    setupObservers() {
        // Observer for navigation changes
        const observer = new MutationObserver(() => {
            this.handleVideoChange();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.observers.push(observer);

        // Listen for YouTube navigation events
        if (window.yt?.www?.watch) {
            const originalPush = window.yt.www.watch.player.push;
            window.yt.www.watch.player.push = (...args) => {
                this.handleVideoChange();
                return originalPush.apply(this, args);
            };
        }
    }

    // Handle video change
    handleVideoChange() {
        if (this.autoSwitchEnabled && !this.hasAutoSwitched) {
            setTimeout(() => {
                const tracks = this.getAvailableAudioTracks();
                if (tracks.length > 1) {
                    console.log('[YT-Commander] Multiple audio tracks detected, auto-switching...');
                    this.switchToOriginal();
                    this.hasAutoSwitched = true;
                }
            }, 1000); // Wait for player to be ready
        }
    }

    // Update auto-switch setting
    updateAutoSwitchSetting(enabled) {
        this.autoSwitchEnabled = enabled;
        console.log('[YT-Commander] Auto-switch setting updated:', enabled);
    }

    // Reset for new video
    reset() {
        this.hasAutoSwitched = false;
        this.audioTracks = [];
        this.currentTrack = null;
    }
}

// Global instance
let audioTrackManager = null;

// Initialize the manager
async function initializeAudioTrackManager() {
    try {
        audioTrackManager = new YouTubeAudioTrackManager();
        const success = await audioTrackManager.initialize();
        
        if (success) {
            console.log('[YT-Commander] Audio Track Manager ready');
        } else {
            console.log('[YT-Commander] Audio Track Manager initialization failed');
        }
        
        return success;
    } catch (error) {
        console.error('[YT-Commander] Failed to initialize Audio Track Manager:', error);
        return false;
    }
}

// Helper function to explore player element
window.exploreYouTubePlayer = function() {
    console.log('=== YouTube Player Exploration ===');
    
    const playerElement = document.getElementById('movie_player');
    if (!playerElement) {
        console.log('No player element found');
        return;
    }
    
    console.log('Player element:', playerElement);
    
    // List all properties that might contain the player API
    const props = Object.getOwnPropertyNames(playerElement);
    console.log('All player element properties:', props);
    
    // Look for properties that have audio track methods
    const audioTrackProps = [];
    for (const prop of props) {
        try {
            const obj = playerElement[prop];
            if (obj && typeof obj === 'object') {
                if (typeof obj.getAudioTrack === 'function' || typeof obj.setAudioTrack === 'function') {
                    audioTrackProps.push({
                        property: prop,
                        hasGetAudioTrack: typeof obj.getAudioTrack === 'function',
                        hasSetAudioTrack: typeof obj.setAudioTrack === 'function',
                        object: obj
                    });
                }
            }
        } catch (error) {
            // Skip properties that can't be accessed
        }
    }
    
    console.log('Properties with audio track methods:', audioTrackProps);
    
    // Also check window.ytplayer
    console.log('window.ytplayer:', window.ytplayer);
    if (window.ytplayer) {
        console.log('ytplayer properties:', Object.getOwnPropertyNames(window.ytplayer));
    }
    
    return audioTrackProps;
};

// Create global API
window.ytCommanderAudioTracks = {
    manager: audioTrackManager,
    isLoaded: () => true,
    isInitialized: () => audioTrackManager?.isInitialized || false,
    isLoadingComplete: () => !window.ytCommanderAudioTracksLoading,
    getAvailableTracks: () => audioTrackManager?.getAvailableAudioTracks() || [],
    switchToOriginal: () => audioTrackManager?.switchToOriginal() || false,
    switchToTrack: (index) => audioTrackManager?.switchToTrack(index) || false,
    openSettings: () => audioTrackManager?.openAudioTrackSettings(),
    version: '2.0.0-main-world'
};

// Test function
window.testYTCommanderAudioTracks = function() {
    console.log('=== YT Commander Audio Tracks Test (Main World) ===');
    console.log('Manager initialized:', audioTrackManager?.isInitialized);
    console.log('Player found:', !!audioTrackManager?.player);
    console.log('Available tracks:', audioTrackManager?.getAvailableAudioTracks());
    console.log('Auto-switch enabled:', audioTrackManager?.autoSwitchEnabled);
    
    // Test YouTube player response
    console.log('ytInitialPlayerResponse exists:', !!window.ytInitialPlayerResponse);
    if (window.ytInitialPlayerResponse?.streamingData) {
        console.log('Streaming data available:', !!window.ytInitialPlayerResponse.streamingData);
        const audioFormats = window.ytInitialPlayerResponse.streamingData.adaptiveFormats
            ?.filter(f => f.mimeType?.includes('audio'));
        console.log('Audio formats found:', audioFormats?.length || 0);
    }
    
    // Debug player methods
    if (audioTrackManager?.player) {
        console.log('=== Player Debug Info ===');
        const player = audioTrackManager.player;
        const methods = Object.getOwnPropertyNames(player.__proto__).filter(name => 
            name.toLowerCase().includes('audio') || 
            name.toLowerCase().includes('track') ||
            name.toLowerCase().includes('language')
        );
        console.log('Audio-related methods:', methods);
        
        // Try to get current audio track info
        if (typeof player.getAudioTrack === 'function') {
            console.log('Current audio track:', player.getAudioTrack());
        }
        if (typeof player.getAvailableAudioTracks === 'function') {
            console.log('Available audio tracks (player):', player.getAvailableAudioTracks());
        }
    }
    
    return 'Test completed - check console output above';
};

// Initialize when page is ready
function initialize() {
    console.log('[YT-Commander] Starting audio track controls initialization...');
    
    // Wait for YouTube to be ready
    const checkReady = () => {
        if (window.ytInitialPlayerResponse || document.querySelector('video')) {
            initializeAudioTrackManager().then(() => {
                window.ytCommanderAudioTracksLoading = false;
                console.log('[YT-Commander] Audio track controls ready! Test with: testYTCommanderAudioTracks()');
            });
        } else {
            setTimeout(checkReady, 500);
        }
    };
    
    checkReady();
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

console.log('[YT-Commander] Audio Track Controls script loaded in MAIN world');
