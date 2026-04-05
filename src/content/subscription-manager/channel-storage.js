/**
 * Channel storage utilities for subscription manager.
 */

import { state } from './state.js';
import { storageGet, storageSet } from './storage-utils.js';
import {
    normalizeHandle,
    normalizeChannelUrl,
    normalizeCategories,
    normalizeAssignments,
} from './data-utils.js';
import { computeSnapshotHash } from './channel-utils.js';
import { STORAGE_KEYS } from './constants.js';

export function rebuildChannelIndexes() {
    state.channelsById = new Map();
    state.channelsByHandle = new Map();
    state.channelsByUrl = new Map();
    state.channels.forEach((channel) => {
        const channelId = channel?.channelId || '',
            handle = channel?.handle || '',
            url = channel?.url || '';
        if (channelId) state.channelsById.set(channelId, channel);
        const normalizedHandle = normalizeHandle(handle);
        if (normalizedHandle) {
            state.channelsByHandle.set(
                normalizedHandle,
                channelId || state.channelsByHandle.get(normalizedHandle) || ''
            );
            state.channelsByHandle.set(
                normalizedHandle.replace(/^@/, ''),
                channelId || state.channelsByHandle.get(normalizedHandle.replace(/^@/, '')) || ''
            );
        }
        const normalizedUrl = normalizeChannelUrl(url);
        if (normalizedUrl)
            state.channelsByUrl.set(
                normalizedUrl,
                channelId || state.channelsByUrl.get(normalizedUrl) || ''
            );
    });
    state.channelsVersion++;
    state.categoryCountsCacheKey = '';
}

export function markCategoriesDirty() {
    state.categoriesVersion++;
    state.categoryCountsCacheKey = '';
}
export function markAssignmentsDirty() {
    state.assignmentsVersion++;
    state.assignmentCache.clear();
    state.categoryCountsCacheKey = '';
}

export function getCategoryCounts() {
    const key = `${state.channelsVersion}:${state.assignmentsVersion}:${state.categoriesVersion}`;
    if (state.categoryCountsCacheKey === key && state.categoryCountsCache)
        return state.categoryCountsCache;
    const counts = { all: state.channels.length, uncategorized: 0 };
    state.categories.forEach((cat) => (counts[cat.id] = 0));
    state.channels.forEach((channel) => {
        const channelId = channel?.channelId || '';
        if (!channelId) return;
        const assigned = readChannelAssignments(channelId);
        if (!assigned || assigned.length === 0) {
            counts.uncategorized++;
            return;
        }
        assigned.forEach((catId) => {
            if (typeof counts[catId] === 'number') counts[catId]++;
        });
    });
    state.categoryCountsCache = counts;
    state.categoryCountsCacheKey = key;
    return counts;
}

export function readChannelAssignments(channelId) {
    if (!channelId) return [];
    if (state.assignmentCache.has(channelId)) return state.assignmentCache.get(channelId);
    const list = state.assignments[channelId],
        normalized = Array.isArray(list) ? list : [],
        singleton = normalized.length > 0 ? [normalized[0]] : [];
    state.assignmentCache.set(channelId, singleton);
    return singleton;
}

export function writeChannelAssignments(channelId, next) {
    if (!channelId) return;
    const normalized = Array.from(new Set(next)).slice(0, 1);
    if (normalized.length === 0) {
        delete state.assignments[channelId];
        state.assignmentCache.delete(channelId);
        markAssignmentsDirty();
        return;
    }
    state.assignments[channelId] = normalized;
    state.assignmentCache.set(channelId, normalized);
    markAssignmentsDirty();
}

export async function loadLocalState() {
    const result = await storageGet([
        STORAGE_KEYS.CATEGORIES,
        STORAGE_KEYS.ASSIGNMENTS,
        STORAGE_KEYS.FILTER,
        STORAGE_KEYS.SORT,
        STORAGE_KEYS.SIDEBAR_COLLAPSED,
    ]);
    state.categories = normalizeCategories(result[STORAGE_KEYS.CATEGORIES]);
    state.assignments = normalizeAssignments(result[STORAGE_KEYS.ASSIGNMENTS]);
    markCategoriesDirty();
    markAssignmentsDirty();
    state.filterMode =
        typeof result[STORAGE_KEYS.FILTER] === 'string' ? result[STORAGE_KEYS.FILTER] : 'all';
    state.sortMode = result[STORAGE_KEYS.SORT] === 'subscribers' ? 'subscribers' : 'name';
    state.sidebarCollapsed = result[STORAGE_KEYS.SIDEBAR_COLLAPSED] === true;
}

export async function persistLocalState() {
    await storageSet({
        [STORAGE_KEYS.CATEGORIES]: state.categories,
        [STORAGE_KEYS.ASSIGNMENTS]: state.assignments,
    });
}
export async function persistViewState() {
    await storageSet({
        [STORAGE_KEYS.FILTER]: state.filterMode,
        [STORAGE_KEYS.SORT]: state.sortMode,
    });
}
export async function persistSidebarState() {
    await storageSet({ [STORAGE_KEYS.SIDEBAR_COLLAPSED]: state.sidebarCollapsed });
}
export async function persistSnapshot(list, hash) {
    await storageSet({ [STORAGE_KEYS.SNAPSHOT]: { channels: list, fetchedAt: Date.now(), hash } });
}

export async function hydrateSnapshotFromStorage() {
    const stored = await storageGet([STORAGE_KEYS.SNAPSHOT]),
        snapshot = stored?.[STORAGE_KEYS.SNAPSHOT];
    if (!snapshot || !Array.isArray(snapshot.channels)) return false;
    const fetchedAt = Number(snapshot.fetchedAt) || 0;
    if (state.channels.length > 0 && fetchedAt <= state.channelsFetchedAt) return true;
    state.channels = snapshot.channels;
    state.channelsFetchedAt = fetchedAt;
    state.lastSnapshotHash =
        typeof snapshot.hash === 'string' ? snapshot.hash : computeSnapshotHash(state.channels);
    rebuildChannelIndexes();
    return true;
}

export async function markPending(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const result = await storageGet([STORAGE_KEYS.PENDING_KEYS]),
        existing = Array.isArray(result[STORAGE_KEYS.PENDING_KEYS])
            ? result[STORAGE_KEYS.PENDING_KEYS]
            : [];
    const set = new Set(existing);
    keys.forEach((key) => {
        if (typeof key === 'string' && key) set.add(key);
    });
    const next = Array.from(set);
    await storageSet({
        [STORAGE_KEYS.PENDING_KEYS]: next,
        [STORAGE_KEYS.PENDING_COUNT]: next.length,
    });
    chrome.runtime.sendMessage(
        { type: 'SUBSCRIPTION_MANAGER_UPDATED', pendingCount: next.length },
        () => {
            if (chrome.runtime.lastError) return;
        }
    );
}
