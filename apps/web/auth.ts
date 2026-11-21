import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: "database" },
  // Auth.js will issue __Secure-prefixed, Secure cookies in production.
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: { signIn: "/sign-in" },
  callbacks: {
    async signIn({ account }) {
      // Apply a second, account-scoped limit after GitHub has authenticated the identity.
      if (account?.provider === "github" && account.providerAccountId) {
        try {
          const result = await consumeAuthRateLimit(
            `account:${account.provider}:${account.providerAccountId}`,
          );
          return result.allowed;
        } catch {
          // Fail closed: never create a session when account abuse checks are unavailable.
          return false;
        }
      }
      return true;
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
