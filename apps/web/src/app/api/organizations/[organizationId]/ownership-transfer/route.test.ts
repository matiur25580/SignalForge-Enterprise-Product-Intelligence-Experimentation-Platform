import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: error instanceof Error && error.message.includes("role cannot") ? 403 : 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { organizationMember: { findFirst: mocks.findFirst }, $transaction: mocks.transaction },
}));

import { POST } from "@/app/api/organizations/[organizationId]/ownership-transfer/route";

const context = { params: Promise.resolve({ organizationId: "org_1" }) };
const body = { targetMemberId: "clh3am9q0000008l5g7f2p1x9", confirmation: "TRANSFER OWNERSHIP" };

describe("organization ownership transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "owner_1" }, membership: { role: "OWNER" } });
    mocks.findFirst.mockResolvedValue({ id: body.targetMemberId, userId: "user_2", role: "MEMBER" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({});
    const tx = {
      organizationMember: { updateMany: mocks.updateMany },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("transfers ownership atomically and records an audit event", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, previousOwnerRole: "ADMIN", newOwnerUserId: "user_2" });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, {
      where: { organizationId: "org_1", userId: "owner_1", role: "OWNER" }, data: { role: "ADMIN" },
    });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: body.targetMemberId, organizationId: "org_1", userId: "user_2", role: "MEMBER" }, data: { role: "OWNER" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "organization.ownership.transferred", actorId: "owner_1" }),
    }));
  });

  it("rejects non-owners before looking up the target", async () => {
    mocks.requireMember.mockRejectedValue(new Error("Your organization role cannot perform this action"));
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a member outside the organization", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires exact confirmation", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ...body, confirmation: "yes" }) }), context);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rolls back if the target membership changes concurrently", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(409);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
