import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { AUTH_RATE_LIMIT, clientAddressFromHeaders, consumeAuthRateLimit, hashClientAddress } from "@/lib/auth-rate-limit";

describe("authentication rate limiting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows attempts within the fixed window and returns remaining quota", async () => {
    mocks.queryRaw.mockResolvedValue([{ requestCount: 3, windowStartedAt: new Date("2026-11-21T10:00:00.000Z") }]);
    const result = await consumeAuthRateLimit("203.0.113.10", new Date("2026-11-21T10:01:00.000Z"));
    expect(result).toEqual({ allowed: true, limit: 10, remaining: 7, retryAfterSeconds: 0 });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it("blocks attempts after the configured maximum and supplies retry timing", async () => {
    mocks.queryRaw.mockResolvedValue([{ requestCount: 11, windowStartedAt: new Date("2026-11-21T10:00:00.000Z") }]);
    const result = await consumeAuthRateLimit("203.0.113.10", new Date("2026-11-21T10:01:00.000Z"));
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(14 * 60);
    expect(AUTH_RATE_LIMIT.maxAttempts).toBe(10);
  });

  it("hashes client addresses instead of exposing them in stored keys", () => {
    const first = hashClientAddress("203.0.113.10");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.10");
    expect(hashClientAddress("203.0.113.11")).not.toBe(first);
  });

  it("prefers the trusted real-IP header and safely falls back to forwarded-for", () => {
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.10");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.2" }))).toBe("198.51.100.1");
    expect(clientAddressFromHeaders(new Headers())).toBe("unknown");
  });
});
