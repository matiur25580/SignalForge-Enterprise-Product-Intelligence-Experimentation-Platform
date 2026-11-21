import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";

export default async function OrganizationBillingPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return notFound();
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    select: { role: true, organization: { select: { name: true, slug: true, plan: true } } },
  });
  if (!membership) return notFound();
  const current = SUBSCRIPTION_PLANS[membership.organization.plan];
  return <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 md:px-10">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6"><Link href="/" className="text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</Link><Link href="/" className="action-secondary">← All workspaces</Link></header>
    <div className="mb-8"><p className="eyebrow">Workspace / {membership.organization.slug}</p><h1 className="mt-3 text-4xl font-extrabold tracking-tight">Plan & billing</h1><p className="mt-3 text-sm muted">{membership.organization.name} · Subscription entitlement overview</p></div>
    <section className="panel p-6"><p className="eyebrow">Current subscription tier</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-extrabold">{current.name}</h2><p className="mt-2 text-sm muted">{current.description}</p></div><span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--mint)]">CURRENT PLAN</span></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-xs muted">Requests / key / min</p><p className="mt-2 text-2xl font-bold">{current.ingestion.requestsPerMinute.toLocaleString()}</p></div><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-xs muted">Events / key / min</p><p className="mt-2 text-2xl font-bold">{current.ingestion.eventsPerMinute.toLocaleString()}</p></div><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-xs muted">Projects</p><p className="mt-2 text-2xl font-bold">{current.includedProjects?.toLocaleString() ?? "Unlimited"}</p></div><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-xs muted">API keys</p><p className="mt-2 text-2xl font-bold">{current.includedApiKeys?.toLocaleString() ?? "Unlimited"}</p></div></div></section>
    <section className="mt-8"><div className="mb-5"><p className="eyebrow">Plan catalog</p><h2 className="mt-2 text-2xl font-bold">Compare platform tiers</h2></div><div className="grid gap-4 lg:grid-cols-3">{Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => <article key={id} className={`panel p-6 ${id === membership.organization.plan ? "border-[var(--accent)]" : ""}`}><div className="flex items-center justify-between gap-2"><h3 className="text-xl font-bold">{plan.name}</h3>{id === membership.organization.plan ? <span className="text-[10px] font-bold tracking-wider text-[var(--mint)]">ACTIVE</span> : null}</div><p className="mt-2 min-h-12 text-sm muted">{plan.description}</p><p className="mt-5 text-2xl font-extrabold">{id === "FREE" ? "Free" : "Contact sales"}</p><ul className="mt-5 space-y-3 text-sm muted"><li>• {plan.ingestion.requestsPerMinute.toLocaleString()} requests / key / min</li><li>• {plan.ingestion.eventsPerMinute.toLocaleString()} events / key / min</li><li>• {plan.includedProjects?.toLocaleString() ?? "Unlimited"} projects</li><li>• {plan.includedApiKeys?.toLocaleString() ?? "Unlimited"} API keys</li><li>• {plan.support} support</li></ul></article>)}</div></section>
    <section className="mt-8 rounded-xl border border-amber-300/20 bg-amber-300/5 p-5"><p className="font-semibold text-amber-100">Billing integrations are not enabled</p><p className="mt-2 text-sm leading-6 muted">Plan tiers and ingestion entitlements are enforced by the application. Checkout, payment collection, invoices, tax handling, subscription upgrades, and automated renewals are not implemented. No charges are being collected.</p></section>
  </main>;
}
