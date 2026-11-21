import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  apiKeyFindMany: vi.fn(),
  projectFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireOrganizationMember: mocks.requireMember,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { count: mocks.count, groupBy: mocks.groupBy },
    apiKey: { findMany: mocks.apiKeyFindMany },
    project: { findMany: mocks.projectFindMany },
    $transaction: mocks.transaction,
  },
}));

import { GET } from "@/app/api/organizations/[organizationId]/usage/route";

const orgId = "org_demo";

describe("GET organization usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMember.mockResolvedValue({ user: { id: "user_1" }, membership: { role: "VIEWER" } });
    mocks.count.mockResolvedValue(42);
    mocks.groupBy
      .mockResolvedValueOnce([{ projectId: "project_1", _count: { _all: 42 } }])
      .mockResolvedValueOnce([{ apiKeyId: "key_1", _count: { _all: 40 } }]);
    mocks.apiKeyFindMany.mockResolvedValue([{
      id: "key_1", name: "Production", keyPrefix: "sf_live_abcd",
      projectId: "project_1", lastUsedAt: new Date("2026-11-21T10:00:00.000Z"), revokedAt: null,
    }]);
    mocks.projectFindMany.mockResolvedValue([{
      id: "project_1", name: "Storefront", slug: "storefront", environment: "PRODUCTION",
    }]);
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("returns organization-scoped event totals and per-project/API-key breakdowns", async () => {
    const response = await GET(new Request("http://localhost/api/organizations/org_demo/usage"), {
      params: Promise.resolve({ organizationId: orgId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalEvents).toBe(42);
    expect(body.projects[0]).toMatchObject({ project: { id: "project_1", name: "Storefront" }, events: 42 });
    expect(body.apiKeys[0]).toMatchObject({ id: "key_1", events: 40, keyPrefix: "sf_live_abcd" });
    expect(body.apiKeys[0]).not.toHaveProperty("keyHash");
    expect(mocks.requireMember).toHaveBeenCalledWith(orgId);
  });

  it("rejects malformed and inverted reporting ranges", async () => {
    const malformed = await GET(new Request("http://localhost/api/organizations/org_demo/usage?from=not-a-date"), {
      params: Promise.resolve({ organizationId: orgId }),
    });
    expect(malformed.status).toBe(400);

    const inverted = await GET(new Request("http://localhost/api/organizations/org_demo/usage?from=2026-11-20T00:00:00.000Z&to=2026-11-19T00:00:00.000Z"), {
      params: Promise.resolve({ organizationId: orgId }),
    });
    expect(inverted.status).toBe(400);
  });

  it("caps custom reporting windows at 90 days", async () => {
    const response = await GET(new Request("http://localhost/api/organizations/org_demo/usage?from=2026-01-01T00:00:00.000Z&to=2026-11-21T00:00:00.000Z"), {
      params: Promise.resolve({ organizationId: orgId }),
    });
    expect(response.status).toBe(400);
  });
});
