import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationCount: vi.fn(), projectCount: vi.fn(), eventCount: vi.fn(),
  apiKeyCount: vi.fn(), alertCount: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { count: mocks.organizationCount },
    project: { count: mocks.projectCount },
    event: { count: mocks.eventCount },
    apiKey: { count: mocks.apiKeyCount },
    securityAlert: { count: mocks.alertCount },
  },
}));
import { GET } from "@/app/api/internal/metrics/route";

describe("protected Prometheus metrics endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OBSERVABILITY_TOKEN = "test-observability-token-that-is-long-enough";
    mocks.organizationCount.mockResolvedValue(2);
    mocks.projectCount.mockResolvedValue(4);
    mocks.eventCount.mockResolvedValue(120);
    mocks.apiKeyCount.mockResolvedValue(3);
    mocks.alertCount.mockResolvedValue(1);
  });

  it("rejects unauthenticated access", async () => {
    const response = await GET(new Request("https://example.test/api/internal/metrics"));
    expect(response.status).toBe(401);
    expect(mocks.eventCount).not.toHaveBeenCalled();
  });

  it("returns Prometheus gauges to authorized scrapers", async () => {
    const response = await GET(new Request("https://example.test/api/internal/metrics", {
      headers: { Authorization: `Bearer ${process.env.OBSERVABILITY_TOKEN}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain("signalforge_events_total 120");
    expect(body).toContain("signalforge_security_alerts_open 1");
  });

  it("fails safely if metric collection fails", async () => {
    mocks.eventCount.mockRejectedValue(new Error("database internals"));
    const response = await GET(new Request("https://example.test/api/internal/metrics", {
      headers: { Authorization: `Bearer ${process.env.OBSERVABILITY_TOKEN}` },
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database internals");
  });
});
