import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-rate-limit", () => ({
  clientAddressFromHeaders: () => "203.0.113.10",
  consumeSharedRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 30, remaining: 29, retryAfterSeconds: 0 }),
  MEMBER_MUTATION_RATE_LIMIT: { windowMs: 3600000, maxAttempts: 30 },
  rateLimitResponse: (retry: number, limit: number) => Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retry), "X-RateLimit-Limit": String(limit) } }),
}));


const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMember: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));

import { DELETE, PATCH } from "@/app/api/organizations/[organizationId]/members/[memberId]/route";

const context = { params: Promise.resolve({ organizationId: "org_1", memberId: "member_1" }) };

function patchRequest(role: string) {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

describe("organization member administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "owner_1" }, membership: { role: "OWNER" } });
    mocks.findFirst.mockResolvedValue({ id: "member_1", userId: "user_2", role: "MEMBER" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({});
    const tx = {
      organizationMember: { updateMany: mocks.updateMany, deleteMany: mocks.deleteMany },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("allows an owner to promote a member and audits the change", async () => {
    const response = await PATCH(patchRequest("ADMIN"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, role: "ADMIN" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "member_1", organizationId: "org_1", role: "MEMBER" },
      data: { role: "ADMIN" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("prevents admins from promoting members to administrator", async () => {
    mocks.requireMember.mockResolvedValue({ user: { id: "admin_1" }, membership: { role: "ADMIN" } });
    const response = await PATCH(patchRequest("ADMIN"), context);
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("prevents changing the owner role", async () => {
    mocks.findFirst.mockResolvedValue({ id: "member_1", userId: "owner_1", role: "OWNER" });
    const response = await PATCH(patchRequest("VIEWER"), context);
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows an owner to remove a non-owner member with an audit record", async () => {
    const response = await DELETE(new Request("http://localhost"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, memberId: "member_1" });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("prevents admins from removing another administrator", async () => {
    mocks.requireMember.mockResolvedValue({ user: { id: "admin_1" }, membership: { role: "ADMIN" } });
    mocks.findFirst.mockResolvedValue({ id: "member_1", userId: "admin_2", role: "ADMIN" });
    const response = await DELETE(new Request("http://localhost"), context);
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
