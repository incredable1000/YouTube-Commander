/**
 * Request/response bridge helper for isolated<->main world messaging.
 */

/**
 * Create a bridge client with timeout and pending-request tracking.
 * @param {{
 *   source: string,
 *   requestType: string,
 *   responseType: string,
 *   timeoutMs?: number
 * }} options
 * @returns {{
 *   sendRequest: (action: string, payload: object) => Promise<any>,
 *   handleResponse: (event: MessageEvent) => void,
 *   rejectAll: (message: string) => void
 * }}
 */
function createBridgeClient(options) {
    const source = String(options?.source || '');
    const requestType = String(options?.requestType || '');
    const responseType = String(options?.responseType || '');
    const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000;

    let requestCounter = 0;
    const pendingRequests = new Map();

    /**
     * Send bridge request and wait for response.
     * @param {string} action
     * @param {object} payload
     * @returns {Promise<any>}
     */
    function sendRequest(action, payload) {
        const requestId = `ytc-playlist-${Date.now()}-${++requestCounter}`;

        return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                pendingRequests.delete(requestId);
                reject(new Error('Playlist request timed out.'));
            }, timeoutMs);

            pendingRequests.set(requestId, {
                resolve,
                reject,
                timeoutId
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
        rejectAll
    };
}

export {
    createBridgeClient
};
