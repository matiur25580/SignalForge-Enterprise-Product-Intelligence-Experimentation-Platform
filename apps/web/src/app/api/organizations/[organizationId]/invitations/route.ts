import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";
import { generateInvitationToken } from "@/lib/invitations";

type RouteContext = { params: Promise<{ organizationId: string }> };

const createInvitationSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId);
    const invitations = await prisma.organizationInvitation.findMany({
      where: { organizationId },
      select: {
        id: true, email: true, role: true, expiresAt: true,
        acceptedAt: true, revokedAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const now = Date.now();
    return Response.json({
      invitations: invitations.map((invitation) => ({
        ...invitation,
        status: invitation.acceptedAt
          ? "ACCEPTED"
          : invitation.revokedAt
            ? "REVOKED"
            : invitation.expiresAt.getTime() <= now
              ? "EXPIRED"
              : "PENDING",
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    const { user } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    const input = createInvitationSchema.parse(await request.json());

    const existingMember = await prisma.organizationMember.findFirst({
      where: { organizationId, user: { email: input.email } },
      select: { id: true },
    });
    if (existingMember) {
      return Response.json({ error: "This person is already an organization member" }, { status: 409 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const generated = generateInvitationToken();

    const invitation = await prisma.$transaction(async (tx) => {
      const existing = await tx.organizationInvitation.findUnique({
        where: { organizationId_email: { organizationId, email: input.email } },
        select: { id: true, acceptedAt: true, revokedAt: true, expiresAt: true },
      });

      if (existing && !existing.acceptedAt && !existing.revokedAt && existing.expiresAt > now) {
        throw new Error("INVITATION_ALREADY_PENDING");
      }

      const saved = await tx.organizationInvitation.upsert({
        where: { organizationId_email: { organizationId, email: input.email } },
        create: {
          organizationId, email: input.email, role: input.role,
          tokenHash: generated.tokenHash, expiresAt, invitedById: user.id,
        },
        update: {
          role: input.role, tokenHash: generated.tokenHash, expiresAt,
          acceptedAt: null, revokedAt: null, invitedById: user.id,
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId, actorId: user.id,
          action: existing ? "organization.invitation.resent" : "organization.invitation.created",
          resourceType: "organization_invitation", resourceId: saved.id,
          metadata: { email: saved.email, role: saved.role, expiresAt: expiresAt.toISOString() },
        },
      });
      return saved;
    });

    return Response.json({
      invitation: {
        ...invitation,
        status: "PENDING",
        acceptanceToken: generated.secret,
        warning: "Deliver this token securely. It is shown only once and is never stored in plaintext.",
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid invitation details", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVITATION_ALREADY_PENDING") {
      return Response.json({ error: "A pending invitation already exists for this email" }, { status: 409 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "An invitation already exists for this email" }, { status: 409 });
    }
    return apiError(error);
  }
}
