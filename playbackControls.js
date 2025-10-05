// Function to create playback speed buttons
function createSpeedControls() {
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    // Remove existing speed buttons if any
    const existingSpeedButtons = document.querySelector('.custom-speed-control');
    if (existingSpeedButtons) {
        existingSpeedButtons.remove();
    }

    // Create speed control button
    const speedButton = document.createElement('button');
    speedButton.className = 'ytp-button custom-speed-control';
    speedButton.innerHTML = '<div class="ytp-menuitem-label" style="font-size: 13px;">1x</div>';
    speedButton.setAttribute('title', 'Playback Speed');

    // Create speed menu
    const speedMenu = document.createElement('div');
    speedMenu.className = 'ytp-popup ytp-settings-menu custom-speed-menu';
    speedMenu.style.cssText = `
        display: none;
        position: absolute;
        bottom: 60px;
        right: auto;
        background-color: rgba(28, 28, 28, 0.9);
        border-radius: 2px;
        padding: 2px 8px;
        z-index: 2;
    `;

    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    speeds.forEach(speed => {
        const speedOption = document.createElement('div');
        speedOption.className = 'ytp-menuitem';
        speedOption.style.cssText = `
            padding: 2px 8px;
            cursor: pointer;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        `;
        speedOption.innerHTML = `<span style="font-size: 11px; line-height: 16px;">${speed}x</span>`;
        
        // Add hover effect
        speedOption.addEventListener('mouseover', () => {
            speedOption.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        speedOption.addEventListener('mouseout', () => {
            speedOption.style.backgroundColor = 'transparent';
        });

        speedOption.onclick = (e) => {
            e.stopPropagation();
            const video = document.querySelector('.html5-main-video');
            if (video) {
                video.playbackRate = speed;
                speedButton.querySelector('.ytp-menuitem-label').textContent = `${speed}x`;
                speedMenu.style.display = 'none';
            }
        };

        speedMenu.appendChild(speedOption);
    });

    // Function to update menu position
    const updateMenuPosition = () => {
        const buttonRect = speedButton.getBoundingClientRect();
        speedMenu.style.bottom = '60px';
        speedMenu.style.left = `${buttonRect.left}px`;
    };

    // Toggle menu on click
    speedButton.onclick = (e) => {
        e.stopPropagation();
        const isVisible = speedMenu.style.display === 'block';
        speedMenu.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            updateMenuPosition();
        }
    };

    // Update position on window resize
    window.addEventListener('resize', () => {
        if (speedMenu.style.display === 'block') {
            updateMenuPosition();
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', () => {
        speedMenu.style.display = 'none';
    });

    // Insert before settings button
    const settingsButton = rightControls.querySelector('.ytp-settings-button');
    if (settingsButton) {
        rightControls.insertBefore(speedButton, settingsButton);
        rightControls.insertBefore(speedMenu, settingsButton);
    }
}

// Initialize speed controls when player is ready
function initializeSpeedControls() {
    createSpeedControls();
    
    // If controls weren't created, try again after a short delay
    setTimeout(() => {
        if (!document.querySelector('.custom-speed-control')) {
            createSpeedControls();
        }
    }, 1000);
}

// Watch for player changes
const speedObserver = new MutationObserver((mutations) => {
    const hasSpeedControls = document.querySelector('.custom-speed-control');
    const hasPlayer = document.querySelector('.html5-main-video');
    
    if (!hasSpeedControls && hasPlayer) {
        createSpeedControls();
    }
});

speedObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Initialize
window.addEventListener('yt-navigate-finish', createSpeedControls);
window.addEventListener('load', createSpeedControls);
