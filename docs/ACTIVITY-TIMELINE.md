# Organization activity timeline

SignalForge exposes an organization-scoped activity feed for workspace members.

## API

`GET /api/organizations/:organizationId/activity?limit=50&cursor=:auditLogId`

- Requires an authenticated organization member.
- Defaults to 50 records and caps each page at 100.
- Uses a stable descending `createdAt`, `id` order and an opaque record-ID cursor.
- Returns `activity`, `hasMore`, and `nextCursor`.
- Applies `Cache-Control: private, no-store`.
- Selects actor identity and event descriptors only. Raw audit metadata is intentionally excluded because it may contain emails, credential prefixes, or other operational details.

## UI

Open `/organizations/:organizationId/activity` to review the latest 50 workspace events. The page is tenant-guarded and uses an explicit empty state. Unknown action identifiers are displayed as readable fallback labels so new audit event types remain visible.

## Security considerations

Every API request verifies organization membership before querying the audit table. The database query includes the organization ID in its filter; callers cannot supply or override tenant scope. The timeline does not expose token hashes, API secrets, raw metadata, or event properties.

The UI currently renders the latest 50 records. Cursor-based pagination is available through the API; an interactive load-more control is a follow-up enhancement.
