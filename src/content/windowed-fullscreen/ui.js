/**
 * Windowed fullscreen UI components.
 */

import { BUTTON_ID, BUTTON_CLASS, BUTTON_ACTIVE_CLASS, WINDOWED_ICON_PATH } from './constants.js';

export function createWindowedButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', 'Windowed fullscreen');
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Windowed fullscreen';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.minWidth = '40px';
    button.style.opacity = '1';
    button.style.visibility = 'visible';

    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.setAttribute('width', '24');
    svgIcon.setAttribute('height', '24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', WINDOWED_ICON_PATH);

    svgIcon.appendChild(path);
    button.appendChild(svgIcon);

    button.addEventListener('mousedown', (event) => {
        event.preventDefault();
    });

    return button;
}

export function updateButtonState(windowedButton, isWindowed) {
    if (!windowedButton) {
        return;
    }

    windowedButton.classList.toggle(BUTTON_ACTIVE_CLASS, isWindowed);
    windowedButton.setAttribute('aria-pressed', isWindowed ? 'true' : 'false');
    windowedButton.setAttribute(
        'aria-label',
        isWindowed ? 'Exit windowed fullscreen' : 'Windowed fullscreen'
    );
    windowedButton.title = isWindowed ? 'Exit windowed fullscreen' : 'Windowed fullscreen';
}

export function removeButton(windowedButton) {
    if (windowedButton) {
        windowedButton.remove();
        return null;
    }
    return windowedButton;
}
