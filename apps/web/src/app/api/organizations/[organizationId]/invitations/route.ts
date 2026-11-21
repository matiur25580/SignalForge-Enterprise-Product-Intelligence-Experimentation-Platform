import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";
import { generateInvitationToken } from "@/lib/invitations";
import { sendOrganizationInvitationEmail } from "@/lib/invitation-email";
import { clientAddressFromHeaders, consumeSharedRateLimit, INVITATION_CREATE_RATE_LIMIT, rateLimitResponse } from "@/lib/auth-rate-limit";

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
    const { user, membership: actor } = await requireOrganizationMember(organizationId, ["OWNER", "ADMIN"]);
    let limit;
    try {
      limit = await consumeSharedRateLimit(`invitation:create:${organizationId}:${user.id}:ip:${clientAddressFromHeaders(request.headers)}`, INVITATION_CREATE_RATE_LIMIT);
    } catch {
      return Response.json({ error: "Invitation creation is temporarily unavailable" }, { status: 503 });
    }
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, limit.limit);
    const input = createInvitationSchema.parse(await request.json());
    if (actor.role !== "OWNER" && input.role === "ADMIN") {
      return Response.json({ error: "Only an owner can invite another administrator" }, { status: 403 });
    }

    const existingMember = await prisma.organizationMember.findFirst({
      where: { organizationId, user: { email: { equals: input.email, mode: "insensitive" } } },
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

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const baseUrl = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL;
    const acceptanceUrl = `${baseUrl?.replace(/\/$/, "") ?? "http://localhost:3000"}/invitations/accept?token=${encodeURIComponent(generated.secret)}`;

    try {
      const delivery = await sendOrganizationInvitationEmail({
        email: invitation.email,
        organizationName: organization?.name ?? "your organization",
        inviterName: user.name ?? user.email ?? "A SignalForge administrator",
        role: invitation.role,
        acceptanceUrl,
        expiresAt: invitation.expiresAt,
      });

      if (delivery.delivered) {
        return Response.json({
          invitation: { ...invitation, status: "PENDING", delivery: "EMAIL_SENT" },
        }, { status: 201 });
      }
    } catch {
      await prisma.$transaction(async (tx) => {
        await tx.organizationInvitation.updateMany({
          where: { id: invitation.id, tokenHash: generated.tokenHash, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            organizationId, actorId: user.id, action: "organization.invitation.email_delivery_failed",
            resourceType: "organization_invitation", resourceId: invitation.id,
            metadata: { email: invitation.email, provider: "resend" },
          },
        });
      });
      return Response.json({
        error: "Invitation email delivery failed. The invitation was invalidated; correct the email configuration and retry.",
        invitationId: invitation.id,
      }, { status: 502 });
    }

    return Response.json({
      invitation: {
        ...invitation,
        status: "PENDING",
        delivery: "MANUAL",
        acceptanceToken: generated.secret,
        acceptanceUrl,
        warning: "Email delivery is not configured. Share this single-use link securely; it will not be shown again.",
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
