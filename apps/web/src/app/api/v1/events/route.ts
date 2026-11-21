import { Prisma, ProjectEnvironment } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateIngestionKey } from "@/lib/ingestion-auth";

export const runtime = "nodejs";

const eventSchema = z.object({
  eventId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  eventName: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  timestamp: z.string().datetime().optional(),
  userId: z.string().trim().min(1).max(256).optional(),
  properties: z.record(z.string(), z.unknown()).default({}).refine(
    (value) => Object.keys(value).length <= 50,
    "At most 50 event properties are allowed",
  ),
}).strict();

const batchSchema = z.object({
  projectId: z.string().cuid(),
  events: z.array(eventSchema).min(1).max(100),
}).strict();

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 256 * 1024) {
    return Response.json({ error: "Request body exceeds the 256 KiB limit" }, { status: 413 });
  }

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid event batch", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const authentication = await authenticateIngestionKey(request);
    if (!authentication.ok) {
      return Response.json({ error: authentication.error }, { status: authentication.status });
    }

    const { apiKey } = authentication;
    if (apiKey.projectId && apiKey.projectId !== parsed.data.projectId) {
      return Response.json({ error: "API key is not authorized for this project" }, { status: 403 });
    }

    const project = await prisma.project.findFirst({
      where: {
        id: parsed.data.projectId,
        organizationId: apiKey.organizationId,
      },
      select: { id: true, environment: true },
    });
    if (!project) {
      return Response.json({ error: "Project not found for this API key" }, { status: 404 });
    }

    const receivedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const inserted = await tx.event.createMany({
        data: parsed.data.events.map((event) => ({
          projectId: project.id,
          apiKeyId: apiKey.id,
          eventId: event.eventId,
          eventName: event.eventName,
          occurredAt: event.timestamp ? new Date(event.timestamp) : receivedAt,
          userId: event.userId,
          properties: event.properties as Prisma.InputJsonValue,
          environment: project.environment as ProjectEnvironment,
          receivedAt,
        })),
        skipDuplicates: true,
      });

      await tx.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: receivedAt },
      });

      return inserted;
    });

    return Response.json({
      accepted: result.count,
      duplicates: parsed.data.events.length - result.count,
    }, { status: 202 });
  } catch {
    return Response.json({ error: "Event ingestion failed" }, { status: 500 });
  }
}
