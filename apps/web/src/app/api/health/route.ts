import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", checks: { database: "ok" }, checkedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", checks: { database: "error" }, checkedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
