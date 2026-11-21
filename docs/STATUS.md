# Implementation status

Last updated: 2026-11-21

## Implemented in source

### Platform foundation
- [x] pnpm workspace and Next.js App Router application
- [x] Strict TypeScript and Tailwind configuration
- [x] Initial dashboard shell with honest empty states
- [x] PostgreSQL Prisma schema, shared client, and committed migration history
- [x] Auth.js GitHub OAuth and database-backed sessions with PostgreSQL-backed rate limits on sign-in initiation
- [x] Account security page with private active-session inventory and remote revocation of other sessions
- [x] Organization creation, memberships, roles, and server-side tenant authorization
- [x] Organization-scoped project creation and listing
- [x] Transactional audit records for organization and project lifecycle actions

### Identity, security, and team management
- [x] API key issuance with cryptographically random secrets, hash-only persistence, one-time display, expiry, listing, revocation, and atomic audited rotation
- [x] Hash-based ingestion authentication with expiry and revocation checks
- [x] Organization member directory
- [x] Secure invitation creation, reissue, seven-day expiry, single-use acceptance, and revocation
- [x] Optional Resend email delivery with a one-time manual-link fallback and no raw-token disclosure when email is sent
- [x] Invitation tokens stored as SHA-256 hashes and bound to the authenticated account email
- [x] OWNER/ADMIN role hierarchy for member role changes and member removal
- [x] OWNER-only ownership transfer with typed confirmation, concurrency guards, atomic role changes, and audit trail
- [x] Transactional audit records for invitation and membership lifecycle actions
- [x] Organization activity timeline page and tenant-scoped cursor-paginated audit API
- [x] Invitation and member-management API tests
- [x] Active-session API tests and session revocation safeguards
- [x] OAuth sign-in abuse protection: 10 attempts per client address and authenticated provider account per 15-minute window, shared PostgreSQL counters, privacy-preserving hashed subject keys, and expired-bucket cleanup
- [x] OAuth callback URL validation, production Secure cookies, and account-level callback throttling
- [x] Rate-limit tests for threshold behavior, retry timing, configurable policies, and client-address hashing
- [x] OAuth account-protection and safe callback URL test coverage\n- [x] Shared configurable PostgreSQL rate limiter for administrative operations\n- [x] Organization creation limit: 3 requests/hour per user and client address\n- [x] Project creation limit: 20 requests/hour per organization, member, and client address\n- [x] API-key and invitation creation limits: 10 requests/hour per organization member and client address\n- [x] Member role changes/removals limit: 30 requests/hour per organization member and client address\n- [x] Organization/project route tests for HTTP 429, fail-closed storage errors, and successful audited creation

### Event ingestion and usage
- [x] Strict, bounded batch event ingestion with project-scoped tenant checks
- [x] PostgreSQL event persistence and project/event idempotency
- [x] Atomic per-API-key request and event quotas
- [x] Free, Pro, and Enterprise organization plans with plan-specific ingestion entitlements
- [x] Public `GET /api/plans` catalog endpoint
- [x] Authenticated organization usage reporting with bounded date ranges and project/API-key breakdowns
- [x] Interactive organization API-key console with scoped creation, one-time secret display, metadata listing, and revocation
- [x] Organization usage dashboard with event breakdowns and current plan entitlement visibility
- [x] Read-only plan comparison and billing overview with explicit payment-processing limitations
- [x] PostgreSQL concurrency tests for quota enforcement
- [x] PostgreSQL-backed event route integration tests for hashed-key authentication, expiry/revocation, tenant isolation, duplicate idempotency, persisted event scope, and invalid payloads

### Quality and documentation
- [x] Vitest unit, route, and PostgreSQL integration test suites
- [x] PostgreSQL migrations for core schema, ingestion quotas, subscription plans, organization invitations, and authentication rate limits
- [x] GitHub Actions CI for clean PostgreSQL migration, tests, lint, typecheck, and production build
- [x] Architecture, security, API, database, usage, team-management, and testing documentation
- [x] Twelve original conceptual dashboard previews embedded as PNG for GitHub mobile compatibility, with source SVGs retained
- [x] Automated SVG-to-PNG rendering workflow and deterministic conversion script

## Not implemented yet

- [x] Dedicated invitee invitation acceptance UI with OAuth callback preservation and POST-based acceptance
- [ ] Provider-delivery integration tests
- [x] Secure OWNER-only ownership transfer to an active member with transactional role handoff and audit logging
- [ ] Additional owner lifecycle workflows
- [ ] Local application setup and production runtime/database verification
- [ ] Self-service key lifecycle policies and configurable rotation schedules
- [ ] Payment-backed subscription lifecycle, checkout, invoices, and billing
- [ ] Product SDKs, durable event transport, and downstream consumers
- [ ] ClickHouse-backed analytical queries
- [ ] Live funnels, journeys, cohorts, and retention dashboards
- [ ] Feature flag evaluation and experimentation assignment
- [ ] Statistical experiment analysis and sample-ratio monitoring
- [ ] AI analyst, anomaly detection, and evidence-linked recommendations
- [ ] Production observability, alerting, and integrations

## Verification

The repository contains 12 original SVG dashboard concepts under `docs/images/`. The README embeds relative PNG previews generated from the 12 source SVGs. `.github/workflows/render-dashboard-previews.yml` regenerates all PNGs whenever a source SVG or renderer changes, and validates that all 12 outputs exist and are non-empty.

The CI workflow verifies clean PostgreSQL migrations, automated tests, lint, TypeScript, and a production build. The PostgreSQL-backed ingestion route integration suite was added after the last recorded passing test run; its result must be confirmed by a new CI run before it is considered verified. Do not treat an in-progress or failed run as a passing verification.
- dependency installation (with a pinned Rollup release to avoid an unavailable optional native-package artifact)
- Prisma Client generation and schema validation
- all four committed PostgreSQL migrations against a clean ephemeral PostgreSQL 16 database
- 39 automated tests across 10 test files in the last previously recorded passing run; additional rotation and PostgreSQL ingestion route integration tests were added afterward and require fresh CI verification
- ESLint
- TypeScript typecheck
- Next.js production build

This validates the repository's CI environment, not production credentials, live OAuth configuration, email delivery, production infrastructure, or a deployed application. No production database migration or deployment has been performed.
