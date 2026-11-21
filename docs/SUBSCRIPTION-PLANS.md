# Subscription plan foundation

SignalForge currently supports three organization subscription tiers. The plan is stored on each organization and defaults to `FREE`. The active organization plan is loaded during API-key authentication and its ingestion entitlements are enforced by the atomic PostgreSQL quota reservation.

## Plan catalog

| Plan | Requests / minute / API key | Submitted events / minute / API key | Projects | API keys |
|---|---:|---:|---:|---:|
| Free | 120 | 10,000 | 2 | 3 |
| Pro | 600 | 50,000 | 20 | 25 |
| Enterprise | 3,000 | 250,000 | Unlimited | Unlimited |

The current plan catalog is code-defined in `src/lib/subscription-plans.ts`. Limits are per API key; they are not aggregate organization-wide quotas. The event batch endpoint continues to enforce its maximum batch size of 100 and 256 KiB request body limit.

## API

`GET /api/plans` returns the public plan catalog and explicitly reports that billing is disabled.

The event ingestion API returns plan-specific `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Remaining-Events` headers. When the plan quota is exhausted, it returns HTTP 429 with retry guidance and the applicable limits.

## Lifecycle and billing boundary

- New organizations default to the Free tier.
- The plan field is persisted in PostgreSQL using the `SubscriptionPlan` enum.
- There is no self-service plan mutation endpoint. Plan upgrades must not be simulated by trusting client input.
- Checkout, payment collection, invoices, tax handling, proration, subscription webhooks, and automated plan changes are not implemented.
- Plan entitlements are currently static configuration; commercial pricing is intentionally unspecified.

Before enabling paid upgrades, integrate a payment provider, verify signed subscription webhooks, implement idempotent subscription state transitions, and audit every entitlement change.
