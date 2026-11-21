import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { evaluateSecurityAlerts } from "@/lib/security-alerts";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    await evaluateSecurityAlerts(organizationId);
    const alerts = await prisma.securityAlert.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { lastSeenAt: "desc" }],
      take: 100,
      select: {
        id: true, type: true, severity: true, status: true, summary: true,
        occurrenceCount: true, firstSeenAt: true, lastSeenAt: true, resolvedAt: true,
      },
    });
    return Response.json({ alerts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const input = z.object({ alertId: z.string().cuid() }).strict().parse(await request.json());
    const updated = await prisma.securityAlert.updateMany({
      where: { id: input.alertId, organizationId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    if (updated.count !== 1) return Response.json({ error: "Open security alert not found" }, { status: 404 });
    return Response.json({ success: true, alertId: input.alertId, status: "RESOLVED" });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid alert details" }, { status: 400 });
    if (error instanceof SyntaxError) return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    return apiError(error);
  }
}
