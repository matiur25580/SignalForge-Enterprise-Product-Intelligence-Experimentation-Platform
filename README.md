# SignalForge

**Enterprise Product Intelligence & Experimentation Platform**

SignalForge is an event-driven product analytics and experimentation platform designed to help teams understand user behaviour, measure product outcomes, and make statistically responsible decisions.

> **Build status:** Initial repository scaffold. Features are added incrementally and documented only after implementation and verification.

## Product scope

- Product event ingestion with versioned contracts and idempotency
- Funnels, journeys, cohorts, retention, and feature adoption analytics
- Feature flags and controlled rollouts
- Experiment lifecycle management, sample-ratio checks, and statistical readouts
- Evidence-linked anomaly explanations and natural-language analysis
- Multi-tenant access control, audit history, and usage metering

## Architecture direction

The first release uses a TypeScript monorepo and a modular application boundary. The initial web application is Next.js. API, event-ingestion, background-worker, and analytics-storage services will be introduced as separately testable components as the product grows.

Key engineering principles:

- Tenant-scoped authorization at every data boundary
- Explicit event schemas, validation, and idempotent processing
- Reproducible experiment assignment and transparent statistical methods
- No fabricated analytics or unverified performance claims
- Tests and documentation accompany each implemented capability

## Repository layout

```text
apps/
  web/              Next.js product interface
packages/           Shared contracts, utilities, and UI (added incrementally)
services/           API, ingestion, and worker services (added incrementally)
infra/              Local development infrastructure (added incrementally)
docs/               Architecture decisions, security, and operations
```

## Getting started

Prerequisites: Node.js 20+ and pnpm.

```bash
corepack enable
pnpm install
pnpm --filter @signalforge/web dev
```

Open http://localhost:3000.

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Some commands become available as their corresponding workspace scripts are added.

## Roadmap

1. **Foundation:** workspace, Next.js shell, design system, linting, type checking, and CI.
2. **Identity & tenancy:** organizations, projects, memberships, roles, and audit events.
3. **Event pipeline:** ingestion contract, validation, idempotency, queue, and analytical storage.
4. **Product analytics:** event explorer, funnels, journeys, cohorts, and retention.
5. **Experimentation:** feature flags, allocation, SRM validation, and statistical analysis.
6. **Intelligence:** anomaly detection and evidence-grounded analyst workflows.
7. **Enterprise readiness:** integrations, governance, metering, observability, and security testing.

## Security

Never commit credentials, private keys, production data, or real customer identifiers. Use environment variables and the provided example configuration when one is introduced.

## License

A license will be selected and added before public distribution.
