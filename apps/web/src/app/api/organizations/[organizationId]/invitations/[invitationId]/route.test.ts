import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  findInvitation: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationInvitation: { findFirst: mocks.findInvitation },
    $transaction: mocks.transaction,
  },
}));

import { DELETE } from "@/app/api/organizations/[organizationId]/invitations/[invitationId]/route";

const context = { params: Promise.resolve({ organizationId: "org_1", invitationId: "invite_1" }) };

describe("DELETE organization invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "admin_1" }, membership: { role: "ADMIN" } });
    mocks.findInvitation.mockResolvedValue({
      id: "invite_1", email: "analyst@example.com", role: "MEMBER",
      acceptedAt: null, revokedAt: null,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({});
    const tx = {
      organizationInvitation: { updateMany: mocks.updateMany },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("revokes a pending invitation and writes an audit event", async () => {
    const response = await DELETE(new Request("http://localhost"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, id: "invite_1" });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("does not allow revoking an accepted invitation", async () => {
    mocks.findInvitation.mockResolvedValue({
      id: "invite_1", email: "analyst@example.com", role: "MEMBER",
      acceptedAt: new Date(), revokedAt: null,
    });
    const response = await DELETE(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("handles a concurrent acceptance or revocation safely", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await DELETE(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
