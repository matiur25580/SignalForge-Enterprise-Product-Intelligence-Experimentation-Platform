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

- Request bodies are limited to 256 KiB.
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

Successful requests return HTTP 202:

```json
{ "accepted": 1, "duplicates": 0 }
```

`accepted` is the number of newly stored events; `duplicates` is the number skipped because their IDs already exist. API key last-used metadata is updated in the same transaction.

## Current limitations

- Storage is PostgreSQL-backed; Kafka/Redpanda and ClickHouse are not wired in.
- No rate limiting, quotas, payload retention policy, schema registry, or SDK is implemented yet.
- Database migration files have not yet been generated or applied. Generate and review migrations from the updated Prisma schema before running this against an environment.
- Automated ingestion integration tests and live database verification remain outstanding.
