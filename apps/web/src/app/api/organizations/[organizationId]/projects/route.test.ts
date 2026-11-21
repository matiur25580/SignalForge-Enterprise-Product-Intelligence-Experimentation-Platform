import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  consume: vi.fn(),
  create: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/auth-rate-limit", () => ({
  clientAddressFromHeaders: () => "203.0.113.10",
  consumeSharedRateLimit: mocks.consume,
  PROJECT_CREATE_RATE_LIMIT: { windowMs: 3600000, maxAttempts: 20 },
  rateLimitResponse: (retry: number, limit: number) => Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retry), "X-RateLimit-Limit": String(limit) } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/organizations/[organizationId]/projects/route";

const context = { params: Promise.resolve({ organizationId: "org_1" }) };

describe("project creation abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "user_1" }, membership: { role: "ADMIN" } });
    mocks.consume.mockResolvedValue({ allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 0 });
    mocks.create.mockResolvedValue({ id: "project_1", name: "Storefront", slug: "storefront", environment: "DEVELOPMENT", createdAt: new Date() });
    mocks.auditCreate.mockResolvedValue({});
    const tx = { project: { create: mocks.create }, auditLog: { create: mocks.auditCreate } };
    mocks.transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it("limits project creation by organization, member, and client address", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, limit: 20, remaining: 0, retryAfterSeconds: 900 });
    const response = await POST(new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify({ name: "Storefront", slug: "storefront" }) }), context);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    expect(mocks.consume).toHaveBeenCalledWith("project:create:org_1:user_1:ip:203.0.113.10", { windowMs: 3600000, maxAttempts: 20 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("fails closed if rate-limit storage is unavailable", async () => {
    mocks.consume.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify({ name: "Storefront", slug: "storefront" }) }), context);
    expect(response.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates and audits a project when within quota", async () => {
    const response = await POST(new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify({ name: "Storefront", slug: "storefront" }) }), context);
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });
});
