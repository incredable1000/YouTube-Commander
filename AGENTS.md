# AGENTS.md - Developer Guide for YouTube Commander

This file provides guidance for agentic coding agents working on this Chrome extension codebase.

## Project Overview

YouTube Commander is a Chrome extension (Manifest V3) that enhances YouTube with quality controls, playback features, navigation enhancements, and more. Built with Vite and ES modules.

## Build Commands

```bash
npm run dev      # Start development server with hot reload (outputs to dist/)
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

**Loading the Extension:**
1. Run `npm run dev`
2. Open Chrome at `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `dist/` directory

**No test or lint scripts are configured.** Manual testing in Chrome is required.

## Code Style Guidelines

### General Principles
- Use ES modules (`import`/`export`) - required for Vite build
- Use 4-space indentation (no tabs)
- Use single quotes for strings
- Always use strict equality (`===`/`!==`)
- Use JSDoc comments for functions that are exported or complex

### File Organization
```
src/
├── manifest.json           # Extension manifest (do not rename)
├── background/             # Service worker scripts
├── content/               # Content scripts
│   ├── content-main.js    # Entry point
│   ├── content-isolated.js # Isolated world scripts
│   └── utils/             # Shared utilities
├── popup/                 # Extension popup
├── shared/                # Shared constants
└── styles/                # CSS files
```

### Naming Conventions
- **Files**: kebab-case (e.g., `qualityControls.js`, `watchedHistory.js`)
- **Functions/variables**: camelCase (e.g., `setVideoQuality`, `userPreferredQuality`)
- **Constants**: UPPER_SCREAMING_SNAKE_CASE (e.g., `LOG_LEVELS`, `DEFAULT_SETTINGS`)
- **CSS classes**: kebab-case with prefix (e.g., `yt-commander-button`)

### Imports
```javascript
// Local modules
import { createLogger } from './utils/logger.js';
import { initializeUtils } from './utils/index.js';

// Shared constants
import { EXTENSION_PREFIX, DEFAULT_SETTINGS } from '../shared/constants.js';
```

### Functions
- Use JSDoc for public/exported functions:
```javascript
/**
 * Set video quality using YouTube's internal API
 * @param {string} preferredQuality - Quality level (e.g., 'hd1080')
 * @returns {boolean} Success status
 */
function setVideoQuality(preferredQuality = 'hd1080') { ... }
```
- Use async/await for asynchronous operations
- Keep functions focused and small (< 50 lines preferred)

### Error Handling
- Always wrap potentially failing code in try/catch
- Filter out non-extension errors in global handlers (see `content-main.js`)
- Use the logger utility instead of console.log:
```javascript
import { createLogger } from './utils/logger.js';
const logger = createLogger('ModuleName');

logger.error('Failed to initialize', error);
logger.info('Operation completed');
logger.debug('Debug info', { data });
```

### Chrome Extension Specific

**Content Scripts:**
- Use `window.addEventListener` for message passing between isolated/main worlds
- Handle YouTube's SPA navigation with MutationObserver
- Access YouTube's internal API via `document.getElementById('movie_player')`

**Background Scripts:**
- Use the web extension polyfill: `import browser from 'webextension-polyfill'`
- Handle extension lifecycle events

**Storage:**
- Use `chrome.storage.local` for settings persistence
- Keys should be defined in `shared/constants.js`

### CSS Guidelines
- Prefix all classes with `yt-commander-`
- Keep styles in `src/styles/`
- Use CSS custom properties for theming where applicable

### Common Patterns

**Wait for YouTube player:**
```javascript
function waitForPlayer() {
    return new Promise((resolve) => {
        const checkPlayer = () => {
            const player = document.getElementById('movie_player');
            if (player && typeof player.getAvailableQualityLevels === 'function') {
                resolve(player);
            } else {
                setTimeout(checkPlayer, 500);
            }
        };
        checkPlayer();
    });
}
```

**Handle YouTube SPA navigation:**
```javascript
const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Reinitialize on navigation
    }
});
observer.observe(document.body, { childList: true, subtree: true });
```

**Message passing:**
```javascript
// Send
window.postMessage({ type: 'SET_QUALITY', quality: 'hd1080' }, '*');

// Receive
window.addEventListener('message', (event) => {
    if (event.data.type === 'SET_QUALITY') { ... }
});
```

## Adding New Features

1. Create new content script in `src/content/`
2. Import it in `content-main.js` or `content-isolated.js`
3. Add any new constants to `src/shared/constants.js`
4. Add CSS to `src/styles/styles.css`
5. Update `manifest.json` if adding new permissions

## Constants Location

All application constants should be defined in `src/shared/constants.js`:
- Quality levels
- YouTube selectors
- Storage keys
- Message types
- Timeouts
- CSS classes

## Testing New Code

1. Make changes in `src/`
2. Run `npm run dev` (hot reload enabled)
3. Reload extension in Chrome (`chrome://extensions/` → reload icon)
4. Test on YouTube pages
5. Run `npm run build` before committing
