import { Prisma } from "@prisma/client";

export const INGESTION_LIMITS = {
  requestsPerMinute: 120,
  eventsPerMinute: 10_000,
  windowMs: 60_000,
} as const;

export type IngestionQuotaState = {
  remainingRequests: number;
  remainingEvents: number;
};

export type IngestionQuotaLimits = {
  requestsPerMinute: number;
  eventsPerMinute: number;
};

/**
 * Atomically reserves request and event capacity for one API key.
 * Must be called inside the same transaction as event persistence so a failed
 * ingestion rolls the reservation back as well.
 */
export async function reserveIngestionQuota(
  tx: Prisma.TransactionClient,
  apiKeyId: string,
  eventCount: number,
  receivedAt: Date,
  limits: IngestionQuotaLimits = INGESTION_LIMITS,
): Promise<IngestionQuotaState | null> {
  const windowStart = new Date(
    Math.floor(receivedAt.getTime() / INGESTION_LIMITS.windowMs) * INGESTION_LIMITS.windowMs,
  );

  const rows = await tx.$queryRaw<IngestionQuotaState[]>(Prisma.sql`
    INSERT INTO "IngestionRateLimit"
      ("apiKeyId", "windowStart", "requestCount", "eventCount", "updatedAt")
    VALUES
      (${apiKeyId}, ${windowStart}, 1, ${eventCount}, ${receivedAt})
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
        AND "IngestionRateLimit"."requestCount" < ${limits.requestsPerMinute}
        AND "IngestionRateLimit"."eventCount" + EXCLUDED."eventCount" <= ${limits.eventsPerMinute}
      )
    RETURNING
      ${limits.requestsPerMinute} - "requestCount" AS "remainingRequests",
      ${limits.eventsPerMinute} - "eventCount" AS "remainingEvents"
  `);

  return rows[0] ?? null;
}
