/**
 * Upload-date resolver with cache + bounded fetch queue.
 */

import { FETCH_CONCURRENCY, FETCH_RETRY_MS } from './constants.js';
import { extractUploadTimestampFromHtml } from './time.js';

/**
 * Create Shorts upload-date resolver.
 * @param {{
 *   logger?: {debug?: Function, warn?: Function, error?: Function},
 *   fetchImpl?: typeof fetch,
 *   concurrency?: number
 * }} [options]
 */
function createShortsUploadAgeResolver(options = {}) {
    const logger = options.logger || null;
    const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : window.fetch.bind(window);
    const concurrency = Number.isFinite(options.concurrency)
        ? Math.max(1, Math.floor(options.concurrency))
        : FETCH_CONCURRENCY;

    const cache = new Map();
    const inflight = new Map();
    const queue = [];

    let activeFetches = 0;

    /**
     * Run pending queue respecting concurrency.
     */
    function pumpQueue() {
        while (activeFetches < concurrency && queue.length > 0) {
            const task = queue.shift();
            if (!task) {
                continue;
            }

            activeFetches += 1;
            void resolveTask(task)
                .catch((_error) => {
                    // Error is handled per-task.
                })
                .finally(() => {
                    activeFetches -= 1;
                    pumpQueue();
                });
        }
    }

    /**
     * Fetch one short and resolve upload timestamp.
     * @param {{shortId: string, resolve: Function}} task
     */
    async function resolveTask(task) {
        const { shortId, resolve } = task;

        try {
            const watchUrl = new URL('/watch', window.location.origin);
            watchUrl.searchParams.set('v', shortId);

            const response = await fetchImpl(watchUrl.toString(), {
                credentials: 'include',
                cache: 'default',
                redirect: 'follow'
            });

            if (!response.ok) {
                cache.set(shortId, {
                    timestampMs: null,
                    retryAt: Date.now() + FETCH_RETRY_MS
                });
                resolve(null);
                return;
            }

            const html = await response.text();
            const timestampMs = extractUploadTimestampFromHtml(html);

            cache.set(shortId, {
                timestampMs,
                retryAt: timestampMs ? Number.POSITIVE_INFINITY : Date.now() + FETCH_RETRY_MS
            });

            resolve(timestampMs);
        } catch (error) {
            cache.set(shortId, {
                timestampMs: null,
                retryAt: Date.now() + FETCH_RETRY_MS
            });
            logger?.warn?.('Failed to resolve shorts upload date', { shortId, error });
            resolve(null);
        } finally {
            inflight.delete(shortId);
        }
    }

    /**
     * Resolve upload timestamp for one Shorts ID.
     * @param {string} shortId
     * @returns {Promise<number|null>}
     */
    function resolveUploadTimestamp(shortId) {
        if (!shortId || typeof shortId !== 'string') {
            return Promise.resolve(null);
        }

        const cached = cache.get(shortId);
        if (cached) {
            if (Number.isFinite(cached.timestampMs)) {
                return Promise.resolve(cached.timestampMs);
            }

            if (Date.now() < (cached.retryAt || 0)) {
                return Promise.resolve(null);
            }
        }

        const inflightPromise = inflight.get(shortId);
        if (inflightPromise) {
            return inflightPromise;
        }

        const pending = new Promise((resolve) => {
            queue.push({ shortId, resolve });
            pumpQueue();
        });

        inflight.set(shortId, pending);
        return pending;
    }

    /**
     * Read cached timestamp if available.
     * @param {string} shortId
     * @returns {number|null}
     */
    function getCachedTimestamp(shortId) {
        const entry = cache.get(shortId);
        return entry && Number.isFinite(entry.timestampMs) ? entry.timestampMs : null;
    }

    /**
     * Reset resolver state.
     */
    function clear() {
        cache.clear();
        while (queue.length > 0) {
            const pendingTask = queue.shift();
            pendingTask?.resolve?.(null);
        }
        inflight.clear();
    }

    return {
        resolveUploadTimestamp,
        getCachedTimestamp,
        clear
    };
}

export {
    createShortsUploadAgeResolver
};
