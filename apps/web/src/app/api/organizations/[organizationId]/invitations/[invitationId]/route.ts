import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

type RouteContext = {
  params: Promise<{ organizationId: string; invitationId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId, invitationId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const invitation = await prisma.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
      select: { id: true, email: true, role: true, acceptedAt: true, revokedAt: true },
    });

    if (!invitation) return Response.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.acceptedAt) {
      return Response.json({ error: "An accepted invitation cannot be revoked" }, { status: 409 });
    }
    if (invitation.revokedAt) {
      return Response.json({ error: "Invitation is already revoked" }, { status: 409 });
    }

    const revokedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const result = await tx.organizationInvitation.updateMany({
        where: {
          id: invitation.id,
          organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: { revokedAt },
      });
      if (result.count !== 1) throw new Error("INVITATION_NOT_PENDING");

      await tx.auditLog.create({
        data: {
          organizationId, actorId: user.id,
          action: "organization.invitation.revoked",
          resourceType: "organization_invitation", resourceId: invitation.id,
          metadata: { email: invitation.email, role: invitation.role },
        },
      });
    });

    return Response.json({ success: true, id: invitation.id, revokedAt: revokedAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_NOT_PENDING") {
      return Response.json({ error: "Only pending, unexpired invitations can be revoked" }, { status: 409 });
    }
    return apiError(error);
  }
}
