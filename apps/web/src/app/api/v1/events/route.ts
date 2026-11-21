import { Prisma, ProjectEnvironment } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateIngestionKey } from "@/lib/ingestion-auth";

export const runtime = "nodejs";

const MAX_REQUESTS_PER_MINUTE = 120;
const MAX_EVENTS_PER_MINUTE = 10_000;
const RATE_LIMIT_WINDOW_MS = 60_000;

const eventSchema = z.object({
  eventId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  eventName: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  timestamp: z.string().datetime().optional(),
  userId: z.string().trim().min(1).max(256).optional(),
  properties: z.record(z.string(), z.unknown()).default({}).refine(
    (value) => Object.keys(value).length <= 50,
    "At most 50 event properties are allowed",
  ),
}).strict();

const batchSchema = z.object({
  projectId: z.string().cuid(),
  events: z.array(eventSchema).min(1).max(100),
}).strict();

type RateLimitState = {
  remainingRequests: number;
  remainingEvents: number;
};

function rateLimitHeaders(state: RateLimitState, resetAt: Date) {
  return {
    "X-RateLimit-Limit": String(MAX_REQUESTS_PER_MINUTE),
    "X-RateLimit-Remaining": String(state.remainingRequests),
    "X-RateLimit-Remaining-Events": String(state.remainingEvents),
    "X-RateLimit-Reset": String(Math.ceil(resetAt.getTime() / 1000)),
  };
}

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 256 * 1024) {
    return Response.json({ error: "Request body exceeds the 256 KiB limit" }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid event batch", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const authentication = await authenticateIngestionKey(request);
    if (!authentication.ok) {
      return Response.json({ error: authentication.error }, { status: authentication.status });
    }

    const { apiKey } = authentication;
    if (apiKey.projectId && apiKey.projectId !== parsed.data.projectId) {
      return Response.json({ error: "API key is not authorized for this project" }, { status: 403 });
    }

    const project = await prisma.project.findFirst({
      where: {
        id: parsed.data.projectId,
        organizationId: apiKey.organizationId,
      },
      select: { id: true, environment: true },
    });
    if (!project) {
      return Response.json({ error: "Project not found for this API key" }, { status: 404 });
    }

    const receivedAt = new Date();
    const windowStart = new Date(
      Math.floor(receivedAt.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS,
    );
    const resetAt = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_MS);

    const result = await prisma.$transaction(async (tx) => {
      // A single row per API key is atomically reset or incremented by PostgreSQL.
      // The conditional conflict update prevents concurrent requests from overshooting either quota.
      const quota = await tx.$queryRaw<RateLimitState[]>(Prisma.sql`
        INSERT INTO "IngestionRateLimit"
          ("apiKeyId", "windowStart", "requestCount", "eventCount", "updatedAt")
        VALUES
          (${apiKey.id}, ${windowStart}, 1, ${parsed.data.events.length}, ${receivedAt})
        ON CONFLICT ("apiKeyId") DO UPDATE SET
          "windowStart" = CASE
            WHEN "IngestionRateLimit"."windowStart" < EXCLUDED."windowStart"
            THEN EXCLUDED."windowStart"
            ELSE "IngestionRateLimit"."windowStart"
          END,
          "requestCount" = CASE
            WHEN "IngestionRateLimit"."windowStart" < EXCLUDED."windowStart"
            THEN 1
            ELSE "IngestionRateLimit"."requestCount" + 1
          END,
          "eventCount" = CASE
            WHEN "IngestionRateLimit"."windowStart" < EXCLUDED."windowStart"
            THEN EXCLUDED."eventCount"
            ELSE "IngestionRateLimit"."eventCount" + EXCLUDED."eventCount"
          END,
          "updatedAt" = EXCLUDED."updatedAt"
        WHERE "IngestionRateLimit"."windowStart" < EXCLUDED."windowStart"
          OR (
            "IngestionRateLimit"."windowStart" = EXCLUDED."windowStart"
            AND "IngestionRateLimit"."requestCount" < ${MAX_REQUESTS_PER_MINUTE}
            AND "IngestionRateLimit"."eventCount" + EXCLUDED."eventCount" <= ${MAX_EVENTS_PER_MINUTE}
          )
        RETURNING
          ${MAX_REQUESTS_PER_MINUTE} - "requestCount" AS "remainingRequests",
          ${MAX_EVENTS_PER_MINUTE} - "eventCount" AS "remainingEvents"
      `);

      if (quota.length === 0) {
        return { limited: true as const };
      }

      const inserted = await tx.event.createMany({
        data: parsed.data.events.map((event) => ({
          projectId: project.id,
          apiKeyId: apiKey.id,
          eventId: event.eventId,
          eventName: event.eventName,
          occurredAt: event.timestamp ? new Date(event.timestamp) : receivedAt,
          userId: event.userId,
          properties: event.properties as Prisma.InputJsonValue,
          environment: project.environment as ProjectEnvironment,
          receivedAt,
        })),
        skipDuplicates: true,
      });

      await tx.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: receivedAt },
      });

      return { limited: false as const, inserted, quota: quota[0] };
    });

    if (result.limited) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
      return Response.json(
        {
          error: "Ingestion rate limit exceeded",
          retryAfterSeconds,
          limits: {
            requestsPerMinute: MAX_REQUESTS_PER_MINUTE,
            eventsPerMinute: MAX_EVENTS_PER_MINUTE,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            ...rateLimitHeaders({ remainingRequests: 0, remainingEvents: 0 }, resetAt),
          },
        },
      );
    }

    return Response.json({
      accepted: result.inserted.count,
      duplicates: parsed.data.events.length - result.inserted.count,
    }, {
      status: 202,
      headers: rateLimitHeaders(result.quota, resetAt),
    });
  } catch {
    return Response.json({ error: "Event ingestion failed" }, { status: 500 });
  }
}
