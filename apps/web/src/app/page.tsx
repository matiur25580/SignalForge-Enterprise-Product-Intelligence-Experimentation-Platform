import Link from "next/link";
import { auth } from "../../auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent)] text-lg font-extrabold text-[#091020]">S</div>
          <div><p className="m-0 text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</p><p className="m-0 mt-1 text-xs muted">PRODUCT INTELLIGENCE PLATFORM</p></div>
        </div>
        <p className="eyebrow">Decision intelligence for product teams</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-extrabold leading-tight tracking-tight md:text-7xl">Turn product signals into <span className="text-[var(--accent)]">confident decisions.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 muted">A secure workspace for event intelligence, experimentation, product analytics, and evidence-led decisions.</p>
        <div className="mt-8"><Link className="action-primary inline-flex" href="/sign-in">Sign in with GitHub <span aria-hidden="true">↗</span></Link></div>
        <p className="mt-12 text-xs muted">Secure by design · Organization-scoped access · Auditable operations</p>
      </main>
    );
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { role: true, createdAt: true, organization: { select: { id: true, name: true, slug: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const organizations = memberships.map((item) => ({ ...item.organization, role: item.role, createdAt: item.createdAt.toISOString() }));

  return (
    <main className="mx-auto min-h-screen max-w-[1440px] px-6 py-8 md:px-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-lg font-extrabold text-[#091020]">S</div>
          <div><p className="m-0 text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</p><p className="m-0 mt-1 text-xs muted">PRODUCT INTELLIGENCE PLATFORM</p></div>
        </Link>
        <div className="flex items-center gap-3 text-sm muted"><span>{session.user?.name ?? session.user?.email}</span><Link href="/account/security" className="action-secondary">Account security</Link><Link href="/api/auth/signout" className="action-secondary">Sign out</Link></div>
      </header>
      <section className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_.6fr] lg:items-end">
        <div><p className="eyebrow">Your command center</p><h1 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">Good to see you<span className="text-[var(--mint)]">.</span></h1><p className="mt-4 max-w-2xl leading-7 muted">Manage your organizations, collaborate securely, and build a reliable product intelligence practice.</p></div>
        <aside className="panel p-5"><p className="eyebrow">Platform status</p><p className="mt-2 text-xl font-bold">Control plane ready</p><p className="mt-2 text-sm leading-6 muted">Analytics surfaces remain honest until real event and experiment data is connected.</p></aside>
      </section>
      <WorkspaceDashboard organizations={organizations} />
      <footer className="mt-12 border-t border-[var(--border)] py-6 text-xs muted">SignalForge · Evidence first. Metrics are never fabricated.</footer>
    </main>
  );
}
