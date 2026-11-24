import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { apiError, requireUser } from "@/lib/tenant";

// Expose a one-way identifier for a session instead of returning its bearer credential.
function sessionId(sessionToken: string) {
  return createHash("sha256").update(sessionToken).digest("hex");
}

async function currentSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get("__Secure-authjs.session-token")?.value
    ?? cookieStore.get("authjs.session-token")?.value
    ?? null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const currentToken = await currentSessionToken();
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, expires: { gt: new Date() } },
      select: { sessionToken: true, expires: true },
      orderBy: { expires: "desc" },
    });

    return Response.json({
      sessions: sessions.map((session) => ({
        id: sessionId(session.sessionToken),
        expiresAt: session.expires.toISOString(),
        isCurrent: currentToken !== null && session.sessionToken === currentToken,
      })),
    }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const input = await request.json() as { sessionId?: unknown };
    if (typeof input.sessionId !== "string" || !/^[a-f0-9]{64}$/.test(input.sessionId)) {
      return Response.json({ error: "A valid session ID is required" }, { status: 400 });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: user.id, expires: { gt: new Date() } },
      select: { sessionToken: true },
    });
    const target = sessions.find((session) => sessionId(session.sessionToken) === input.sessionId);
    if (!target) return Response.json({ error: "Session not found" }, { status: 404 });

    const currentToken = await currentSessionToken();
    if (currentToken && target.sessionToken === currentToken) {
      return Response.json({ error: "The current session cannot be revoked here. Use Sign out instead." }, { status: 409 });
    }

    const deleted = await prisma.session.deleteMany({
      where: { sessionToken: target.sessionToken, userId: user.id },
    });
    if (deleted.count !== 1) return Response.json({ error: "Session is no longer available" }, { status: 404 });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    return apiError(error);
  }
}
