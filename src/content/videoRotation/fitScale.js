/**
 * Rotation fit-scale helpers.
 */

const SAFE_EDGE_SCALE = 0.998;

/**
 * Compute scale factor for 90/270 rotation while keeping content inside player.
 * Uses displayed content size (object-fit: contain style behavior), not raw
 * element box, so vertical videos are handled correctly.
 * @param {HTMLVideoElement} video
 * @param {number} angle
 * @param {Element|null} player
 * @returns {number}
 */
export function computeRotationFitScale(video, angle, player) {
    if (angle !== 90 && angle !== 270) {
        return 1;
    }

    const containerSize = getContainerSize(video, player);
    if (!containerSize) {
        return 1;
    }

    const displayedSize = getDisplayedVideoSize(video, containerSize.width, containerSize.height);
    if (!displayedSize) {
        return 1;
    }

    const rotatedWidth = displayedSize.height;
    const rotatedHeight = displayedSize.width;

    if (rotatedWidth <= 0 || rotatedHeight <= 0) {
        return 1;
    }

    const widthScale = containerSize.width / rotatedWidth;
    const heightScale = containerSize.height / rotatedHeight;
    const scale = Math.min(widthScale, heightScale);

    if (!Number.isFinite(scale) || scale <= 0) {
        return 1;
    }

    return scale * SAFE_EDGE_SCALE;
}

/**
 * Resolve target container size.
 * @param {HTMLVideoElement} video
 * @param {Element|null} player
 * @returns {{width: number, height: number}|null}
 */
function getContainerSize(video, player) {
    const playerRect = player?.getBoundingClientRect?.();
    const playerWidth = Number(playerRect?.width) || 0;
    const playerHeight = Number(playerRect?.height) || 0;

    if (playerWidth > 0 && playerHeight > 0) {
        return {
            width: playerWidth,
            height: playerHeight
        };
    }

    const videoRect = video.getBoundingClientRect();
    if (videoRect.width > 0 && videoRect.height > 0) {
        return {
            width: videoRect.width,
            height: videoRect.height
        };
    }

    return null;
}

/**
 * Compute displayed content size inside container (contain-fit behavior).
 * @param {HTMLVideoElement} video
 * @param {number} containerWidth
 * @param {number} containerHeight
 * @returns {{width: number, height: number}|null}
 */
function getDisplayedVideoSize(video, containerWidth, containerHeight) {
    if (containerWidth <= 0 || containerHeight <= 0) {
        return null;
    }

    const intrinsicWidth = Number(video.videoWidth) || 0;
    const intrinsicHeight = Number(video.videoHeight) || 0;

    if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
        // Fallback when metadata isn't ready yet.
        return {
            width: containerWidth,
            height: containerHeight
        };
    }

    const containerAspect = containerWidth / containerHeight;
    const videoAspect = intrinsicWidth / intrinsicHeight;

    if (!Number.isFinite(containerAspect) || !Number.isFinite(videoAspect) || videoAspect <= 0) {
        return null;
    }

    if (videoAspect >= containerAspect) {
        return {
            width: containerWidth,
            height: containerWidth / videoAspect
        };
    }

    return {
        width: containerHeight * videoAspect,
        height: containerHeight
    };
}

