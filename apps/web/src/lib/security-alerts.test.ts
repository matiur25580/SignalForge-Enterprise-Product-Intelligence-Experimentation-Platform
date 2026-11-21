import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { findMany: mocks.findMany }, securityAlert: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));
import { evaluateSecurityAlerts } from "@/lib/security-alerts";

describe("security signal evaluation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([]); mocks.findUnique.mockResolvedValue(null); mocks.upsert.mockResolvedValue({}); });

  it("creates a high severity alert after repeated API-key lifecycle events", async () => {
    const now = new Date("2026-11-21T12:00:00.000Z");
    mocks.findMany.mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({
      id: String(index), actorId: "user_1", action: "api_key.created",
      createdAt: new Date(now.getTime() - (5 - index) * 60_000),
    })));
    const count = await evaluateSecurityAlerts("org_alpha", now);
    expect(count).toBe(1);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org_alpha" }), take: 500,
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: "API_KEY_BURST", severity: "HIGH", occurrenceCount: 5 }),
    }));
  });

  it("detects ownership transfers immediately as critical", async () => {
    const now = new Date("2026-11-21T12:00:00.000Z");
    mocks.findMany.mockResolvedValue([{ id: "audit_1", actorId: "owner_1", action: "organization.ownership.transferred", createdAt: now }]);
    await evaluateSecurityAlerts("org_alpha", now);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: "OWNERSHIP_TRANSFER", severity: "CRITICAL" }),
    }));
  });

  it("deduplicates by organization and actor, and does not reopen an alert without newer evidence", async () => {
    const now = new Date("2026-11-21T12:00:00.000Z");
    const lastSeenAt = new Date(now.getTime() - 60_000);
    mocks.findMany.mockResolvedValue([{ id: "audit_1", actorId: "user_1", action: "organization.ownership.transferred", createdAt: lastSeenAt }]);
    mocks.findUnique.mockResolvedValue({ id: "alert_1", status: "RESOLVED", resolvedAt: now, lastSeenAt });
    await evaluateSecurityAlerts("org_alpha", now);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not create alerts below the configured threshold", async () => {
    const now = new Date("2026-11-21T12:00:00.000Z");
    mocks.findMany.mockResolvedValue(Array.from({ length: 4 }, (_, index) => ({
      id: String(index), actorId: "user_1", action: "organization.invitation.created", createdAt: now,
    })));
    expect(await evaluateSecurityAlerts("org_alpha", now)).toBe(0);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
