# Code Patterns for YouTube Commander

This document outlines the coding patterns and conventions used in the YouTube Commander Chrome extension.

---

## Table of Contents

1. [DOM Creation](#dom-creation)
2. [Module Communication](#module-communication)
3. [State Management](#state-management)
4. [Async Operations](#async-operations)
5. [Error Handling](#error-handling)
6. [Performance](#performance)

---

## DOM Creation

### Use Shared Utilities

Always prefer `utils/dom.js` for DOM operations:

```javascript
import { createEl, batchAppend, mountOnce, batchRender } from '../utils/dom.js';
```

### Create Element with Attributes

```javascript
// Create button with class, id, and event listener
const button = createEl('button', {
  className: 'yt-commander-button',
  id: 'my-button',
  onClick: handleClick,
  'data-action': 'save'
}, 'Save');
```

### Batch Operations

```javascript
// Good: Batch append using DocumentFragment
const elements = items.map(item => createEl('div', {}, item.name));
batchAppend(container, elements);

// Bad: Individual appends (causes multiple reflows)
items.forEach(item => {
  container.appendChild(createEl('div', {}, item.name));
});
```

### Lazy Mounting

```javascript
// Mount an element only once per parent
mountOnce(toastElement, document.body, 'toast-notification');
```

### Chunked Rendering for Large Lists

```javascript
// Render 1000 items in chunks of 50
batchRender(
  videoIds,
  videoId => createVideoCard(videoId),
  container,
  { chunkSize: 50, onProgress: updateProgress }
);
```

---

## Module Communication

### Event-Based Communication

```javascript
// utils/events.js - Event emitter pattern
class EventEmitter {
  constructor() {
    this.events = new Map();
  }
  
  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(callback);
  }
  
  emit(event, data) {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }
}
```

### Shared Observer Pattern

```javascript
// utils/observer.js
import { sharedObserver } from '../utils/observer.js';

// In your module
sharedObserver.register('myFeature', (nodes) => {
  nodes.forEach(node => {
    if (node.matches('.video-card')) {
      decorateCard(node);
    }
  });
});
```

---

## State Management

### Module-Level State

```javascript
// Prefer module-level state for module-specific data
const state = {
  videos: new Map(),
  selected: new Set(),
  loading: false
};

export function selectVideo(id) {
  state.selected.add(id);
}
```

### State Synchronization

```javascript
// Use a single source of truth
let currentState = 'idle';

export function setState(newState) {
  const prevState = currentState;
  currentState = newState;
  syncUI(prevState, newState);
}
```

---

## Async Operations

### Always Await

```javascript
// Good: explicit async/await
async function loadData() {
  try {
    const data = await fetchData();
    return processData(data);
  } catch (error) {
    logger.error('Failed to load data', error);
    return null;
  }
}

// Bad: implicit promise handling
function loadData() {
  return fetchData().then(processData); // Harder to debug
}
```

### Debouncing

```javascript
// For frequent operations like scroll/resize
import { debounce } from '../utils/events.js';

const handleScroll = debounce(() => {
  updateVisibleItems();
}, 100);
```

---

## Error Handling

### Always Wrap External Calls

```javascript
async function saveToStorage(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    logger.info('Saved to storage', { key });
  } catch (error) {
    logger.error('Failed to save to storage', error);
    throw error; // Re-throw if caller needs to handle
  }
}
```

### Null Checks for DOM

```javascript
function updateElement(id, text) {
  const el = document.getElementById(id);
  if (!el) {
    logger.warn('Element not found', { id });
    return;
  }
  el.textContent = text;
}
```

---

## Performance

### Cache DOM References

```javascript
// Good: Cache reference
let cachedButton = null;
function getButton() {
  if (!cachedButton) {
    cachedButton = document.getElementById('my-button');
  }
  return cachedButton;
}

// Bad: Query every time
function updateButton() {
  document.getElementById('my-button').textContent = 'Updated';
}
```

### Use RequestAnimationFrame

```javascript
function animateProgress(progress) {
  requestAnimationFrame(() => {
    progressBar.style.width = `${progress}%`;
  });
}
```

### Clean Up Observers

```javascript
let observer = null;

function startObserver() {
  observer = new MutationObserver((mutations) => {
    // handle mutations
  });
  observer.observe(document.body, { childList: true });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
```

---

## File Structure

### Feature Module Pattern

```
src/content/feature/
├── module.js          # Main entry, exports init/enable/disable
├── constants.js       # Module-specific constants
├── api.js            # API calls
├── storage.js        # IndexedDB/storage operations
├── renderer.js       # DOM rendering
├── events.js        # Event handlers
└── utils.js         # Module-specific utilities
```

### Wrapper Pattern for Large Files

```javascript
// feature.js - Wrapper for backward compatibility
export * from './feature/module.js';
export * from './feature/constants.js';
// ... other exports
```

---

## Testing Checklist

Before committing, verify:

- [ ] Build passes (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] No console errors in browser
- [ ] Feature works on YouTube pages
- [ ] No memory leaks (observers cleaned up)
- [ ] Performance acceptable with large lists
