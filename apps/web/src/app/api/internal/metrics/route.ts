import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.OBSERVABILITY_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 32 || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function metric(name: string, help: string, value: number) {
  return `# HELP signalforge_${name} ${help}\n# TYPE signalforge_${name} gauge\nsignalforge_${name} ${value}\n`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return new Response("Unauthorized\n", {
      status: 401,
      headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const [organizations, projects, events, activeApiKeys, openSecurityAlerts] = await Promise.all([
      prisma.organization.count(),
      prisma.project.count(),
      prisma.event.count(),
      prisma.apiKey.count({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
      prisma.securityAlert.count({ where: { status: "OPEN" } }),
    ]);
    const body = [
      metric("organizations_total", "Total organizations stored.", organizations),
      metric("projects_total", "Total projects stored.", projects),
      metric("events_total", "Total ingested events stored.", events),
      metric("api_keys_active", "API keys that are not revoked or expired.", activeApiKeys),
      metric("security_alerts_open", "Currently open security alerts.", openSecurityAlerts),
    ].join("");
    return new Response(body, {
      status: 200,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
    });
  } catch {
    return new Response("Metrics temporarily unavailable\n", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
