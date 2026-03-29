/**
 * Request/response bridge helper for isolated<->main world messaging.
 */

const PROGRESS_TYPE = 'YT_COMMANDER_BRIDGE_PROGRESS';

/**
 * Create a bridge client with timeout and pending-request tracking.
 * @param {{
 *   source: string,
 *   requestType: string,
 *   responseType: string,
 *   timeoutMs?: number,
 *   requestPrefix?: string
 * }} options
 * @returns {{
 *   sendRequest: (action: string, payload: object, onProgress?: (progress: object) => void) => Promise<any>,
 *   handleResponse: (event: MessageEvent) => void,
 *   handleProgress: (event: MessageEvent) => void,
 *   rejectAll: (message: string) => void
 * }}
 */
function createBridgeClient(options) {
    const source = String(options?.source || '');
    const requestType = String(options?.requestType || '');
    const responseType = String(options?.responseType || '');
    const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000;
    const requestPrefix = String(options?.requestPrefix || 'ytc-bridge');

    let requestCounter = 0;
    const pendingRequests = new Map();

    /**
     * Send bridge request and wait for response.
     * @param {string} action
     * @param {object} payload
     * @param {((progress: object) => void)=} onProgress
     * @returns {Promise<any>}
     */
    function sendRequest(action, payload, onProgress) {
        const requestId = `${requestPrefix}-${Date.now()}-${++requestCounter}`;

        return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                pendingRequests.delete(requestId);
                reject(new Error('Playlist request timed out.'));
            }, timeoutMs);

            pendingRequests.set(requestId, {
                resolve,
                reject,
                timeoutId,
                onProgress
            });

            window.postMessage({
                source,
                type: requestType,
                requestId,
                action,
                payload
            }, '*');
        });
    }

    /**
     * Handle bridge response messages.
     * @param {MessageEvent} event
     */
    function handleResponse(event) {
        if (event.source !== window || !event.data || typeof event.data !== 'object') {
            return;
        }

        const message = event.data;
        if (message.source !== source || message.type !== responseType || !message.requestId) {
            return;
        }

        const pending = pendingRequests.get(message.requestId);
        if (!pending) {
            return;
        }

        pendingRequests.delete(message.requestId);
        clearTimeout(pending.timeoutId);

        if (message.success) {
            pending.resolve(message.data || {});
        } else {
            pending.reject(new Error(message.error || 'Playlist action failed.'));
        }
    }

    /**
     * Handle bridge progress messages.
     * @param {MessageEvent} event
     */
    function handleProgress(event) {
        if (event.source !== window || !event.data || typeof event.data !== 'object') {
            return;
        }

        const message = event.data;
        if (message.type !== PROGRESS_TYPE || !message.requestId) {
            return;
        }

        const pending = pendingRequests.get(message.requestId);
        
        if (!pending || typeof pending.onProgress !== 'function') {
            return;
        }

        pending.onProgress(message.data || {});
    }

    /**
     * Reject all pending requests.
     * @param {string} message
     */
    function rejectAll(message) {
        pendingRequests.forEach((pending) => {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error(message));
        });
        pendingRequests.clear();
    }

    return {
        sendRequest,
        handleResponse,
        handleProgress,
        rejectAll
    };
}

export { PROGRESS_TYPE };

export {
    createBridgeClient
};
