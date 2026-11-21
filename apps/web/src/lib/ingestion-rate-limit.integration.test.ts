import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { reserveIngestionQuota } from "@/lib/ingestion-rate-limit";

describe("reserveIngestionQuota (PostgreSQL integration)", () => {
  let organizationId: string;
  let apiKeyId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        name: "Rate limit integration test",
        slug: `rate-limit-test-${randomUUID()}`,
      },
    });
    organizationId = organization.id;

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        name: "Integration test key",
        keyPrefix: "sf_live_test",
        keyHash: randomUUID(),
      },
    });
    apiKeyId = apiKey.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  });

  it("enforces request limits atomically under concurrent transactions", async () => {
    const now = new Date();
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction((tx) =>
          reserveIngestionQuota(tx, apiKeyId, 1, now, {
            requestsPerMinute: 3,
            eventsPerMinute: 100,
          }),
        ),
      ),
    );

    expect(attempts.filter(Boolean)).toHaveLength(3);
    expect(attempts.filter((result) => result === null)).toHaveLength(5);
    expect(attempts.filter(Boolean).map((result) => result?.remainingRequests).sort())
      .toEqual([0, 1, 2]);
  });

  it("rejects a batch that would exceed the event quota without consuming it", async () => {
    const nextWindow = new Date(Date.now() + 120_000);
    const first = await prisma.$transaction((tx) =>
      reserveIngestionQuota(tx, apiKeyId, 4, nextWindow, {
        requestsPerMinute: 10,
        eventsPerMinute: 5,
      }),
    );
    const rejected = await prisma.$transaction((tx) =>
      reserveIngestionQuota(tx, apiKeyId, 2, nextWindow, {
        requestsPerMinute: 10,
        eventsPerMinute: 5,
      }),
    );

    expect(first).toMatchObject({ remainingRequests: 9, remainingEvents: 1 });
    expect(rejected).toBeNull();
  });
});
