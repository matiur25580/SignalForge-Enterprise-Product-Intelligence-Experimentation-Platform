import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { AccountSessions } from "@/components/account-sessions";

export default async function AccountSecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <Link href="/" className="text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</Link>
        <Link href="/" className="action-secondary">← Workspace</Link>
      </header>
      <div className="mb-8">
        <p className="eyebrow">Account / Security</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight">Account security</h1>
        <p className="mt-3 text-sm muted">Manage sign-ins connected to {session.user.email ?? "your account"}.</p>
      </div>
      <AccountSessions />
    </main>
  );
}
