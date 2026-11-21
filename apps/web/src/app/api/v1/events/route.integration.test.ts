import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-keys";
import { POST } from "@/app/api/v1/events/route";

describe("POST /api/v1/events (PostgreSQL integration)", () => {
  let organizationId = "";
  let otherOrganizationId = "";
  let projectId = "";
  let otherProjectId = "";
  let apiKeyId = "";
  let rawKey = "";

  beforeAll(async () => {
    const [organization, otherOrganization] = await Promise.all([
      prisma.organization.create({
        data: { name: "Ingestion integration", slug: `ingestion-${randomUUID()}` },
      }),
      prisma.organization.create({
        data: { name: "Other tenant integration", slug: `other-tenant-${randomUUID()}` },
      }),
    ]);
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;

    const [project, otherProject] = await Promise.all([
      prisma.project.create({
        data: {
          organizationId,
          name: "Ingestion project",
          slug: "ingestion",
          environment: "STAGING",
        },
      }),
      prisma.project.create({
        data: {
          organizationId: otherOrganizationId,
          name: "Other tenant project",
          slug: "other-tenant",
          environment: "PRODUCTION",
        },
      }),
    ]);
    projectId = project.id;
    otherProjectId = otherProject.id;

    const generated = generateApiKey();
    rawKey = generated.rawKey;
    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        projectId: null,
        name: "Integration ingestion key",
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash,
      },
    });
    apiKeyId = apiKey.id;
  });

  beforeEach(async () => {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: null, expiresAt: null, lastUsedAt: null },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    if (otherOrganizationId) {
      await prisma.organization.delete({ where: { id: otherOrganizationId } });
    }
  });

  function request(body: unknown) {
    return new Request("http://localhost/api/v1/events", {
      method: "POST",
      headers: {
        authorization: `Bearer ${rawKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  function batch(eventId: string, targetProjectId = projectId) {
    return {
      projectId: targetProjectId,
      events: [{
        eventId,
        eventName: "checkout.completed",
        timestamp: "2026-11-21T06:30:00.000Z",
        userId: "integration-user",
        properties: { currency: "INR", total: 1299 },
      }],
    };
  }

  it("authenticates a real hashed API key and persists events with server-derived scope", async () => {
    const eventId = `accepted-${randomUUID()}`;
    const response = await POST(request(batch(eventId)));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1, duplicates: 0 });

    const stored = await prisma.event.findUnique({
      where: { projectId_eventId: { projectId, eventId } },
    });
    expect(stored).toMatchObject({
      projectId,
      apiKeyId,
      eventId,
      eventName: "checkout.completed",
      environment: "STAGING",
      userId: "integration-user",
      properties: { currency: "INR", total: 1299 },
    });

    const usedKey = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    expect(usedKey?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("rejects revoked and expired credentials against PostgreSQL state", async () => {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
    const revoked = await POST(request(batch(`revoked-${randomUUID()}`)));
    expect(revoked.status).toBe(401);

    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: null, expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await POST(request(batch(`expired-${randomUUID()}`)));
    expect(expired.status).toBe(401);
  });

  it("prevents a key from ingesting into another organization's project", async () => {
    const response = await POST(request(batch(`cross-tenant-${randomUUID()}`, otherProjectId)));

    expect(response.status).toBe(404);
    expect(await prisma.event.count({ where: { projectId: otherProjectId } })).toBe(0);
  });

  it("is idempotent for repeated project-scoped event IDs", async () => {
    const eventId = `duplicate-${randomUUID()}`;
    const first = await POST(request(batch(eventId)));
    const second = await POST(request(batch(eventId)));

    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ accepted: 1, duplicates: 0 });
    expect(second.status).toBe(202);
    expect(await second.json()).toEqual({ accepted: 0, duplicates: 1 });
    expect(await prisma.event.count({ where: { projectId, eventId } })).toBe(1);
  });

  it("rejects invalid payloads before attempting database authentication", async () => {
    const response = await POST(request({
      ...batch(`invalid-${randomUUID()}`),
      unexpected: true,
    }));

    expect(response.status).toBe(400);
    expect(await prisma.event.count({ where: { projectId } })).toBe(0);
  });
});
