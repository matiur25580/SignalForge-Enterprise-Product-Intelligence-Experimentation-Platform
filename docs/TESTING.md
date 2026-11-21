# Automated tests

SignalForge's web application uses Vitest for focused unit and route-handler tests.

## Run locally

```bash
pnpm install
pnpm db:generate
pnpm test
```

The root `pnpm test` command runs the web-app Vitest suite, including PostgreSQL-backed integration tests. Configure `DATABASE_URL` to a migrated PostgreSQL database before running locally. Use `pnpm --filter @signalforge/web test:watch` for watch-mode unit tests while developing.

## Ingestion coverage

The current suite covers:

- Missing and malformed bearer credentials
- SHA-256 hash lookup for active API keys
- Unknown, revoked, and expired API keys
- Valid event batch acceptance and server-derived project/environment scope
- Duplicate event reporting
- Project-bound API key restrictions
- Organization-to-project tenant boundary enforcement
- Strict event field validation and malformed JSON
- Request body size limits
- Generic persistence error responses that do not expose database details
- Atomic quota enforcement under concurrent PostgreSQL transactions
- PostgreSQL-backed event route integration tests for active, revoked, and expired API keys
- Cross-organization project isolation, duplicate idempotency, persisted event scope, and invalid payload rejection
- Event-volume quota rejection without consuming additional capacity

The route-handler unit tests mock Prisma at the boundary and validate request/authentication orchestration. A separate `route.integration.test.ts` suite exercises the actual route, hashed API-key lookup, API-key expiry and revocation, organization/project isolation, event persistence, server-derived environment, duplicate handling, and invalid payload rejection against PostgreSQL. These database-backed tests run in CI after migrations and are not a substitute for verification against a deployed production environment.

GitHub Actions runs this suite after applying migrations to its ephemeral PostgreSQL 16 service, including real database concurrency checks, then continues with lint, typecheck, and production build.
