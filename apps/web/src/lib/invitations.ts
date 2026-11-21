import { createHash, randomBytes } from "node:crypto";

export function generateInvitationToken() {
  const secret = `sf_inv_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    tokenHash: createHash("sha256").update(secret).digest("hex"),
  };
}

export function hashInvitationToken(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
