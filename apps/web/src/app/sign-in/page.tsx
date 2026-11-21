import { signIn } from "../../../auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientAddressFromHeaders, consumeAuthRateLimit } from "@/lib/auth-rate-limit";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo =
    callbackUrl?.startsWith("/") &&
    !callbackUrl.startsWith("//") &&
    !callbackUrl.includes("\\\\")
      ? callbackUrl
      : "/";
  const rateLimited = error === "rate_limit";

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <p className="font-mono text-xs tracking-[.2em] text-[var(--mint)]">SIGNALFORGE IDENTITY</p>
        <h1 className="mt-4 text-3xl font-extrabold">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Sign in with your GitHub account to access your organizations and product workspaces.
        </p>
        {rateLimited ? (
          <p role="alert" className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
            Too many sign-in attempts from this network. Please wait 15 minutes before trying again.
          </p>
        ) : null}
        <form className="mt-8" action={async () => {
          "use server";
          const requestHeaders = await headers();
          try {
            const result = await consumeAuthRateLimit(clientAddressFromHeaders(requestHeaders));
            if (!result.allowed) redirect("/sign-in?error=rate_limit");
          } catch (cause) {
            if (cause && typeof cause === "object" && "digest" in cause) throw cause;
            redirect("/sign-in?error=rate_limit");
          }
          await signIn("github", { redirectTo });
        }}>
          <button type="submit" disabled={rateLimited} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[#091020] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            Continue with GitHub
          </button>
        </form>
      </section>
    </main>
  );
}
