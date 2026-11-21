# Organization API keys

API keys are intended for product event ingestion and machine-to-machine requests. This milestone implements secure issuance, metadata listing, and revocation.

## Endpoints

All routes require an authenticated Auth.js session and organization membership.

### GET /api/organizations/:organizationId/api-keys

Lists API key metadata. The raw secret is never returned by this endpoint.

### POST /api/organizations/:organizationId/api-keys

Requires OWNER or ADMIN role.

Request body:
{ "name": "Production ingestion", "projectId": "optional-project-cuid", "expiresAt": "2027-01-01T00:00:00.000Z" }

Project and expiration fields are optional. A supplied project must belong to the same organization. The raw key is returned exactly once in the successful response. Copy it immediately; SignalForge stores only its SHA-256 hash and a short display prefix.

### DELETE /api/organizations/:organizationId/api-keys/:apiKeyId

Requires OWNER or ADMIN role. Revocation is soft and auditable. Revoked keys remain in the database for historical audit purposes.

## Key format and storage

- Keys use a 256-bit cryptographically secure random secret.
- The raw secret is prefixed with sf_live_.
- Only a SHA-256 hash and a short prefix are persisted.
- Key secrets must not be logged, committed, or sent to analytics.
- API-key authentication middleware and usage tracking are a separate follow-up milestone.
