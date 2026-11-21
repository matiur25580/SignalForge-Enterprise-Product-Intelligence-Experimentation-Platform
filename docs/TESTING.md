# Automated tests

SignalForge's web application uses Vitest for focused unit and route-handler tests.

## Run locally

```bash
pnpm install
pnpm db:generate
pnpm test
```

The root `pnpm test` command runs the web-app Vitest suite. Use `pnpm --filter @signalforge/web test:watch` while developing.

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

Prisma calls are mocked at the route boundary. These tests validate request/authentication orchestration and persistence intent, but they are not substitutes for end-to-end tests against a running application and a real database.

GitHub Actions runs this suite after applying migrations to its ephemeral PostgreSQL 16 service, then continues with lint, typecheck, and production build.
