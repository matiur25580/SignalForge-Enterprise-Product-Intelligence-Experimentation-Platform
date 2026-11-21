# Identity, tenancy, and security baseline

## Authentication

- Auth.js uses GitHub OAuth and a database-backed session adapter.
- The session callback exposes the authenticated database user ID.
- OAuth credentials are read only from environment variables.
- Production Auth.js cookies are explicitly configured as secure, with HTTPS-only cookie behavior in production.
- OAuth callback destinations are restricted to safe root-relative paths; protocol-relative, external, backslash, malformed-encoding, and control-character destinations fall back to the application root.
- GitHub OAuth callback completion applies a second PostgreSQL-backed account-level limit of 10 authenticated sign-in callbacks per provider account in a 15-minute window. Provider account identifiers are hashed before persistence; the account check fails closed if its storage is unavailable.
- Auth.js retains its built-in OAuth state/CSRF protections; the application does not disable or replace provider callback checks.
- Request bodies are never trusted for user IDs, roles, or tenant membership.

## Tenant authorization

- Organization APIs resolve the authenticated user before accessing tenant data.
- Membership is queried using the composite organization/user key.
- Project reads resolve the project's organization and then verify membership.
- Project creation is restricted to organization owners and administrators.\n- Organization creation is limited to 3 attempts per hour per authenticated user and client address.\n- Project creation is limited to 20 attempts per hour per organization, member, and client address.\n- API-key creation and invitation creation are each limited to 10 attempts per hour per organization member and client address.\n- Member role changes and removals are limited to 30 attempts per hour per organization member and client address.\n- Administrative creation and team mutation limits use the same atomic PostgreSQL fixed-window counter table as OAuth protection, with only keyed SHA-256 subject hashes stored.\n- Administrative creation routes fail closed with HTTP 503 when rate-limit storage is unavailable and return HTTP 429 with `Retry-After` when over quota.
- Organization/project creation and audit events share a database transaction.

## Data model

- Memberships are unique per organization and user.
- Project slugs are unique within an organization.
- API key records are designed to store a hash and non-secret prefix only.
- Audit records are organization-scoped and indexed by time.

## Authentication abuse protection

- GitHub OAuth sign-in initiation is rate-limited to 10 attempts per client address per 15-minute fixed window, both through the sign-in server action and direct Auth.js sign-in endpoints. After GitHub authenticates the provider identity, a separate 10-attempt per-account window protects session creation.
- Rate-limit counters are stored in PostgreSQL, so limits are shared across application instances rather than relying on per-process memory.
- Client addresses and provider account identifiers are keyed with SHA-256 and the application auth secret before persistence; raw IP addresses and provider account IDs are not stored in the limiter table.
- Expired buckets are pruned opportunistically during limiter requests.
- Requests over the limit receive HTTP 429 with `Retry-After` and rate-limit headers. If the limiter database is unavailable, sign-in initiation fails closed with HTTP 503 or a retry notice rather than silently bypassing protection.
- The migration creates `AuthRateLimit`; deploy the database migration before running the updated application. This single table backs authentication and administrative operation limits.

## Active session controls

- Auth.js database sessions can be listed by the authenticated account at `GET /api/account/sessions`.
- The response includes expiry and a current-session marker, but never returns raw session tokens.
- Public session identifiers are SHA-256 digests of the underlying token and are resolved only against the signed-in user's unexpired sessions.
- `DELETE /api/account/sessions` revokes one matching session after verifying ownership. The current browser session is deliberately protected; use the sign-out flow to end it.
- Session inventory responses are private and non-cacheable. Expired sessions are excluded from the active list.
- The account security page is available at `/account/security`.

## Before production

This is an initial security baseline, not a production security certification. Add:
- Complete OAuth account-linking threat review (safe callback URL validation and provider account throttling are implemented)
- Configurable per-tenant policies and anomaly alerting for broader administrative/API operations
- CSRF/origin and deployment-host configuration review
- Secret rotation and managed secret storage
- API-key issuance, one-time secret display, hashing, rotation, and revocation workflows
- Tenant-isolation integration tests and authorization matrix tests
- Audit-log access controls and retention policy
- Database backup, restore, and migration rollback procedures
