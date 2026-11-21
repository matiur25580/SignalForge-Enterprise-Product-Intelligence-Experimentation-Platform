import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

export async function allowOAuthAccountSignIn(
  provider: string | undefined,
  providerAccountId: string | undefined,
) {
  if (provider !== "github" || !providerAccountId) return true;

  try {
    const result = await consumeAuthRateLimit(`account:${provider}:${providerAccountId}`);
    return result.allowed;
  } catch {
    return false;
  }
}
