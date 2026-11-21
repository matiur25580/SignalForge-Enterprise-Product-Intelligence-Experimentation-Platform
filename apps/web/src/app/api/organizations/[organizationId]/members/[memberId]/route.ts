
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";
import { clientAddressFromHeaders, consumeSharedRateLimit, MEMBER_MUTATION_RATE_LIMIT, rateLimitResponse } from "@/lib/auth-rate-limit";

type RouteContext = {
  params: Promise<{ organizationId: string; memberId: string }>;
};

const updateRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
}).strict();

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { organizationId, memberId } = await params;
    const { user, membership: actor } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    let limit;
    try {
      limit = await consumeSharedRateLimit(`member:mutate:${organizationId}:${user.id}:ip:${clientAddressFromHeaders(request.headers)}`, MEMBER_MUTATION_RATE_LIMIT);
    } catch {
      return Response.json({ error: "Member management is temporarily unavailable" }, { status: 503 });
    }
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, limit.limit);
    const input = updateRoleSchema.parse(await request.json());

    const target = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, userId: true, role: true },
    });
    if (!target) return Response.json({ error: "Organization member not found" }, { status: 404 });
    if (target.role === "OWNER") {
      return Response.json({ error: "Owner role changes require a dedicated ownership transfer workflow" }, { status: 409 });
    }
    if (actor.role !== "OWNER" && (target.role === "ADMIN" || input.role === "ADMIN")) {
      return Response.json({ error: "Only an owner can manage administrator roles" }, { status: 403 });
    }
    if (target.role === input.role) {
      return Response.json({ error: "Member already has this role" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.organizationMember.updateMany({
        where: { id: target.id, organizationId, role: target.role },
        data: { role: input.role },
      });
      if (updated.count !== 1) throw new Error("MEMBERSHIP_CHANGED");

      await tx.auditLog.create({
        data: {
          organizationId, actorId: user.id,
          action: "organization.member.role_changed",
          resourceType: "organization_member", resourceId: target.id,
          metadata: { previousRole: target.role, newRole: input.role, targetUserId: target.userId },
        },
      });
    });

    return Response.json({ success: true, memberId: target.id, role: input.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid member role", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "MEMBERSHIP_CHANGED") {
      return Response.json({ error: "Membership changed concurrently; refresh and retry" }, { status: 409 });
    }
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId, memberId } = await params;
    const { user, membership: actor } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const target = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, userId: true, role: true },
    });

    if (!target) return Response.json({ error: "Organization member not found" }, { status: 404 });
    if (target.role === "OWNER") {
      return Response.json({ error: "Owner removal requires a dedicated ownership transfer workflow" }, { status: 409 });
    }
    if (actor.role !== "OWNER" && target.role === "ADMIN") {
      return Response.json({ error: "Only an owner can remove an administrator" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      const removed = await tx.organizationMember.deleteMany({
        where: { id: target.id, organizationId, role: target.role },
      });
      if (removed.count !== 1) throw new Error("MEMBERSHIP_CHANGED");

      await tx.auditLog.create({
        data: {
          organizationId, actorId: user.id,
          action: "organization.member.removed",
          resourceType: "organization_member", resourceId: target.id,
          metadata: { removedRole: target.role, targetUserId: target.userId },
        },
      });
    });

    return Response.json({ success: true, memberId: target.id });
  } catch (error) {
    if (error instanceof Error && error.message === "MEMBERSHIP_CHANGED") {
      return Response.json({ error: "Membership changed concurrently; refresh and retry" }, { status: 409 });
    }
    return apiError(error);
  }
}
