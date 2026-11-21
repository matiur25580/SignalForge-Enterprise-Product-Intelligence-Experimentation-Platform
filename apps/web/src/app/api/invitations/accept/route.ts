import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireUser } from "@/lib/tenant";
import { hashInvitationToken } from "@/lib/invitations";

const acceptSchema = z.object({
  token: z.string().min(20).max(128),
}).strict();

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      return Response.json({ error: "Your account must have an email address to accept invitations" }, { status: 403 });
    }

    const input = acceptSchema.parse(await request.json());
    const invitation = await prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(input.token) },
      select: {
        id: true, organizationId: true, email: true, role: true, tokenHash: true,
        expiresAt: true, acceptedAt: true, revokedAt: true,
      },
    });

    if (!invitation) return Response.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.email !== email) {
      return Response.json({ error: "This invitation was issued to a different email address" }, { status: 403 });
    }
    if (invitation.acceptedAt) {
      return Response.json({ error: "Invitation has already been accepted" }, { status: 409 });
    }
    if (invitation.revokedAt) {
      return Response.json({ error: "Invitation has been revoked" }, { status: 410 });
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      return Response.json({ error: "Invitation has expired" }, { status: 410 });
    }

    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (existingMembership) {
      return Response.json({ error: "You are already a member of this organization" }, { status: 409 });
    }

    const acceptedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.organizationInvitation.updateMany({
        where: {
          id: invitation.id,
          email,
          tokenHash: invitation.tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: acceptedAt },
        },
        data: { acceptedAt },
      });
      if (claimed.count !== 1) throw new Error("INVITATION_NOT_ACCEPTABLE");

      await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: user.id,
          action: "organization.invitation.accepted",
          resourceType: "organization_invitation",
          resourceId: invitation.id,
          metadata: { email, role: invitation.role },
        },
      });
    });

    return Response.json({
      success: true,
      organizationId: invitation.organizationId,
      role: invitation.role,
      acceptedAt: acceptedAt.toISOString(),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid invitation token", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVITATION_NOT_ACCEPTABLE") {
      return Response.json({ error: "Invitation is no longer available" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "You are already a member of this organization" }, { status: 409 });
    }
    return apiError(error);
  }
}
