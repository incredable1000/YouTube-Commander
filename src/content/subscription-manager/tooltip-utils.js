export function setTooltip(el, label) {
    if (!el || !label) {
        return;
    }
    el.setAttribute('aria-label', label);
    el.setAttribute('title', label);
    el.setAttribute('data-tooltip', label);
    el.classList.add('yt-commander-sub-manager-tooltip');
}

export function clearTooltip(el) {
    if (!el) {
        return;
    }
    el.removeAttribute('aria-label');
    el.removeAttribute('title');
    el.removeAttribute('data-tooltip');
    el.classList.remove('yt-commander-sub-manager-tooltip');
}

export function applySidebarTooltip(el, label, options = {}) {
    const { immediate = false } = options;
    if (!el || !label) {
        return;
    }
    setTooltip(el, label);
}
