import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, requireOrganizationMember } from "@/lib/tenant";

type RouteContext = { params: Promise<{ organizationId: string }> };
const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().cuid().optional() });

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { organizationId } = await params;
    await requireOrganizationMember(organizationId);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? undefined, cursor: url.searchParams.get("cursor") ?? undefined });
    if (!parsed.success) return Response.json({ error: "Invalid activity pagination parameters" }, { status: 400 });
    const { limit, cursor } = parsed.data;
    const entries = await prisma.auditLog.findMany({
      where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true, actor: { select: { id: true, name: true, image: true } } },
    });
    const hasMore = entries.length > limit;
    const page = hasMore ? entries.slice(0, limit) : entries;
    return Response.json({ activity: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null, hasMore }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
