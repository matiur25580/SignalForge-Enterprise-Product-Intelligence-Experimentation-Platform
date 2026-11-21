import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(), evaluate: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/security-alerts", () => ({ evaluateSecurityAlerts: mocks.evaluate }));
vi.mock("@/lib/prisma", () => ({ prisma: { securityAlert: { findMany: mocks.findMany, updateMany: mocks.updateMany } } }));

import { GET, POST } from "@/app/api/organizations/[organizationId]/security-alerts/route";
const context = { params: Promise.resolve({ organizationId: "org_alpha" }) };

describe("organization security alerts API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "user_1" }, membership: { role: "ADMIN" } });
    mocks.evaluate.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires an administrator and returns tenant-scoped, non-cacheable alerts", async () => {
    const response = await GET(new Request("http://localhost/api/organizations/org_alpha/security-alerts"), context);
    expect(response.status).toBe(200);
    expect(mocks.requireMember).toHaveBeenCalledWith("org_alpha", ["OWNER", "ADMIN"]);
    expect(mocks.evaluate).toHaveBeenCalledWith("org_alpha");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_alpha" }, take: 100 }));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not resolve an alert outside the organization", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await POST(new Request("http://localhost/api/organizations/org_alpha/security-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId: "c123456789012345678901234" }),
    }), context);
    expect(response.status).toBe(404);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "c123456789012345678901234", organizationId: "org_alpha", status: "OPEN" },
    }));
  });

  it("resolves only an open alert in the selected organization", async () => {
    const response = await POST(new Request("http://localhost/api/organizations/org_alpha/security-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId: "c123456789012345678901234" }),
    }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("RESOLVED");
  });

  it("rejects malformed resolve payloads", async () => {
    const response = await POST(new Request("http://localhost/api/organizations/org_alpha/security-alerts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId: "wrong" }),
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
