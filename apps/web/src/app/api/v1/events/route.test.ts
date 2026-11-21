import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  createMany: vi.fn(),
  queryRaw: vi.fn(),
  updateApiKey: vi.fn(),
  transaction: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/ingestion-auth", () => ({
  authenticateIngestionKey: mocks.authenticate,
}));

import { POST } from "@/app/api/v1/events/route";

const projectId = "clxxxxxxxxxxxxxxxxxxxxxxxx";
const activeKey = {
  id: "key_1",
  organizationId: "org_1",
  projectId: null as string | null,
  expiresAt: null,
  revokedAt: null,
  organization: { plan: "FREE" as "FREE" | "PRO" | "ENTERPRISE" },
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBatch() {
  return {
    projectId,
    events: [{
      eventId: "evt-001",
      eventName: "checkout.completed",
      timestamp: "2026-11-21T06:30:00.000Z",
      userId: "user-123",
      properties: { currency: "INR", total: 1299 },
    }],
  };
}

describe("POST /api/v1/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ ok: true, apiKey: { ...activeKey } });
    mocks.projectFindFirst.mockResolvedValue({ id: projectId, environment: "PRODUCTION" });
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.queryRaw.mockResolvedValue([{ remainingRequests: 119, remainingEvents: 9_999 }]);
    mocks.updateApiKey.mockResolvedValue({});
    const tx = {
      event: { createMany: mocks.createMany },
      $queryRaw: mocks.queryRaw,
      apiKey: { update: mocks.updateApiKey },
    };
    mocks.transaction.mockImplementation(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );
  });

  it("accepts a valid batch, persists server-derived scope, and reports duplicates", async () => {
    mocks.createMany.mockResolvedValue({ count: 1 });
    const response = await POST(makeRequest(validBatch()));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toEqual({ accepted: 1, duplicates: 0 });
    expect(response.headers.get("x-ratelimit-limit")).toBe("120");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
    expect(response.headers.get("x-ratelimit-remaining-events")).toBe("9999");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: projectId, organizationId: "org_1" },
      select: { id: true, environment: true },
    });
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        projectId,
        apiKeyId: "key_1",
        eventId: "evt-001",
        environment: "PRODUCTION",
      })],
      skipDuplicates: true,
    });
    expect(mocks.updateApiKey).toHaveBeenCalledWith({
      where: { id: "key_1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });


  it("applies the higher request and event limits for a Pro organization", async () => {
    mocks.authenticate.mockResolvedValue({
      ok: true,
      apiKey: { ...activeKey, organization: { plan: "PRO" } },
    });
    mocks.queryRaw.mockResolvedValue([{ remainingRequests: 599, remainingEvents: 49_999 }]);
    const response = await POST(makeRequest(validBatch()));

    expect(response.status).toBe(202);
    expect(response.headers.get("x-ratelimit-limit")).toBe("600");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("599");
    expect(response.headers.get("x-ratelimit-remaining-events")).toBe("49999");
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns the number of duplicate event IDs skipped by storage", async () => {
    mocks.createMany.mockResolvedValue({ count: 0 });
    const response = await POST(makeRequest(validBatch()));
    expect(await response.json()).toEqual({ accepted: 0, duplicates: 1 });
  });


  it("returns 429 with retry metadata when the per-key quota is exhausted", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const response = await POST(makeRequest(validBatch()));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("Ingestion rate limit exceeded");
    expect(payload.limits).toEqual({ requestsPerMinute: 120, eventsPerMinute: 10_000 });
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.updateApiKey).not.toHaveBeenCalled();
  });

  it("rejects a project-bound key used against another project", async () => {
    mocks.authenticate.mockResolvedValue({
      ok: true,
      apiKey: { ...activeKey, projectId: "another_project" },
    });
    const response = await POST(makeRequest(validBatch()));

    expect(response.status).toBe(403);
    expect(mocks.projectFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not allow an organization key to cross organization boundaries", async () => {
    mocks.projectFindFirst.mockResolvedValue(null);
    const response = await POST(makeRequest(validBatch()));

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid and unknown event fields before authentication", async () => {
    const body = validBatch();
    const response = await POST(makeRequest({
      ...body,
      events: [{ ...body.events[0], unexpected: "not allowed" }],
    }));

    expect(response.status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/v1/events", {
      method: "POST",
      body: "{",
    }));
    expect(response.status).toBe(400);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("rejects request bodies above 256 KiB", async () => {
    const response = await POST(new Request("http://localhost/api/v1/events", {
      method: "POST",
      body: "x".repeat(256 * 1024 + 1),
    }));
    expect(response.status).toBe(413);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it("returns a generic server error when persistence fails", async () => {
    mocks.transaction.mockRejectedValue(new Error("database details must not leak"));
    const response = await POST(makeRequest(validBatch()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Event ingestion failed" });
  });
});
