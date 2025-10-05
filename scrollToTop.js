// Create and inject the scroll-to-top button
function createScrollButton() {
    const button = document.createElement('button');
    button.id = 'yt-scroll-to-top';
    button.setAttribute('aria-label', 'Scroll to top');
    
    // Create SVG icon
    button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" transform="rotate(-90 12 12)"/>
        </svg>
    `;
    
    document.body.appendChild(button);
    return button;
}

// Toggle button visibility
function toggleScrollButton(button) {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    
    if (scrollTop > 100) {
        button.style.display = 'flex';
        // Small delay to ensure display: flex is applied before opacity transition
        setTimeout(() => {
            button.style.opacity = '1';
        }, 10);
    } else {
        button.style.opacity = '0';
        setTimeout(() => {
            if (scrollTop <= 100) {
                button.style.display = 'none';
            }
        }, 200);
    }
}

// Initialize scroll-to-top functionality
function initScrollToTop() {
    const button = createScrollButton();
    
    // Add scroll event listener
    window.addEventListener('scroll', () => toggleScrollButton(button));
    
    // Add click handler
    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // Initial check
    toggleScrollButton(button);
}

// Initialize when DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollToTop);
} else {
    initScrollToTop();
}
