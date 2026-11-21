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

## Atomic key rotation

`POST /api/organizations/:organizationId/api-keys/:apiKeyId` requires OWNER or ADMIN. It generates a new 256-bit secret, revokes the old credential, creates the replacement with the same organization, project scope, name, and expiry, and writes audit records for both sides of the rotation in one database transaction. The old credential is revoked immediately; the new raw secret is returned exactly once. Copy it and update the integration secret store immediately.

Rotation is rejected for missing, already-revoked, or expired keys. Expired keys are not silently extended; create a new key with an explicit expiry policy instead. A concurrent rotation attempt is rejected if another request has already changed the original key.

## Key format and storage

- Keys use a 256-bit cryptographically secure random secret.
- The raw secret is prefixed with `sf_live_`.
- Only a SHA-256 hash and a short prefix are persisted.
- Key secrets must not be logged, committed, or sent to analytics.
- The ingestion endpoint authenticates these keys by hash and updates last-used metadata after successful batch processing.
- The UI reveals the secret once and provides a copy action; reloading the page does not recover it.

