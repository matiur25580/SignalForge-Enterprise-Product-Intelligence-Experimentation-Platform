import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { allowOAuthAccountSignIn } from "@/lib/auth-account-protection";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: "database" },
  // Auth.js will issue __Secure-prefixed, Secure cookies in production.
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: { signIn: "/sign-in" },
  callbacks: {
    async signIn({ account }) {
      return allowOAuthAccountSignIn(account?.provider, account?.providerAccountId);
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
