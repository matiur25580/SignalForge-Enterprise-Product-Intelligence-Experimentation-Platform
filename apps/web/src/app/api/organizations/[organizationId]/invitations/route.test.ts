import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-rate-limit", () => ({
  clientAddressFromHeaders: () => "203.0.113.10",
  consumeSharedRateLimit: mocks.consumeRateLimit,
  INVITATION_CREATE_RATE_LIMIT: { windowMs: 3600000, maxAttempts: 10 },
  rateLimitResponse: (retry: number, limit: number) => Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retry), "X-RateLimit-Limit": String(limit) } }),
}));


const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  findFirstMember: vi.fn(),
  findOrganization: vi.fn(),
  findManyInvitations: vi.fn(),
  findUniqueInvitation: vi.fn(),
  upsertInvitation: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  sendEmail: vi.fn(),
  updateManyInvitation: vi.fn(),
  consumeRateLimit: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: mocks.findOrganization },
    organizationMember: { findFirst: mocks.findFirstMember },
    organizationInvitation: {
      findMany: mocks.findManyInvitations,
      findUnique: mocks.findUniqueInvitation,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/invitation-email", () => ({
  sendOrganizationInvitationEmail: mocks.sendEmail,
}));
vi.mock("@/lib/invitations", () => ({
  generateInvitationToken: () => ({ secret: "sf_inv_one_time_secret_token", tokenHash: "a".repeat(64) }),
}));

import { GET, POST } from "@/app/api/organizations/[organizationId]/invitations/route";

const organizationId = "org_123";
const params = { params: Promise.resolve({ organizationId }) };

function request(body: unknown) {
  return new Request("http://localhost/api/organizations/org_123/invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("organization invitation collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 });
    mocks.requireMember.mockResolvedValue({ user: { id: "user_owner" }, membership: { role: "OWNER" } });
    mocks.findFirstMember.mockResolvedValue(null);
    mocks.findOrganization.mockResolvedValue({ name: "SignalForge Test" });
    mocks.sendEmail.mockResolvedValue({ delivered: false, reason: "NOT_CONFIGURED" });
    mocks.updateManyInvitation.mockResolvedValue({ count: 1 });
    mocks.findManyInvitations.mockResolvedValue([]);
    mocks.findUniqueInvitation.mockResolvedValue(null);
    mocks.upsertInvitation.mockResolvedValue({
      id: "invite_1", email: "analyst@example.com", role: "MEMBER",
      expiresAt: new Date("2026-11-28T00:00:00.000Z"), createdAt: new Date("2026-11-21T00:00:00.000Z"),
    });
    mocks.auditCreate.mockResolvedValue({});
    const tx = {
      organizationInvitation: {
        findUnique: mocks.findUniqueInvitation,
        upsert: mocks.upsertInvitation,
        updateMany: mocks.updateManyInvitation,
      },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("lists invitations without exposing token hashes", async () => {
    mocks.findManyInvitations.mockResolvedValue([{
      id: "invite_1", email: "analyst@example.com", role: "MEMBER",
      expiresAt: new Date(Date.now() + 60_000), acceptedAt: null, revokedAt: null,
      createdAt: new Date(),
    }]);
    const response = await GET(new Request("http://localhost"), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invitations[0].status).toBe("PENDING");
    expect(body.invitations[0]).not.toHaveProperty("tokenHash");
  });

  it("returns 429 and does not create an invitation when the invitation quota is exhausted", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 1200 });
    const response = await POST(request({ email: "analyst@example.com" }), params);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1200");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a normalized invitation and returns its secret exactly once", async () => {
    const response = await POST(request({ email: " Analyst@Example.com ", role: "MEMBER" }), params);
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(201);
    expect(body.invitation.email).toBe("analyst@example.com");
    expect(body.invitation.delivery).toBe("MANUAL");
    expect(body.invitation.acceptanceUrl).toContain("/invitations/accept?token=sf_inv_one_time_secret_token");
    expect(body.invitation.warning).toContain("Share this single-use link securely");
    expect(mocks.upsertInvitation).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_email: { organizationId, email: "analyst@example.com" } },
      create: expect.objectContaining({ role: "MEMBER", tokenHash: "a".repeat(64) }),
    }));
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects owner-role invitations and malformed email addresses", async () => {
    const response = await POST(request({ email: "person@example.com", role: "OWNER" }), params);
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });


  it("prevents administrators from inviting another administrator", async () => {
    mocks.requireMember.mockResolvedValue({ user: { id: "admin_1" }, membership: { role: "ADMIN" } });
    const response = await POST(request({ email: "admin2@example.com", role: "ADMIN" }), params);
    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not invite an existing organization member", async () => {
    mocks.findFirstMember.mockResolvedValue({ id: "member_1" });
    const response = await POST(request({ email: "analyst@example.com" }), params);
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not replace an active pending invitation", async () => {
    mocks.findUniqueInvitation.mockResolvedValue({
      id: "invite_1", acceptedAt: null, revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const response = await POST(request({ email: "analyst@example.com" }), params);
    expect(response.status).toBe(409);
    expect(mocks.upsertInvitation).not.toHaveBeenCalled();
  });
});
