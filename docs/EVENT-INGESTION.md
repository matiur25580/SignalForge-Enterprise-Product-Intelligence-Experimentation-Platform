# Event ingestion API

The first ingestion milestone provides a PostgreSQL-backed, synchronous batch endpoint. It is a foundation for contract validation and deduplication, not yet a streaming or high-volume analytics pipeline.

## Endpoint

`POST /api/v1/events`

Send the API key in the `Authorization` header:

```http
Authorization: Bearer sf_live_<secret>
Content-Type: application/json
```

Request body:

```json
{
  "projectId": "project_cuid",
  "events": [
    {
      "eventId": "client-generated-stable-id",
      "eventName": "checkout.completed",
      "timestamp": "2026-11-21T06:30:00.000Z",
      "userId": "user-123",
      "properties": {
        "currency": "INR",
        "total": 1299
      }
    }
  ]
}
```

## Validation and limits

- Request bodies are limited to 256 KiB. The handler rejects an oversized declared `Content-Length` early and independently counts streamed bytes, canceling the body as soon as the actual byte limit is crossed; it does not buffer an unbounded body before enforcing the cap.
- Request bodies must be valid UTF-8 JSON.
- Each API key is limited to 120 requests and 10,000 submitted events per fixed 60-second window. Limits are independent per key and enforced atomically in PostgreSQL.
- Batches contain 1–100 events.
- Event IDs and names are 1–128 characters and restricted to letters, digits, dot, underscore, colon, and hyphen.
- Timestamps, when supplied, must be ISO date-time strings. Omitted timestamps use the server receive time.
- User IDs are optional and limited to 256 characters.
- Properties are optional, must be a JSON object, and may contain at most 50 top-level keys.
- Unknown fields are rejected at both the batch and event levels.

## Authentication and project scope

The endpoint hashes the supplied key with SHA-256 and looks up the stored hash. It rejects missing, unknown, revoked, and expired keys. The raw key is never persisted or logged.

A project-bound key can write only to its bound project. An organization-level key may select a project only when that project belongs to the key's organization. The environment is taken from the server-side project record, not from the request.

## Idempotency and response

Events are uniquely constrained by `(projectId, eventId)`. PostgreSQL `createMany(skipDuplicates: true)` makes retries safe for duplicate IDs within or across batches.

Successful requests return HTTP 202 and include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Remaining-Events`, and `X-RateLimit-Reset` response headers:

```json
{ "accepted": 1, "duplicates": 0 }
```

`accepted` is the number of newly stored events; `duplicates` is the number skipped because their IDs already exist. Quota reservation, event persistence, and API-key last-used metadata update share one transaction, so a failed write does not consume quota.

When either per-key quota is exhausted, the endpoint returns HTTP 429 with a `Retry-After` header, a reset timestamp, and the configured request/event limits. Clients should wait for the indicated window before retrying.

## Current limitations

- PostgreSQL is the synchronous operational store; Kafka/Redpanda and ClickHouse are not wired in.
- Payload retention policies, a schema registry, and first-party SDKs are not implemented yet.
- CI applies committed migrations to an ephemeral PostgreSQL 16 database and runs PostgreSQL-backed concurrency tests. Production database migration and runtime verification remain operator responsibilities.


## Subscription plan quotas

Quotas are resolved from the authenticated API key's organization plan, never from a client-supplied plan field. Free organizations receive 120 requests and 10,000 submitted events per minute per API key; Pro receives 600 and 50,000; Enterprise receives 3,000 and 250,000. See [Subscription plans](SUBSCRIPTION-PLANS.md).