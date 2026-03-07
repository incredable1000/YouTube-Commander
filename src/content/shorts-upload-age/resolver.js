/**
 * Upload-date resolver with cache + bounded batch queue.
 */

import {
    FETCH_BATCH_SIZE,
    FETCH_CONCURRENCY,
    FETCH_RETRY_MS
} from './constants.js';
import { extractUploadTimestampFromHtml } from './time.js';

/**
 * Run mapper with bounded concurrency.
 * @template T, U
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T) => Promise<U>} mapper
 * @returns {Promise<U[]>}
 */
async function mapWithConcurrency(items, concurrency, mapper) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: safeConcurrency }, async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= items.length) {
                break;
            }

            results[index] = await mapper(items[index]);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Create Shorts upload-date resolver.
 * @param {{
 *   logger?: {debug?: Function, warn?: Function, error?: Function},
 *   fetchImpl?: typeof fetch,
 *   concurrency?: number,
 *   batchSize?: number,
 *   batchResolveImpl?: (shortIds: string[]) => Promise<Map<string, number|null>|Record<string, number|null>>
 * }} [options]
 */
function createShortsUploadAgeResolver(options = {}) {
    const logger = options.logger || null;
    const fetchImpl = typeof options.fetchImpl === 'function'
        ? options.fetchImpl
        : window.fetch.bind(window);
    const concurrency = Number.isFinite(options.concurrency)
        ? Math.max(1, Math.floor(options.concurrency))
        : FETCH_CONCURRENCY;
    const batchSize = Number.isFinite(options.batchSize)
        ? Math.max(1, Math.floor(options.batchSize))
        : FETCH_BATCH_SIZE;
    const batchResolveImpl = typeof options.batchResolveImpl === 'function'
        ? options.batchResolveImpl
        : null;

    const cache = new Map();
    const inflight = new Map();
    const queue = [];

    let activeBatches = 0;

    /**
     * Normalize batch resolver output.
     * @param {Map<string, number|null>|Record<string, number|null>|null|undefined} result
     * @param {string[]} expectedIds
     * @returns {Map<string, number|null>}
     */
    function normalizeBatchResult(result, expectedIds) {
        const normalized = new Map();
        if (result instanceof Map) {
            result.forEach((value, key) => {
                if (typeof key !== 'string' || !key.trim()) {
                    return;
                }
                normalized.set(key.trim(), Number.isFinite(value) ? Number(value) : null);
            });
        } else if (result && typeof result === 'object') {
            Object.entries(result).forEach(([key, value]) => {
                if (typeof key !== 'string' || !key.trim()) {
                    return;
                }
                normalized.set(key.trim(), Number.isFinite(value) ? Number(value) : null);
            });
        }

        expectedIds.forEach((shortId) => {
            if (!normalized.has(shortId)) {
                normalized.set(shortId, null);
            }
        });

        return normalized;
    }

    /**
     * Fetch one short page and extract upload timestamp.
     * @param {string} shortId
     * @returns {Promise<number|null>}
     */
    async function fetchSingleWatchTimestamp(shortId) {
        try {
            const watchUrl = new URL('/watch', window.location.origin);
            watchUrl.searchParams.set('v', shortId);

            const response = await fetchImpl(watchUrl.toString(), {
                credentials: 'include',
                cache: 'default',
                redirect: 'follow'
            });

            if (!response.ok) {
                return null;
            }

            const html = await response.text();
            return extractUploadTimestampFromHtml(html);
        } catch (error) {
            logger?.warn?.('Failed to resolve shorts upload date via watch page', { shortId, error });
            return null;
        }
    }

    /**
     * Fallback resolver for IDs not returned by batch resolver.
     * @param {string[]} shortIds
     * @returns {Promise<Map<string, number|null>>}
     */
    async function resolveBatchViaWatchPages(shortIds) {
        const output = new Map();
        if (!Array.isArray(shortIds) || shortIds.length === 0) {
            return output;
        }

        await mapWithConcurrency(shortIds, concurrency, async (shortId) => {
            const timestampMs = await fetchSingleWatchTimestamp(shortId);
            output.set(shortId, Number.isFinite(timestampMs) ? timestampMs : null);
            return null;
        });

        return output;
    }

    /**
     * Resolve one chunk of IDs. Uses batch resolver first, then watch-page fallback for misses.
     * @param {string[]} shortIds
     * @returns {Promise<Map<string, number|null>>}
     */
    async function resolveBatch(shortIds) {
        const uniqueIds = Array.from(
            new Set(
                shortIds
                    .filter((value) => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
            )
        );

        const resolvedById = new Map();
        if (uniqueIds.length === 0) {
            return resolvedById;
        }

        if (batchResolveImpl) {
            try {
                const batchResult = await batchResolveImpl(uniqueIds);
                const normalized = normalizeBatchResult(batchResult, uniqueIds);
                normalized.forEach((value, key) => {
                    resolvedById.set(key, Number.isFinite(value) ? Number(value) : null);
                });
            } catch (error) {
                logger?.warn?.('Batch shorts upload-date resolve failed', {
                    shortCount: uniqueIds.length,
                    error
                });
            }
        }

        const unresolvedIds = uniqueIds.filter((shortId) => !Number.isFinite(resolvedById.get(shortId)));
        if (unresolvedIds.length > 0) {
            const fallbackMap = await resolveBatchViaWatchPages(unresolvedIds);
            unresolvedIds.forEach((shortId) => {
                const timestampMs = fallbackMap.get(shortId);
                resolvedById.set(shortId, Number.isFinite(timestampMs) ? Number(timestampMs) : null);
            });
        }

        return resolvedById;
    }

    /**
     * Process queue respecting bounded batch concurrency.
     */
    function pumpQueue() {
        while (activeBatches < concurrency && queue.length > 0) {
            const tasks = queue.splice(0, batchSize);
            if (tasks.length === 0) {
                continue;
            }

            activeBatches += 1;
            void resolveTaskBatch(tasks)
                .catch((_error) => {
                    // Per-task errors are handled inside resolveTaskBatch.
                })
                .finally(() => {
                    activeBatches -= 1;
                    pumpQueue();
                });
        }
    }

    /**
     * Resolve one queued batch.
     * @param {{shortId: string, resolve: (value: number|null) => void}[]} tasks
     */
    async function resolveTaskBatch(tasks) {
        const shortIds = tasks.map((task) => task.shortId);
        let resolvedMap = new Map();

        try {
            resolvedMap = await resolveBatch(shortIds);
        } catch (error) {
            logger?.warn?.('Failed to resolve shorts upload batch', {
                shortCount: shortIds.length,
                error
            });
        }

        const retryAt = Date.now() + FETCH_RETRY_MS;
        tasks.forEach((task) => {
            const timestampMs = resolvedMap.get(task.shortId);
            const normalized = Number.isFinite(timestampMs) ? Number(timestampMs) : null;

            cache.set(task.shortId, {
                timestampMs: normalized,
                retryAt: normalized ? Number.POSITIVE_INFINITY : retryAt
            });

            inflight.delete(task.shortId);
            task.resolve(normalized);
        });
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
     * Resolve upload timestamps for multiple Shorts IDs.
     * @param {string[]} shortIds
     * @returns {Promise<Map<string, number|null>>}
     */
    async function resolveUploadTimestamps(shortIds) {
        if (!Array.isArray(shortIds) || shortIds.length === 0) {
            return new Map();
        }

        const uniqueIds = Array.from(
            new Set(
                shortIds
                    .filter((value) => typeof value === 'string')
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
            )
        );

        if (uniqueIds.length === 0) {
            return new Map();
        }

        const pendingEntries = await Promise.all(
            uniqueIds.map(async (shortId) => {
                const timestampMs = await resolveUploadTimestamp(shortId);
                return [shortId, timestampMs];
            })
        );

        return new Map(pendingEntries);
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
        resolveUploadTimestamps,
        getCachedTimestamp,
        clear
    };
}

export {
    createShortsUploadAgeResolver
};
