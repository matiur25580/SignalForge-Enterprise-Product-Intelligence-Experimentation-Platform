import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: { findUnique },
  },
}));

import { authenticateIngestionKey } from "@/lib/ingestion-auth";
import { hashApiKey } from "@/lib/api-keys";

const rawKey = "sf_live_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

describe("authenticateIngestionKey", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("rejects a missing or malformed bearer token without querying the database", async () => {
    const missing = await authenticateIngestionKey(new Request("http://localhost"));
    const malformed = await authenticateIngestionKey(
      new Request("http://localhost", { headers: { authorization: "Basic abc" } }),
    );

    expect(missing).toMatchObject({ ok: false, status: 401 });
    expect(malformed).toMatchObject({ ok: false, status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("looks up the SHA-256 hash and accepts an active key", async () => {
    const apiKey = {
      id: "key_1",
      organizationId: "org_1",
      projectId: "project_1",
      expiresAt: null,
      revokedAt: null,
      organization: { plan: "FREE" },
    };
    findUnique.mockResolvedValue(apiKey);

    const result = await authenticateIngestionKey(
      new Request("http://localhost", {
        headers: { authorization: `Bearer ${rawKey}` },
      }),
    );

    expect(findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey(rawKey) },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        expiresAt: true,
        revokedAt: true,
        organization: { select: { plan: true } },
      },
    });
    expect(result).toEqual({ ok: true, apiKey });
  });

  it("rejects unknown, revoked, and expired keys", async () => {
    findUnique.mockResolvedValueOnce(null);
    const unknown = await authenticateIngestionKey(
      new Request("http://localhost", { headers: { authorization: `Bearer ${rawKey}` } }),
    );

    findUnique.mockResolvedValueOnce({
      id: "key_1", organizationId: "org_1", projectId: null,
      expiresAt: null, revokedAt: new Date(),
    });
    const revoked = await authenticateIngestionKey(
      new Request("http://localhost", { headers: { authorization: `Bearer ${rawKey}` } }),
    );

    findUnique.mockResolvedValueOnce({
      id: "key_1", organizationId: "org_1", projectId: null,
      expiresAt: new Date(Date.now() - 60_000), revokedAt: null,
    });
    const expired = await authenticateIngestionKey(
      new Request("http://localhost", { headers: { authorization: `Bearer ${rawKey}` } }),
    );

    expect(unknown).toMatchObject({ ok: false, status: 401 });
    expect(revoked).toMatchObject({ ok: false, status: 401 });
    expect(expired).toMatchObject({ ok: false, status: 401 });
  });
});
