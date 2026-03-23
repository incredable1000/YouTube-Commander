/**
 * SVG icon helpers for playlist multi-select.
 */

/**
 * Create an SVG icon from a single path.
 * @param {string} path
 * @param {string} [viewBox]
 * @returns {SVGSVGElement}
 */
function createSvgIcon(path, viewBox = '0 0 24 24') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', path);
    svg.appendChild(iconPath);

    return svg;
}

/**
 * @returns {SVGSVGElement}
 */
function createMastheadIcon() {
    return createSvgIcon('M4 5h11v2H4V5zm0 6h11v2H4v-2zm0 6h7v2H4v-2zm14.7-5.3L20 13l-4.7 4.7-2.3-2.3 1.4-1.4.9.9z');
}

/**
 * @returns {SVGSVGElement}
 */
function createDotsIcon() {
    return createSvgIcon('M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z');
}

/**
 * @returns {SVGSVGElement}
 */
function createBookmarkIcon() {
    return createSvgIcon('M6 3h12c1.1 0 2 .9 2 2v16l-8-4-8 4V5c0-1.1.9-2 2-2zm0 2v12.76l6-3 6 3V5H6z');
}

/**
 * @returns {SVGSVGElement}
 */
function createWatchLaterIcon() {
    return createSvgIcon('M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9zm0 16.5A7.5 7.5 0 1 1 19.5 12 7.51 7.51 0 0 1 12 19.5zm.75-11.25h-1.5v4.2l3.6 2.16.75-1.23-2.85-1.68z');
}

/**
 * @returns {SVGSVGElement}
 */
function createCloseIcon() {
    return createSvgIcon('M18.3 5.71 12 12l6.3 6.29-1.41 1.42-6.3-6.31-6.3 6.31-1.41-1.42L9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z');
}

/**
 * @returns {SVGSVGElement}
 */
function createPlusIcon() {
    return createSvgIcon('M19 11H13V5h-2v6H5v2h6v6h2v-6h6z');
}

/**
 * @returns {SVGSVGElement}
 */
function createPlaylistAddIcon() {
    return createSvgIcon('M3 10h10v2H3v-2zm0-4h10v2H3V6zm0 8h6v2H3v-2zm12 0v-3h-3v-2h3V6h2v3h3v2h-3v3h-2z');
}

/**
 * @returns {SVGSVGElement}
 */
function createChevronDownIcon() {
    return createSvgIcon('M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z');
}

/**
 * @returns {SVGSVGElement}
 */
function createCheckIcon() {
    return createSvgIcon('M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z');
}

/**
 * @returns {SVGSVGElement}
 */
function createRemoveIcon() {
    return createSvgIcon('M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zm3.46-8.88L12 12.67l2.54-2.55 1.06 1.06L13.06 13.73l2.54 2.55-1.06 1.06L12 14.79l-2.54 2.55-1.06-1.06 2.54-2.55-2.54-2.55 1.06-1.06zM15.5 4l-1-1h-5l-1 1H5v2h14V4z');
}

/**
 * @returns {SVGSVGElement}
 */
function createSelectAllIcon() {
    return createSvgIcon('M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm11.3-1.3L16 13.4l4.3-4.3L22 10.8 16 16.8l-3.7-3.7z');
}

/**
 * @returns {SVGSVGElement}
 */
function createUnselectAllIcon() {
    return createSvgIcon('M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm11.4 0L16 14.6l1.6-1.6L19 14.4l1.4-1.4 1.6 1.6-1.4 1.4 1.4 1.4-1.6 1.6-1.4-1.4-1.4 1.4-1.6-1.6 1.4-1.4z');
}

export {
    createSvgIcon,
    createMastheadIcon,
    createDotsIcon,
    createBookmarkIcon,
    createWatchLaterIcon,
    createCloseIcon,
    createPlusIcon,
    createPlaylistAddIcon,
    createChevronDownIcon,
    createCheckIcon,
    createRemoveIcon,
    createSelectAllIcon,
    createUnselectAllIcon
};
