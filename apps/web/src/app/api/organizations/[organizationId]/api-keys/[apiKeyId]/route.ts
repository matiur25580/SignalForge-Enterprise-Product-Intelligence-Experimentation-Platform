import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

type RouteContext = {
  params: Promise<{ organizationId: string; apiKeyId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId, apiKeyId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const existing = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
      select: { id: true, revokedAt: true, keyPrefix: true },
    });

    if (!existing) return Response.json({ error: "API key not found" }, { status: 404 });
    if (existing.revokedAt) return Response.json({ error: "API key is already revoked" }, { status: 409 });

    const revokedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.apiKey.update({ where: { id: existing.id }, data: { revokedAt } });
      await tx.auditLog.create({
        data: {
          organizationId, actorId: user.id, action: "api_key.revoked",
          resourceType: "api_key", resourceId: existing.id,
          metadata: { keyPrefix: existing.keyPrefix },
        },
      });
    });

    return Response.json({ success: true, id: existing.id, revokedAt: revokedAt.toISOString() });
  } catch (error) {
    return apiError(error);
  }
}
