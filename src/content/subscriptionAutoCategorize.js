import { createLogger } from './utils/logger.js';

const logger = createLogger('SubscriptionAutoCategorize');

const STORAGE_KEYS = {
    ENABLED: 'subscriptionAutoCategorizeEnabled',
    API_KEY: 'subscriptionAutoCategorizeApiKey',
    MODEL: 'subscriptionAutoCategorizeModel',
    ENDPOINT: 'subscriptionAutoCategorizeEndpoint'
};

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MAX_CHANNELS = 60;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Load auto-categorize settings from storage.
 * @returns {Promise<{enabled: boolean, apiKey: string, model: string, endpoint: string}>}
 */
async function loadAutoCategorizeSettings() {
    const [syncValues, localValues] = await Promise.all([
        chrome.storage.sync.get([STORAGE_KEYS.ENABLED]),
        chrome.storage.local.get([STORAGE_KEYS.API_KEY, STORAGE_KEYS.MODEL, STORAGE_KEYS.ENDPOINT])
    ]);

    const enabled = syncValues?.[STORAGE_KEYS.ENABLED] !== false;
    const apiKey = typeof localValues?.[STORAGE_KEYS.API_KEY] === 'string'
        ? localValues[STORAGE_KEYS.API_KEY].trim()
        : '';
    const model = typeof localValues?.[STORAGE_KEYS.MODEL] === 'string'
        ? localValues[STORAGE_KEYS.MODEL].trim()
        : DEFAULT_MODEL;
    const endpoint = typeof localValues?.[STORAGE_KEYS.ENDPOINT] === 'string'
        ? localValues[STORAGE_KEYS.ENDPOINT].trim()
        : DEFAULT_ENDPOINT;

    return {
        enabled,
        apiKey,
        model: model || DEFAULT_MODEL,
        endpoint: endpoint || DEFAULT_ENDPOINT
    };
}

function normalizeCategories(list) {
    return (Array.isArray(list) ? list : [])
        .map((category) => ({
            id: typeof category?.id === 'string' ? category.id.trim() : '',
            name: typeof category?.name === 'string' ? category.name.trim() : ''
        }))
        .filter((category) => category.id && category.name);
}

function normalizeChannel(channel) {
    return {
        channelId: channel?.channelId || '',
        title: channel?.title || '',
        handle: channel?.handle || '',
        url: channel?.url || '',
        subscriberCount: channel?.subscriberCount || '',
        videoCount: channel?.videoCount || ''
    };
}

function buildPrompt(categories, channels) {
    const categoryPayload = categories.map((category) => ({
        id: category.id,
        name: category.name
    }));
    const channelPayload = channels.map(normalizeChannel);

    return [
        'You are classifying YouTube channels into user-defined categories.',
        'Rules:',
        '- Only choose from the provided categories by id.',
        '- If there is no strong match, use "uncategorized".',
        '- Return JSON only with this exact shape:',
        '{"assignments":[{"channelId":"UC...", "categoryId":"category-id", "confidence":0.0}]}',
        '',
        'Categories:',
        JSON.stringify(categoryPayload, null, 2),
        '',
        'Channels:',
        JSON.stringify(channelPayload, null, 2)
    ].join('\n');
}

