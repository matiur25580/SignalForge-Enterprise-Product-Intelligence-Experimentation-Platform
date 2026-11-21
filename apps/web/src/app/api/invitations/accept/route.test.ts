import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findInvitation: vi.fn(),
  findMembership: vi.fn(),
  updateInvitation: vi.fn(),
  createMembership: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationInvitation: { findUnique: mocks.findInvitation },
    organizationMember: { findUnique: mocks.findMembership },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/invitations", () => ({
  hashInvitationToken: () => "b".repeat(64),
}));

import { POST } from "@/app/api/invitations/accept/route";

function request(token = "sf_inv_valid_test_token_123456") {
  return new Request("http://localhost/api/invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

describe("POST /api/invitations/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_invited", email: "analyst@example.com" });
    mocks.findInvitation.mockResolvedValue({
      id: "invite_1", organizationId: "org_1", email: "analyst@example.com",
      role: "MEMBER", expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: null, revokedAt: null,
    });
    mocks.findMembership.mockResolvedValue(null);
    mocks.updateInvitation.mockResolvedValue({ count: 1 });
    mocks.createMembership.mockResolvedValue({ id: "member_1" });
    mocks.auditCreate.mockResolvedValue({});
    const tx = {
      organizationInvitation: { updateMany: mocks.updateInvitation },
      organizationMember: { create: mocks.createMembership },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("accepts an invitation for the authenticated email and creates membership atomically", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, organizationId: "org_1", role: "MEMBER" });
    expect(mocks.updateInvitation).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "invite_1", email: "analyst@example.com", acceptedAt: null, revokedAt: null }),
    }));
    expect(mocks.createMembership).toHaveBeenCalledWith({
      data: { organizationId: "org_1", userId: "user_invited", role: "MEMBER" },
    });
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects an invitation issued to another email address", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user_wrong", email: "other@example.com" });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects expired invitations", async () => {
    mocks.findInvitation.mockResolvedValue({
      id: "invite_1", organizationId: "org_1", email: "analyst@example.com",
      role: "MEMBER", expiresAt: new Date(Date.now() - 60_000),
      acceptedAt: null, revokedAt: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(410);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not accept the same invitation twice", async () => {
    mocks.findInvitation.mockResolvedValue({
      id: "invite_1", organizationId: "org_1", email: "analyst@example.com",
      role: "MEMBER", expiresAt: new Date(Date.now() + 60_000),
      acceptedAt: new Date(), revokedAt: null,
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
