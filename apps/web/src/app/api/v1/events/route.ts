import { Prisma, ProjectEnvironment } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateIngestionKey } from "@/lib/ingestion-auth";
import { INGESTION_LIMITS, reserveIngestionQuota, type IngestionQuotaLimits } from "@/lib/ingestion-rate-limit";
import { getPlanIngestionLimits } from "@/lib/subscription-plans";
import { MAX_REQUEST_BODY_BYTES, readBoundedRequestBody } from "@/lib/bounded-request-body";

export const runtime = "nodejs";

const eventSchema = z.object({
  eventId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  eventName: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  timestamp: z.string().datetime().optional().refine(
    (value) => value === undefined || Date.parse(value) <= Date.now() + 5 * 60 * 1000,
    "Event timestamps cannot be more than five minutes in the future",
  ),
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

function rateLimitHeaders(state: RateLimitState, resetAt: Date, limits: IngestionQuotaLimits) {
  return {
    "X-RateLimit-Limit": String(limits.requestsPerMinute),
    "X-RateLimit-Remaining": String(state.remainingRequests),
    "X-RateLimit-Remaining-Events": String(state.remainingEvents),
    "X-RateLimit-Reset": String(Math.ceil(resetAt.getTime() / 1000)),
  };
}

export async function POST(request: Request) {
  const bodyResult = await readBoundedRequestBody(request, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "too_large") {
      return Response.json({ error: "Request body exceeds the 256 KiB limit" }, { status: 413 });
    }
    return Response.json({ error: "Request body must be readable UTF-8" }, { status: 400 });
  }

  let input: unknown;
  try {
    input = JSON.parse(bodyResult.body);
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
    const limits = getPlanIngestionLimits(apiKey.organization.plan);
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
      Math.floor(receivedAt.getTime() / INGESTION_LIMITS.windowMs) * INGESTION_LIMITS.windowMs,
    );
    const resetAt = new Date(windowStart.getTime() + INGESTION_LIMITS.windowMs);

    const result = await prisma.$transaction(async (tx) => {
      const quota = await reserveIngestionQuota(
        tx,
        apiKey.id,
        parsed.data.events.length,
        receivedAt,
        limits,
      );

      if (!quota) {
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

      return { limited: false as const, inserted, quota };
    });

    if (result.limited) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
      return Response.json(
        {
          error: "Ingestion rate limit exceeded",
          retryAfterSeconds,
          limits: {
            requestsPerMinute: limits.requestsPerMinute,
            eventsPerMinute: limits.eventsPerMinute,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            ...rateLimitHeaders({ remainingRequests: 0, remainingEvents: 0 }, resetAt, limits),
          },
        },
      );
    }

    return Response.json({
      accepted: result.inserted.count,
      duplicates: parsed.data.events.length - result.inserted.count,
    }, {
      status: 202,
      headers: rateLimitHeaders(result.quota, resetAt, limits),
    });
  } catch {
    return Response.json({ error: "Event ingestion failed" }, { status: 500 });
  }
}
