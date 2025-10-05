class FullWindowMode {
    constructor() {
        this.isFullWindow = false;
        this.originalStyles = {};
        this.videoElement = null;
        this.fullWindowContainer = null;
        this.originalParent = null;
        this.originalNextSibling = null;
        this.originalBodyOverflow = '';
        
        this.initialize();
    }

    async initialize() {
        // Wait for YouTube player to be ready
        await this.waitForPlayer();
        this.setupFullWindowButton();
    }

    waitForPlayer() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const player = document.querySelector('.html5-video-player');
                if (player) {
                    clearInterval(checkInterval);
                    this.videoElement = player.querySelector('video');
                    resolve();
                }
            }, 500);
        });
    }

    setupFullWindowButton() {
        // Create button
        this.fullWindowButton = document.createElement('button');
        this.fullWindowButton.className = 'ytp-button ytp-fullwindow-button';
        this.fullWindowButton.title = 'Toggle full window (Alt+F)';
        this.fullWindowButton.setAttribute('aria-label', 'Toggle full window');
        
        // Add icon
        this.fullWindowButton.innerHTML = `
            <svg width="100%" height="100%" viewBox="0 0 36 36" style="pointer-events: none;">
                <path d="M10 16h2v-4h4v-2h-6v6zm14-6h-6v2h4v4h2v-6zm-14 14v-6h2v4h4v2h-6zm14 0h-6v2h8v-8h-2v6z" 
                      fill="#fff" 
                      style="filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));">
                </path>
            </svg>
        `;

        // Style the button
        Object.assign(this.fullWindowButton.style, {
            width: '46px',
            height: '42px',
            padding: '0',
            margin: '0 5px',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px',
            outline: 'none',
            color: '#fff',
            opacity: '0.9',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: '1000',
            transition: 'all 0.2s ease'
        });

        // Add hover effects
        this.fullWindowButton.onmouseover = () => {
            this.fullWindowButton.style.opacity = '1';
            this.fullWindowButton.style.background = 'rgba(255, 255, 255, 0.2)';
        };
        
        this.fullWindowButton.onmouseout = () => {
            this.fullWindowButton.style.opacity = '0.9';
            this.fullWindowButton.style.background = 'rgba(255, 255, 255, 0.1)';
        };

        // Add click handler
        this.fullWindowButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleFullWindow();
            return false;
        });

        // Add keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'enter') {
                e.preventDefault();
                this.toggleFullWindow();
            } else if (e.key === 'Escape' && this.isFullWindow) {
                this.exitFullWindow();
            }
        });

        // Add button to controls
        this.addButtonToControls();
    }

    addButtonToControls() {
        const tryAddButton = () => {
            // Try different selectors for the controls container
            const controls = document.querySelector('.ytp-right-controls') || 
                           document.querySelector('.ytp-chrome-controls') ||
                           document.querySelector('.ytp-chrome-bottom') ||
                           document.querySelector('.ytp-chrome-controls .ytp-right-controls');
            
            if (controls) {
                // Check if button already exists
                if (controls.querySelector('.ytp-fullwindow-button')) {
                    return true;
                }

                // Try to insert before settings button if it exists
                const settingsButton = controls.querySelector('.ytp-settings-button, [role="button"][aria-label*="Settings"]');
                if (settingsButton && settingsButton.parentNode === controls) {
                    controls.insertBefore(this.fullWindowButton, settingsButton);
                } else {
                    // Otherwise add to the end
                    controls.appendChild(this.fullWindowButton);
                }
                console.log('Full window button added to controls');
                return true;
            }
            return false;
        };

        // Try immediately
        if (!tryAddButton()) {
            // If not found, try again after a delay
            const checkInterval = setInterval(() => {
                if (tryAddButton()) {
                    clearInterval(checkInterval);
                }
            }, 500);

            // Give up after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn('Could not find YouTube controls container after 10 seconds');
            }, 10000);
        }
    }

    toggleFullWindow() {
        if (this.isFullWindow) {
            this.exitFullWindow();
        } else {
            this.enterFullWindow();
        }
        this.isFullWindow = !this.isFullWindow;
    }

    enterFullWindow() {
        if (!this.videoElement) return;

        // Store original body overflow
        this.originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Store original parent and next sibling
        const player = this.videoElement.closest('.html5-video-player');
        if (!player) return;

        this.originalParent = player.parentNode;
        this.originalNextSibling = player.nextSibling;

        // Create full window container
        this.fullWindowContainer = document.createElement('div');
        this.fullWindowContainer.className = 'ytp-fullwindow-container';
        
        // Style the container
        Object.assign(this.fullWindowContainer.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#000',
            zIndex: '9999',
            margin: '0',
            padding: '0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden'
        });

        // Add to body
        document.body.appendChild(this.fullWindowContainer);

        // Move player to full window container
        this.fullWindowContainer.appendChild(player);

        // Style the player for full window
        Object.assign(player.style, {
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100vh',
            margin: '0',
            padding: '0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000'
        });

        // Style the video element
        Object.assign(this.videoElement.style, {
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '100vh',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto',
            padding: '0',
            position: 'relative',
            top: 'auto',
            left: 'auto',
            transform: 'none'
        });

        // Add class to body for custom styling
        document.body.classList.add('ytp-fullwindow-mode');

        // Update button state
        if (this.fullWindowButton) {
            this.fullWindowButton.classList.add('ytp-fullwindow-active');
            this.fullWindowButton.title = 'Exit full window (Alt+F)';
            this.fullWindowButton.setAttribute('aria-label', 'Exit full window');
        }
    }

    exitFullWindow() {
        if (!this.videoElement || !this.originalParent || !this.fullWindowContainer) return;

        // Remove full window container
        if (this.fullWindowContainer.parentNode) {
            this.fullWindowContainer.parentNode.removeChild(this.fullWindowContainer);
        }

        // Move player back to original position
        if (this.originalNextSibling) {
            this.originalParent.insertBefore(this.videoElement.closest('.html5-video-player'), this.originalNextSibling);
        } else {
            this.originalParent.appendChild(this.videoElement.closest('.html5-video-player'));
        }

        // Restore body overflow
        document.body.style.overflow = this.originalBodyOverflow || '';

        // Remove full window class
        document.body.classList.remove('ytp-fullwindow-mode');

        // Update button state
        if (this.fullWindowButton) {
            this.fullWindowButton.classList.remove('ytp-fullwindow-active');
            this.fullWindowButton.title = 'Toggle full window (Alt+F)';
            this.fullWindowButton.setAttribute('aria-label', 'Toggle full window');
        }
    }
}

// Initialize when the page is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new FullWindowMode());
} else {
    new FullWindowMode();
}
