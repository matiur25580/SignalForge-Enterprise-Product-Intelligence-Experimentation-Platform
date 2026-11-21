import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
import { GET } from "@/app/api/health/route";

describe("health endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports database readiness", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a sanitized degraded response when the database is unavailable", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("sensitive database connection details"));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ status: "degraded", checks: { database: "error" } });
    expect(JSON.stringify(body)).not.toContain("sensitive");
  });
});
