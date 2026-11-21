import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInvitationToken, hashInvitationToken } from "@/lib/invitations";

describe("invitation token utilities", () => {
  it("generates high-entropy one-time tokens and stores only a SHA-256 digest", () => {
    const generated = generateInvitationToken();

    expect(generated.secret).toMatch(/^sf_inv_[A-Za-z0-9_-]{40,}$/);
    expect(generated.tokenHash).toBe(createHash("sha256").update(generated.secret).digest("hex"));
    expect(generated.tokenHash).toHaveLength(64);
    expect(generated.tokenHash).not.toContain(generated.secret);
    expect(hashInvitationToken(generated.secret)).toBe(generated.tokenHash);
  });

  it("generates a different token for every invitation", () => {
    expect(generateInvitationToken().secret).not.toBe(generateInvitationToken().secret);
  });
});
