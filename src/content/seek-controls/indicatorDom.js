/**
 * Seek indicator DOM helpers.
 */

/**
 * Create default indicator state object.
 * @returns {{element: HTMLDivElement|null, player: Element|null, totalSeconds: number, hideTimer: number|null, removeTimer: number|null}}
 */
export function createIndicatorState() {
    return {
        element: null,
        player: null,
        totalSeconds: 0,
        hideTimer: null,
        removeTimer: null
    };
}

/**
 * Create indicator DOM structure.
 * @param {'forward'|'backward'} direction
 * @returns {HTMLDivElement}
 */
export function createIndicatorElement(direction) {
    const root = document.createElement('div');
    root.className = `modern-seek-indicator ${direction}`;

    const content = document.createElement('div');
    content.className = 'modern-seek-indicator__content';

    const amount = document.createElement('div');
    amount.className = 'modern-seek-indicator__amount';

    const edgeArrow = document.createElement('div');
    edgeArrow.className = 'modern-seek-indicator__edge-arrow';

    const valueRow = document.createElement('div');
    valueRow.className = 'modern-seek-indicator__value-row';

    valueRow.appendChild(amount);
    valueRow.appendChild(edgeArrow);
    content.appendChild(valueRow);
    root.appendChild(content);

    updateIndicatorElement(root, direction, 0);

    return root;
}

/**
 * Update indicator label text.
 * @param {HTMLDivElement} element
 * @param {'forward'|'backward'} direction
 * @param {number} totalSeconds
 */
export function updateIndicatorElement(element, direction, totalSeconds) {
    const amount = element.querySelector('.modern-seek-indicator__amount');
    const edgeArrow = element.querySelector('.modern-seek-indicator__edge-arrow');
    if (!amount) {
        return;
    }

    const prefix = direction === 'forward' ? '+' : '-';
    amount.textContent = `${prefix}${totalSeconds}`;

    if (edgeArrow) {
        edgeArrow.textContent = direction === 'forward' ? '>' : '<';
    }
}
