import { auth } from "../../auth";
import { prisma } from "./prisma";
import type { OrganizationRole } from "@prisma/client";

export class AuthenticationError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have access to this resource") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new AuthenticationError();
  return session.user;
}

export async function requireOrganizationMember(
  organizationId: string,
  allowedRoles?: OrganizationRole[],
) {
  const user = await requireUser();
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId: user.id,
      },
    },
    select: { id: true, organizationId: true, userId: true, role: true },
  });

  if (!membership) throw new AuthorizationError();
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new AuthorizationError("Your organization role cannot perform this action");
  }

  return { user, membership };
}

export async function requireProjectMember(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      organizationId: true,
      name: true,
      slug: true,
      environment: true,
    },
  });

  if (!project) throw new AuthorizationError("Project not found");
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: project.organizationId,
        userId: user.id,
      },
    },
    select: { role: true },
  });

  if (!membership) throw new AuthorizationError();
  return { user, project, membership };
}

export function apiError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
