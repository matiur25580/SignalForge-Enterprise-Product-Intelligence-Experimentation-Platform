import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]).default("DEVELOPMENT"),
});

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId);
    const projects = await prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true, slug: true, environment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ projects });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const input = createProjectSchema.parse(await request.json());
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          organizationId,
          name: input.name,
          slug: input.slug,
          environment: input.environment,
        },
        select: { id: true, name: true, slug: true, environment: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "project.created",
          resourceType: "project",
          resourceId: created.id,
          metadata: { slug: created.slug, environment: created.environment },
        },
      });
      return created;
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid project details", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That project slug is already used in this organization" }, { status: 409 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    return apiError(error);
  }
}
