/**
 * Subscription Labels styles.
 */

import {
    LABEL_CLASS,
    HOST_CLASS,
    ROW_CLASS,
    LABEL_KIND_ATTR,
    LABEL_KIND_SUBSCRIBED,
} from './constants.js';

export function injectStyles() {
    if (document.getElementById('yt-commander-subscription-label-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'yt-commander-subscription-label-styles';
    style.textContent = `
        .${HOST_CLASS} {
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            overflow: visible;
        }

        .${HOST_CLASS}.${ROW_CLASS} {
            display: flex !important;
        }

        .${HOST_CLASS}.shortsLockupViewModelHostOutsideMetadataSubhead,
        .${HOST_CLASS}.shortsLockupViewModelHostMetadataSubhead {
            display: flex !important;
        }

        .${HOST_CLASS}:not(.${ROW_CLASS}) {
            display: inline-flex;
        }

        .${LABEL_CLASS} {
            display: none;
            align-items: center;
            padding: 4px 10px;
            margin-left: 6px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
            white-space: nowrap;
        }

        ytd-browse[page-subtype="home"] .${LABEL_CLASS},
        ytd-browse[browse-id="FEwhat_to_watch"] .${LABEL_CLASS} {
            display: inline-flex;
        }

        .${LABEL_CLASS}[${LABEL_KIND_ATTR}='${LABEL_KIND_SUBSCRIBED}'] {
            background: rgba(46, 204, 113, 0.16);
            color: #b8f2cd;
            border: 1px solid rgba(46, 204, 113, 0.4);
        }
    `;

    document.head.appendChild(style);
}
