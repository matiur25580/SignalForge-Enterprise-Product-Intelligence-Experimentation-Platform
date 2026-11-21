import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

type RouteContext = { params: Promise<{ organizationId: string }> };

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 90;

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: "Invalid usage reporting range", details: parsed.error.flatten() }, { status: 400 });
    }

    const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
    const from = parsed.data.from ? new Date(parsed.data.from) : new Date(to.getTime() - 30 * DAY_MS);
    if (from >= to || to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      return Response.json({ error: "Usage range must be ordered and no longer than 90 days" }, { status: 400 });
    }

    const eventScope = {
      project: { organizationId },
      receivedAt: { gte: from, lt: to },
    };

    const [totalEvents, projectUsage, keyUsage, apiKeys] = await prisma.$transaction([
      prisma.event.count({ where: eventScope }),
      prisma.event.groupBy({
        by: ["projectId"],
        where: eventScope,
        _count: { _all: true },
        orderBy: { _count: { projectId: "desc" } },
      }),
      prisma.event.groupBy({
        by: ["apiKeyId"],
        where: { ...eventScope, apiKeyId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { apiKeyId: "desc" } },
      }),
      prisma.apiKey.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          projectId: true,
          lastUsedAt: true,
          revokedAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const projectIds = projectUsage.map((item) => item.projectId);
    const projects = await prisma.project.findMany({
      where: { id: { in: projectIds }, organizationId },
      select: { id: true, name: true, slug: true, environment: true },
    });
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const keyById = new Map(apiKeys.map((key) => [key.id, key]));

    return Response.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totalEvents,
      projects: projectUsage.map((item) => ({
        project: projectById.get(item.projectId) ?? { id: item.projectId, name: "Unknown project" },
        events: item._count._all,
      })),
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        projectId: key.projectId,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        events: keyUsage.find((item) => item.apiKeyId === key.id)?._count._all ?? 0,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
