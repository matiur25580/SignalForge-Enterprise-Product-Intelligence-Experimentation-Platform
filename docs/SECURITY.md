# Identity, tenancy, and security baseline

## Authentication

- Auth.js uses GitHub OAuth and a database-backed session adapter.
- The session callback exposes the authenticated database user ID.
- OAuth credentials are read only from environment variables.
- Request bodies are never trusted for user IDs, roles, or tenant membership.

## Tenant authorization

- Organization APIs resolve the authenticated user before accessing tenant data.
- Membership is queried using the composite organization/user key.
- Project reads resolve the project's organization and then verify membership.
- Project creation is restricted to organization owners and administrators.
- Organization/project creation and audit events share a database transaction.

## Data model

- Memberships are unique per organization and user.
- Project slugs are unique within an organization.
- API key records are designed to store a hash and non-secret prefix only.
- Audit records are organization-scoped and indexed by time.

## Before production

This is an initial security baseline, not a production security certification. Add:
- OAuth callback and account-linking threat review
- Rate limits and abuse controls for authentication and organization creation
- CSRF/origin and deployment-host configuration review
- Secret rotation and managed secret storage
- API-key issuance, one-time secret display, hashing, rotation, and revocation workflows
- Tenant-isolation integration tests and authorization matrix tests
- Audit-log access controls and retention policy
- Database backup, restore, and migration rollback procedures
