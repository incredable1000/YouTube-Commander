/**
 * Gemini API utilities for background script.
 */

const GEMINI_MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let geminiModelCache = { fetchedAt: 0, models: [] };

export function normalizeGeminiModelName(name) {
    if (typeof name !== 'string') {
        return '';
    }
    return name.replace(/^models\//i, '').trim();
}

export function buildGeminiEndpoint(endpoint, model, apiKey) {
    const fallbackBase = 'https://generativelanguage.googleapis.com/v1beta/models';
    const base = typeof endpoint === 'string' && endpoint.trim() ? endpoint.trim() : fallbackBase;
    let url = base.replace(/\/+$/, '');
    if (!url.includes(':generateContent')) {
        const normalizedModel = normalizeGeminiModelName(model);
        const safeModel =
            normalizedModel && normalizedModel.toLowerCase() !== 'auto'
                ? normalizedModel
                : 'gemini-1.5-pro';
        url = `${url}/${safeModel}:generateContent`;
    }
    if (apiKey && !url.includes('key=')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}key=${encodeURIComponent(apiKey)}`;
    }
    return url;
}

export function buildGeminiModelsEndpoint(endpoint, apiKey) {
    const fallbackBase = 'https://generativelanguage.googleapis.com/v1beta/models';
    let base = typeof endpoint === 'string' && endpoint.trim() ? endpoint.trim() : fallbackBase;

    if (base.includes('/models/')) {
        base = `${base.split('/models/')[0]}/models`;
    } else if (base.includes('/models')) {
        base = `${base.split('/models')[0]}/models`;
    } else if (base.endsWith('/v1beta')) {
        base = `${base}/models`;
    } else if (!base.includes('/v1beta')) {
        base = fallbackBase;
    }

    if (apiKey && !base.includes('key=')) {
        const separator = base.includes('?') ? '&' : '?';
        base = `${base}${separator}key=${encodeURIComponent(apiKey)}`;
    }
    return base;
}

export function scoreGeminiModel(modelName) {
    const name = modelName.toLowerCase();
    const versionMatch = name.match(/gemini-(\d+)(?:\.(\d+))?/);
    let score = 0;
    if (versionMatch) {
        const major = Number(versionMatch[1]) || 0;
        const minor = Number(versionMatch[2]) || 0;
        score += major * 100 + minor * 10;
    }
    if (name.includes('pro')) {
        score += 20;
    }
    if (name.includes('flash')) {
        score += 10;
    }
    if (name.includes('lite')) {
        score -= 5;
    }
    if (name.includes('latest')) {
        score += 5;
    }
    return score;
}

export async function listGeminiModels(apiKey, endpoint) {
    const urlBase = buildGeminiModelsEndpoint(endpoint, apiKey);
    const models = [];
    let pageToken = '';
    let pageCount = 0;

    while (pageCount < 4) {
        const url = pageToken ? `${urlBase}&pageToken=${encodeURIComponent(pageToken)}` : urlBase;
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data?.error?.message || `ListModels failed (${response.status})`;
            throw new Error(message);
        }
        const items = Array.isArray(data?.models) ? data.models : [];
        items.forEach((model) => {
            if (model?.name && Array.isArray(model?.supportedGenerationMethods)) {
                models.push(model);
            }
        });
        pageToken = data?.nextPageToken || '';
        if (!pageToken) {
            break;
        }
        pageCount += 1;
    }

    return models;
}

export async function resolveGeminiModel(requestedModel, apiKey, endpoint) {
    const now = Date.now();
    if (
        geminiModelCache.models.length > 0 &&
        now - geminiModelCache.fetchedAt < GEMINI_MODEL_CACHE_TTL_MS
    ) {
        return selectModelFromCache(requestedModel, geminiModelCache.models);
    }

    try {
        const models = await listGeminiModels(apiKey, endpoint);
        geminiModelCache = { fetchedAt: now, models };
        return selectModelFromCache(requestedModel, models);
    } catch (error) {
        if (geminiModelCache.models.length > 0) {
            return selectModelFromCache(requestedModel, geminiModelCache.models);
        }
        throw error;
    }
}

function selectModelFromCache(requestedModel, models) {
    const normalized = normalizeGeminiModelName(requestedModel);
    if (normalized && normalized.toLowerCase() !== 'auto') {
        const exact = models.find((m) => normalizeGeminiModelName(m.name) === normalized);
        if (exact) {
            return normalizeGeminiModelName(exact.name);
        }
    }
    const scored = models
        .filter(
            (m) =>
                Array.isArray(m.supportedGenerationMethods) &&
                m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m) => ({ name: m.name, score: scoreGeminiModel(m.name) }))
        .sort((a, b) => b.score - a.score);
    if (scored.length > 0) {
        return normalizeGeminiModelName(scored[0].name);
    }
    return 'gemini-1.5-pro';
}

export async function resolveGeminiFallbackModel(primaryModel, apiKey, endpoint) {
    const allModels = await listGeminiModels(apiKey, endpoint);
    const primaryName = normalizeGeminiModelName(primaryModel);
    const candidates = allModels
        .filter((m) => {
            if (
                !Array.isArray(m.supportedGenerationMethods) ||
                !m.supportedGenerationMethods.includes('generateContent')
            ) {
                return false;
            }
            return normalizeGeminiModelName(m.name) !== primaryName;
        })
        .map((m) => ({ name: m.name, score: scoreGeminiModel(m.name) }))
        .sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
        return normalizeGeminiModelName(candidates[0].name);
    }
    return 'gemini-1.5-flash';
}

export function isGeminiQuotaError(message) {
    if (!message || typeof message !== 'string') {
        return false;
    }
    const lower = message.toLowerCase();
    return lower.includes('quota') || lower.includes('rate limit') || lower.includes('429');
}

export async function requestGeminiGenerate(url, contentParts, generationConfig, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: contentParts }],
                generationConfig,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data?.error?.message || `Gemini request failed (${response.status})`;
            throw new Error(message);
        }
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
