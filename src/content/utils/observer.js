import { createLogger } from './logger.js';

const logger = createLogger('SharedObserver');

class SharedObserver {
    constructor() {
        this.observers = new Map();
        this.mainObserver = null;
        this.initialized = false;
        this.mountedElements = new Set();
    }

    /**
     * Initialize the shared observer
     */
    init() {
        if (this.initialized) return;
        if (!document.body) {
            logger.warn('Document body not ready, deferring initialization');
            document.addEventListener('DOMContentLoaded', () => this.init());
            return;
        }

        this.mainObserver = new MutationObserver((mutations) => {
            const addedNodes = [];

            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            addedNodes.push(node);
                            this.mountedElements.add(node);
                        }
                    }
                }
            }

            if (addedNodes.length) {
                this.notify(addedNodes);
            }
        });

        this.mainObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.initialized = true;
        logger.info('Shared observer initialized');
    }

    /**
     * Register a feature to receive page updates
     * @param {string} feature - Feature name
     * @param {Function} callback - (addedNodes: Node[]) => void
     */
    register(feature, callback) {
        if (!this.observers.has(feature)) {
            this.observers.set(feature, new Set());
        }
        this.observers.get(feature).add(callback);
        logger.debug(`Registered feature: ${feature}`);
    }

    /**
     * Unregister a feature
     * @param {string} feature
     */
    unregister(feature) {
        if (this.observers.delete(feature)) {
            logger.debug(`Unregistered feature: ${feature}`);
        }
    }

    /**
     * Check if a node has been observed before
     * @param {Node} node
     * @returns {boolean}
     */
    hasObserved(node) {
        return this.mountedElements.has(node);
    }

    /**
     * Notify all registered features
     * @param {Node[]} nodes
     */
    notify(nodes) {
        for (const [feature, callbacks] of this.observers) {
            for (const callback of callbacks) {
                try {
                    callback(nodes);
                } catch (e) {
                    logger.error(`Error in ${feature} callback:`, e);
                }
            }
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.mainObserver) {
            this.mainObserver.disconnect();
            this.mainObserver = null;
        }
        this.observers.clear();
        this.mountedElements.clear();
        this.initialized = false;
        logger.info('Shared observer destroyed');
    }
}

export const sharedObserver = new SharedObserver();
