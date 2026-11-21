# SignalForge

**Enterprise Product Intelligence & Experimentation Platform**

SignalForge is an event-driven product analytics and experimentation platform designed to help teams understand user behaviour, measure product outcomes, and make statistically responsible decisions.

> **Build status:** Multi-tenant identity, API-key management, and PostgreSQL-backed event ingestion with atomic per-key quotas are implemented. CI applies migrations to a clean PostgreSQL service and exercises quota concurrency against the database. Production runtime verification and deployment remain outstanding.

## Implemented foundations

- Next.js 15 App Router application with TypeScript and Tailwind CSS
- Auth.js GitHub OAuth with database-backed Prisma sessions
- PostgreSQL data model for users, organizations, memberships, projects, API keys, audit logs, and product events
- Organization creation and membership listing APIs
- Organization-scoped project listing and creation APIs
- Server-side membership checks; only owners and admins can create projects and manage API keys
- Hash-only API-key storage, one-time secret issuance, expiry and revocation checks
- Project-scoped batch event ingestion with strict validation and duplicate protection
- Atomic per-API-key limits: 120 requests and 10,000 submitted events per minute, with HTTP 429 retry guidance
- PostgreSQL concurrency tests proving quota enforcement under simultaneous requests
- Committed PostgreSQL migrations and CI migration-apply verification

## Product roadmap

- Product SDK, plan-based quotas, usage metering, and API-key rotation
- Durable event transport and processing with Kafka-compatible infrastructure
- ClickHouse-backed funnels, journeys, cohorts, retention, and feature adoption analytics
- Feature flags and controlled rollouts
- Experiment lifecycle management, sample-ratio checks, and statistical readouts
- Evidence-linked anomaly explanations and natural-language analysis
- Usage metering, integrations, governance, and operational observability

## Architecture principles

- Tenant identity is derived from the authenticated session, never trusted from request payloads.
- Operational entities live in PostgreSQL; high-volume event analytics will use a column-oriented analytical store.
- Event processing uses explicit contracts, stable event IDs, and idempotency.
- AI explanations will be grounded in validated query results.
- Features are documented as implemented only after code and checks are verified.

## Repository layout

```text
apps/web/
  prisma/             PostgreSQL schema and migrations
  src/app/            Next.js routes and UI
  src/lib/             Database, API-key, and tenant authorization helpers
  auth.ts              Auth.js configuration
docs/                  Architecture, security, API, and database guides
```

## Local setup

Prerequisites: Node.js 20+, pnpm 10+, and PostgreSQL.

1. Copy `.env.example` to `.env`.
2. Create a PostgreSQL database named `signalforge`.
3. Create a GitHub OAuth application with callback URL `http://localhost:3000/api/auth/callback/github`.
4. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET` in `.env`.
5. Install dependencies, generate Prisma Client, and apply committed migrations:

```bash
corepack enable
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm dev
```

Open http://localhost:3000. Visit `/sign-in` to authenticate with GitHub.

## Database commands

```bash
pnpm db:generate   # Generate Prisma Client
pnpm db:migrate    # Create/apply a development migration
pnpm db:deploy     # Apply committed migrations
pnpm db:studio     # Open Prisma Studio
```

See [Automated tests](docs/TESTING.md), [Database migrations](docs/DATABASE.md), [Identity API](docs/IDENTITY.md), [Security baseline](docs/SECURITY.md), [API keys](docs/API-KEYS.md), and [Event ingestion](docs/EVENT-INGESTION.md).

## Event ingestion

Send a batch to `POST /api/v1/events` with `Authorization: Bearer sf_live_<secret>`. See [docs/EVENT-INGESTION.md](docs/EVENT-INGESTION.md) for the complete contract, limits, and current limitations.

## Verification status

GitHub Actions validates the Prisma schema, applies committed migrations to an ephemeral PostgreSQL 16 service, runs mocked ingestion/authentication tests plus PostgreSQL-backed quota concurrency tests, then runs lint, typecheck, and a production build. Production runtime verification and rollout are separate steps and are not implied by CI success.

## Security

Never commit credentials, private keys, production data, or real customer identifiers. Review [docs/SECURITY.md](docs/SECURITY.md) before connecting real users or data.

## License

A license will be selected and added before public distribution.
