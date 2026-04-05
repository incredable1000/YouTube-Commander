import { normalizeHandle, normalizeChannelUrl } from './data-utils.js';
import { parseCountValue, formatCountLabel } from './parse-utils.js';

export function resolveChannelCounts(channel) {
    const subRaw =
        typeof channel?.subscriberCount === 'string' ? channel.subscriberCount.trim() : '';
    const vidRaw = typeof channel?.videoCount === 'string' ? channel.videoCount.trim() : '';
    const subHasHandle = subRaw.startsWith('@');
    const subHasSubscribers = /subscribers?/i.test(subRaw);
    const subHasVideos = /videos?/i.test(subRaw);
    const vidHasSubscribers = /subscribers?/i.test(vidRaw);
    const vidHasVideos = /videos?/i.test(vidRaw);
    const subIsCount = !subHasHandle && /\d/.test(subRaw);
    const vidIsCount = !vidRaw.startsWith('@') && /\d/.test(vidRaw);

    let subscriberValue = '';
    let videoValue = '';

    if (subHasSubscribers) {
        subscriberValue = subRaw;
    } else if (vidHasSubscribers) {
        subscriberValue = vidRaw;
    } else if (subIsCount) {
        subscriberValue = subRaw;
    } else if (vidIsCount && subHasHandle) {
        subscriberValue = vidRaw;
    }

    if (vidHasVideos) {
        videoValue = vidRaw;
    } else if (subHasVideos) {
        videoValue = subRaw;
    } else if (vidIsCount && !vidHasSubscribers) {
        videoValue = vidRaw;
    }

    return {
        subscribers: formatCountLabel(subscriberValue, 'subscribers'),
        videos: formatCountLabel(videoValue, 'videos'),
    };
}

export function buildChannelMeta(channel) {
    const bits = [];
    if (channel?.handle) {
        bits.push(channel.handle);
    }
    const counts = resolveChannelCounts(channel);
    if (counts.subscribers) {
        bits.push(counts.subscribers);
    }
    if (counts.videos) {
        bits.push(counts.videos);
    }
    return bits.join(' | ');
}

export function compareChannelName(a, b) {
    return (a?.title || '').localeCompare(b?.title || '', undefined, { sensitivity: 'base' });
}

export function sortChannelsByName(list) {
    return [...list].sort((a, b) => compareChannelName(a, b));
}

export function sortChannelsBySubscribers(list) {
    return [...list].sort((a, b) => {
        const aCounts = resolveChannelCounts(a);
        const bCounts = resolveChannelCounts(b);
        const aValue = parseCountValue(aCounts.subscribers);
        const bValue = parseCountValue(bCounts.subscribers);
        if (bValue !== aValue) {
            return bValue - aValue;
        }
        return compareChannelName(a, b);
    });
}

export function rebuildChannelIndexes(list, channelsById, channelsByHandle, channelsByUrl) {
    channelsById = new Map();
    channelsByHandle = new Map();
    channelsByUrl = new Map();

    (list || []).forEach((channel) => {
        const channelId = typeof channel?.channelId === 'string' ? channel.channelId : '';
        const handle = typeof channel?.handle === 'string' ? channel.handle : '';
        const url = typeof channel?.url === 'string' ? channel.url : '';
        if (channelId) {
            channelsById.set(channelId, channel);
        }
        const normalizedHandle = normalizeHandle(handle);
        if (normalizedHandle) {
            channelsByHandle.set(
                normalizedHandle,
                channelId || channelsByHandle.get(normalizedHandle) || ''
            );
            channelsByHandle.set(
                normalizedHandle.replace(/^@/, ''),
                channelId || channelsByHandle.get(normalizedHandle.replace(/^@/, '')) || ''
            );
        }
        const normalizedUrl = normalizeChannelUrl(url);
        if (normalizedUrl) {
            channelsByUrl.set(normalizedUrl, channelId || channelsByUrl.get(normalizedUrl) || '');
        }
    });

    return { channelsById, channelsByHandle, channelsByUrl };
}

export function resolveChannelIdFromIdentity(
    identity,
    channelsById,
    channelsByHandle,
    channelsByUrl
) {
    if (identity.channelId && channelsById.has(identity.channelId)) {
        return identity.channelId;
    }
    const normalizedHandle = normalizeHandle(identity.handle);
    if (normalizedHandle && channelsByHandle.has(normalizedHandle)) {
        return channelsByHandle.get(normalizedHandle) || '';
    }
    if (normalizedHandle && channelsByHandle.has(normalizedHandle.replace(/^@/, ''))) {
        return channelsByHandle.get(normalizedHandle.replace(/^@/, '')) || '';
    }
    const normalizedUrl = normalizeChannelUrl(identity.url);
    if (normalizedUrl && channelsByUrl.has(normalizedUrl)) {
        return channelsByUrl.get(normalizedUrl) || '';
    }
    return identity.channelId || '';
}

export function computeSnapshotHash(list) {
    if (!Array.isArray(list)) {
        return '';
    }
    return list
        .map((item) => item?.channelId)
        .filter((id) => typeof id === 'string' && id)
        .sort()
        .join('|');
}
