// Seek Controls Indicator Utilities

export function applyIndicatorInset(element, player) {
    if (!element || !player) {
        return;
    }
    const video = player.querySelector('video');
    if (!video) {
        element.style.removeProperty('--ytc-seek-indicator-inset');
        return;
    }
    const playerRect = player.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    if (!playerRect.width || !videoRect.width) {
        element.style.removeProperty('--ytc-seek-indicator-inset');
        return;
    }
    const leftBar = Math.max(0, videoRect.left - playerRect.left);
    const rightBar = Math.max(0, playerRect.right - videoRect.right);
    const barWidth = Math.min(leftBar, rightBar);
    if (barWidth > 6) {
        const inset = Math.max(12, Math.round(barWidth + 8));
        element.style.setProperty('--ytc-seek-indicator-inset', `${inset}px`);
        return;
    }
    element.style.removeProperty('--ytc-seek-indicator-inset');
}

export function formatSeekDuration(seconds) {
    const abs = Math.abs(Math.round(seconds));
    if (abs >= 60) {
        const m = Math.floor(abs / 60);
        const s = abs % 60;
        return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m}:00`;
    }
    return String(abs);
}

export function clampSeekValue(value, min = 1, max = 600) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return min;
    }
    return Math.min(max, Math.max(min, parsed));
}
