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

export {
    createSvgIcon,
    createMastheadIcon,
    createDotsIcon,
    createBookmarkIcon,
    createCloseIcon,
    createPlusIcon,
    createChevronDownIcon,
    createCheckIcon,
    createRemoveIcon
};
