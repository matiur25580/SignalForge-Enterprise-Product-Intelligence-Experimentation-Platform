# Implementation status

Last updated: 2026-11-21

## Implemented in source

- [x] pnpm workspace and Next.js App Router application
- [x] Strict TypeScript and Tailwind configuration
- [x] Initial product dashboard shell with honest empty states
- [x] PostgreSQL Prisma schema and shared Prisma client
- [x] Auth.js GitHub OAuth configuration and database sessions
- [x] Sign-in page and typed session user ID
- [x] Organization creation and membership listing endpoints
- [x] Organization-scoped project listing and creation endpoints
- [x] Server-side organization membership and role checks
- [x] Transactional audit events for organization/project creation
- [x] Environment example and identity/security documentation
- [x] Organization API key issuance, hash-only persistence, one-time secret response, listing, and revocation
- [x] Hash-based API-key authentication for event ingestion, including expiry and revocation checks
- [x] Project-scoped batch event ingestion with strict validation and bounded payloads
- [x] PostgreSQL event storage with project/event idempotency and duplicate reporting
- [x] Initial Prisma migration for the current schema, including the Event model
- [x] Event ingestion, API-key, and database migration documentation
- [x] GitHub Actions CI for Prisma validation, migration application, lint, typecheck, and build (migration-enabled run pending)

## Not implemented yet

- [ ] Local application setup and live database/runtime verification
- [ ] Automated authentication, ingestion, deduplication, and tenant-isolation tests
- [ ] Organization invitations and membership administration
- [ ] API-key rotation workflow, rate limiting, quotas, and usage metering
- [ ] Product SDK, durable event transport, and idempotent downstream consumers
- [ ] ClickHouse analytics queries
- [ ] Funnels, journeys, cohorts, and retention
- [ ] Feature flags and experiment assignment
- [ ] Statistical validation and experiment readouts
- [ ] AI analyst, integrations, billing, and observability

## Verification

Before the migration-enabled workflow change, CI passed Prisma Client generation, schema validation, lint, typecheck, and production build. The latest workflow now provisions PostgreSQL 16 and applies the committed migration with `prisma migrate deploy`; its first run is pending. No production database migration or live application integration test has been executed. Automated ingestion and tenant-isolation tests remain outstanding.
