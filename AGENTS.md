# AGENTS.md - Developer Guide for YouTube Commander

This file provides guidance for agentic coding agents working on this Chrome extension codebase.

## Project Overview

YouTube Commander is a Chrome extension (Manifest V3) that enhances YouTube with quality controls, playback features, navigation enhancements, and more. Built with Vite and ES modules.

## Build Commands

```bash
npm run dev        # Development build (outputs to build_development/)
npm run build      # Production build (outputs to build_production/)
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run lint:fix   # Run ESLint with auto-fix
npm run format    # Format code with Prettier
```

**Loading the Extension:**

1. Run `npm run dev` (development build)
2. Open Chrome at `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `build_development/` directory

**Pre-commit hooks:** Run automatically via Husky to lint and format staged files.

---

## Code Style Guidelines

### General Principles

- Use ES modules (`import`/`export`) - required for Vite build
- Use 4-space indentation (no tabs)
- Use single quotes for strings
- Always use strict equality (`===`/`!==`)
- Use JSDoc comments for functions that are exported or complex
- **Max 600 lines per file** (hard limit enforced by ESLint)
- **Max 100 lines per function** (soft warning enforced by ESLint)

### File Organization

```
src/
├── manifest.json                  # Extension manifest (do not rename)
├── background/                  # Service worker scripts
├── content/                     # Content scripts
│   ├── content-main.js         # Entry point
│   ├── content-isolated.js      # Isolated world scripts
│   ├── utils/                  # Shared utilities
│   │   ├── dom.js             # DOM utilities (createEl, batchAppend, etc.)
│   │   ├── observer.js        # Shared observer pattern
│   │   └── ...
│   └── [feature]*/            # Feature modules (split if >600 lines)
├── popup/                       # Extension popup
├── shared/                      # Shared constants
└── styles/                      # CSS files
```

### Naming Conventions

| Type                | Convention                             | Example                                     |
| ------------------- | -------------------------------------- | ------------------------------------------- |
| Files               | kebab-case                             | `quality-controls.js`, `watched-history.js` |
| Functions/variables | camelCase                              | `setVideoQuality`, `userPreferredQuality`   |
| Constants           | UPPER_SCREAMING_SNAKE_CASE             | `LOG_LEVELS`, `DEFAULT_SETTINGS`            |
| CSS classes         | kebab-case with `yt-commander-` prefix | `yt-commander-button`                       |

### Imports

```javascript
// Local modules
import { createLogger } from './utils/logger.js';
import { createEl, batchAppend } from './utils/dom.js';

// Shared constants
import { EXTENSION_PREFIX, DEFAULT_SETTINGS } from '../shared/constants.js';
```

---

## Module Structure

### Large File Strategy

Files exceeding 600 lines should be split into a subdirectory:

```
playlistMultiSelect.js (3000+ lines)
├── playlist-multi-select/
│   ├── module.js      # Main orchestrator (~400 lines)
│   ├── constants.js  # Constants
│   ├── icons.js       # Icon creation
│   ├── ui.js         # UI components
│   └── ...
└── playlistMultiSelect.js  # Wrapper (re-exports)
```

### Module Pattern

```javascript
// Each feature module should export:
export { init, enable, disable, cleanup };
export { specificFunction1, specificFunction2 };
```

### Shared State

- Use `export const` or `export let` for module-level state
- Import shared state from the primary module, not duplicate it
- Avoid creating multiple instances of shared state

---

## DOM Creation Rules

### Use Shared Utilities

Always prefer `utils/dom.js` for DOM operations:

```javascript
// GOOD - uses shared utilities
import { createEl, batchAppend } from './utils/dom.js';

const elements = items.map((item) => createEl('div', { className: 'item' }, item.name));
batchAppend(container, elements); // Single reflow

// BAD - inline DOM creation
const div = document.createElement('div');
div.className = 'item';
```

### Available DOM Utilities

```javascript
import { createEl, createFragment, batchAppend, mountOnce, batchRender } from './utils/dom.js';

// createEl - Create element with attributes
const button = createEl('button', { className: 'btn', type: 'button' }, 'Click');

// createFragment - Create DocumentFragment
const fragment = createFragment(el1, el2, el3);

// batchAppend - Batch append with DocumentFragment
batchAppend(parent, [el1, el2, el3]);

// mountOnce - Lazy mount with deduplication
mountOnce(element, parent, 'unique-key');

// batchRender - Chunked rendering for large lists
batchRender(items, (item) => createEl('div', {}, item.name), container, { chunkSize: 50 });
```

---

## Performance Rules

1. **Batch DOM operations** - Use DocumentFragment or `batchAppend()`
2. **Use `requestAnimationFrame`** for visual updates
3. **Cache DOM element references** - Store in variables, don't query repeatedly
4. **Debounce/throttle** frequent operations (scroll, resize, input)
5. **Use WeakMap for object-to-value mappings** when appropriate
6. **Avoid memory leaks** - Clean up observers and event listeners

---

## Error Handling

```javascript
// Wrap async operations
try {
    const result = await someAsyncOperation();
    logger.info('Operation succeeded', { result });
} catch (error) {
    logger.error('Operation failed', error);
    // Handle gracefully
}

// Wrap DOM operations
try {
    element.textContent = 'new value';
} catch (error) {
    logger.warn('Failed to update element', error);
}
```

---

## Chrome Extension Specific

### Content Scripts

- Use `window.addEventListener` for message passing
- Handle YouTube's SPA navigation with MutationObserver
- Access YouTube's internal API via `document.getElementById('movie_player')`

### Background Scripts

- Use the web extension polyfill: `import browser from 'webextension-polyfill'`
- Handle extension lifecycle events

### Storage

- Use `chrome.storage.local` for settings persistence
- Keys should be defined in `src/shared/constants.js`

---

## CSS Guidelines

- Prefix all classes with `yt-commander-`
- Keep styles in `src/styles/styles.css`
- Use CSS custom properties for theming
- Use `createEl()` with className for dynamic classes

---

## Adding New Features

1. Create new content script in `src/content/`
2. If file exceeds 600 lines, create a subdirectory
3. Import it in `content-main.js` or `content-isolated.js`
4. Add any new constants to `src/shared/constants.js`
5. Add CSS to `src/styles/styles.css`
6. Update `manifest.json` if adding new permissions

---

## Testing New Code

1. Make changes in `src/`
2. Run `npm run dev` (outputs to `build_development/`)
3. Reload extension in Chrome (`chrome://extensions/` → reload icon)
4. Test on YouTube pages
5. Run `npm run lint:fix` to auto-fix issues
6. Run `npm run build` before committing (outputs to `build_production/`)

---

## Constants Location

All application constants should be defined in `src/shared/constants.js`:

- Quality levels
- YouTube selectors
- Storage keys
- Message types
- Timeouts
- CSS classes
