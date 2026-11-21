import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/security-monitor", () => ({
  isAuthorizedSecurityMonitor: mocks.authorize,
  runSecurityMonitor: mocks.run,
}));
import { POST } from "@/app/api/internal/security-monitor/route";

describe("internal scheduled security monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockReturnValue(true);
    mocks.run.mockResolvedValue({ organizationsEvaluated: 2, alertsNotified: 1 });
  });

  it("rejects requests without the monitor secret", async () => {
    mocks.authorize.mockReturnValue(false);
    const response = await POST(new Request("https://example.test/api/internal/security-monitor", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("runs the monitor and returns aggregate counts without tenant details", async () => {
    const response = await POST(new Request("https://example.test/api/internal/security-monitor", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, organizationsEvaluated: 2, alertsNotified: 1,
    });
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it("does not leak provider or database errors", async () => {
    mocks.run.mockRejectedValue(new Error("provider secret must not leak"));
    const response = await POST(new Request("https://example.test/api/internal/security-monitor", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Security monitoring run failed" });
  });
});
