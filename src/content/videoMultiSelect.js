/**
 * Video Multi-Select - Simple click-to-select approach
 * Click video titles to select, avoid thumbnail hover issues
 */

import { createLogger } from './utils/logger.js';
import { getVideoId } from './utils/youtube.js';

const logger = createLogger('VideoMultiSelect');

class VideoMultiSelect {
    constructor() {
        this.isEnabled = false;
        this.selectedVideos = new Map(); // Store videoId -> container
        this.actionToolbar = null;
        this.observer = null;
        this.settings = {
            multiSelectEnabled: false
        };
        
        this.init();
    }

    async init() {
        logger.info('Initializing video multi-select');
        
        // Load settings
        await this.loadSettings();
        
        // Set up message listeners for settings updates
        this.setupMessageListeners();
        
        // Initialize if enabled
        if (this.settings.multiSelectEnabled) {
            this.enable();
        }
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['multiSelectEnabled']);
            this.settings.multiSelectEnabled = result.multiSelectEnabled || false;
            logger.info('Settings loaded:', this.settings);
        } catch (error) {
            logger.error('Error loading settings:', error);
        }
    }

    setupMessageListeners() {
        // Listen for settings updates from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SETTINGS_UPDATED' && message.settings.multiSelectEnabled !== undefined) {
                this.updateSettings(message.settings);
            }
        });
    }

    updateSettings(newSettings) {
        const wasEnabled = this.settings.multiSelectEnabled;
        this.settings = { ...this.settings, ...newSettings };
        
        logger.info('Settings updated:', this.settings);
        
        if (this.settings.multiSelectEnabled && !wasEnabled) {
            this.enable();
        } else if (!this.settings.multiSelectEnabled && wasEnabled) {
            this.disable();
        }
    }

    enable() {
        if (this.isEnabled) return;
        
        logger.info('Enabling multi-select mode');
        this.isEnabled = true;
        
        // Inject CSS
        this.injectStyles();
        
        // Add click handlers to existing videos
        this.addClickHandlers();
        
        // Create action toolbar
        this.createActionToolbar();
        
        // Set up simple observer for new videos
        this.setupSimpleObserver();
        
        // Add keyboard shortcuts
        this.setupKeyboardShortcuts();
    }

    disable() {
        if (!this.isEnabled) return;
        
        logger.info('Disabling multi-select mode');
        this.isEnabled = false;
        
        // Clear selections
        this.clearAllSelections();
        
        // Remove action toolbar
        this.removeActionToolbar();
        
        // Disconnect observer
        this.disconnectObserver();
        
        // Remove keyboard shortcuts
        this.removeKeyboardShortcuts();
    }

    injectStyles() {
        if (document.querySelector('#yt-commander-multiselect-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'yt-commander-multiselect-styles';
        style.textContent = `
            /* Simple selection styling with overlay */
            .yt-commander-selected {
                position: relative !important;
            }
            
            .yt-commander-selected::after {
                content: '' !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                background: rgba(255, 0, 0, 0.15) !important;
                border: 2px solid #ff0000 !important;
                border-radius: 8px !important;
                pointer-events: none !important;
                z-index: 5 !important;
            }
            
            .yt-commander-processing {
                position: relative !important;
            }
            
            .yt-commander-processing::before {
                content: 'Processing...' !important;
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                background: rgba(0, 0, 0, 0.9) !important;
                color: white !important;
                padding: 8px 12px !important;
                border-radius: 6px !important;
                font-size: 12px !important;
                font-weight: bold !important;
                z-index: 10 !important;
                pointer-events: none !important;
                animation: pulse 1s infinite !important;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            .yt-commander-clickable {
                cursor: pointer !important;
                position: relative !important;
            }
            
            .yt-commander-clickable:hover {
                background: rgba(255, 0, 0, 0.05) !important;
            }
            
            .yt-commander-clickable::before {
                content: 'Ctrl+Click to select' !important;
                position: absolute !important;
                top: 5px !important;
                right: 5px !important;
                background: rgba(0, 0, 0, 0.8) !important;
                color: white !important;
                padding: 2px 6px !important;
                border-radius: 4px !important;
                font-size: 11px !important;
                opacity: 0 !important;
                transition: opacity 0.2s !important;
                z-index: 10 !important;
                pointer-events: none !important;
            }
            
            .yt-commander-clickable:hover::before {
                opacity: 1 !important;
            }
            
            /* Action toolbar styling */
            .yt-commander-action-toolbar {
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                background: #1f1f1f !important;
                border: 1px solid #333 !important;
                border-radius: 12px !important;
                padding: 16px !important;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
                z-index: 9999 !important;
                display: none !important;
                flex-direction: column !important;
                gap: 12px !important;
                min-width: 200px !important;
            }
            
            .yt-commander-action-toolbar.visible {
                display: flex !important;
            }
            
            .yt-commander-toolbar-header {
                color: #f1f1f1 !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                text-align: center !important;
            }
            
            .yt-commander-toolbar-buttons {
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
            }
            
            .yt-commander-action-btn {
                background: #ff0000 !important;
                color: white !important;
                border: none !important;
                padding: 10px 16px !important;
                border-radius: 6px !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
            }
            
            .yt-commander-action-btn:hover {
                background: #cc0000 !important;
                transform: translateY(-1px) !important;
            }
            
            .yt-commander-action-btn.secondary {
                background: #333 !important;
                color: #f1f1f1 !important;
            }
            
            .yt-commander-action-btn.secondary:hover {
                background: #444 !important;
            }
            
            .yt-commander-action-btn.danger {
                background: #d32f2f !important;
            }
            
            .yt-commander-action-btn.danger:hover {
                background: #b71c1c !important;
            }
        `;
        document.head.appendChild(style);
        logger.info('Styles injected');
    }

    addClickHandlers() {
        // Simple approach: find all video containers
        const videoContainers = document.querySelectorAll(`
            ytd-rich-item-renderer,
            ytd-video-renderer,
            ytd-playlist-video-renderer,
            ytd-compact-video-renderer
        `);
        
        logger.info(`Adding click handlers to ${videoContainers.length} videos`);
        
        videoContainers.forEach(container => this.addClickHandler(container));
    }

    addClickHandler(container) {
        if (!container || container.hasAttribute('data-multiselect-processed')) return;
        
        // Mark as processed
        container.setAttribute('data-multiselect-processed', 'true');
        
        // Find video link to get video ID
        const videoLink = container.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
        if (!videoLink) return;
        
        const videoId = getVideoId(videoLink.href);
        if (!videoId) return;
        
        // Add visual indicator
        container.classList.add('yt-commander-clickable');
        
        // Add click handler to entire container (better event handling)
        container.addEventListener('click', (e) => {
            // Only handle if Ctrl is pressed (multi-select mode)
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.toggleVideoSelection(container, videoId);
                return false;
            }
        }, true); // Use capture phase for better control
        
        logger.info(`Added click handler for video: ${videoId}`);
    }

    toggleVideoSelection(container, videoId) {
        if (this.selectedVideos.has(videoId)) {
            // Deselect
            this.selectedVideos.delete(videoId);
            container.classList.remove('yt-commander-selected');
            logger.info(`Deselected video: ${videoId}`);
        } else {
            // Select
            this.selectedVideos.set(videoId, container);
            container.classList.add('yt-commander-selected');
            logger.info(`Selected video: ${videoId}`);
        }
        
        this.updateActionToolbar();
    }

    createActionToolbar() {
        if (this.actionToolbar) return;
        
        const toolbar = document.createElement('div');
        toolbar.className = 'yt-commander-action-toolbar';
        toolbar.innerHTML = `
            <div class="yt-commander-toolbar-header">
                <span id="yt-commander-selection-count">0 videos selected</span>
            </div>
            <div class="yt-commander-toolbar-buttons">
                <button class="yt-commander-action-btn" id="yt-commander-add-to-playlist">
                    Add to Playlist
                </button>
                <button class="yt-commander-action-btn danger" id="yt-commander-delete-videos">
                    Delete Selected
                </button>
                <button class="yt-commander-action-btn secondary" id="yt-commander-select-all">
                    Select All
                </button>
                <button class="yt-commander-action-btn secondary" id="yt-commander-clear-selection">
                    Clear Selection
                </button>
            </div>
        `;
        
        // Add event listeners
        toolbar.querySelector('#yt-commander-add-to-playlist').addEventListener('click', () => {
            this.addSelectedToPlaylist();
        });
        
        toolbar.querySelector('#yt-commander-delete-videos').addEventListener('click', () => {
            this.deleteSelectedVideos();
        });
        
        toolbar.querySelector('#yt-commander-select-all').addEventListener('click', () => {
            this.selectAllVideos();
        });
        
        toolbar.querySelector('#yt-commander-clear-selection').addEventListener('click', () => {
            this.clearAllSelections();
        });
        
        document.body.appendChild(toolbar);
        this.actionToolbar = toolbar;
        
        logger.info('Action toolbar created');
    }

    updateActionToolbar() {
        if (!this.actionToolbar) return;
        
        const count = this.selectedVideos.size;
        const countElement = this.actionToolbar.querySelector('#yt-commander-selection-count');
        
        if (count > 0) {
            countElement.textContent = `${count} video${count === 1 ? '' : 's'} selected`;
            this.actionToolbar.classList.add('visible');
        } else {
            this.actionToolbar.classList.remove('visible');
        }
    }

    addSelectedToPlaylist() {
        if (this.selectedVideos.size === 0) return;
        
        const videoIds = Array.from(this.selectedVideos.keys());
        logger.info(`Adding ${videoIds.length} videos to playlist:`, videoIds);
        
        // Research YouTube's actual API structure first
        this.researchYouTubeAPI(videoIds);
    }
    
    researchYouTubeAPI(videoIds) {
        logger.info('=== STARTING DEEP RESEARCH OF YOUTUBE API ===');
        
        // Step 1: Analyze current page structure
        this.analyzePageStructure();
        
        // Step 2: Monitor all network requests
        this.setupNetworkMonitoring();
        
        // Step 3: Try to trigger a single save to see the actual API calls
        this.triggerSingleSaveForResearch(videoIds);
    }
    
    analyzePageStructure() {
        logger.info('=== ANALYZING PAGE STRUCTURE ===');
        
        // Check what YouTube objects are available
        logger.info('window.yt:', window.yt ? Object.keys(window.yt) : 'not found');
        logger.info('window.ytcfg:', window.ytcfg ? 'found' : 'not found');
        logger.info('window.ytInitialData:', window.ytInitialData ? 'found' : 'not found');
        
        if (window.ytcfg && window.ytcfg.get) {
            const apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
            const sessionToken = window.ytcfg.get('XSRF_TOKEN');
            const clientName = window.ytcfg.get('INNERTUBE_CLIENT_NAME');
            const clientVersion = window.ytcfg.get('INNERTUBE_CLIENT_VERSION');
            
            logger.info('API Key:', apiKey);
            logger.info('Session Token:', sessionToken ? 'found' : 'not found');
            logger.info('Client Name:', clientName);
            logger.info('Client Version:', clientVersion);
        }
        
        // Check for playlist-related objects
        if (window.yt && window.yt.www) {
            logger.info('yt.www keys:', Object.keys(window.yt.www));
        }
    }
    
    setupNetworkMonitoring() {
        logger.info('=== SETTING UP NETWORK MONITORING ===');
        
        // Store original fetch to monitor all requests
        if (!window.originalFetchForResearch) {
            window.originalFetchForResearch = window.fetch;
            
            window.fetch = function(...args) {
                const [url, options] = args;
                
                // Log all YouTube API calls
                if (url && url.includes('youtubei')) {
                    logger.info('🔍 YOUTUBE API CALL:', url);
                    
                    if (options && options.body) {
                        try {
                            const body = JSON.parse(options.body);
                            logger.info('📝 REQUEST BODY:', body);
                        } catch (e) {
                            logger.info('📝 REQUEST BODY (raw):', options.body);
                        }
                    }
                    
                    if (options && options.headers) {
                        logger.info('📋 REQUEST HEADERS:', options.headers);
                    }
                }
                
                // Call original fetch and log response
                const response = window.originalFetchForResearch.apply(this, args);
                
                if (url && url.includes('youtubei')) {
                    response.then(resp => {
                        logger.info('✅ RESPONSE STATUS:', resp.status);
                        
                        // Clone response to read body without consuming it
                        const clonedResponse = resp.clone();
                        clonedResponse.text().then(text => {
                            try {
                                const json = JSON.parse(text);
                                logger.info('📤 RESPONSE BODY:', json);
                            } catch (e) {
                                logger.info('📤 RESPONSE BODY (raw):', text.substring(0, 500));
                            }
                        });
                    }).catch(err => {
                        logger.error('❌ REQUEST FAILED:', err);
                    });
                }
                
                return response;
            };
        }
    }
    
    triggerSingleSaveForResearch(videoIds) {
        logger.info('=== TRIGGERING SINGLE SAVE FOR RESEARCH ===');
        
        // Get first video to test with
        const firstVideoId = videoIds[0];
        const firstContainer = this.selectedVideos.get(firstVideoId);
        
        if (!firstContainer) {
            logger.error('No container found for research');
            return;
        }
        
        // Find save button
        const saveButton = firstContainer.querySelector('button[aria-label*="Save"], button[title*="Save"]');
        
        if (saveButton) {
            logger.info('🔬 CLICKING SAVE BUTTON FOR RESEARCH - WATCH NETWORK LOGS');
            saveButton.click();
            
            // After 5 seconds, restore original fetch and show findings
            setTimeout(() => {
                this.restoreOriginalFetch();
                this.showResearchFindings(videoIds);
            }, 5000);
        } else {
            logger.error('No save button found for research');
            this.showCustomBulkModal(videoIds);
        }
    }
    
    restoreOriginalFetch() {
        if (window.originalFetchForResearch) {
            window.fetch = window.originalFetchForResearch;
            delete window.originalFetchForResearch;
            logger.info('🔄 RESTORED ORIGINAL FETCH');
        }
    }
    
    showResearchFindings(videoIds) {
        logger.info('=== RESEARCH COMPLETE ===');
        logger.info('Check the console logs above to see:');
        logger.info('1. What API endpoints YouTube actually uses');
        logger.info('2. What the request/response structure looks like');
        logger.info('3. What authentication headers are needed');
        logger.info('4. How the playlist modal gets its data');
        
        // For now, fall back to custom modal
        this.showCustomBulkModal(videoIds);
    }

    interceptPlaylistSave(videoIds) {
        // Store video IDs globally for the save modal to access
        window.ytCommanderBulkVideos = videoIds;
        
        // Get first video container to trigger save modal
        const firstContainer = this.selectedVideos.values().next().value;
        if (!firstContainer) return;
        
        // Find save button on first video
        const saveButton = firstContainer.querySelector('button[aria-label*="Save"], button[title*="Save"]');
        
        if (saveButton) {
            // Set up interception before clicking
            this.setupSaveInterception();
            
            // Click save button to open modal
            saveButton.click();
            
            logger.info('Opened save modal, intercepting for bulk operation');
        } else {
            logger.warn('No save button found, showing custom modal');
            this.showCustomBulkModal(videoIds);
        }
    }
    
    setupSaveInterception() {
        // Intercept YouTube's playlist save requests
        if (window.ytCommanderInterceptionActive) return;
        
        window.ytCommanderInterceptionActive = true;
        const originalFetch = window.fetch;
        
        window.fetch = function(...args) {
            const [url, options] = args;
            
            // Intercept playlist add requests
            if (url && (url.includes('playlist/get_add_to_playlist') || url.includes('browse/edit_playlist'))) {
                logger.info('Intercepting playlist request:', url);
                
                if (options && options.body && window.ytCommanderBulkVideos) {
                    try {
                        const body = JSON.parse(options.body);
                        
                        // Modify the request to include all selected videos
                        if (body.videoIds) {
                            body.videoIds = window.ytCommanderBulkVideos;
                        } else if (body.videoId) {
                            // Convert single video to multiple videos
                            body.videoIds = window.ytCommanderBulkVideos;
                            delete body.videoId;
                        }
                        
                        options.body = JSON.stringify(body);
                        logger.info('Modified request for bulk videos:', window.ytCommanderBulkVideos);
                        
                    } catch (e) {
                        logger.warn('Failed to modify request:', e);
                    }
                }
            }
            
            return originalFetch.apply(this, args);
        };
        
        // Restore after 30 seconds
        setTimeout(() => {
            window.fetch = originalFetch;
            window.ytCommanderInterceptionActive = false;
            delete window.ytCommanderBulkVideos;
        }, 30000);
    }
    
    showCustomBulkModal(videoIds) {
        // Simple custom modal for bulk operations
        const modal = document.createElement('div');
        modal.className = 'yt-commander-bulk-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Add ${videoIds.length} videos to playlist</h3>
                <p>Click "Watch Later" to add all videos to your Watch Later playlist</p>
                <div class="modal-actions">
                    <button class="watch-later-btn">📺 Add to Watch Later</button>
                    <button class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        
        // Add styles
        if (!document.querySelector('#yt-commander-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'yt-commander-modal-styles';
            style.textContent = `
                .yt-commander-bulk-modal {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                }
                .yt-commander-bulk-modal .modal-content {
                    background: #1f1f1f;
                    border-radius: 8px;
                    padding: 24px;
                    min-width: 350px;
                    color: white;
                    text-align: center;
                }
                .yt-commander-bulk-modal h3 {
                    margin: 0 0 16px 0;
                    color: #fff;
                }
                .yt-commander-bulk-modal p {
                    margin: 0 0 20px 0;
                    color: #ccc;
                }
                .yt-commander-bulk-modal .modal-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
                .yt-commander-bulk-modal button {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .yt-commander-bulk-modal .watch-later-btn {
                    background: #ff0000;
                    color: white;
                }
                .yt-commander-bulk-modal .cancel-btn {
                    background: #333;
                    color: white;
                }
                .yt-commander-bulk-modal button:hover {
                    opacity: 0.8;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(modal);
        
        // Handle actions
        modal.querySelector('.watch-later-btn').addEventListener('click', () => {
            this.addAllToWatchLater(videoIds);
            modal.remove();
        });
        
        modal.querySelector('.cancel-btn').addEventListener('click', () => {
            modal.remove();
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    addAllToWatchLater(videoIds) {
        logger.info(`Adding ${videoIds.length} videos to Watch Later`);
        
        // Use YouTube's internal API to add videos to Watch Later
        this.bulkAddToWatchLater(videoIds);
    }
    
    async bulkAddToWatchLater(videoIds) {
        try {
            // Method 1: Try direct button clicking approach first
            const success = await this.tryDirectWatchLaterMethod(videoIds);
            if (success) {
                this.showSuccessMessage(`✅ Added ${videoIds.length} videos to Watch Later!`);
                return;
            }
            
            // Method 2: Try API approach
            const sessionToken = this.getYouTubeSessionToken();
            const apiKey = this.getYouTubeApiKey();
            
            if (!sessionToken || !apiKey) {
                logger.warn('Could not get YouTube session data, trying alternative method');
                this.tryAlternativeWatchLaterMethod(videoIds);
                return;
            }
            
            // Use YouTube's internal API to add videos to Watch Later playlist
            const watchLaterPlaylistId = 'WL'; // YouTube's Watch Later playlist ID
            
            for (const videoId of videoIds) {
                await this.addVideoToPlaylistAPI(videoId, watchLaterPlaylistId, sessionToken, apiKey);
                await new Promise(resolve => setTimeout(resolve, 200)); // Small delay
            }
            
            this.showSuccessMessage(`✅ Added ${videoIds.length} videos to Watch Later!`);
            
        } catch (error) {
            logger.error('Failed to bulk add to Watch Later:', error);
            this.fallbackWatchLaterMethod(videoIds);
        }
    }
    
    async tryDirectWatchLaterMethod(videoIds) {
        try {
            logger.info('Trying direct Watch Later button method');
            
            for (const videoId of videoIds) {
                const container = this.selectedVideos.get(videoId);
                if (!container) continue;
                
                // Look for Watch Later button in this container
                const watchLaterBtn = container.querySelector('button[aria-label*="Watch later"], button[title*="Watch later"]');
                
                if (watchLaterBtn) {
                    // Click the Watch Later button
                    watchLaterBtn.click();
                    logger.info(`Clicked Watch Later for video: ${videoId}`);
                    
                    // Small delay between clicks
                    await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                    logger.warn(`No Watch Later button found for video: ${videoId}`);
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            logger.error('Direct Watch Later method failed:', error);
            return false;
        }
    }
    
    tryAlternativeWatchLaterMethod(videoIds) {
        logger.info('Trying alternative Watch Later method');
        
        // Open first video and use its Watch Later button
        const firstVideoId = videoIds[0];
        const firstVideoUrl = `https://www.youtube.com/watch?v=${firstVideoId}`;
        
        // Create a temporary iframe to load the video page
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = firstVideoUrl;
        
        iframe.onload = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const watchLaterBtn = iframeDoc.querySelector('button[aria-label*="Watch later"]');
                
                if (watchLaterBtn) {
                    // Try to trigger Watch Later for all videos
                    videoIds.forEach((videoId, index) => {
                        setTimeout(() => {
                            // Modify the iframe URL and click Watch Later
                            iframe.src = `https://www.youtube.com/watch?v=${videoId}`;
                            setTimeout(() => {
                                const btn = iframe.contentDocument?.querySelector('button[aria-label*="Watch later"]');
                                if (btn) btn.click();
                            }, 1000);
                        }, index * 2000);
                    });
                    
                    // Remove iframe after processing
                    setTimeout(() => {
                        iframe.remove();
                        this.showSuccessMessage(`✅ Attempted to add ${videoIds.length} videos to Watch Later!`);
                    }, videoIds.length * 2000 + 1000);
                } else {
                    iframe.remove();
                    this.fallbackWatchLaterMethod(videoIds);
                }
            } catch (error) {
                logger.error('Alternative method failed:', error);
                iframe.remove();
                this.fallbackWatchLaterMethod(videoIds);
            }
        };
        
        document.body.appendChild(iframe);
    }
    
    getYouTubeSessionToken() {
        try {
            // Method 1: Try ytcfg
            if (window.ytcfg && window.ytcfg.get) {
                const token = window.ytcfg.get('XSRF_TOKEN') || window.ytcfg.get('SESSION_INDEX');
                if (token) {
                    logger.info('Found session token via ytcfg');
                    return token;
                }
            }
            
            // Method 2: Try ytInitialData
            if (window.ytInitialData && window.ytInitialData.xsrf_token) {
                logger.info('Found session token via ytInitialData');
                return window.ytInitialData.xsrf_token;
            }
            
            // Method 3: Look in page scripts
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const content = script.textContent;
                if (content && content.includes('XSRF_TOKEN')) {
                    const match = content.match(/["']XSRF_TOKEN["']\s*:\s*["']([^"']+)["']/);
                    if (match) {
                        logger.info('Found session token via script parsing');
                        return match[1];
                    }
                }
            }
            
            // Method 4: Look for session_token in page
            const sessionMatch = document.documentElement.innerHTML.match(/["']session_token["']\s*:\s*["']([^"']+)["']/);
            if (sessionMatch) {
                logger.info('Found session token via page search');
                return sessionMatch[1];
            }
            
            logger.warn('No session token found');
            return null;
        } catch (error) {
            logger.error('Failed to get session token:', error);
            return null;
        }
    }
    
    getYouTubeApiKey() {
        try {
            // Method 1: Try ytcfg
            if (window.ytcfg && window.ytcfg.get) {
                const apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
                if (apiKey) {
                    logger.info('Found API key via ytcfg');
                    return apiKey;
                }
            }
            
            // Method 2: Look in page scripts
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const content = script.textContent;
                if (content && content.includes('INNERTUBE_API_KEY')) {
                    const match = content.match(/["']INNERTUBE_API_KEY["']\s*:\s*["']([^"']+)["']/);
                    if (match) {
                        logger.info('Found API key via script parsing');
                        return match[1];
                    }
                }
            }
            
            logger.warn('No API key found');
            return null;
        } catch (error) {
            logger.error('Failed to get API key:', error);
            return null;
        }
    }
    
    async addVideoToPlaylistAPI(videoId, playlistId, sessionToken, apiKey) {
        try {
            const url = `https://www.youtube.com/youtubei/v1/browse/edit_playlist?key=${apiKey}`;
            
            const payload = {
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.0'
                    }
                },
                playlistId: playlistId,
                actions: [{
                    action: 'ACTION_ADD_VIDEO',
                    addedVideoId: videoId
                }]
            };
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-YouTube-Client-Name': '1',
                    'X-YouTube-Client-Version': '2.0',
                    'X-XSRF-TOKEN': sessionToken
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                logger.info(`Successfully added video ${videoId} to Watch Later`);
                return true;
            } else {
                logger.warn(`Failed to add video ${videoId} to Watch Later:`, response.status);
                return false;
            }
            
        } catch (error) {
            logger.error(`Error adding video ${videoId} to Watch Later:`, error);
            return false;
        }
    }
    
    fallbackWatchLaterMethod(videoIds) {
        logger.info('Using fallback method for Watch Later');
        
        // Show a message to the user with video links
        const videoLinks = videoIds.map(id => `https://www.youtube.com/watch?v=${id}`).join('\n');
        
        const modal = document.createElement('div');
        modal.className = 'yt-commander-fallback-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>⚠️ Automatic Watch Later Failed</h3>
                <p>Please manually add these ${videoIds.length} videos to Watch Later:</p>
                <textarea readonly>${videoLinks}</textarea>
                <div class="modal-actions">
                    <button class="copy-btn">📋 Copy Links</button>
                    <button class="close-btn">Close</button>
                </div>
            </div>
        `;
        
        // Add styles for fallback modal
        const style = document.createElement('style');
        style.textContent = `
            .yt-commander-fallback-modal {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .yt-commander-fallback-modal .modal-content {
                background: #1f1f1f;
                border-radius: 8px;
                padding: 24px;
                max-width: 500px;
                color: white;
                text-align: center;
            }
            .yt-commander-fallback-modal textarea {
                width: 100%;
                height: 150px;
                margin: 16px 0;
                padding: 8px;
                background: #333;
                color: white;
                border: 1px solid #555;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
            }
            .yt-commander-fallback-modal .modal-actions {
                display: flex;
                gap: 12px;
                justify-content: center;
            }
            .yt-commander-fallback-modal button {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            }
            .yt-commander-fallback-modal .copy-btn {
                background: #4caf50;
                color: white;
            }
            .yt-commander-fallback-modal .close-btn {
                background: #333;
                color: white;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
        
        // Handle actions
        modal.querySelector('.copy-btn').addEventListener('click', () => {
            const textarea = modal.querySelector('textarea');
            textarea.select();
            document.execCommand('copy');
            this.showSuccessMessage('📋 Video links copied to clipboard!');
        });
        
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
            style.remove();
        });
    }
    
    getCurrentVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }
    
    setCurrentVideoId(videoId) {
        // This is a simplified approach - in reality you'd need to modify YouTube's internal state
        // For now, just log the action
        logger.info(`Setting context video ID to: ${videoId}`);
    }
    
    showSuccessMessage(message) {
        const toast = document.createElement('div');
        toast.className = 'yt-commander-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #4caf50;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            z-index: 10000;
            font-size: 14px;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    deleteSelectedVideos() {
        if (this.selectedVideos.size === 0) return;
        
        const count = this.selectedVideos.size;
        if (!confirm(`Are you sure you want to delete ${count} video${count === 1 ? '' : 's'}?`)) {
            return;
        }
        
        logger.info(`Deleting ${count} videos`);
        
        // Trigger native YouTube delete for each selected video
        this.selectedVideos.forEach((container, videoId) => {
            this.triggerNativeDelete(videoId, container);
        });
        
        // Clear selections after deletion
        setTimeout(() => {
            this.clearAllSelections();
        }, 1000);
    }

    triggerNativeDelete(videoId, container) {
        
        // Click three-dots menu
        const menuButton = container.querySelector('button[aria-label="Action menu"], button[aria-label*="More"]');
        if (!menuButton) return;
        
        menuButton.click();
        
        // Wait for menu to appear, then look for remove/delete option
        setTimeout(() => {
            const menuItems = document.querySelectorAll('tp-yt-paper-listbox [role="menuitem"]');
            for (const item of menuItems) {
                const text = item.textContent.toLowerCase();
                if (text.includes('remove') || text.includes('delete') || text.includes('from')) {
                    item.click();
                    logger.info(`Triggered delete for video: ${videoId}`);
                    break;
                }
            }
        }, 100);
    }

    selectAllVideos() {
        const containers = document.querySelectorAll('[data-multiselect-processed="true"]:not(.yt-commander-selected)');
        containers.forEach(container => {
            const videoLink = container.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
            if (videoLink) {
                const videoId = getVideoId(videoLink.href);
                if (videoId) {
                    this.selectedVideos.set(videoId, container);
                    container.classList.add('yt-commander-selected');
                }
            }
        });
        
        this.updateActionToolbar();
        logger.info(`Selected all ${containers.length} videos`);
    }

    clearAllSelections() {
        // Remove selection styling
        document.querySelectorAll('.yt-commander-selected').forEach(element => {
            element.classList.remove('yt-commander-selected');
        });
        
        this.selectedVideos.clear();
        this.updateActionToolbar();
        logger.info('Cleared all selections');
    }


    removeActionToolbar() {
        if (this.actionToolbar) {
            this.actionToolbar.remove();
            this.actionToolbar = null;
            logger.info('Removed action toolbar');
        }
    }

    setupSimpleObserver() {
        // Simple observer for infinite loading
        this.observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            let hasNewVideos = false;
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        // Check if new video containers were added
                        const isVideoContainer = node.matches && node.matches('ytd-rich-item-renderer, ytd-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer');
                        const hasVideoContainers = node.querySelectorAll && node.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer').length > 0;
                        
                        if (isVideoContainer || hasVideoContainers) {
                            hasNewVideos = true;
                        }
                    }
                });
            });
            
            if (hasNewVideos) {
                // Small delay to let YouTube finish rendering
                setTimeout(() => this.addClickHandlers(), 200);
            }
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        logger.info('Set up simple observer for infinite loading');
    }

    disconnectObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
            logger.info('Disconnected observer');
        }
    }

    setupKeyboardShortcuts() {
        this.keyboardHandler = (event) => {
            if (!this.isEnabled) return;
            
            // Ctrl+A to select all (when not in input field)
            if (event.ctrlKey && event.key === 'a' && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
                event.preventDefault();
                this.selectAllVideos();
            }
            
            // Escape to clear selection
            if (event.key === 'Escape') {
                this.clearAllSelections();
            }
        };
        
        document.addEventListener('keydown', this.keyboardHandler);
        logger.info('Set up keyboard shortcuts');
    }

    removeKeyboardShortcuts() {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
            logger.info('Removed keyboard shortcuts');
        }
    }
}

// Initialize the multi-select system
const videoMultiSelect = new VideoMultiSelect();

// Export for testing
window.ytCommanderMultiSelect = videoMultiSelect;

// Export functions for module system
export {
    videoMultiSelect as default,
    VideoMultiSelect
};
