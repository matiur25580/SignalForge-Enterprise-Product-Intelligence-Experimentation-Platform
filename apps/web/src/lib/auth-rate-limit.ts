import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const AUTH_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 10 };
type RateLimitRow = { requestCount: number; windowStartedAt: Date };

export function hashRateLimitSubject(subject: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required for authentication rate limiting");
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

/** Shared fixed-window limiter; only a keyed digest of the client address is persisted. */
export async function consumeAuthRateLimit(subject: string, now = new Date()) {
  const key = hashRateLimitSubject(subject);
  const expiresAt = new Date(now.getTime() + AUTH_RATE_LIMIT.windowMs * 2);
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "AuthRateLimit" ("key", "windowStartedAt", "requestCount", "expiresAt")
    VALUES (${key}, ${now}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStartedAt" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${now} - INTERVAL '15 minutes' THEN ${now}
        ELSE "AuthRateLimit"."windowStartedAt"
      END,
      "requestCount" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= ${now} - INTERVAL '15 minutes' THEN 1
        ELSE "AuthRateLimit"."requestCount" + 1
      END,
      "expiresAt" = ${expiresAt}
    RETURNING "requestCount", "windowStartedAt"
  `;
  const row = rows[0];
  if (!row) throw new Error("Authentication rate limiter did not return a result");
  const allowed = row.requestCount <= AUTH_RATE_LIMIT.maxAttempts;
  const retryAfterSeconds = Math.max(1, Math.ceil((row.windowStartedAt.getTime() + AUTH_RATE_LIMIT.windowMs - now.getTime()) / 1000));
  return { allowed, limit: AUTH_RATE_LIMIT.maxAttempts, remaining: Math.max(0, AUTH_RATE_LIMIT.maxAttempts - row.requestCount), retryAfterSeconds: allowed ? 0 : retryAfterSeconds };
}

export function clientAddressFromHeaders(headers: Headers) {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}