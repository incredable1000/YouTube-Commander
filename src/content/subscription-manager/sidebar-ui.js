/**
 * Sidebar UI module for subscription manager.
 */

import { setTooltip, clearTooltip } from './tooltip-utils.js';
import { normalizeColorToHex, pickCategoryColor, applyCategoryItemColors } from './data-utils.js';
import { createIcon } from './icon-utils.js';
import { ICONS, FILTER_ITEM_CLASS, FILTER_COUNT_CLASS } from './constants.js';

export function getSidebarInitial(label) {
    if (typeof label !== 'string') return '';
    const trimmed = label.trim();
    if (!trimmed) return '';
    return trimmed[0].toUpperCase();
}

export function applySidebarTooltip(el, label, options = {}, sidebar, sidebarCollapsed) {
    if (!el) return;
    const tooltipText =
        typeof options.tooltip === 'string' && options.tooltip.trim() ? options.tooltip : label;
    if (sidebar?.classList.contains('yt-commander-sub-manager-chipbar')) {
        setTooltip(el, tooltipText);
        return;
    }
    if (sidebarCollapsed) {
        setTooltip(el, tooltipText);
        return;
    }
    clearTooltip(el);
}

export function renderSidebarCategories(params) {
    const {
        sidebarList,
        sidebarCountEl,
        sidebarEditingId,
        sidebarCreating,
        sidebarDraftName,
        sidebarDraftColor,
        sidebar,
        sidebarCollapsed,
        filterMode,
        categories,
        counts,
        setIconButton,
        updateChipbarNavButtons,
        generateRandomCategoryColor,
        persistViewState,
    } = params;

    if (!sidebarList) return;

    const previousScrollTop = sidebarList.scrollTop;
    const wasAtBottom =
        sidebarList.scrollHeight > sidebarList.clientHeight &&
        sidebarList.scrollHeight - sidebarList.scrollTop - sidebarList.clientHeight < 4;

    if (sidebarCountEl) {
        sidebarCountEl.textContent = String(categories.length);
    }

    const validIds = new Set(['all', 'uncategorized', ...categories.map((c) => c.id)]);
    if (!validIds.has(filterMode)) {
        params.filterMode = 'all';
        persistViewState().catch(() => undefined);
    }

    sidebarList.innerHTML = '';

    if (sidebarEditingId && !categories.some((c) => c.id === sidebarEditingId)) {
        params.resetSidebarDraftState();
    }

    const buildColorInput = (value, options = {}) => {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'yt-commander-sub-manager-color-input';
        input.value = normalizeColorToHex(value);
        if (options.categoryId) input.setAttribute('data-category-id', options.categoryId);
        if (options.mode) input.setAttribute('data-mode', options.mode);
        input.setAttribute('data-action', 'category-color');
        setTooltip(input, options.tooltip || 'Change color');
        return input;
    };

    const addItem = (id, label, color, options = {}) => {
        const countValue = typeof counts[id] === 'number' ? counts[id] : 0;
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item`;
        item.setAttribute('data-action', 'filter-select');
        item.setAttribute('data-filter-id', id);
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        if (filterMode === id) item.classList.add('active');

        applySidebarTooltip(
            item,
            label,
            { tooltip: `${label} (${countValue})` },
            sidebar,
            sidebarCollapsed
        );

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const initial = document.createElement('span');
        initial.className = 'yt-commander-sub-manager-filter-initial';
        initial.textContent = getSidebarInitial(label);

        const name = document.createElement('span');
        name.className = 'yt-commander-sub-manager-filter-name';
        name.textContent = label;

        left.appendChild(initial);
        left.appendChild(name);

        const right = document.createElement('span');
        right.className = 'yt-commander-sub-manager-filter-right';

        const count = document.createElement('span');
        count.className = FILTER_COUNT_CLASS;
        count.textContent = String(countValue);
        right.appendChild(count);

        if (options.removable) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'yt-commander-sub-manager-filter-remove';
            remove.setAttribute('data-action', 'filter-remove');
            remove.setAttribute('data-category-id', id);
            setTooltip(remove, `Delete ${label}`);
            const removeIcon = createIcon(ICONS.trash);
            removeIcon.classList.add('yt-commander-sub-manager-icon');
            remove.appendChild(removeIcon);
            right.appendChild(remove);
        }

        item.appendChild(left);
        item.appendChild(right);
        sidebarList.appendChild(item);
    };

    const addEditableItem = (category) => {
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item is-editing`;

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const color = buildColorInput(category.color, {
            categoryId: category.id,
            tooltip: 'Change color',
        });
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'yt-commander-sub-manager-sidebar-input';
        input.value = sidebarEditingId || category.name;
        input.placeholder = 'Category name';
        input.setAttribute('data-category-id', category.id);
        input.setAttribute('data-mode', 'edit');

        left.appendChild(color);
        left.appendChild(input);
        item.appendChild(left);
        sidebarList.appendChild(item);
        applyCategoryItemColors(item, category.color);
    };

    const addCreateItem = () => {
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item is-creating`;

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const colorValue =
            sidebarDraftColor || pickCategoryColor(sidebarDraftName || 'New category');
        const color = buildColorInput(colorValue, { mode: 'create', tooltip: 'Pick color' });
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'yt-commander-sub-manager-sidebar-input';
        input.value = sidebarDraftName;
        input.placeholder = 'New category';
        input.setAttribute('data-mode', 'create');

        left.appendChild(color);
        left.appendChild(input);
        item.appendChild(left);
        sidebarList.appendChild(item);
        applyCategoryItemColors(item, colorValue);
    };

    addItem('all', 'All categories', '#616b7f');
    addItem('uncategorized', 'Uncategorized', '#3b4457');

    categories.forEach((category) => {
        if (sidebarEditingId === category.id) {
            addEditableItem(category);
            return;
        }
        addCategoryItem(category, params);
    });

    if (sidebarCreating) {
        addCreateItem();
    }

    if (!sidebarCreating && !sidebarEditingId) {
        const nextScrollTop = wasAtBottom ? sidebarList.scrollHeight : previousScrollTop;
        window.requestAnimationFrame(() => {
            if (!sidebarList) return;
            sidebarList.scrollTop = Math.min(nextScrollTop, sidebarList.scrollHeight);
        });
    }

    window.requestAnimationFrame(() => updateChipbarNavButtons());
}

function addCategoryItem(category, params) {
    const {
        sidebarList,
        sidebarEditingId,
        filterMode,
        sidebar,
        sidebarCollapsed,
        counts,
        setIconButton,
    } = params;
    const countValue = typeof counts[category.id] === 'number' ? counts[category.id] : 0;

    const item = document.createElement('div');
    item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item`;
    item.setAttribute('data-action', 'filter-select');
    item.setAttribute('data-filter-id', category.id);
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    if (filterMode === category.id) item.classList.add('active');

    applySidebarTooltip(
        item,
        category.name,
        { tooltip: `${category.name} (${countValue})` },
        sidebar,
        sidebarCollapsed
    );

    const left = document.createElement('span');
    left.className = 'yt-commander-sub-manager-filter-left';

    const initial = document.createElement('span');
    initial.className = 'yt-commander-sub-manager-filter-initial';
    initial.textContent = getSidebarInitial(category.name);

    const name = document.createElement('span');
    name.className = 'yt-commander-sub-manager-filter-name';
    name.textContent = category.name;
    name.setAttribute('data-category-id', category.id);

    left.appendChild(initial);
    left.appendChild(name);

    const right = document.createElement('span');
    right.className = 'yt-commander-sub-manager-filter-right';

    const count = document.createElement('span');
    count.className = FILTER_COUNT_CLASS;
    count.textContent = String(countValue);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'yt-commander-sub-manager-filter-remove';
    remove.setAttribute('data-action', 'filter-remove');
    remove.setAttribute('data-category-id', category.id);
    setTooltip(remove, `Delete ${category.name}`);
    const removeIcon = createIcon(ICONS.trash);
    removeIcon.classList.add('yt-commander-sub-manager-icon');
    remove.appendChild(removeIcon);

    right.appendChild(count);
    right.appendChild(remove);
    item.appendChild(left);
    item.appendChild(right);
    sidebarList.appendChild(item);
    applyCategoryItemColors(item, category.color);
}

export function updateSidebarToggleButton(sidebarToggleButton, sidebarCollapsed, setIconButton) {
    if (!sidebarToggleButton) return;
    const icon = sidebarCollapsed ? ICONS.expand : ICONS.collapse;
    const label = sidebarCollapsed ? 'Expand categories' : 'Collapse categories';
    setIconButton(sidebarToggleButton, icon, label);
}

export function updateSortButton(sortButton, sortMode, setIconButton) {
    if (!sortButton) return;
    const isSubscribers = sortMode === 'subscribers';
    const label = isSubscribers ? 'Sort by name' : 'Sort by subscribers';
    setIconButton(sortButton, ICONS.sort, label);
    sortButton.classList.toggle('active', isSubscribers);
}

export function updateRemoveCategoryButton(
    removeCategoryButton,
    selectedChannelIds,
    setIconButton
) {
    if (!removeCategoryButton) return;
    const hasSelection = selectedChannelIds.size > 0;
    removeCategoryButton.disabled = !hasSelection;
    const label = hasSelection ? 'Move to category' : 'Select channels to move';
    setIconButton(removeCategoryButton, ICONS.categoryMove, label);
}

export function updateChipbarNavButtons(sidebarList, chipbarPrevButton, chipbarNextButton) {
    if (!sidebarList) return;
    const maxScrollLeft = Math.max(0, sidebarList.scrollWidth - sidebarList.clientWidth);
    const currentScrollLeft = sidebarList.scrollLeft;
    if (chipbarPrevButton) chipbarPrevButton.disabled = currentScrollLeft <= 0;
    if (chipbarNextButton) chipbarNextButton.disabled = currentScrollLeft >= maxScrollLeft - 1;
}

export function attachChipbarWheelScroll(params) {
    const {
        sidebar,
        sidebarList,
        chipbarWheelTarget,
        chipbarWheelHandler,
        chipbarScrollTarget,
        chipbarScrollHandler,
        updateChipbarNavButtons,
    } = params;

    if (!sidebar || !sidebarList) return;
    if (!sidebar.classList.contains('yt-commander-sub-manager-chipbar')) return;

    if (chipbarWheelTarget && chipbarWheelHandler) {
        chipbarWheelTarget.removeEventListener('wheel', chipbarWheelHandler);
    }

    params.chipbarWheelTarget = sidebar;
    params.chipbarWheelHandler = (event) => {
        if (!sidebarList) return;
        if (event.ctrlKey) return;
        if (sidebarList.scrollWidth <= sidebarList.clientWidth) return;

        const dominantDelta =
            Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (!dominantDelta) return;

        event.preventDefault();
        sidebarList.scrollLeft += dominantDelta;
        updateChipbarNavButtons(sidebarList, params.chipbarPrevButton, params.chipbarNextButton);
    };
    chipbarWheelTarget.addEventListener('wheel', params.chipbarWheelHandler, { passive: false });

    params.chipbarScrollTarget = sidebarList;
    params.chipbarScrollHandler = () => {
        updateChipbarNavButtons(sidebarList, params.chipbarPrevButton, params.chipbarNextButton);
    };
    chipbarScrollTarget.addEventListener('scroll', params.chipbarScrollHandler, { passive: true });
    updateChipbarNavButtons(sidebarList, params.chipbarPrevButton, params.chipbarNextButton);
}

export function scrollChipbarBy(
    sidebarList,
    amount,
    updateChipbarNavButtons,
    chipbarPrevButton,
    chipbarNextButton
) {
    if (!sidebarList) return;
    sidebarList.scrollBy({ left: amount, behavior: 'smooth' });
    updateChipbarNavButtons(sidebarList, chipbarPrevButton, chipbarNextButton);
}

export function applySidebarState(
    sidebar,
    sidebarCollapsed,
    updateSidebarToggleButton,
    toggleButton,
    setIconButton
) {
    if (!sidebar) return;
    if (sidebar.classList.contains('yt-commander-sub-manager-chipbar')) {
        sidebarCollapsed = false;
        sidebar.classList.remove('is-collapsed');
        return;
    }
    sidebar.classList.toggle('is-collapsed', sidebarCollapsed);
    updateSidebarToggleButton(toggleButton, sidebarCollapsed, setIconButton);
}
