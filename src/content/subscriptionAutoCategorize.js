import { createLogger } from './utils/logger.js';

const logger = createLogger('SubscriptionAutoCategorize');

const STORAGE_KEYS = {
    ENABLED: 'subscriptionAutoCategorizeEnabled',
    API_KEY: 'subscriptionAutoCategorizeApiKey',
    MODEL: 'subscriptionAutoCategorizeModel',
    ENDPOINT: 'subscriptionAutoCategorizeEndpoint'
};

const DEFAULT_MODEL = 'auto';
const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MAX_CHANNELS = 20;
const DEFAULT_BATCH_SIZE = 3;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_VIDEO_SAMPLE_COUNT = 2;
const DEFAULT_VIDEO_FETCH_CONCURRENCY = 4;
const VIDEO_FEED_BASE_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

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

function buildVideoFeedUrl(channelId) {
    return `${VIDEO_FEED_BASE_URL}${encodeURIComponent(channelId)}`;
}

function parseVideoFeed(xmlText, limit) {
    if (!xmlText) {
        return [];
    }
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const entries = Array.from(doc.getElementsByTagName('entry'));
    return entries.slice(0, limit).map((entry) => {
        const videoIdNode = entry.getElementsByTagName('yt:videoId')[0]
            || entry.getElementsByTagName('videoId')[0];
        const videoId = videoIdNode?.textContent?.trim() || '';
        const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() || '';
        const linkNode = entry.getElementsByTagName('link')[0];
        const href = linkNode?.getAttribute('href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
        if (!href) {
            return null;
        }
        return {
            videoId,
            title,
            url: href
        };
    }).filter(Boolean);
}

async function fetchChannelVideoSamples(channelId, limit) {
    if (!channelId) {
        return [];
    }
    try {
        const response = await fetch(buildVideoFeedUrl(channelId));
        if (!response.ok) {
            return [];
        }
        const text = await response.text();
        return parseVideoFeed(text, limit);
    } catch (error) {
        logger.warn('Failed to fetch channel video feed', error);
        return [];
    }
}

async function fetchVideoSamplesForChannels(channels, limit) {
    const queue = Array.isArray(channels) ? channels.slice() : [];
    const results = new Map();
    const workers = Array.from({ length: DEFAULT_VIDEO_FETCH_CONCURRENCY }, async () => {
        while (queue.length > 0) {
            const channel = queue.shift();
            const channelId = channel?.channelId || '';
            if (!channelId) {
                continue;
            }
            const samples = await fetchChannelVideoSamples(channelId, limit);
            results.set(channelId, samples);
        }
    });
    await Promise.all(workers);
    return results;
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

function buildChannelPayload(channel, videoSamplesById) {
    const base = normalizeChannel(channel);
    const samples = videoSamplesById?.get(base.channelId);
    return {
        ...base,
        videos: Array.isArray(samples) ? samples : []
    };
}

function buildPrompt(categories, channels, videoSamplesById) {
    const categoryPayload = categories.map((category) => ({
        id: category.id,
        name: category.name
    }));
    const channelPayload = channels.map((channel) => buildChannelPayload(channel, videoSamplesById));

    return [
        'You are classifying YouTube channels into user-defined categories.',
        'Use the provided video samples to determine the actual content.',
        'If videos are missing or unclear, fall back to channel metadata.',
        'Each video sample is preceded by a label that includes the channelId it belongs to.',
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

function buildGeminiParts(categories, channels, videoSamplesById) {
    const parts = [{ text: buildPrompt(categories, channels, videoSamplesById) }];
    channels.forEach((channel) => {
        const channelId = channel?.channelId || '';
        if (!channelId) {
            return;
        }
        const samples = videoSamplesById?.get(channelId) || [];
        samples.forEach((sample, index) => {
            if (!sample?.url) {
                return;
            }
            const title = sample.title || 'Untitled video';
            parts.push({
                text: `Video sample ${index + 1} for channelId ${channelId} (${channel?.title || 'Untitled channel'}): ${title}`
            });
            parts.push({
                file_data: {
                    file_uri: sample.url
                }
            });
        });
    });
    return parts;
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
                parts: payload.parts,
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

    if (setStatus) {
        setStatus(`Fetching recent videos for ${targets.length} channel(s)...`, 'info');
    }
    const videoSamplesById = await fetchVideoSamplesForChannels(targets, DEFAULT_VIDEO_SAMPLE_COUNT);

    const targetIds = new Set(targets.map((channel) => channel?.channelId).filter(Boolean));
    const categoryIds = new Set(categories.map((category) => category.id));
    const batches = chunk(targets, DEFAULT_BATCH_SIZE);
    const assignedChannelIds = new Set();

    if (setStatus) {
        setStatus(`Analyzing ${targets.length} channel(s) with Gemini...`, 'info');
    }

    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const parts = buildGeminiParts(categories, batch, videoSamplesById);
        const responseData = await requestGeminiCompletion({
            apiKey: settings.apiKey,
            endpoint: settings.endpoint,
            model: settings.model,
            parts,
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
