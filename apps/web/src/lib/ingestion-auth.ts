import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/api-keys";

export async function authenticateIngestionKey(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (sf_live_[A-Za-z0-9_-]+)$/);
  if (!match) {
    return { ok: false as const, status: 401, error: "A valid Bearer API key is required" };
  }

  const keyHash = hashApiKey(match[1]);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      expiresAt: true,
      revokedAt: true,
      organization: { select: { plan: true } },
    },
  });

  if (!apiKey || apiKey.revokedAt || (apiKey.expiresAt && apiKey.expiresAt <= new Date())) {
    return { ok: false as const, status: 401, error: "Invalid or inactive API key" };
  }

  return { ok: true as const, apiKey };
}
