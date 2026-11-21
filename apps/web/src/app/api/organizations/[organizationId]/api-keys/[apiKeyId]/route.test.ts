import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  auditCreateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findFirst: mocks.findFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/api-keys", () => ({
  generateApiKey: () => ({ rawKey: "sf_live_replacement_secret", keyPrefix: "sf_live_replacem", keyHash: "b".repeat(64) }),
}));

import { POST } from "@/app/api/organizations/[organizationId]/api-keys/[apiKeyId]/route";

const context = { params: Promise.resolve({ organizationId: "org_1", apiKeyId: "key_old" }) };

describe("API key rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "owner_1" }, membership: { role: "OWNER" } });
    mocks.findFirst.mockResolvedValue({
      id: "key_old", name: "Production", projectId: "project_1",
      keyPrefix: "sf_live_oldprefix", expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null,
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.create.mockResolvedValue({
      id: "key_new", name: "Production", keyPrefix: "sf_live_replacem",
      projectId: "project_1", expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(),
    });
    mocks.auditCreateMany.mockResolvedValue({ count: 2 });
    const tx = {
      apiKey: { updateMany: mocks.updateMany, create: mocks.create },
      auditLog: { createMany: mocks.auditCreateMany },
    };
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("atomically revokes the old key, preserves scope and expiry, and returns the replacement secret once", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), context);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.apiKey.secret).toBe("sf_live_replacement_secret");
    expect(body.revokedApiKeyId).toBe("key_old");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "key_old", organizationId: "org_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: "org_1", projectId: "project_1", name: "Production",
        keyHash: "b".repeat(64), expiresAt: expect.any(Date),
      }),
    }));
    expect(mocks.auditCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.auditCreateMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it("requires an owner or administrator", async () => {
    mocks.requireMember.mockRejectedValue(new Error("Forbidden"));
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not rotate a key from another organization or a missing key", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects already revoked keys", async () => {
    mocks.findFirst.mockResolvedValue({ id: "key_old", revokedAt: new Date(), expiresAt: null });
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects expired keys rather than silently extending their lifetime", async () => {
    mocks.findFirst.mockResolvedValue({ id: "key_old", revokedAt: null, expiresAt: new Date(Date.now() - 1) });
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("detects concurrent rotation and never creates a second credential", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(new Request("http://localhost"), context);
    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.auditCreateMany).not.toHaveBeenCalled();
  });
});
