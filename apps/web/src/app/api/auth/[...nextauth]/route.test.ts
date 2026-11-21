import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  consume: vi.fn(),
  address: vi.fn(() => "203.0.113.10"),
}));

vi.mock("../../../../../auth", () => ({
  handlers: { GET: mocks.get, POST: mocks.post },
}));
vi.mock("@/lib/auth-rate-limit", () => ({
  clientAddressFromHeaders: mocks.address,
  consumeAuthRateLimit: mocks.consume,
}));

import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

describe("Auth.js sign-in route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(Response.json({ ok: true }));
    mocks.post.mockResolvedValue(Response.json({ ok: true }));
    mocks.consume.mockResolvedValue({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 });
  });

  it("rate limits direct GET OAuth initiation", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 120 });
    const response = await GET(new Request("https://example.test/api/auth/signin/github", { headers: { "x-real-ip": "203.0.113.10" } }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rate limits direct POST OAuth initiation", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 60 });
    const response = await POST(new Request("https://example.test/api/auth/signin/github", { method: "POST" }));
    expect(response.status).toBe(429);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("does not apply the sign-in limiter to OAuth callbacks", async () => {
    const response = await GET(new Request("https://example.test/api/auth/callback/github"));
    expect(response.status).toBe(200);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledOnce();
  });

  it("fails closed when the shared limiter is unavailable", async () => {
    mocks.consume.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(new Request("https://example.test/api/auth/signin/github", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
