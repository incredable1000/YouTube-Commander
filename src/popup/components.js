import {
    POPUP_UI_V2_CLASS,
    POPUP_UI_V2_TONES,
    POPUP_UI_V2_NAV_ITEMS,
    POPUP_UI_V2_DEFAULT_FEATURE
} from './module.js';

export function setFeatureCardExpanded(card, expanded) {
    const header = card?.querySelector('.feature-header');
    const content = card?.querySelector('.feature-content');
    header?.classList.toggle('expanded', expanded === true);
    content?.classList.toggle('expanded', expanded === true);
}

export function findFeatureCard(featureName) {
    return document.querySelector(`.feature-header[data-feature='${featureName}']`)?.closest('.feature-card') || null;
}

export function setPopupUiV2ActiveFeature(featureName) {
    const scope = document.querySelector('.ytc-v2-content') || document.querySelector('.container');
    const cards = Array.from(scope?.querySelectorAll('.feature-card') || []);
    if (!cards.length) return;

    let resolvedFeature = featureName;
    if (!findFeatureCard(featureName)) resolvedFeature = POPUP_UI_V2_DEFAULT_FEATURE;
    if (!findFeatureCard(resolvedFeature)) {
        const firstFeature = cards[0].querySelector('.feature-header')?.dataset?.feature || '';
        resolvedFeature = firstFeature;
    }

    cards.forEach((card) => {
        const header = card.querySelector('.feature-header');
        const featureName = header?.dataset?.feature || '';
        const isActive = featureName === resolvedFeature;
        card.classList.toggle('ytc-v2-feature-active', isActive);
        setFeatureCardExpanded(card, isActive);
    });

    document.querySelectorAll('.ytc-v2-nav-button').forEach((button) => {
        const isActive = button.getAttribute('data-feature') === resolvedFeature;
        button.classList.toggle('active', isActive);
    });
}

export function buildV2NavIcon(feature) {
    const icons = {
        seek: 'M5 6v12l8-6zM15 6v12l8-6z',
        quality: 'M4 7h16v2H4V7zm0 8h16v2H4v-2zM7 4h10v2H7V4zm0 14h10v2H7v-2z',
        audio: 'M5 9v6h4l5 4V5l-5 4H5zm12 0a4 4 0 010 6',
        history: 'M12 4a8 8 0 108 8h-2a6 6 0 11-6-6V4zm-1 4h2v5l4 2-1 1.7-5-2.7V8z',
        subscriptionManager: 'M4 5h11v2H4V5zm0 4h11v2H4V9zm0 4h11v2H4v-2zm13-7h3v9h-3V6zm-1 10H4v2h12v-2z',
        playlist: 'M4 6h10v2H4V6zm0 5h10v2H4v-2zm0 5h6v2H4v-2zm13-8h3v3h-3v-3zm0 5h3v3h-3v-3z',
        windowedFullscreen: 'M5 6h14v12H5V6zm2 2v8h10V8H7z',
        shortcuts: 'M4 7h10v2H4V7zm0 4h16v2H4v-2zm0 4h10v2H4v-2zm14-8h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z',
        settings: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.65l-1.92-3.32a.5.5 0 00-.61-.22l-2.39.96a7.07 7.07 0 00-1.63-.94l-.36-2.54A.5.5 0 0014.39 2h-3.78a.5.5 0 00-.5.43l-.36 2.54c-.58.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 00-.61.22L2.2 8.49a.5.5 0 00.12.65l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.32 14.18a.5.5 0 00-.12.65l1.92 3.32c.13.23.4.32.61.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.43.5.43h3.78c.25 0 .46-.19.5-.43l.36-2.54c.58-.22 1.12-.52 1.63-.94l2.39.96c.23.1.48.01.61-.22l1.92-3.32a.5.5 0 00-.12-.65l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z',
        rotation: 'M12 6V3l4 4-4 4V8a4 4 0 104 4h2a6 6 0 11-6-6z',
        shorts: 'M8 4h8v16H8V4zm2 3l5 2.5L10 12V7z',
        shortsUploadAge: 'M6 4h12v3H6V4zm0 5h12v9H6V9zm3 2h2v2H9v-2zm4 0h2v2h-2v-2z',
        subscriptions: 'M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.7 0-8 1.3-8 4v2h10v-2c0-1.1.4-2.1 1.1-2.9C10.3 13.6 9 13 8 13zm8 0c-1.1 0-2.4.3-3.5 1 1 .9 1.5 2 1.5 3v2h10v-2c0-2.7-5.3-4-8-4z',
        scroll: 'M12 5l-6 6h4v8h4v-8h4l-6-6z'
    };
    const path = icons[feature] || icons.seek;
    return `<span class="ytc-v2-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="${path}"></path></svg></span>`;
}

