import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireMember: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ requireOrganizationMember: mocks.requireMember, apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { findMany: mocks.findMany } } }));
import { GET } from "@/app/api/organizations/[organizationId]/activity/route";
const params = { params: Promise.resolve({ organizationId: "org_alpha" }) };

describe("organization activity feed", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.requireMember.mockResolvedValue({ user: { id: "user_1" }, membership: { role: "MEMBER" } }); mocks.findMany.mockResolvedValue([]); });
  it("requires membership and scopes the query to one organization", async () => {
    const response = await GET(new Request("http://localhost/api/organizations/org_alpha/activity"), params);
    expect(response.status).toBe(200);
    expect(mocks.requireMember).toHaveBeenCalledWith("org_alpha");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org_alpha" }, take: 51 }));
  });
  it("returns a bounded cursor page without exposing audit metadata", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ id: `clxxxxxxxxxxxxxxx00000000${index}`, action: "api_key.created", resourceType: "api_key", resourceId: "key_1", createdAt: new Date(), actor: { id: "user_1", name: "Analyst", image: null } }));
    mocks.findMany.mockResolvedValue(rows);
    const response = await GET(new Request("http://localhost/api/organizations/org_alpha/activity?limit=2"), params);
    const body = await response.json();
    expect(body.activity).toHaveLength(2); expect(body.hasMore).toBe(true); expect(body.nextCursor).toBe(rows[1].id);
    expect(body.activity[0]).not.toHaveProperty("metadata");
  });
  it("rejects invalid limits", async () => {
    const response = await GET(new Request("http://localhost/api/organizations/org_alpha/activity?limit=500"), params);
    expect(response.status).toBe(400); expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
