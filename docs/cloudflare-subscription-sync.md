# Subscription Sync (Cloudflare Worker + D1)

Recommendation: extend the existing watched-history Worker and add a new
`POST /subscriptions` route. This keeps a single deployment and single API
token while supporting both watched history and subscription sync.

In the popup, set `Subscription Worker URL` to:

- `https://<your-worker>.workers.dev/subscriptions`
- If you point it at `/sync`, the extension will automatically normalize to
  `/subscriptions`.

## D1 Schema

Run this once in your D1 database:

```sql
CREATE TABLE IF NOT EXISTS subscription_channels (
    account_key TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    title TEXT,
    handle TEXT,
    url TEXT,
    avatar TEXT,
    subscriber_count TEXT,
    video_count TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (account_key, channel_id)
);

CREATE TABLE IF NOT EXISTS subscription_categories (
    account_key TEXT NOT NULL,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (account_key, category_id)
);

CREATE TABLE IF NOT EXISTS subscription_channel_categories (
    account_key TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (account_key, channel_id, category_id)
);

CREATE TABLE IF NOT EXISTS subscription_sync_state (
    account_key TEXT PRIMARY KEY,
    snapshot_hash TEXT,
    snapshot_fetched_at INTEGER,
    synced_at INTEGER,
    channel_total INTEGER
);

CREATE INDEX IF NOT EXISTS idx_subscription_channels_account
    ON subscription_channels(account_key);
CREATE INDEX IF NOT EXISTS idx_subscription_categories_account
    ON subscription_categories(account_key);
CREATE INDEX IF NOT EXISTS idx_subscription_channel_categories_account
    ON subscription_channel_categories(account_key);
```

## Worker Script (single worker for watched history + subscriptions)

Save this as your Worker script (or merge the `/subscriptions` handler into
your existing Worker). It supports:

- `POST /sync` (watched history)
- `GET /pull` (watched history restore)
- `POST /subscriptions` (subscription manager sync)

