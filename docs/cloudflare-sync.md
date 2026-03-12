# Cloudflare Sync and D1 SQL Import

YouTube Commander supports two ways to move watched IDs to Cloudflare D1:

1. API sync (`Sync` / `Restore`)
2. SQL export from local source of truth (`Export SQL`)

## API Contract

### `POST /sync`

Request body:

```json
{
    "videoIds": ["dQw4w9WgXcQ", "9bZkp7q19f0"],
    "accountKey": "optional-compat-value"
}
```

Notes:

- `videoIds` are deduped YouTube IDs.
- `accountKey` may be included by the extension for compatibility.
- Worker may ignore `accountKey` if using a global table.

### `GET /pull`

Query params:

- `limit` (1-1000)
- `cursor` (optional)
- `accountKey` (optional compatibility param)

Expected response:

```json
{
    "videoIds": ["dQw4w9WgXcQ", "9bZkp7q19f0"],
    "nextCursor": "123456",
    "hasMore": true
}
```

### Headers sent by extension

- `Content-Type: application/json` (POST only)
- `X-YT-Commander-Client: chrome-extension`
- `Authorization: Bearer <token>` (if configured)
- `X-YT-Commander-Key: <token>` (if configured)

## Subscription Sync

Subscription Manager uses a separate endpoint (`POST /subscriptions`) and D1
tables for channels/categories. See `docs/cloudflare-subscription-sync.md`
for the worker script and schema.

## SQL Export Workflow (No API Calls)

Use popup button: `Watched History -> Export SQL`

What it does:

- Reads watched IDs from local IndexedDB (source of truth).
- Generates one or more `.sql` files.
- Uses `INSERT OR IGNORE` so imports are idempotent.
- Splits large exports into multiple files for scale.
- Avoids explicit SQL transaction statements (`BEGIN/COMMIT`) for compatibility with Cloudflare execution environments.

Generated SQL includes:

```sql
CREATE TABLE IF NOT EXISTS watched_videos (
    video_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

## D1 Commands

Run these in your local terminal (PowerShell/CMD), not in browser devtools.
You must have Wrangler installed and authenticated.

### Single file

```powershell
wrangler d1 execute <YOUR_DB_NAME> --remote --file ".\youtube-watched-history-d1.sql"
```

### Multiple chunk files

```powershell
Get-ChildItem ".\youtube-watched-history-d1-part-*.sql" |
    Sort-Object Name |
    ForEach-Object {
        wrangler d1 execute <YOUR_DB_NAME> --remote --file $_.FullName
    }
```

Replace `<YOUR_DB_NAME>` with your D1 database name from Cloudflare dashboard/Wrangler config.
