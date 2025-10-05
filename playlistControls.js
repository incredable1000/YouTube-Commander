// Function to add open-in-new-tab icons to playlist videos
function addOpenLinkIcons() {
    // Only run on playlist pages
    if (!window.location.href.includes('/playlist?')) return;

    // Select all video rows on the playlist page
    const videoRows = document.querySelectorAll("ytd-playlist-video-renderer");

    videoRows.forEach((row) => {
        // Skip rows that already have the icon
        if (row.querySelector(".open-new-tab-icon")) return;

        // Create a container for the icon
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.height = "100%";
        container.style.marginRight = "8px";
        container.classList.add("open-new-tab-icon");
        container.style.cursor = "pointer";
        container.style.padding = "8px";
        container.style.opacity = "0.7";
        container.style.transition = "opacity 0.2s";
        container.style.color = "#808080";

        // Create SVG icon
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "24");
        svg.setAttribute("height", "24");
        svg.style.fill = "currentColor";

        // Add the path for the "open in new" icon
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z");

        svg.appendChild(path);
        container.appendChild(svg);

        // Add hover effect
        container.addEventListener("mouseover", () => {
            container.style.opacity = "1";
        });

        container.addEventListener("mouseout", () => {
            container.style.opacity = "0.7";
        });

        // Attach click event to open the video in a new tab
        container.addEventListener("click", () => {
            const videoLink = row.querySelector("a#thumbnail")?.href;
            if (videoLink) {
                const videoIdMatch = videoLink.match(/[?&]v=([^&]+)/);
                if (videoIdMatch) {
                    const videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
                    chrome.runtime.sendMessage({ action: 'openNewTab', url: videoUrl });
                }
            }
        });

        // Insert the container before the #menu element
        const menu = row.querySelector("#menu");
        if (menu) {
            menu.parentNode.insertBefore(container, menu);
        } else {
            row.appendChild(container);
        }
    });
}

// Initialize playlist functionality
const playlistObserver = new MutationObserver(() => {
    requestIdleCallback(() => addOpenLinkIcons(), { timeout: 2000 });
});

// Start observing changes for playlist functionality
playlistObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial run for playlist functionality
addOpenLinkIcons();

// Initialize on navigation and page load
window.addEventListener('yt-navigate-finish', addOpenLinkIcons);
window.addEventListener('load', addOpenLinkIcons);
