import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizations: vi.fn(),
  evaluate: vi.fn(),
  claim: vi.fn(),
  alerts: vi.fn(),
  members: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findMany: mocks.organizations },
    securityAlert: { updateMany: mocks.claim, findMany: mocks.alerts },
    organizationMember: { findMany: mocks.members },
  },
}));
vi.mock("@/lib/security-alerts", () => ({ evaluateSecurityAlerts: mocks.evaluate }));
import { isAuthorizedSecurityMonitor, runSecurityMonitor } from "@/lib/security-monitor";

const now = new Date("2026-11-21T12:00:00.000Z");
const alert = {
  id: "alert_1", type: "API_KEY_BURST", severity: "HIGH",
  summary: "Repeated API key lifecycle changes detected", occurrenceCount: 5,
};

describe("security monitor notification claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("SECURITY_ALERT_SLACK_WEBHOOK_URL", "https://hooks.example.test/slack");
    mocks.organizations.mockResolvedValue([{ id: "org_1", name: "Acme" }]);
    mocks.evaluate.mockResolvedValue(1);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.alerts.mockResolvedValue([alert]);
    mocks.members.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a notification only after atomically claiming eligible alerts", async () => {
    const result = await runSecurityMonitor(now);
    expect(result).toEqual({ organizationsEvaluated: 1, alertsNotified: 1 });
    expect(mocks.claim).toHaveBeenCalledTimes(2);
    expect(mocks.claim.mock.calls[0][0]).toMatchObject({
      where: expect.objectContaining({
        organizationId: "org_1",
        status: "OPEN",
        severity: { in: ["HIGH", "CRITICAL"] },
        AND: [{ OR: [{ notificationClaimedAt: null }, { notificationClaimedAt: { lt: expect.any(Date) } }] }],
      }),
      data: { notificationClaimedAt: now, notificationClaimToken: expect.any(String) },
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(mocks.claim.mock.calls[1][0].data).toEqual({
      lastNotifiedAt: now, notificationClaimedAt: null, notificationClaimToken: null,
    });
  });

  it("skips alerts already claimed by another monitor run", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    const result = await runSecurityMonitor(now);
    expect(result).toEqual({ organizationsEvaluated: 1, alertsNotified: 0 });
    expect(mocks.alerts).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("releases its claim when delivery fails so a later run can retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(runSecurityMonitor(now)).rejects.toThrow("SECURITY_SLACK_DELIVERY_FAILED");
    expect(mocks.claim).toHaveBeenCalledTimes(2);
    expect(mocks.claim.mock.calls[1][0]).toMatchObject({
      data: { notificationClaimedAt: null, notificationClaimToken: null },
    });
  });

  it("releases claims when no notification provider is configured", async () => {
    vi.stubEnv("SECURITY_ALERT_SLACK_WEBHOOK_URL", "");
    await expect(runSecurityMonitor(now)).resolves.toEqual({
      organizationsEvaluated: 1, alertsNotified: 0,
    });
    expect(mocks.claim).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});


describe("security monitor bearer authorization", () => {
  const secret = "a".repeat(40);

  beforeEach(() => {
    vi.stubEnv("SECURITY_MONITOR_SECRET", secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a valid Bearer token with the standard scheme separator", () => {
    const request = new Request("https://example.test/api/security-monitor", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(isAuthorizedSecurityMonitor(request)).toBe(true);
  });

  it("rejects a wrong token and a missing authorization header", () => {
    const wrongToken = new Request("https://example.test/api/security-monitor", {
      headers: { authorization: `Bearer ${"b".repeat(40)}` },
    });
    const missing = new Request("https://example.test/api/security-monitor");
    expect(isAuthorizedSecurityMonitor(wrongToken)).toBe(false);
    expect(isAuthorizedSecurityMonitor(missing)).toBe(false);
  });
});
