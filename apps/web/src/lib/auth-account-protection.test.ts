import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/auth-rate-limit", () => ({ consumeAuthRateLimit: mocks.consume }));

import { allowOAuthAccountSignIn } from "@/lib/auth-account-protection";

describe("OAuth account-level abuse protection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks a privacy-safe account-scoped bucket after GitHub authentication", async () => {
    mocks.consume.mockResolvedValue({ allowed: true });
    await expect(allowOAuthAccountSignIn("github", "github-account-123")).resolves.toBe(true);
    expect(mocks.consume).toHaveBeenCalledWith("account:github:github-account-123");
  });

  it("rejects accounts over the configured threshold", async () => {
    mocks.consume.mockResolvedValue({ allowed: false });
    await expect(allowOAuthAccountSignIn("github", "github-account-123")).resolves.toBe(false);
  });

  it("fails closed when account abuse storage is unavailable", async () => {
    mocks.consume.mockRejectedValue(new Error("database unavailable"));
    await expect(allowOAuthAccountSignIn("github", "github-account-123")).resolves.toBe(false);
  });

  it("does not apply GitHub account limits to other providers or missing account IDs", async () => {
    await expect(allowOAuthAccountSignIn("google", "provider-id")).resolves.toBe(true);
    await expect(allowOAuthAccountSignIn("github", undefined)).resolves.toBe(true);
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
