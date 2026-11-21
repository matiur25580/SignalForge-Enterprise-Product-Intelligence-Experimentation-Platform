import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { AUTH_RATE_LIMIT, clientAddressFromHeaders, consumeAuthRateLimit, consumeSharedRateLimit, hashClientAddress, ORGANIZATION_CREATE_RATE_LIMIT, PROJECT_CREATE_RATE_LIMIT } from "@/lib/auth-rate-limit";

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

  it("supports separate operation policies without changing the auth policy", async () => {
    mocks.queryRaw.mockResolvedValue([{ requestCount: 4, windowStartedAt: new Date("2026-11-21T10:00:00.000Z") }]);
    const result = await consumeSharedRateLimit("organization:create:user_1", ORGANIZATION_CREATE_RATE_LIMIT, new Date("2026-11-21T10:01:00.000Z"));
    expect(result).toMatchObject({ allowed: false, limit: 3, remaining: 0 });
    expect(ORGANIZATION_CREATE_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000);
    expect(PROJECT_CREATE_RATE_LIMIT.maxAttempts).toBe(20);
  });

  it("rejects invalid rate-limit policies before touching storage", async () => {
    await expect(consumeSharedRateLimit("bad-policy", { windowMs: 0, maxAttempts: 1 })).rejects.toThrow("Invalid rate limit policy");
    expect(mocks.queryRaw).not.toHaveBeenCalled();
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
