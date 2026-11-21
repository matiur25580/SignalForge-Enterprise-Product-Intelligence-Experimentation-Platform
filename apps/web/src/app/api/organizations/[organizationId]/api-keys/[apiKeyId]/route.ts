import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-keys";
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


export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId, apiKeyId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const existing = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
      select: { id: true, name: true, projectId: true, keyPrefix: true, expiresAt: true, revokedAt: true },
    });

    if (!existing) return Response.json({ error: "API key not found" }, { status: 404 });
    if (existing.revokedAt) return Response.json({ error: "Revoked API keys cannot be rotated" }, { status: 409 });
    if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
      return Response.json({ error: "Expired API keys cannot be rotated. Create a replacement key instead." }, { status: 409 });
    }

    const generated = generateApiKey();
    const now = new Date();
    const replacement = await prisma.$transaction(async (tx) => {
      const revoked = await tx.apiKey.updateMany({
        where: { id: existing.id, organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) throw new Error("API_KEY_ROTATION_CONFLICT");

      const created = await tx.apiKey.create({
        data: {
          organizationId,
          projectId: existing.projectId,
          name: existing.name,
          keyPrefix: generated.keyPrefix,
          keyHash: generated.keyHash,
          expiresAt: existing.expiresAt,
        },
        select: { id: true, name: true, keyPrefix: true, projectId: true, expiresAt: true, createdAt: true },
      });

      await tx.auditLog.createMany({
        data: [
          {
            organizationId, actorId: user.id, action: "api_key.rotated",
            resourceType: "api_key", resourceId: existing.id,
            metadata: { keyPrefix: existing.keyPrefix, replacementApiKeyId: created.id },
          },
          {
            organizationId, actorId: user.id, action: "api_key.rotation_created",
            resourceType: "api_key", resourceId: created.id,
            metadata: { keyPrefix: created.keyPrefix, replacedApiKeyId: existing.id, projectId: created.projectId },
          },
        ],
      });
      return created;
    });

    return Response.json({
      apiKey: {
        ...replacement,
        secret: generated.rawKey,
        warning: "The previous key has been revoked. Copy this replacement secret now; it will not be shown again.",
      },
      revokedApiKeyId: existing.id,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "API_KEY_ROTATION_CONFLICT") {
      return Response.json({ error: "This API key was changed by another request. Refresh and try again." }, { status: 409 });
    }
    return apiError(error);
  }
}
