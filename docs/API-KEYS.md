# Organization API keys

API keys authenticate product event ingestion. The organization console is available at `/organizations/:organizationId/api-keys` to authorized organization members.

## Endpoints

All routes require an authenticated Auth.js session and organization membership.

### GET /api/organizations/:organizationId/api-keys

Lists organization-scoped key metadata, including prefix, project scope, expiry, revocation state, and last-used timestamp. Raw secrets and hashes are never returned.

### POST /api/organizations/:organizationId/api-keys

Requires OWNER or ADMIN role.

Request body:

```json
{ "name": "Production ingestion", "projectId": "optional-project-cuid", "expiresAt": "2027-01-01T00:00:00.000Z" }
```

Project and expiration fields are optional. A supplied project must belong to the same organization. The raw key is returned exactly once in the successful response. Copy it immediately; SignalForge stores only its SHA-256 hash and a short display prefix.

### DELETE /api/organizations/:organizationId/api-keys/:apiKeyId

Requires OWNER or ADMIN role. Revocation is soft and auditable. Revoked keys remain in the database for historical audit purposes.

## Safe manual rotation

There is no atomic one-click rotation endpoint yet. Use a staged replacement to avoid interrupting production ingestion:

1. Create a replacement key with the same project scope and an appropriate expiry.
2. Store the new secret in your deployment secret manager; do not commit it.
3. Update the integration and verify successful event ingestion using the replacement.
4. Revoke the old key from the console only after the replacement is confirmed healthy.

## Key format and storage

- Keys use a 256-bit cryptographically secure random secret.
- The raw secret is prefixed with `sf_live_`.
- Only a SHA-256 hash and a short prefix are persisted.
- Key secrets must not be logged, committed, or sent to analytics.
- The ingestion endpoint authenticates these keys by hash and updates last-used metadata after successful batch processing.
- The UI reveals the secret once and provides a copy action; reloading the page does not recover it.

