import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

type RouteContext = { params: Promise<{ organizationId: string }> };

const transferSchema = z.object({
  targetMemberId: z.string().cuid(),
  confirmation: z.literal("TRANSFER OWNERSHIP"),
}).strict();

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER"]);
    const input = transferSchema.parse(await request.json());

    const target = await prisma.organizationMember.findFirst({
      where: { id: input.targetMemberId, organizationId },
      select: { id: true, userId: true, role: true },
    });
    if (!target) return Response.json({ error: "Target member not found in this organization" }, { status: 404 });
    if (target.userId === user.id || target.role === "OWNER") {
      return Response.json({ error: "Choose another active organization member" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      const demoted = await tx.organizationMember.updateMany({
        where: { organizationId, userId: user.id, role: "OWNER" },
        data: { role: "ADMIN" },
      });
      if (demoted.count !== 1) throw new Error("OWNERSHIP_CHANGED");

      const promoted = await tx.organizationMember.updateMany({
        where: { id: target.id, organizationId, userId: target.userId, role: target.role },
        data: { role: "OWNER" },
      });
      if (promoted.count !== 1) throw new Error("TARGET_MEMBERSHIP_CHANGED");

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: "organization.ownership.transferred",
          resourceType: "organization",
          resourceId: organizationId,
          metadata: {
            previousOwnerUserId: user.id,
            newOwnerUserId: target.userId,
            previousOwnerRole: "OWNER",
            newOwnerRole: target.role,
          },
        },
      });
    });

    return Response.json({ success: true, previousOwnerRole: "ADMIN", newOwnerUserId: target.userId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Ownership transfer requires a valid member and exact confirmation" }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof Error && (error.message === "OWNERSHIP_CHANGED" || error.message === "TARGET_MEMBERSHIP_CHANGED")) {
      return Response.json({ error: "Organization membership changed concurrently; refresh and retry" }, { status: 409 });
    }
    return apiError(error);
  }
}
