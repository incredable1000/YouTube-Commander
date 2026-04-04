// Subscription Labels - HTML Parsing Utilities

export function parseJsonSafe(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

export function extractInitialDataFromHtml(html) {
    if (!html || typeof html !== 'string') {
        return null;
    }
    const markers = ['var ytInitialData =', 'window["ytInitialData"] =', 'ytInitialData ='];
    for (const marker of markers) {
        const index = html.indexOf(marker);
        if (index === -1) {
            continue;
        }
        const start = html.indexOf('{', index);
        if (start === -1) {
            continue;
        }
        let depth = 0;
        for (let i = start; i < html.length; i += 1) {
            const char = html[i];
            if (char === '{') {
                depth += 1;
            } else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    const jsonText = html.slice(start, i + 1);
                    const parsed = parseJsonSafe(jsonText);
                    if (parsed) {
                        return parsed;
                    }
                    break;
                }
            }
        }
    }
    return null;
}

export function extractYtCfgFromHtml(html) {
    if (!html || typeof html !== 'string') {
        return null;
    }
    const marker = 'ytcfg.set(';
    const index = html.indexOf(marker);
    if (index === -1) {
        return null;
    }
    const start = html.indexOf('{', index);
    if (start === -1) {
        return null;
    }
    let depth = 0;
    for (let i = start; i < html.length; i += 1) {
        const char = html[i];
        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return parseJsonSafe(html.slice(start, i + 1));
            }
        }
    }
    return null;
}
