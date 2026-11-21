import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, requireUser } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function GET() {
  try {
    const user = await requireUser();
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true, createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({ organizations: memberships });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createOrganizationSchema.parse(await request.json());
    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name,
          slug: input.slug,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
        select: { id: true, name: true, slug: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: created.id,
          actorId: user.id,
          action: "organization.created",
          resourceType: "organization",
          resourceId: created.id,
        },
      });
      return created;
    });
    return Response.json({ organization }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid organization details", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That organization slug is already in use" }, { status: 409 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    return apiError(error);
  }
}
