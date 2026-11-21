import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };
export const ORGANIZATION_CREATE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 3 };
export const PROJECT_CREATE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 20 };
export const API_KEY_CREATE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 10 };
export const INVITATION_CREATE_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 10 };
export const MEMBER_MUTATION_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 30 };
type RateLimitRow = { requestCount: number; windowStartedAt: Date };

export function hashRateLimitSubject(subject: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required for rate limiting");
  }
  return createHash("sha256")
    .update(secret ?? "local-development-auth-rate-limit-salt")
    .update(":")
    .update(subject)
    .digest("hex");
}

export function hashClientAddress(address: string) {
  return hashRateLimitSubject(`ip:${address}`);
}

/** Shared fixed-window limiter; only a keyed digest of the subject is persisted. */
export async function consumeSharedRateLimit(
  subject: string,
  policy: { windowMs: number; maxAttempts: number },
  now = new Date(),
) {
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1 ||
      !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new Error("Invalid rate limit policy");
  }
  const key = hashRateLimitSubject(subject);
  const windowCutoff = new Date(now.getTime() - policy.windowMs);
  const expiresAt = new Date(now.getTime() + policy.windowMs * 2);
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    WITH cleanup AS (
      DELETE FROM "AuthRateLimit"
      WHERE "expiresAt" <= ${now} AND "key" <> ${key}
    )
    INSERT INTO "AuthRateLimit" ("key", "windowStartedAt", "requestCount", "expiresAt")
    VALUES (${key}, ${now}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStartedAt" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${windowCutoff} THEN ${now}
        ELSE "AuthRateLimit"."windowStartedAt"
      END,
      "requestCount" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${windowCutoff} THEN 1
        ELSE "AuthRateLimit"."requestCount" + 1
      END,
      "expiresAt" = ${expiresAt}
    RETURNING "requestCount", "windowStartedAt"
  `;
  const row = rows[0];
  if (!row) throw new Error("Rate limiter did not return a result");
  const allowed = row.requestCount <= policy.maxAttempts;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((row.windowStartedAt.getTime() + policy.windowMs - now.getTime()) / 1000),
  );
  return {
    allowed,
    limit: policy.maxAttempts,
    remaining: Math.max(0, policy.maxAttempts - row.requestCount),
    retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
  };
}

export function consumeAuthRateLimit(subject: string, now = new Date()) {
  return consumeSharedRateLimit(subject, AUTH_RATE_LIMIT, now);
}

export function clientAddressFromHeaders(headers: Headers) {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimitResponse(retryAfterSeconds: number, limit: number) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
