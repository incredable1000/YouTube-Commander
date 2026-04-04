// Video Rotation Utilities
export const ROTATION_ANGLES = [0, 90, 180, 270];
export function normalizeAngle(angle) {
    const rounded = Math.round(Number(angle) || 0);
    return ROTATION_ANGLES.includes(rounded) ? rounded : 0;
}
export function isValidVideoId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{10,15}$/.test(value);
}
export function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
