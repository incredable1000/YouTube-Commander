import { createLogger } from './logger.js';

const logger = createLogger('DOMUtils');

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {...(string|Element)} children - Child elements or text
 * @returns {Element}
 */
export function createEl(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.slice(2).toLowerCase();
            element.addEventListener(eventName, value);
        } else if (key === 'dataset') {
            for (const [dataKey, dataValue] of Object.entries(value)) {
                element.dataset[dataKey] = dataValue;
            }
        } else if (value !== null && value !== undefined) {
            element.setAttribute(key, value);
        }
    }

    for (const child of children) {
        if (child === null || child === undefined) continue;
        if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    }

    return element;
}

/**
 * Create a DocumentFragment from elements
 * @param {...Element} elements
 * @returns {DocumentFragment}
 */
export function createFragment(...elements) {
    const fragment = document.createDocumentFragment();
    for (const element of elements) {
        if (element instanceof Node) {
            fragment.appendChild(element);
        }
    }
    return fragment;
}

/**
 * Batch append elements to parent using DocumentFragment
 * @param {Element} parent
 * @param {Element[]} elements
 */
export function batchAppend(parent, elements) {
    if (!parent || !elements?.length) return;

    const fragment = document.createDocumentFragment();
    for (const element of elements) {
        if (element instanceof Node) {
            fragment.appendChild(element);
        }
    }
    parent.appendChild(fragment);
}

/**
 * Lazy mount an element to parent (deduplicated)
 * @param {Element} element
 * @param {Element} parent
 * @param {string} key - Unique key for deduplication
 */
export function mountOnce(element, parent, key) {
    if (!element || !parent) return;

    const cacheKey = `yt-commander-mounted-${key}`;
    if (parent[cacheKey]) {
        logger.debug(`Skipping duplicate mount: ${key}`);
        return;
    }

    parent.appendChild(element);
    parent[cacheKey] = true;
}

/**
 * Batch render items with chunking
 * @param {any[]} items
 * @param {Function} createFn - Function to create element for each item
 * @param {Element} parent
 * @param {Object} options - { chunkSize: 50, onProgress: fn }
 */
export function batchRender(items, createFn, parent, options = {}) {
    const { chunkSize = 50, onProgress } = options;

    if (!items?.length || !createFn || !parent) return;

    let index = 0;
    const total = items.length;

    function processChunk() {
        const chunk = items.slice(index, index + chunkSize);
        const elements = [];

        for (const item of chunk) {
            try {
                const element = createFn(item, index);
                if (element instanceof Node) {
                    elements.push(element);
                }
            } catch (e) {
                logger.error(`Error creating element at index ${index}:`, e);
            }
            index++;
        }

        batchAppend(parent, elements);

        if (onProgress) {
            onProgress(index, total);
        }

        if (index < total) {
            requestAnimationFrame(processChunk);
        }
    }

    processChunk();
}
