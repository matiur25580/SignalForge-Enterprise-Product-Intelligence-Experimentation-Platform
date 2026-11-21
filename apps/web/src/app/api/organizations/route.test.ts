import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  consume: vi.fn(),
  create: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/auth-rate-limit", () => ({
  clientAddressFromHeaders: () => "203.0.113.10",
  consumeSharedRateLimit: mocks.consume,
  ORGANIZATION_CREATE_RATE_LIMIT: { windowMs: 3600000, maxAttempts: 3 },
  rateLimitResponse: (retry: number, limit: number) => Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retry), "X-RateLimit-Limit": String(limit) } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/organizations/route";

describe("organization creation abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.consume.mockResolvedValue({ allowed: true, limit: 3, remaining: 2, retryAfterSeconds: 0 });
    mocks.create.mockResolvedValue({ id: "org_1", name: "Acme", slug: "acme", createdAt: new Date() });
    mocks.auditCreate.mockResolvedValue({});
    const tx = { organization: { create: mocks.create }, auditLog: { create: mocks.auditCreate } };
    mocks.transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it("enforces the per-user and client-address policy before creating resources", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, limit: 3, remaining: 0, retryAfterSeconds: 1800 });
    const response = await POST(new Request("http://localhost/api/organizations", { method: "POST", body: JSON.stringify({ name: "Acme", slug: "acme" }) }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1800");
    expect(mocks.consume).toHaveBeenCalledWith("organization:create:user_1:ip:203.0.113.10", { windowMs: 3600000, maxAttempts: 3 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("fails closed if shared rate-limit storage is unavailable", async () => {
    mocks.consume.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(new Request("http://localhost/api/organizations", { method: "POST", body: JSON.stringify({ name: "Acme", slug: "acme" }) }));
    expect(response.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates and audits an organization when within quota", async () => {
    const response = await POST(new Request("http://localhost/api/organizations", { method: "POST", body: JSON.stringify({ name: "Acme", slug: "acme" }) }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });
});
