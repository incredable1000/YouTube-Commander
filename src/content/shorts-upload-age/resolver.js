/**
 * Upload-date resolver with cache + chunked batch requests.
 */

import {
    FETCH_BATCH_SIZE,
    FETCH_CONCURRENCY,
    FETCH_RETRY_MS
} from './constants.js';

/**
 * Run mapper with bounded concurrency.
 * @template T, U
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<U>} mapper
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

            results[index] = await mapper(items[index], index);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Split array into chunks.
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(items, size) {
    const output = [];
    for (let index = 0; index < items.length; index += size) {
        output.push(items.slice(index, index + size));
    }
    return output;
}

/**
 * Normalize and dedupe short IDs.
 * @param {string[]} shortIds
 * @returns {string[]}
 */
function normalizeShortIds(shortIds) {
    if (!Array.isArray(shortIds)) {
        return [];
    }

    return Array.from(
        new Set(
            shortIds
                .filter((value) => typeof value === 'string')
                .map((value) => value.trim())
                .filter((value) => value.length > 0)
        )
    );
}

/**
 * Create Shorts upload-date resolver.
 * @param {{
 *   logger?: {debug?: Function, warn?: Function, error?: Function},
 *   concurrency?: number,
 *   batchSize?: number,
 *   batchResolveImpl?: (shortIds: string[]) => Promise<Map<string, number|null>|Record<string, number|null>>
 * }} [options]
 */
function createShortsUploadAgeResolver(options = {}) {
    const logger = options.logger || null;
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
     * Resolve one chunk via batch resolver only (no per-video fallback).
     * @param {string[]} shortIds
     * @returns {Promise<Map<string, number|null>>}
     */
    async function resolveChunk(shortIds) {
        const uniqueIds = normalizeShortIds(shortIds);
        const output = new Map();
        if (uniqueIds.length === 0) {
            return output;
        }

        if (!batchResolveImpl) {
            uniqueIds.forEach((shortId) => output.set(shortId, null));
            return output;
        }

        try {
            const batchResult = await batchResolveImpl(uniqueIds);
            return normalizeBatchResult(batchResult, uniqueIds);
        } catch (error) {
            logger?.warn?.('Batch shorts upload-date resolve failed', {
                shortCount: uniqueIds.length,
                error
            });
            uniqueIds.forEach((shortId) => output.set(shortId, null));
            return output;
        }
    }

    /**
     * Resolve upload timestamp for one Shorts ID.
     * @param {string} shortId
     * @returns {Promise<number|null>}
     */
    async function resolveUploadTimestamp(shortId) {
        if (!shortId || typeof shortId !== 'string') {
            return null;
        }

        const resolved = await resolveUploadTimestamps([shortId]);
        return Number.isFinite(resolved.get(shortId)) ? Number(resolved.get(shortId)) : null;
    }

    /**
     * Resolve upload timestamps for multiple Shorts IDs.
     * Uses chunked batch requests only.
     * @param {string[]} shortIds
     * @returns {Promise<Map<string, number|null>>}
     */
    async function resolveUploadTimestamps(shortIds) {
        const uniqueIds = normalizeShortIds(shortIds);
        if (uniqueIds.length === 0) {
            return new Map();
        }

        const output = new Map();
        const idsToResolve = [];
        const now = Date.now();

        uniqueIds.forEach((shortId) => {
            const cached = cache.get(shortId);
            if (cached) {
                if (Number.isFinite(cached.timestampMs)) {
                    output.set(shortId, Number(cached.timestampMs));
                    return;
                }

                if (now < (cached.retryAt || 0)) {
                    output.set(shortId, null);
                    return;
                }
            }

            idsToResolve.push(shortId);
        });

        if (idsToResolve.length > 0) {
            const idChunks = chunk(idsToResolve, batchSize);
            const chunkResults = await mapWithConcurrency(
                idChunks,
                concurrency,
                async (idChunk) => ({
                    ids: idChunk,
                    resolved: await resolveChunk(idChunk)
                })
            );

            chunkResults.forEach(({ ids, resolved }) => {
                const retryAt = Date.now() + FETCH_RETRY_MS;
                ids.forEach((shortId) => {
                    const timestampMs = resolved.get(shortId);
                    const normalized = Number.isFinite(timestampMs) ? Number(timestampMs) : null;
                    cache.set(shortId, {
                        timestampMs: normalized,
                        retryAt: normalized ? Number.POSITIVE_INFINITY : retryAt
                    });
                    output.set(shortId, normalized);
                });
            });
        }

        uniqueIds.forEach((shortId) => {
            if (!output.has(shortId)) {
                const cached = cache.get(shortId);
                output.set(shortId, Number.isFinite(cached?.timestampMs) ? Number(cached.timestampMs) : null);
            }
        });

        return output;
    }

    /**
     * Read cached timestamp if available.
     * @param {string} shortId
     * @returns {number|null}
     */
    function getCachedTimestamp(shortId) {
        const entry = cache.get(shortId);
        return entry && Number.isFinite(entry.timestampMs) ? Number(entry.timestampMs) : null;
    }

    /**
     * Reset resolver state.
     */
    function clear() {
        cache.clear();
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
