import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  currentToken: "current-session-token",
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => name === "authjs.session-token" ? { value: mocks.currentToken } : undefined,
  }),
}));
vi.mock("@/lib/tenant", () => ({
  requireUser: mocks.requireUser,
  apiError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { session: { findMany: mocks.findMany, deleteMany: mocks.deleteMany } },
}));

import { DELETE, GET } from "@/app/api/account/sessions/route";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe("account session management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentToken = "current-session-token";
    mocks.requireUser.mockResolvedValue({ id: "user_1" });
    mocks.findMany.mockResolvedValue([
      { sessionToken: "current-session-token", expires: new Date("2030-01-01T00:00:00.000Z") },
      { sessionToken: "other-session-token", expires: new Date("2030-02-01T00:00:00.000Z") },
    ]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("lists only the signed-in user's unexpired sessions without exposing raw tokens", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([
      expect.objectContaining({ id: digest("current-session-token"), isCurrent: true }),
      expect.objectContaining({ id: digest("other-session-token"), isCurrent: false }),
    ]);
    expect(JSON.stringify(body)).not.toContain("current-session-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user_1", expires: expect.any(Object) } }));
  });

  it("revokes a different session owned by the signed-in user", async () => {
    const response = await DELETE(new Request("http://localhost/api/account/sessions", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: digest("other-session-token") }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { sessionToken: "other-session-token", userId: "user_1" } });
  });

  it("does not allow the current session to be revoked remotely", async () => {
    const response = await DELETE(new Request("http://localhost/api/account/sessions", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: digest("current-session-token") }),
    }));
    expect(response.status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("does not revoke sessions belonging to another account or malformed identifiers", async () => {
    const missing = await DELETE(new Request("http://localhost/api/account/sessions", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: digest("unknown-session") }),
    }));
    const invalid = await DELETE(new Request("http://localhost/api/account/sessions", {
      method: "DELETE", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "not-a-session-id" }),
    }));
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
