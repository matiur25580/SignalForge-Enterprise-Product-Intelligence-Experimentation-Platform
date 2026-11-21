# Implementation status

Last updated: 2026-11-21

## Implemented in source

### Platform foundation
- [x] pnpm workspace and Next.js App Router application
- [x] Strict TypeScript and Tailwind configuration
- [x] Initial dashboard shell with honest empty states
- [x] PostgreSQL Prisma schema, shared client, and committed migration history
- [x] Auth.js GitHub OAuth and database-backed sessions
- [x] Organization creation, memberships, roles, and server-side tenant authorization
- [x] Organization-scoped project creation and listing
- [x] Transactional audit records for organization and project lifecycle actions

### Identity, security, and team management
- [x] API key issuance with cryptographically random secrets, hash-only persistence, one-time display, expiry, listing, revocation, and atomic audited rotation
- [x] Hash-based ingestion authentication with expiry and revocation checks
- [x] Organization member directory
- [x] Secure invitation creation, reissue, seven-day expiry, single-use acceptance, and revocation
- [x] Invitation tokens stored as SHA-256 hashes and bound to the authenticated account email
- [x] OWNER/ADMIN role hierarchy for member role changes and member removal
- [x] Transactional audit records for invitation and membership lifecycle actions
- [x] Invitation and member-management API tests

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

### Quality and documentation
- [x] Vitest unit, route, and PostgreSQL integration test suites
- [x] PostgreSQL migrations for core schema, ingestion quotas, subscription plans, and organization invitations
- [x] GitHub Actions CI for clean PostgreSQL migration, tests, lint, typecheck, and production build
- [x] Architecture, security, API, database, usage, team-management, and testing documentation
- [x] Twelve original conceptual dashboard SVG previews in the README (illustrative, not live application pages)

## Not implemented yet

- [ ] Automatic invitation email delivery and invitee invitation acceptance UI
- [ ] Ownership transfer and owner lifecycle workflows
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

The latest verified GitHub Actions run [44879418883](https://github.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/actions/runs/44879418883) passed the application UI changes with 39 tests. Atomic API-key rotation and its new route tests were added afterward; their CI verification is pending.
- dependency installation (with a pinned Rollup release to avoid an unavailable optional native-package artifact)
- Prisma Client generation and schema validation
- all four committed PostgreSQL migrations against a clean ephemeral PostgreSQL 16 database
- 39 automated tests across 10 test files in the last passing run (the rotation test suite was added afterward)
- ESLint
- TypeScript typecheck
- Next.js production build

This validates the repository's CI environment, not production credentials, live OAuth configuration, email delivery, production infrastructure, or a deployed application. No production database migration or deployment has been performed.
