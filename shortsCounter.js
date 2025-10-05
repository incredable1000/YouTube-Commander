// shortsCounter.js
(() => {
  let countedVideos = new Set();
  let counter = 0;
  let counterLabel;

  // Create and style the counter label (only if on Shorts page)
  function createCounterLabel() {
    // Avoid duplicates
    if (document.getElementById('shorts-counter-label')) return;

    counterLabel = document.createElement('div');
    counterLabel.id = 'shorts-counter-label';
    counterLabel.style.position = 'fixed';
    counterLabel.style.top = '60px'; // more space from top
    counterLabel.style.right = '10px';
    counterLabel.style.background = 'rgba(255, 0, 100, 0.8)'; // fun color
    counterLabel.style.color = '#fff';
    counterLabel.style.padding = '10px 14px';
    counterLabel.style.borderRadius = '50%';
    counterLabel.style.fontSize = '20px';
    counterLabel.style.fontWeight = 'bold';
    counterLabel.style.textAlign = 'center';
    counterLabel.style.zIndex = '99999';
    counterLabel.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    counterLabel.style.cursor = 'default';
    counterLabel.innerText = counter; // only show number
    document.body.appendChild(counterLabel);
  }

  // Update the counter label
  function updateCounterLabel() {
    if (counterLabel) {
      counterLabel.innerText = counter; // just the number
    }
  }

  // Extract Shorts video ID from URL
  function getCurrentShortsId() {
    try {
      const url = new URL(window.location.href);
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/shorts/')[1];
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  // Check if new Shorts video loaded
  function checkForNewShorts() {
    const currentId = getCurrentShortsId();
    if (currentId) {
      // If on Shorts page but no label yet → create it
      if (!document.getElementById('shorts-counter-label')) {
        createCounterLabel();
      }
      // Count unique video IDs
      if (!countedVideos.has(currentId)) {
        countedVideos.add(currentId);
        counter++;
        updateCounterLabel();
      }
    } else {
      // Not on Shorts page → remove label if exists
      const existingLabel = document.getElementById('shorts-counter-label');
      if (existingLabel) existingLabel.remove();
    }
  }

  // Watch for URL changes (YouTube SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkForNewShorts();
    }
  }).observe(document, {subtree: true, childList: true});

  // Init
  checkForNewShorts();
})();
