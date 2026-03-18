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

    const valueRow = document.createElement('div');
    valueRow.className = 'modern-seek-indicator__value-row';

    const amount = document.createElement('div');
    amount.className = 'modern-seek-indicator__amount';

    const chevrons = document.createElement('div');
    chevrons.className = 'modern-seek-indicator__chevrons';
    chevrons.appendChild(createChevronGroup(direction, 'modern-seek-indicator__chevrons-static'));

    valueRow.appendChild(amount);
    valueRow.appendChild(chevrons);
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
    const chevrons = element.querySelector('.modern-seek-indicator__chevrons');
    if (!amount) {
        return;
    }

    const prefix = direction === 'forward' ? '+' : '-';
    amount.textContent = `${prefix}${totalSeconds}`;

    if (chevrons) {
        chevrons.querySelectorAll('.modern-seek-indicator__chevrons-burst').forEach((node) => {
            node.remove();
        });

        const burst = createChevronGroup(direction, 'modern-seek-indicator__chevrons-burst');
        chevrons.appendChild(burst);

        const cleanup = () => {
            if (burst.parentNode) {
                burst.remove();
            }
        };

        burst.addEventListener('animationend', cleanup, { once: true });
        window.setTimeout(cleanup, 900);
    }
}

/**
 * Create a chevron group for the seek indicator.
 * @param {'forward'|'backward'} direction
 * @param {string} className
 * @returns {HTMLDivElement}
 */
function createChevronGroup(direction, className) {
    const group = document.createElement('div');
    group.className = className;

    const chevron = document.createElement('span');
    chevron.className = 'modern-seek-indicator__chevron';
    group.appendChild(chevron);

    return group;
}
