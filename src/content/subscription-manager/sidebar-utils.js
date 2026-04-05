/**
 * Sidebar utilities for subscription manager.
 */

import { generateRandomCategoryColor } from './data-utils.js';
import { state } from './state.js';

export function createCategory(name, colorOverride = '') {
    const trimmed = name.trim();
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const color =
        typeof colorOverride === 'string' && colorOverride.trim()
            ? colorOverride.trim()
            : generateRandomCategoryColor();
    return { id, name: trimmed, color };
}

export function resetSidebarDraftState() {
    state.sidebarEditingId = '';
    state.sidebarEditingName = '';
    state.sidebarCreating = false;
    state.sidebarDraftName = '';
    state.sidebarDraftColor = '';
}

export function captureSidebarDraftState() {
    if (!state.sidebarList) return;
    const input = state.sidebarList.querySelector('.yt-commander-sub-manager-sidebar-input');
    if (!input) return;
    if (state.sidebarCreating) {
        state.sidebarDraftName = input.value;
        return;
    }
    if (state.sidebarEditingId) state.sidebarEditingName = input.value;
}

export function focusSidebarInput() {
    if (!state.sidebarList) return;
    const input = state.sidebarList.querySelector('.yt-commander-sub-manager-sidebar-input');
    if (!input) return;
    input.focus();
    input.select();
    input.scrollIntoView({ block: 'nearest' });
}

export function ensureSidebarExpanded() {
    if (!state.sidebarCollapsed) return;
    state.sidebarCollapsed = false;
}

export function startSidebarCreate(generateRandomColor) {
    ensureSidebarExpanded();
    state.sidebarCreating = true;
    state.sidebarEditingId = '';
    state.sidebarEditingName = '';
    state.sidebarDraftName = '';
    state.sidebarDraftColor = generateRandomColor();
}

export function startSidebarEdit(categoryId) {
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;
    ensureSidebarExpanded();
    state.sidebarEditingId = categoryId;
    state.sidebarEditingName = category.name;
    state.sidebarCreating = false;
    state.sidebarDraftName = '';
    state.sidebarDraftColor = '';
}

export function commitSidebarCreate(
    name,
    { setStatus, renderList, markPending, persistLocalState, markCategoriesDirty }
) {
    const trimmed = name.trim();
    if (!trimmed) {
        resetSidebarDraftState();
        return false;
    }
    if (state.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        setStatus('Category already exists.', 'error');
        focusSidebarInput();
        return false;
    }
    const category = createCategory(trimmed, state.sidebarDraftColor);
    state.categories.push(category);
    markCategoriesDirty();
    persistLocalState().then(() => markPending([`category:${category.id}`]));
    setStatus(`Created category "${category.name}".`, 'success');
    resetSidebarDraftState();
    renderList();
    return true;
}

export function commitSidebarRename(
    categoryId,
    name,
    { setStatus, renderList, markPending, persistLocalState, markCategoriesDirty }
) {
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) {
        resetSidebarDraftState();
        return false;
    }
    const trimmed = name.trim();
    if (!trimmed) {
        setStatus('Category name required.', 'error');
        focusSidebarInput();
        return false;
    }
    if (
        state.categories.some(
            (c) => c.id !== categoryId && c.name.toLowerCase() === trimmed.toLowerCase()
        )
    ) {
        setStatus('Category already exists.', 'error');
        focusSidebarInput();
        return false;
    }
    if (category.name !== trimmed) {
        category.name = trimmed;
        markCategoriesDirty();
        persistLocalState().then(() => markPending([`category:${categoryId}`]));
        setStatus(`Renamed category to "${trimmed}".`, 'success');
    }
    resetSidebarDraftState();
    renderList();
    return true;
}

export function commitSidebarInput(input, reason, callbacks) {
    if (!input) return false;
    const mode = input.getAttribute('data-mode');
    if (mode === 'create') {
        if (reason === 'blur' && !input.value.trim()) {
            resetSidebarDraftState();
            return false;
        }
        return commitSidebarCreate(input.value, callbacks);
    }
    const categoryId = input.getAttribute('data-category-id') || '';
    if (reason === 'blur' && !input.value.trim()) {
        resetSidebarDraftState();
        return false;
    }
    return commitSidebarRename(categoryId, input.value, callbacks);
}

export function updateCategoryColor(
    categoryId,
    nextColor,
    { setStatus, renderList, markPending, persistLocalState, markCategoriesDirty }
) {
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category || !nextColor) return;
    if (category.color === nextColor) return;
    category.color = nextColor;
    markCategoriesDirty();
    persistLocalState().then(() => markPending([`category:${categoryId}`]));
    setStatus(`Updated color for "${category.name}".`, 'success');
    renderList();
}

export async function removeCategory(
    categoryId,
    {
        setStatus,
        renderSidebarCategories,
        renderList,
        markPending,
        persistLocalState,
        markCategoriesDirty,
        markAssignmentsDirty,
    }
) {
    if (!categoryId) return;
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;
    const confirmText = `Remove category "${category.name}"? This will unassign it from all channels.`;
    if (!window.confirm(confirmText)) return;
    state.categories = state.categories.filter((c) => c.id !== categoryId);
    markCategoriesDirty();
    const updatedKeys = [`category:${categoryId}`];
    let affected = 0;
    Object.entries(state.assignments).forEach(([channelId, list]) => {
        if (!Array.isArray(list) || !list.includes(categoryId)) return;
        const next = list.filter((id) => id !== categoryId);
        if (next.length > 0) state.assignments[channelId] = next;
        else delete state.assignments[channelId];
        updatedKeys.push(`channel:${channelId}`);
        affected++;
    });
    if (affected > 0) markAssignmentsDirty();
    await persistLocalState();
    await markPending(updatedKeys);
    setStatus(`Deleted "${category.name}" and unassigned ${affected} channel(s).`, 'success');
    renderSidebarCategories();
    renderList();
}

export function getCategoryLabel(categoryId) {
    if (categoryId === 'all') return 'All categories';
    if (categoryId === 'uncategorized') return 'Uncategorized';
    const category = state.categories.find((c) => c.id === categoryId);
    return category ? category.name : 'category';
}
