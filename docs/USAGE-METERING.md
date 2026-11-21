# Organization usage metering

SignalForge exposes an authenticated, organization-scoped usage endpoint:

`GET /api/organizations/:organizationId/usage`

Any organization member, including read-only viewers, can inspect usage. The endpoint never returns API-key hashes or raw secrets.

## Reporting window

- Defaults to the trailing 30 days ending at request time.
- Accepts optional ISO-8601 `from` and `to` query parameters.
- Uses a half-open interval: `receivedAt >= from` and `receivedAt < to`.
- Rejects inverted ranges and ranges longer than 90 days.

## Response

The response includes total ingested events, event counts grouped by project, and API-key metadata with event counts for the selected window. Revoked keys remain visible for historical attribution; unused keys report zero events.

## Scope and limitations

Every event query is scoped through its project's organization ID. API-key metadata is separately scoped to the requested organization. This is usage visibility, not billing: subscription plans, invoices, payment collection, retention policies, and configurable per-plan quotas are not implemented. Current ingestion quotas remain fixed per API key.
