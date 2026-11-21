import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "sf_live_";

export function generateApiKey() {
  const secret = randomBytes(32).toString("base64url");
  const rawKey = KEY_PREFIX + secret;
  const keyPrefix = rawKey.slice(0, 16);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  return { rawKey, keyPrefix, keyHash };
}

export function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}
