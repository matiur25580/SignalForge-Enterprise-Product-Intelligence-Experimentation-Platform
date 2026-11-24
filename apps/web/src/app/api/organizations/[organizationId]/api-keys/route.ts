import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";
import { generateApiKey } from "@/lib/api-keys";
import { clientAddressFromHeaders, consumeSharedRateLimit, API_KEY_CREATE_RATE_LIMIT, rateLimitResponse } from "@/lib/auth-rate-limit";

type RouteContext = { params: Promise<{ organizationId: string }> };

const createApiKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
  projectId: z.string().cuid().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId);
    const apiKeys = await prisma.apiKey.findMany({
      where: { organizationId },
      select: {
        id: true, name: true, keyPrefix: true, projectId: true,
        lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ apiKeys });
  } catch (error) {
    return apiError(error);
  }
}

// Restrict key creation to organization owners/admins and record the creation in the audit log.
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    let limit;
    try {
      limit = await consumeSharedRateLimit(`api-key:create:${organizationId}:${user.id}:ip:${clientAddressFromHeaders(request.headers)}`, API_KEY_CREATE_RATE_LIMIT);
    } catch {
      return Response.json({ error: "API key creation is temporarily unavailable" }, { status: 503 });
    }
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, limit.limit);
    const input = createApiKeySchema.parse(await request.json());

    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId },
        select: { id: true },
      });
      if (!project) {
        return Response.json({ error: "Project does not belong to this organization" }, { status: 404 });
      }
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return Response.json({ error: "Expiration must be in the future" }, { status: 400 });
    }

    const generated = generateApiKey();
    const apiKey = await prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          organizationId, projectId: input.projectId, name: input.name,
          keyPrefix: generated.keyPrefix, keyHash: generated.keyHash, expiresAt,
        },
        select: {
          id: true, name: true, keyPrefix: true, projectId: true,
          expiresAt: true, createdAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId, actorId: user.id, action: "api_key.created",
          resourceType: "api_key", resourceId: created.id,
          metadata: { keyPrefix: created.keyPrefix, projectId: created.projectId },
        },
      });
      return created;
    });

    return Response.json({
      apiKey: {
        ...apiKey,
        secret: generated.rawKey,
        warning: "Copy this secret now. It will not be shown again.",
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid API key details", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return Response.json({ error: "Unable to create API key" }, { status: 409 });
    }
    return apiError(error);
  }
}