function normalizeJsonText(text) {
    if (!text) {
        return '';
    }
    let trimmed = String(text).trim();
    trimmed = trimmed.replace(/^```json/i, '```').replace(/^```/i, '');
    trimmed = trimmed.replace(/```$/i, '').trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
        return trimmed.slice(start, end + 1);
    }
    return trimmed;
}

function parseAssignmentsFromResponse(text) {
    const normalized = normalizeJsonText(text);
    if (!normalized) {
        return [];
    }
    try {
        const parsed = JSON.parse(normalized);
        const assignments = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
        return assignments.filter((item) => item && typeof item === 'object');
    } catch (error) {
        logger.warn('Failed to parse Gemini response', error);
        return [];
    }
}

function chunk(list, size) {
    const chunks = [];
    if (!Array.isArray(list) || size <= 0) {
        return chunks;
    }
    for (let i = 0; i < list.length; i += size) {
        chunks.push(list.slice(i, i + size));
    }
    return chunks;
}

async function requestGeminiCompletion(payload) {
    if (!chrome?.runtime?.sendMessage) {
        throw new Error('Extension runtime unavailable for auto-categorize.');
    }
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: 'AUTO_CATEGORIZE_SUBSCRIPTIONS',
                apiKey: payload.apiKey,
                endpoint: payload.endpoint,
                model: payload.model,
                prompt: payload.prompt,
                temperature: payload.temperature,
                maxOutputTokens: payload.maxOutputTokens,
                timeoutMs: payload.timeoutMs
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'Auto-categorize request failed'));
                    return;
                }
                if (!response || response.success !== true) {
                    reject(new Error(response?.error || 'Auto-categorize request failed'));
                    return;
                }
                resolve(response.data || {});
            }
        );
    });
}

/**
 * Auto categorize uncategorized channels using Gemini.
 * @param {object} options
 * @param {Array<object>} options.channels
 * @param {Array<object>} options.categories
 * @param {object} options.assignments
 * @param {(ids: string[], categoryId: string, mode: 'add'|'remove'|'toggle') => Promise<void>} options.applyCategoryUpdate
 * @param {(message: string, type?: string) => void} [options.setStatus]
 * @param {number} [options.maxChannels]
 * @returns {Promise<{status: string, appliedCount: number, remainingCount: number}>}
 */
export async function autoCategorizeSubscriptions(options) {
    const channels = Array.isArray(options?.channels) ? options.channels : [];
    const categories = normalizeCategories(options?.categories);
    const assignments = options?.assignments && typeof options.assignments === 'object'
        ? options.assignments
        : {};
    const applyCategoryUpdate = options?.applyCategoryUpdate;
    const setStatus = typeof options?.setStatus === 'function' ? options.setStatus : null;
    const maxChannels = Number.isFinite(options?.maxChannels)
        ? Math.max(1, Math.floor(options.maxChannels))
        : DEFAULT_MAX_CHANNELS;

    if (!channels.length || !categories.length || typeof applyCategoryUpdate !== 'function') {
        return { status: 'skipped', appliedCount: 0, remainingCount: 0 };
    }

    const settings = await loadAutoCategorizeSettings();
    if (!settings.enabled) {
        return { status: 'disabled', appliedCount: 0, remainingCount: 0 };
    }
    if (!settings.apiKey) {
        if (setStatus) {
            setStatus('Add a Gemini API key to enable auto-categorize.', 'info');
        }
        return { status: 'missing-key', appliedCount: 0, remainingCount: 0 };
    }

    const uncategorized = channels.filter((channel) => {
        const channelId = channel?.channelId || '';
        if (!channelId) {
            return false;
        }
        const assigned = assignments[channelId];
        return !Array.isArray(assigned) || assigned.length === 0;
    });

    if (!uncategorized.length) {
        return { status: 'empty', appliedCount: 0, remainingCount: 0 };
    }

    const targets = uncategorized
        .slice()
        .sort((a, b) => (a?.title || '').localeCompare(b?.title || '', undefined, { sensitivity: 'base' }))
        .slice(0, maxChannels);
    if (!targets.length) {
        return { status: 'empty', appliedCount: 0, remainingCount: uncategorized.length };
    }

    const targetIds = new Set(targets.map((channel) => channel?.channelId).filter(Boolean));
    const categoryIds = new Set(categories.map((category) => category.id));
    const batches = chunk(targets, DEFAULT_BATCH_SIZE);
    const assignedChannelIds = new Set();

    if (setStatus) {
        setStatus(`Auto-categorizing ${targets.length} channel(s)...`, 'info');
    }

    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const prompt = buildPrompt(categories, batch);
        const responseData = await requestGeminiCompletion({
            apiKey: settings.apiKey,
            endpoint: settings.endpoint,
            model: settings.model,
            prompt,
            temperature: DEFAULT_TEMPERATURE,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            timeoutMs: DEFAULT_TIMEOUT_MS
        });

        const responseText = Array.isArray(responseData?.candidates)
            ? responseData.candidates
                .flatMap((candidate) => candidate?.content?.parts || [])
                .map((part) => part?.text || '')
                .join('')
            : '';
        const rawAssignments = parseAssignmentsFromResponse(responseText);
        const grouped = new Map();

        rawAssignments.forEach((item) => {
            const channelId = typeof item?.channelId === 'string' ? item.channelId.trim() : '';
            const categoryId = typeof item?.categoryId === 'string' ? item.categoryId.trim() : '';
            if (!channelId || !categoryId || categoryId === 'uncategorized') {
                return;
            }
            if (!targetIds.has(channelId) || !categoryIds.has(categoryId)) {
                return;
            }
            if (assignedChannelIds.has(channelId)) {
                return;
            }
            const bucket = grouped.get(categoryId) || [];
            bucket.push(channelId);
            grouped.set(categoryId, bucket);
            assignedChannelIds.add(channelId);
        });

        for (const [categoryId, channelIds] of grouped.entries()) {
            if (channelIds.length === 0) {
                continue;
            }
            await applyCategoryUpdate(channelIds, categoryId, 'add');
        }
    }

    const appliedCount = assignedChannelIds.size;
    const remainingCount = Math.max(0, uncategorized.length - appliedCount);
    if (setStatus) {
        const label = appliedCount
            ? `Auto-categorized ${appliedCount} channel(s).`
            : 'No auto-categorize matches found.';
        const suffix = remainingCount ? ` ${remainingCount} still uncategorized.` : '';
        setStatus(`${label}${suffix}`, appliedCount ? 'success' : 'info');
    }

    return { status: 'completed', appliedCount, remainingCount };
}
