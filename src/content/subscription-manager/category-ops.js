/**
 * Category operations module.
 */

import { state } from './state.js';
import { getCategoryLabel } from './sidebar-utils.js';
import {
    readChannelAssignments,
    writeChannelAssignments,
    persistLocalState,
    markPending,
} from './channel-storage.js';
import { setStatus } from './status-utils.js';

export async function applyCategoryUpdate(channelIds, categoryId, mode) {
    if (!categoryId) return;
    const isUncategorized = categoryId === 'uncategorized',
        categoryLabel = getCategoryLabel(categoryId),
        categoryDisplay = isUncategorized
            ? 'Uncategorized'
            : categoryLabel === 'category'
              ? 'selected category'
              : `"${categoryLabel}"`;
    const ids = (channelIds || []).filter((id) => typeof id === 'string' && id);
    if (ids.length === 0) {
        setStatus('Select at least one channel.', 'error');
        return;
    }
    const updatedKeys = [];
    const total = ids.length;
    const batchSize = Math.min(50, Math.max(5, Math.ceil(total / 6)));
    let processed = 0,
        assignedCount = 0,
        clearedCount = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        batch.forEach((channelId) => {
            const current = readChannelAssignments(channelId),
                hasCategory = current.includes(categoryId);
            let next = current,
                changed = false;
            if (mode === 'add' && (!hasCategory || current.length > 1)) {
                next = isUncategorized ? [] : [categoryId];
                changed = true;
            } else if (mode === 'remove' && hasCategory) {
                next = [];
                changed = true;
            } else if (mode === 'toggle') {
                next = isUncategorized ? [] : hasCategory ? [] : [categoryId];
                changed = true;
            }
            if (changed) {
                writeChannelAssignments(channelId, next);
                updatedKeys.push(`channel:${channelId}`);
                if (next.length === 0) clearedCount++;
                else assignedCount++;
            }
        });
        processed += batch.length;
        if (total > batchSize) {
            setStatus(
                `${isUncategorized ? 'Clearing' : mode === 'remove' ? 'Removing' : mode === 'add' ? 'Assigning' : 'Updating'} ${categoryDisplay} ${processed}/${total}...`,
                'info'
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }
    if (updatedKeys.length === 0) {
        setStatus('No changes.', 'info');
        return;
    }
    await persistLocalState();
    await markPending(updatedKeys);
    const successMessage = isUncategorized
        ? `Moved ${clearedCount || updatedKeys.length} channel(s) to Uncategorized.`
        : assignedCount && !clearedCount
          ? `Assigned ${categoryDisplay} to ${assignedCount} channel(s).`
          : clearedCount && !assignedCount
            ? `Removed ${categoryDisplay} from ${clearedCount} channel(s).`
            : `Updated ${categoryDisplay}: assigned ${assignedCount}, cleared ${clearedCount} channel(s).`;
    setStatus(successMessage, 'success');
    state.selectedChannelIds = new Set();
    state.selectionAnchorId = '';
    if (typeof window.ytcRenderListAll === 'function') window.ytcRenderListAll();
}
