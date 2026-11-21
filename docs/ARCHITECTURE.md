# Architecture

## Current state

The repository currently contains a Next.js 15 App Router application in a pnpm workspace. The application now includes Auth.js identity, organization and project APIs, scoped API keys, event ingestion, PostgreSQL-backed quota reservation, usage reporting, subscription entitlements, organization invitations, role administration, and audit logging. Analytics cards intentionally display empty states; no synthetic business metrics are presented as live data.

## Target system boundaries

```text
Browser / Product SDK
        |
        v
API Gateway + Tenant Authorization
        |
        +---- Control plane (organizations, projects, users, flags, experiments)
        |
        +---- Event ingestion (validation, quotas, idempotency)
                         |
                         v
                  Durable message stream
                         |
             +-----------+-----------+
             v                       v
       Analytical store        Operational store
             |                       |
             +-----------+-----------+
                         v
                Query / analytics API
                         |
                         v
                  Next.js workspace
```

## Architectural decisions

1. Begin with a modular monolith for control-plane workflows; extract ingestion and workers only when scaling or isolation requirements justify it.
2. Keep operational entities in a relational database and high-volume event analytics in a column-oriented analytical store.
3. Treat tenant identity as a server-derived authorization context, never as a trusted client-supplied filter.
4. Give events stable IDs and idempotency semantics before introducing asynchronous processing.
5. Version event contracts and experiment definitions. Preserve the exact analysis inputs used for each experiment readout.
6. Separate AI-generated explanations from metric computation. AI may explain validated results, but must not invent or silently alter them.

## Planned technology choices

- Web: Next.js App Router, React, TypeScript, Tailwind CSS
- API: TypeScript service with explicit request/response contracts
- Operational data: PostgreSQL
- Event transport: Kafka-compatible broker
- Analytics: ClickHouse
- Cache and rate limits: Redis
- Tests: unit, integration, end-to-end, and load tests

These are target choices, not claims that the services are already implemented.


## Implemented control-plane modules

- **Identity:** Auth.js GitHub OAuth and database sessions.
- **Tenant and access:** organization membership checks and OWNER/ADMIN/MEMBER/VIEWER roles.
- **Team lifecycle:** email-bound invitations with one-time hashed tokens, seven-day expiry, reissue, acceptance, and revocation; guarded member role changes/removal.
- **Project registry:** organization-scoped projects and environments.
- **Credential management:** API key issue/list/revoke, expiration, and hash-only storage.
- **Ingestion governance:** project-bound authorization, idempotent event writes, atomic per-key quotas, and plan-derived entitlements.
- **Auditability:** transactional audit events for sensitive organization, project, credential, invitation, and member operations.

## Current persistence boundary

PostgreSQL is the current operational source of truth for the implemented control plane and initial event records. Event analytics at scale, durable streaming, ClickHouse, Redis, background workers, feature flags, and experimentation services remain planned. The modular monolith is deliberate: it keeps transaction boundaries and authorization policy understandable while the domain model matures.
