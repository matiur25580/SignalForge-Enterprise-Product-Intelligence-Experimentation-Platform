# SignalForge

**Enterprise Product Intelligence & Experimentation Platform**

SignalForge is an event-driven product analytics and experimentation platform designed to help teams understand user behaviour, measure product outcomes, and make statistically responsible decisions.

> **Build status:** Identity and multi-tenant foundations are implemented in source. Database migration and application checks must be run in a configured local environment before use.

## Implemented foundations

- Next.js 15 App Router application with TypeScript and Tailwind CSS
- Auth.js GitHub OAuth with database-backed Prisma sessions
- PostgreSQL data model for users, organizations, memberships, projects, API-key records, and audit logs
- Organization creation and membership listing APIs
- Organization-scoped project listing and creation APIs
- Server-side membership checks; only owners and admins can create projects
- Transactional audit events for organization and project creation
- GitHub Actions CI workflow for Prisma validation, lint, typecheck, and build

## Product roadmap

- Product event ingestion with versioned contracts and idempotency
- Funnels, journeys, cohorts, retention, and feature adoption analytics
- Feature flags and controlled rollouts
- Experiment lifecycle management, sample-ratio checks, and statistical readouts
- Evidence-linked anomaly explanations and natural-language analysis
- Usage metering, integrations, governance, and operational observability

## Architecture principles

- Tenant identity is derived from the authenticated session, never trusted from request payloads.
- Operational entities live in PostgreSQL; high-volume event analytics will use a column-oriented analytical store.
- Event processing will use explicit contracts, stable event IDs, and idempotency.
- AI explanations will be grounded in validated query results.
- Features are documented as implemented only after code and checks are verified.

## Repository layout

```text
apps/web/
  prisma/             PostgreSQL schema
  src/app/            Next.js routes and UI
  src/lib/             Database and tenant authorization helpers
  auth.ts              Auth.js configuration
docs/                  Architecture, security, and API guides
```

## Local setup

Prerequisites: Node.js 20+, pnpm 10+, and PostgreSQL.

1. Copy `.env.example` to `.env`.
2. Create a PostgreSQL database named `signalforge`.
3. Create a GitHub OAuth application with callback URL `http://localhost:3000/api/auth/callback/github`.
4. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, and `AUTH_GITHUB_SECRET` in `.env`.
5. Install dependencies and generate the Prisma client:

```bash
corepack enable
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. Visit `/sign-in` to authenticate with GitHub.

## Database commands

```bash
pnpm db:generate   # Generate Prisma Client
pnpm db:migrate    # Create/apply a development migration
pnpm db:deploy     # Apply committed migrations in deployment environments
pnpm db:studio     # Open Prisma Studio
```

## API overview

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/organizations` | Authenticated user |
| POST | `/api/organizations` | Authenticated user |
| GET | `/api/organizations/:organizationId/projects` | Organization member |
| POST | `/api/organizations/:organizationId/projects` | Organization owner/admin |

See [Identity API](docs/IDENTITY.md) and [Security baseline](docs/SECURITY.md).

## Verification status

The source files and configuration have been committed to GitHub. Dependency installation, Prisma migration, lint, typecheck, and production build have not yet been run in a configured environment. Do not treat the current repository state as a verified production deployment.

## Security

Never commit credentials, private keys, production data, or real customer identifiers. Review [docs/SECURITY.md](docs/SECURITY.md) before connecting real users or data.

## License

A license will be selected and added before public distribution.
