import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const SIGNALS = [
  { type: "API_KEY_BURST", severity: "HIGH", threshold: 5, actions: ["api_key.created", "api_key.rotated", "api_key.revoked"], summary: "Repeated API key lifecycle changes detected" },
  { type: "INVITATION_BURST", severity: "MEDIUM", threshold: 5, actions: ["organization.invitation.created", "organization.invitation.resent"], summary: "Unusually high invitation activity detected" },
  { type: "MEMBER_ADMIN_BURST", severity: "HIGH", threshold: 3, actions: ["organization.member.role_changed", "organization.member.role_updated", "organization.member.removed"], summary: "Repeated member access changes detected" },
] as const;

/**
 * Materializes deduplicated alerts from the tenant's recent audit trail.
 * This is deliberately audit-log based: only committed, successful actions count.
 */
export async function evaluateSecurityAlerts(organizationId: string, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_MS);
  const events = await prisma.auditLog.findMany({
    where: {
      organizationId,
      createdAt: { gte: since, lte: now },
      action: { in: [...SIGNALS.flatMap((signal) => signal.actions), "organization.ownership.transferred"] },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: { id: true, actorId: true, action: true, createdAt: true },
  });

  const grouped = new Map<string, typeof events>();
  for (const event of events) {
    const key = event.actorId ?? "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const candidates: Array<{
    type: string; severity: "MEDIUM" | "HIGH" | "CRITICAL"; actorId: string | null;
    fingerprint: string; summary: string; count: number; firstSeenAt: Date; lastSeenAt: Date;
  }> = [];

  for (const [actorKey, actorEvents] of grouped) {
    const actorId = actorKey === "unknown" ? null : actorKey;
    const ownership = actorEvents.filter((event) => event.action === "organization.ownership.transferred");
    if (ownership.length) {
      candidates.push({
        type: "OWNERSHIP_TRANSFER", severity: "CRITICAL", actorId,
        fingerprint: `OWNERSHIP_TRANSFER:${actorKey}`, summary: "Organization ownership was transferred",
        count: ownership.length, firstSeenAt: ownership[0].createdAt, lastSeenAt: ownership[ownership.length - 1].createdAt,
      });
    }
    for (const signal of SIGNALS) {
      const matches = actorEvents.filter((event) => (signal.actions as readonly string[]).includes(event.action));
      if (matches.length >= signal.threshold) {
        candidates.push({
          type: signal.type, severity: signal.severity, actorId,
          fingerprint: `${signal.type}:${actorKey}`, summary: signal.summary,
          count: matches.length, firstSeenAt: matches[0].createdAt, lastSeenAt: matches[matches.length - 1].createdAt,
        });
      }
    }
  }

  for (const candidate of candidates) {
    const existing = await prisma.securityAlert.findUnique({
      where: { organizationId_fingerprint: { organizationId, fingerprint: candidate.fingerprint } },
      select: { id: true, status: true, resolvedAt: true, lastSeenAt: true },
    });
    if (existing?.status === "RESOLVED" && existing.resolvedAt && candidate.lastSeenAt <= existing.resolvedAt) continue;
    await prisma.securityAlert.upsert({
      where: { organizationId_fingerprint: { organizationId, fingerprint: candidate.fingerprint } },
      create: {
        organizationId, actorId: candidate.actorId, type: candidate.type,
        severity: candidate.severity, fingerprint: candidate.fingerprint,
        summary: candidate.summary, occurrenceCount: candidate.count,
        firstSeenAt: candidate.firstSeenAt, lastSeenAt: candidate.lastSeenAt,
      },
      update: {
        actorId: candidate.actorId, severity: candidate.severity, summary: candidate.summary,
        occurrenceCount: candidate.count, lastSeenAt: candidate.lastSeenAt,
        ...(existing?.status === "RESOLVED" ? { status: "OPEN", resolvedAt: null } : {}),
      },
    });
  }

  return candidates.length;
}
