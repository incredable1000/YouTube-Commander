/**
 * Watched History styles.
 */

import { HIDDEN_CLASS, MARKER_CLASS, WATCHED_ATTR } from './constants.js';

export function injectStyles() {
    if (document.getElementById('yt-commander-watched-history-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'yt-commander-watched-history-styles';
    style.textContent = `
        .${HIDDEN_CLASS} {
            display: none !important;
        }

        [${WATCHED_ATTR}='true'] {
            position: relative !important;
            display: block !important;
        }

        .${MARKER_CLASS} {
            position: absolute !important;
            inset: 0 !important;
            pointer-events: none !important;
            z-index: 12 !important;
            background: rgba(0, 0, 0, 0.45) !important;
            border-radius: 12px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        .${MARKER_CLASS}::after {
            content: '\\2713' !important;
            font-size: 20px !important;
            font-weight: 700 !important;
            letter-spacing: 0.3px !important;
            color: #ffffff !important;
            background: rgba(31, 165, 68, 0.95) !important;
            border-radius: 999px !important;
            width: 30px !important;
            height: 30px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
        }
    `;

    document.head.appendChild(style);
}