export function ensurePopupUiV2Tooltip() {
    if (!document.body.classList.contains(POPUP_UI_V2_CLASS)) return null;

    let tooltip = document.querySelector('.ytc-v2-tooltip');
    if (tooltip) return tooltip;

    tooltip = document.createElement('div');
    tooltip.className = 'ytc-v2-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
    return tooltip;
}

export function initializePopupUiV2Navigator() {
    if (!POPUP_UI_V2_NAV_ITEMS.length) return;

    const container = document.querySelector('.container');
    const firstCard = container?.querySelector('.feature-card');
    if (!container || !firstCard || document.querySelector('.ytc-v2-nav')) return;

    const navWrap = document.createElement('div');
    navWrap.className = 'ytc-v2-nav-wrap';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'ytc-v2-nav-arrow';
    prevButton.setAttribute('data-direction', 'prev');
    prevButton.setAttribute('aria-label', 'Scroll left');
    prevButton.innerHTML = '<span class="ytc-v2-nav-arrow-icon" aria-hidden="true">◀</span>';

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'ytc-v2-nav-arrow';
    nextButton.setAttribute('data-direction', 'next');
    nextButton.setAttribute('aria-label', 'Scroll right');
    nextButton.innerHTML = '<span class="ytc-v2-nav-arrow-icon" aria-hidden="true">▶</span>';

    const scrollArea = document.createElement('div');
    scrollArea.className = 'ytc-v2-nav-scroll';

    const nav = document.createElement('div');
    nav.className = 'ytc-v2-nav';

    POPUP_UI_V2_NAV_ITEMS.forEach((item) => {
        if (!findFeatureCard(item.feature)) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ytc-v2-nav-button';
        button.setAttribute('data-feature', item.feature);
        button.setAttribute('data-label', item.label);
        button.setAttribute('aria-label', item.label);
        button.innerHTML = buildV2NavIcon(item.feature);
        const label = document.createElement('span');
        label.className = 'ytc-v2-nav-label';
        label.textContent = item.label;
        button.appendChild(label);
        button.addEventListener('click', () => setPopupUiV2ActiveFeature(item.feature));
        nav.appendChild(button);
    });

    scrollArea.appendChild(nav);
    navWrap.appendChild(prevButton);
    navWrap.appendChild(scrollArea);
    navWrap.appendChild(nextButton);
    document.body.insertBefore(navWrap, container);

    const tooltip = ensurePopupUiV2Tooltip();

    const showTooltip = (button) => {
        if (!tooltip || !button) return;
        const label = button.getAttribute('data-label') || '';
        if (!label) return;
        tooltip.textContent = label;
        tooltip.classList.add('visible');
        const rect = button.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        const top = rect.top - tooltipRect.height - 8;
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
    };

    const hideTooltip = () => {
        if (!tooltip) return;
        tooltip.classList.remove('visible');
    };

    nav.querySelectorAll('.ytc-v2-nav-button').forEach((button) => {
        button.addEventListener('mouseenter', () => showTooltip(button));
        button.addEventListener('focus', () => showTooltip(button));
        button.addEventListener('mouseleave', hideTooltip);
        button.addEventListener('blur', hideTooltip);
    });

    scrollArea.addEventListener('scroll', hideTooltip);

    const scrollByAmount = (direction) => {
        const delta = direction === 'prev' ? -120 : 120;
        scrollArea.scrollBy({ left: delta, behavior: 'smooth' });
    };

    prevButton.addEventListener('click', () => scrollByAmount('prev'));
    nextButton.addEventListener('click', () => scrollByAmount('next'));

    const updateArrows = () => {
        const maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
        prevButton.disabled = scrollArea.scrollLeft <= 2;
        nextButton.disabled = scrollArea.scrollLeft >= maxScroll - 2;
    };

    scrollArea.addEventListener('scroll', updateArrows);
    window.requestAnimationFrame(updateArrows);
    setPopupUiV2ActiveFeature(POPUP_UI_V2_DEFAULT_FEATURE);
}

export function initializePopupUiV2Layout() {
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach((card, index) => {
        card.dataset.tone = POPUP_UI_V2_TONES[index % POPUP_UI_V2_TONES.length];
    });

    initializePopupUiV2Navigator();
    ensurePopupUiV2ContentWrapper();
}

export function ensurePopupUiV2ContentWrapper() {
    const container = document.querySelector('.container');
    if (!container || container.querySelector('.ytc-v2-content')) return;

    const content = document.createElement('div');
    content.className = 'ytc-v2-content';

    const cards = Array.from(container.querySelectorAll('.feature-card'));
    cards.forEach((card) => content.appendChild(card));

    const status = container.querySelector('#status');
    if (status) container.insertBefore(content, status);
    else container.appendChild(content);
}
