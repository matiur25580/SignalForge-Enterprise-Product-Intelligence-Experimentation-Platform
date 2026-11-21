import Link from "next/link";
import { auth } from "../../../../auth";
import { InvitationAcceptance } from "@/components/invitation-acceptance";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, session] = await Promise.all([searchParams, auth()]);
  const safeToken = token && token.length >= 20 && token.length <= 128 ? token : "";

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8">
        <p className="font-mono text-xs tracking-[.2em] text-[var(--mint)]">SIGNALFORGE WORKSPACE ACCESS</p>
        <h1 className="mt-4 text-3xl font-extrabold">Join your team</h1>
        {!safeToken ? (
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">This invitation link is missing or malformed. Ask your organization administrator to issue a new invitation.</p>
        ) : !session?.user?.id ? (
          <>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Sign in with the GitHub account whose email address received this invitation. The invitation will be checked against that account before access is granted.</p>
            <Link className="mt-7 inline-flex rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[#091020]" href={`/sign-in?callbackUrl=${encodeURIComponent(`/invitations/accept?token=${safeToken}`)}`}>Sign in to accept invitation</Link>
          </>
        ) : (
          <InvitationAcceptance token={safeToken} />
        )}
        <div className="mt-8 border-t border-[var(--border)] pt-5"><Link href="/" className="text-sm muted hover:text-white">← Back to SignalForge</Link></div>
      </section>
    </main>
  );
}
