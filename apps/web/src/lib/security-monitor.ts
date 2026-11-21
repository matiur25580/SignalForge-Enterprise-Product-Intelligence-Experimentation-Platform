import { randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { evaluateSecurityAlerts } from "@/lib/security-alerts";

const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000;
const NOTIFICATION_CLAIM_STALE_MS = 5 * 60 * 1000;

function secretMatches(expected: string, supplied: string | null) {
  if (!supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAuthorizedSecurityMonitor(request: Request) {
  const secret = process.env.SECURITY_MONITOR_SECRET;
  if (!secret || secret.length < 32) return false;
  return secretMatches(secret, request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? null);
}

async function sendNotifications(input: {
  organizationName: string;
  alerts: Array<{ type: string; severity: string; summary: string; occurrenceCount: number }>;
  recipients: string[];
}) {
  const lines = input.alerts.map((alert) => `[${alert.severity}] ${alert.summary} (${alert.occurrenceCount} events)`);
  const message = [`SignalForge security alerts for ${input.organizationName}`, "", ...lines].join("\\n");
  const tasks: Promise<void>[] = [];

  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM && input.recipients.length) {
    tasks.push((async () => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: input.recipients,
          subject: `[SignalForge] Security alerts — ${input.organizationName}`,
          text: message,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("SECURITY_EMAIL_DELIVERY_FAILED");
    })());
  }

  if (process.env.SECURITY_ALERT_SLACK_WEBHOOK_URL) {
    tasks.push((async () => {
      const response = await fetch(process.env.SECURITY_ALERT_SLACK_WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("SECURITY_SLACK_DELIVERY_FAILED");
    })());
  }

  if (!tasks.length) return false;
  await Promise.all(tasks);
  return true;
}

async function releaseNotificationClaim(organizationId: string, claimToken: string) {
  await prisma.securityAlert.updateMany({
    where: { organizationId, notificationClaimToken: claimToken },
    data: { notificationClaimedAt: null, notificationClaimToken: null },
  });
}

/** Called by a protected scheduler endpoint; atomic claims prevent overlapping runs from duplicating notifications. */
export async function runSecurityMonitor(now = new Date()) {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  let evaluated = 0;
  let notified = 0;

  for (const organization of organizations) {
    await evaluateSecurityAlerts(organization.id, now);
    evaluated += 1;

    const claimToken = randomUUID();
    const claim = await prisma.securityAlert.updateMany({
      where: {
        organizationId: organization.id,
        status: "OPEN",
        severity: { in: ["HIGH", "CRITICAL"] },
        OR: [
          { lastNotifiedAt: null },
          { lastNotifiedAt: { lt: new Date(now.getTime() - NOTIFICATION_COOLDOWN_MS) } },
        ],
        AND: [{
          OR: [
            { notificationClaimedAt: null },
            { notificationClaimedAt: { lt: new Date(now.getTime() - NOTIFICATION_CLAIM_STALE_MS) } },
          ],
        }],
      },
      data: { notificationClaimedAt: now, notificationClaimToken: claimToken },
    });
    if (!claim.count) continue;

    const alerts = await prisma.securityAlert.findMany({
      where: {
        organizationId: organization.id,
        status: "OPEN",
        notificationClaimToken: claimToken,
      },
      select: { id: true, type: true, severity: true, summary: true, occurrenceCount: true },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      take: 25,
    });
    if (!alerts.length) {
      await releaseNotificationClaim(organization.id, claimToken);
      continue;
    }

    try {
      const members = await prisma.organizationMember.findMany({
        where: { organizationId: organization.id, role: { in: ["OWNER", "ADMIN"] } },
        select: { user: { select: { email: true } } },
      });
      const recipients = [...new Set(members.map((member) => member.user.email).filter((email): email is string => Boolean(email)))];
      const delivered = await sendNotifications({ organizationName: organization.name, alerts, recipients });
      if (!delivered) {
        await releaseNotificationClaim(organization.id, claimToken);
        continue;
      }

      const result = await prisma.securityAlert.updateMany({
        where: { organizationId: organization.id, notificationClaimToken: claimToken, status: "OPEN" },
        data: { lastNotifiedAt: now, notificationClaimedAt: null, notificationClaimToken: null },
      });
      notified += result.count;
    } catch (error) {
      await releaseNotificationClaim(organization.id, claimToken);
      throw error;
    }
  }

  return { organizationsEvaluated: evaluated, alertsNotified: notified };
}
