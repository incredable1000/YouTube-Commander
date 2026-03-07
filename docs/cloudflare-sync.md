# Cloudflare Sync Contract

YouTube Commander sends a `POST` request to your configured Worker URL with:

```json
{
    "source": "popup-manual-sync",
    "schemaVersion": 1,
    "exportedAt": "2026-03-07T12:34:56.789Z",
    "count": 1234,
    "records": [
        {
            "videoId": "dQw4w9WgXcQ",
            "timestamp": 1709800000000
        }
    ]
}
```

Headers:

- `Content-Type: application/json`
- `X-YT-Commander-Client: chrome-extension`
- `Authorization: Bearer <token>` (only when token is configured)
- `X-YT-Commander-Key: <token>` (only when token is configured)

Expected success response:

- Any `2xx` status.
- JSON is optional, but recommended:

```json
{
    "success": true,
    "upserted": 1234
}
```

Non-2xx responses are treated as sync errors and surfaced in popup status.
