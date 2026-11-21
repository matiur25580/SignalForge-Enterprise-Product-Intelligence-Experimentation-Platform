import { signIn } from "../../../auth";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <p className="font-mono text-xs tracking-[.2em] text-[var(--mint)]">SIGNALFORGE IDENTITY</p>
        <h1 className="mt-4 text-3xl font-extrabold">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Sign in with your GitHub account to access your organizations and product workspaces.
        </p>
        <form className="mt-8" action={async () => {
          "use server";
          await signIn("github", { redirectTo: "/" });
        }}>
          <button type="submit" className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[#091020] transition hover:opacity-90">
            Continue with GitHub
          </button>
        </form>
      </section>
    </main>
  );
}
