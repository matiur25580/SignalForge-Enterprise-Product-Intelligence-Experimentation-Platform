<div align="center">

# SignalForge

### Product Intelligence. Experimentation. Decisions backed by evidence.

**An enterprise-minded product analytics platform designed to turn behavioral signals into confident product decisions.**

[![CI](https://github.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![License](https://img.shields.io/badge/License-Not%20yet%20selected-lightgrey)

[Architecture](#architecture) · [Capabilities](#implemented-capabilities) · [Dashboard concepts](#dashboard-concepts) · [Activity timeline](docs/ACTIVITY-TIMELINE.md) · [Security](docs/SECURITY.md) · [Getting started](#getting-started) · [Roadmap](#roadmap)

</div>

---

## Why SignalForge?

Product teams collect events, run experiments, and ship features—but the evidence is often scattered across disconnected tools. SignalForge is being built as a unified workspace for understanding product behavior, measuring outcomes, governing releases, and making decisions with trustworthy data.

The project emphasizes the engineering foundations behind a credible SaaS product: tenant isolation, scoped credentials, idempotent ingestion, atomic quotas, auditable actions, and automated verification.

> **Current implementation status:** The repository contains a Next.js application with authenticated workspace, organization/team and project management screens, plus backend APIs for multi-tenant identity, projects, API keys, event ingestion, per-key quotas, and organization usage reporting. The 12 dashboard images below are **conceptual product-design previews with illustrative data**, not screenshots of currently implemented live dashboard pages. Production deployment and runtime verification have not been performed.

## Implemented capabilities

| Area | Current implementation |
|---|---|
| Identity | Auth.js GitHub OAuth, database-backed sessions, active-session inventory, and remote session revocation |
| Multi-tenancy | Organizations, memberships, roles, and server-side access checks |
| Team management | Secure owner-controlled ownership transfer with typed confirmation and atomic role handoff; secure email-bound invitations with optional Resend delivery, member directory, role administration, guarded removal, single-use acceptance, revocation, audit trail, and interactive team UI |
| Workspace UI | Authenticated organization dashboard, workspace creation, project registry, team administration, and invitation token handling |
| Projects | Organization-scoped project creation and listing |
| API credentials | Cryptographically random secrets, SHA-256 hash-only storage, one-time display, expiry, revocation, atomic audited rotation, and interactive organization key console |
| Event ingestion | Strictly validated batch endpoint, bounded payloads, server-derived environment, and duplicate protection |
| Rate limiting | Atomic PostgreSQL per-key ingestion quotas plus shared PostgreSQL rate limits for OAuth, organization/project creation, API-key issuance, invitations, and member administration, with privacy-preserving subject hashes |
| Usage intelligence | Authenticated organization usage report with project and API-key breakdowns, dashboard summaries, and plan entitlement visibility |
| Plan entitlements | Free, Pro, and Enterprise organization tiers with plan-specific atomic per-key ingestion quotas and a transparent plan comparison page |
| Billing visibility | Current plan, tier comparison, usage and entitlement overview; payment processing is explicitly disabled |
| Account security | Private active-session inventory, current-session protection, one-way session identifiers, per-session remote revocation, and OAuth sign-in abuse protection |
| Auditability | Transactional audit records, tenant-scoped activity timeline, and OWNER/ADMIN security alerts for suspicious API-key, invitation, member-access, and ownership activity |
| Database delivery | Committed Prisma migrations applied against clean PostgreSQL in CI |
| Quality gates | Vitest, ESLint, TypeScript checks, Prisma validation, and production build in GitHub Actions |

### Team invitations

Organization OWNERs can invite teammates as ADMIN, MEMBER, or VIEWER; ADMINs can invite MEMBER or VIEWER only. Invitation tokens are generated using cryptographically secure randomness, stored only as SHA-256 hashes, expire after seven days, and can be accepted only by a signed-in account with the matching email. Members can be listed, roles can be changed under a strict OWNER/ADMIN hierarchy, and non-owner members can be removed. The current OWNER can transfer ownership to an active organization member using an explicit typed confirmation; the previous owner becomes ADMIN and both role changes plus the audit event commit atomically. Acceptance, role changes, revocation, and removal are transactional and audited. When Resend credentials are configured, invitations are emailed with a single-use acceptance link and the raw token is not returned to the inviter. Without email credentials, the API provides a one-time manual acceptance URL. Invitees can open a dedicated acceptance page, sign in with the invited GitHub account, and accept the invitation directly. The page removes the token from the visible URL after hydration and submits it only in the POST body. Configure `RESEND_API_KEY`, `EMAIL_FROM`, and `AUTH_URL` to enable delivery. See [Team management](docs/TEAM-MANAGEMENT.md). Organization administrators can review deduplicated security alerts at `/organizations/:organizationId/security`; a protected scheduled monitor now evaluates all organizations every five minutes and can notify OWNER/ADMIN recipients about HIGH/CRITICAL alerts through Resend email and/or Slack. Configure `SECURITY_MONITOR_SECRET` in the app and GitHub Actions secret, `SIGNALFORGE_APP_URL` as an HTTPS GitHub Actions variable, and optionally `RESEND_API_KEY` + `EMAIL_FROM` and/or `SECURITY_ALERT_SLACK_WEBHOOK_URL`. Notifications are throttled per alert for one hour. See [Security](docs/SECURITY.md).

### Event ingestion contract

Send batches to `POST /api/v1/events` with a project ID and an API key:

```http
POST /api/v1/events
Authorization: Bearer sf_live_<secret>
Content-Type: application/json
```

```json
{
  "projectId": "your_project_cuid",
  "events": [
    {
      "eventId": "checkout-0001",
      "eventName": "checkout.completed",
      "timestamp": "2026-11-21T10:30:00.000Z",
      "userId": "user-123",
      "properties": {
        "currency": "INR",
        "total": 1299
      }
    }
  ]
}
```

The endpoint validates the payload, verifies API-key scope and lifecycle state, enforces per-key request/event quotas in PostgreSQL, persists events with project-scoped idempotency, and reports accepted/duplicate counts. OAuth sign-in initiation and authenticated GitHub callback completion are rate-limited across app instances using PostgreSQL fixed-window counters; only keyed SHA-256 digests of IP/account subjects are stored. Organization creation is limited to 3 requests/hour per user and client address; project creation is limited to 20 requests/hour per organization, member, and client address; API-key creation and invitation creation are each limited to 10 requests/hour per organization member and client address; member role changes/removals are limited to 30 requests/hour per organization member and client address. These administrative creation limits fail closed if shared limiter storage is unavailable. Callback destinations are restricted to safe root-relative paths, and production session cookies are Secure. See [Event ingestion](docs/EVENT-INGESTION.md) and [Security](docs/SECURITY.md).

### Organization usage reporting

`GET /api/organizations/:organizationId/usage` returns organization-scoped event totals and per-project/API-key breakdowns. It defaults to the trailing 30 days and accepts ISO-8601 `from` and `to` parameters for custom windows up to 90 days. Ingestion entitlements are enforced per API key using the organization’s Free, Pro, or Enterprise plan. The public `GET /api/plans` endpoint publishes the plan catalog. Organization admins can inspect API-key usage and plan entitlements in the workspace UI. The API-key console supports secure creation, one-time secret copying, metadata listing, revocation, and atomic rotation. Rotation revokes the old key and creates a replacement with preserved project scope and expiry in one audited transaction; the replacement secret is shown once. This is not payment processing or a subscription checkout system. See [API keys](docs/API-KEYS.md), [Usage metering](docs/USAGE-METERING.md), and [Subscription plans](docs/SUBSCRIPTION-PLANS.md).

## Architecture

SignalForge currently follows a modular-monolith approach for its control plane. High-volume analytical infrastructure is part of the roadmap and is not represented as already deployed.

```mermaid
flowchart LR
    Client[Product / Server SDK] -->|Bearer API key| Ingest[Next.js Event API]
    User[Workspace User] -->|GitHub OAuth| Web[Next.js App]
    Web --> Auth[Auth.js + Tenant Authorization]
    Auth --> PG[(PostgreSQL)]
    Ingest --> KeyAuth[API Key Verification]
    KeyAuth --> Quota[Atomic Per-Key Quotas]
    Quota --> Events[Validated Event Persistence]
    Events --> PG
    Web --> Usage[Organization Usage API]
    Usage --> PG
    PG --> Audit[Audit Trail]
    Events -. future .-> Queue[Kafka-compatible Transport]
    Queue -. future .-> OLAP[(ClickHouse Analytics)]
    OLAP -. future .-> Insights[Funnels · Cohorts · Experiments]
```

### Engineering principles

- **Tenant isolation:** Organization ownership and membership are verified server-side; request payloads never define tenant scope.
- **Credential hygiene:** API secrets are shown once; only their SHA-256 hashes are persisted.
- **Idempotency:** Event IDs are unique within a project, preventing duplicate persistence on retries.
- **Atomic quotas:** PostgreSQL upserts reserve request and event capacity safely under concurrent traffic.
- **Transactional consistency:** Quota reservation and event persistence share a transaction.
- **Auditability:** Sensitive lifecycle operations produce organization-scoped audit records.
- **Honest observability:** Empty or unimplemented product areas are not presented as live metrics.

## Dashboard concepts

The following 12 screens illustrate the intended product experience and information architecture. They are original dashboard designs rendered as **PNG previews** from the source SVG files, presented in a **single vertical column** for reliable rendering in GitHub's web and mobile Markdown viewers. Source SVGs are retained alongside the PNGs. All figures, activity rows, and chart values are illustrative; these screens are not wired to live product data.

### 01 · Executive overview
A high-level workspace snapshot for activation, engagement, conversion, and overall product health.

![SignalForge executive overview dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-01-executive-overview.png)

### 02 · Event intelligence
An operational view of event volume, accepted traffic, duplicate rates, and source health.

![SignalForge event intelligence dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-02-event-intelligence.png)

### 03 · Conversion funnels
A focused analysis surface for conversion steps, drop-off points, and checkout performance.

![SignalForge conversion funnels dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-03-conversion-funnels.png)

### 04 · User journeys
A journey exploration workspace for understanding common paths, key transitions, and exits.

![SignalForge user journeys dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-04-user-journeys.png)

### 05 · Cohorts & retention
A retention view for comparing acquisition cohorts and tracking long-term engagement.

![SignalForge cohorts and retention dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-05-cohorts-retention.png)

### 06 · Experimentation
An experiment operations view for enrollment, outcome movement, and sample-ratio monitoring.

![SignalForge experimentation dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-06-experimentation.png)

### 07 · Feature flags
A release governance view for flag inventory, rollout coverage, and operational safety.

![SignalForge feature flags dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-07-feature-flags.png)

### 08 · Audience cohorts
A segmentation workspace for defining behavioral audiences and understanding their size.

![SignalForge audience cohorts dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-08-audience-cohorts.png)

### 09 · Data quality
A data observability concept for schema compliance, drift alerts, and event validation.

![SignalForge data quality dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-09-data-quality.png)

### 10 · Usage & quotas
An organization consumption view for event volume, API-key activity, and quota awareness.

![SignalForge usage and quotas dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-10-usage-quotas.png)

### 11 · API key security
A credential administration concept for key lifecycle, expiry hygiene, and revocation review.

![SignalForge API key security dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-11-api-key-security.png)

### 12 · Audit & governance
An accountability view for administrative activity, policy checks, and review workflows.

![SignalForge audit and governance dashboard concept](https://raw.githubusercontent.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/main/docs/images/dashboard-12-audit-governance.png)

## Technology stack

| Layer | Technology |
|---|---|
| Web application | Next.js 15 App Router, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Authentication | Auth.js (GitHub OAuth) |
| Operational database | PostgreSQL 16 |
| ORM and migrations | Prisma 6 |
| Validation | Zod |
| Automated tests | Vitest |
| CI | GitHub Actions |

**Planned analytical and distributed systems:** ClickHouse, Redis, Kafka/Redpanda, background workers, OpenTelemetry, and a Python-based AI service. These are roadmap items, not current runtime dependencies.

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL 16+
- A GitHub OAuth application

### 1. Clone the repository

```bash
git clone https://github.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform.git
cd SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform
```

### 2. Configure environment variables

Copy the example file and configure your local credentials:

```bash
cp .env.example .env
```

Required values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js session encryption secret |
| `AUTH_GITHUB_ID` | GitHub OAuth client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth client secret |

Set the GitHub OAuth callback URL to:

```
http://localhost:3000/api/auth/callback/github
```

Never commit your real `.env` file or production credentials.

### 3. Install and initialize

```bash
corepack enable
pnpm install
pnpm db:generate
pnpm db:deploy
```

### 4. Run the application

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in through GitHub OAuth.

### Useful commands

```bash
pnpm dev          # Start the web application
pnpm test         # Run automated tests
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript checks
pnpm build        # Create a production build
pnpm db:generate  # Generate Prisma Client
pnpm db:migrate   # Create/apply a development migration
pnpm db:deploy    # Apply committed migrations
pnpm db:studio    # Open Prisma Studio
```

## Verification & delivery

GitHub Actions provisions an ephemeral PostgreSQL 16 service, generates Prisma Client, validates the Prisma schema, applies committed migrations, runs automated tests, and performs lint, typecheck, and production-build checks.

- [View CI workflow](https://github.com/matiur25580/SignalForge-Enterprise-Product-Intelligence-Experimentation-Platform/actions/workflows/ci.yml)
- [Implementation status](docs/STATUS.md)
- [Testing guide](docs/TESTING.md)

CI success verifies the checks in that workflow; it does not imply that a production environment, live customer data, or external analytical infrastructure has been configured.

## Roadmap

- [x] Multi-tenant identity, organizations, roles, and project foundations
- [x] Secure API-key lifecycle and scoped event ingestion
- [x] Atomic per-key request and event quotas
- [x] Organization-level usage reporting
- [x] Plan catalog and organization-level Free/Pro/Enterprise ingestion entitlements
- [x] Authenticated workspace dashboard, organization creation, project registry, and team management UI
- [x] Organization API-key console, usage dashboard, and read-only plan/billing overview
- [ ] Payment-backed subscription lifecycle, self-service upgrades, and billing
- [x] API-key rotation workflow
- [ ] Usage threshold notifications
- [x] Invitation email delivery integration and invitee acceptance UI
- [x] Organization activity timeline with tenant-scoped cursor pagination
- [x] Audit-based security alert center with thresholds, severity, deduplication, and resolution workflow
- [x] Secure ownership transfer with atomic role handoff and audit trail
- [ ] Product SDKs and durable event transport
- [ ] ClickHouse-backed funnels, journeys, cohorts, and retention
- [ ] Feature flag evaluation and controlled rollouts
- [ ] Experiment assignment, sample-ratio checks, and statistical readouts
- [ ] Background/real-time anomaly detection, alert notifications, and AI-assisted product analysis
- [ ] Operational observability, integrations, and governance workflows

## Documentation

- [Database migrations](docs/DATABASE.md)
- [Identity and organization APIs](docs/IDENTITY.md)
- [Team management and invitations](docs/TEAM-MANAGEMENT.md)
- [Organization activity timeline](docs/ACTIVITY-TIMELINE.md)
- [Ownership transfer](docs/OWNERSHIP-TRANSFER.md)
- [Security baseline](docs/SECURITY.md)
- [API key lifecycle](docs/API-KEYS.md)
- [Event ingestion contract](docs/EVENT-INGESTION.md)
- [Usage metering](docs/USAGE-METERING.md)
- [Subscription plans](docs/SUBSCRIPTION-PLANS.md)
- [Automated testing](docs/TESTING.md)
- [Implementation status](docs/STATUS.md)

## Contributing

Issues and focused pull requests are welcome. For substantial changes, please open an issue first to discuss the proposed design. Keep changes scoped, add tests for behavior changes, and update documentation when contracts change.

## License

No license has been selected yet. Until a license is added, the repository should not be treated as granting general permission to reuse, distribute, or modify its contents.

---

<div align="center">

**SignalForge** · Evidence first. Product decisions with confidence.

</div>
