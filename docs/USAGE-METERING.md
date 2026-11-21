# Organization usage metering

SignalForge exposes an authenticated, organization-scoped usage endpoint and dashboard.

- UI: `/organizations/:organizationId/usage`
- API: `GET /api/organizations/:organizationId/usage`

Any organization member, including read-only viewers, can inspect usage. The endpoint never returns API-key hashes or raw secrets.

## Reporting window

- Defaults to the trailing 30 days ending at request time.
- Accepts optional ISO-8601 `from` and `to` query parameters.
- Uses a half-open interval: `receivedAt >= from` and `receivedAt < to`.
- Rejects inverted ranges and ranges longer than 90 days.

## Dashboard

The page summarizes received event count, projects reporting events, active API keys, and the organization's current plan. It displays event counts by project and API key and renders the plan's configured per-key request/event rate limits and included resource entitlements.

The current UI uses the API's default trailing 30-day reporting window. It refreshes on page load; it does not poll continuously or present fabricated live data.

## Response

The API response includes total ingested events, event counts grouped by project, and API-key metadata with event counts for the selected window. Revoked keys remain visible for historical attribution; unused keys report zero events.

## Scope and limitations

Every event query is scoped through its project's organization ID. API-key metadata is separately scoped to the requested organization. Rate limits are enforced per API key and per minute; they are not monthly billing allowances or aggregate organization-wide quotas.

This is usage visibility, not billing. Payment collection, invoices, tax handling, checkout, subscription upgrades, and configurable monthly billing allowances are not implemented.