```js
/**
 * Cloudflare Worker for YouTube Commander
 * Bindings:
 * - env.DB (D1 database)
 * - env.API_TOKEN (optional)
 */
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname.replace(/\/+$/, '');

        try {
            requireAuthIfConfigured(request, env);

            if (request.method === 'POST' && pathname.endsWith('/sync')) {
                return handleSync(request, env);
            }

            if (request.method === 'GET' && pathname.endsWith('/pull')) {
                return handlePull(request, env);
            }

            if (request.method === 'POST' && pathname.endsWith('/subscriptions')) {
                return handleSubscriptions(request, env);
            }

            return json({ error: 'Not found' }, 404);
        } catch (error) {
            return json({ error: error?.message || 'Server error' }, 500);
        }
    }
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function requireAuthIfConfigured(request, env) {
    const token = env.API_TOKEN;
    if (!token) {
        return;
    }

    const authHeader = request.headers.get('Authorization') || '';
    const keyHeader = request.headers.get('X-YT-Commander-Key') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (bearer !== token && keyHeader !== token) {
        throw new Error('Unauthorized');
    }
}

async function handleSync(request, env) {
    const body = await request.json().catch(() => ({}));
    const rawIds = Array.isArray(body.videoIds) ? body.videoIds : [];
    const ids = Array.from(new Set(rawIds.filter((id) => typeof id === 'string' && id)));

    if (ids.length === 0) {
        return json({ ok: true, inserted: 0 });
    }

    const statements = ids.map((id) =>
        env.DB.prepare(
            'INSERT OR IGNORE INTO watched_videos (video_id) VALUES (?)'
        ).bind(id)
    );

    await runBatched(env.DB, statements);
    return json({ ok: true, inserted: ids.length });
}

async function handlePull(request, env) {
    const url = new URL(request.url);
    const limit = clampNumber(url.searchParams.get('limit'), 1, 1000, 1000);
    const cursor = clampNumber(url.searchParams.get('cursor'), 0, Number.MAX_SAFE_INTEGER, 0);

    const { results } = await env.DB.prepare(
        'SELECT video_id FROM watched_videos ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, cursor).all();

    const videoIds = results.map((row) => row.video_id).filter(Boolean);
    const nextCursor = cursor + videoIds.length;
    const hasMore = videoIds.length === limit;

    return json({
        videoIds,
        nextCursor: hasMore ? String(nextCursor) : null,
        hasMore
    });
}

async function handleSubscriptions(request, env) {
    const body = await request.json().catch(() => ({}));

    const accountKey = typeof body.accountKey === 'string' && body.accountKey.trim()
        ? body.accountKey.trim()
        : 'default';

    const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {};
    const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];

    const categories = Array.isArray(body.categories) ? body.categories : [];
    const assignments = body.assignments && typeof body.assignments === 'object'
        ? body.assignments
        : {};

    await env.DB.prepare(
        'DELETE FROM subscription_channels WHERE account_key = ?'
    ).bind(accountKey).run();
    await env.DB.prepare(
        'DELETE FROM subscription_categories WHERE account_key = ?'
    ).bind(accountKey).run();
    await env.DB.prepare(
        'DELETE FROM subscription_channel_categories WHERE account_key = ?'
    ).bind(accountKey).run();

    const channelStatements = channels.map((channel) =>
        env.DB.prepare(
            `INSERT INTO subscription_channels (
                account_key,
                channel_id,
                title,
                handle,
                url,
                avatar,
                subscriber_count,
                video_count,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
        ).bind(
            accountKey,
            channel?.channelId || '',
            channel?.title || '',
            channel?.handle || '',
            channel?.url || '',
            channel?.avatar || '',
            channel?.subscriberCount || '',
            channel?.videoCount || ''
        )
    );
    await runBatched(env.DB, channelStatements);

    const categoryStatements = categories
        .filter((item) => item && typeof item === 'object')
        .map((item) =>
            env.DB.prepare(
                `INSERT INTO subscription_categories (
                    account_key,
                    category_id,
                    name,
                    color,
                    updated_at
                ) VALUES (?, ?, ?, ?, unixepoch())`
            ).bind(
                accountKey,
                item.id || '',
                item.name || '',
                item.color || ''
            )
        );
    await runBatched(env.DB, categoryStatements);

    const assignmentStatements = [];
    Object.entries(assignments).forEach(([channelId, list]) => {
        const categoryIds = Array.isArray(list)
            ? list.filter((id) => typeof id === 'string' && id)
            : [];
        categoryIds.forEach((categoryId) => {
            assignmentStatements.push(
                env.DB.prepare(
                    `INSERT INTO subscription_channel_categories (
                        account_key,
                        channel_id,
                        category_id,
                        updated_at
                    ) VALUES (?, ?, ?, unixepoch())`
                ).bind(accountKey, channelId, categoryId)
            );
        });
    });
    await runBatched(env.DB, assignmentStatements);

    await env.DB.prepare(
        `INSERT OR REPLACE INTO subscription_sync_state (
            account_key,
            snapshot_hash,
            snapshot_fetched_at,
            synced_at,
            channel_total
        ) VALUES (?, ?, ?, ?, ?)`
    ).bind(
        accountKey,
        typeof snapshot.hash === 'string' ? snapshot.hash : '',
        Number(snapshot.fetchedAt) || null,
        Date.now(),
        channels.length
    ).run();

    return json({
        ok: true,
        channelCount: channels.length,
        categoryCount: categories.length,
        assignmentCount: assignmentStatements.length
    });
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

async function runBatched(db, statements, batchSize = 100) {
    if (!statements || statements.length === 0) {
        return;
    }

    for (let i = 0; i < statements.length; i += batchSize) {
        const batch = statements.slice(i, i + batchSize);
        await db.batch(batch);
    }
}
```

## Wrangler bindings

```toml
[[d1_databases]]
binding = "DB"
database_name = "<YOUR_DB_NAME>"
database_id = "<YOUR_DB_ID>"

[vars]
API_TOKEN = "your-secret-token"
```
