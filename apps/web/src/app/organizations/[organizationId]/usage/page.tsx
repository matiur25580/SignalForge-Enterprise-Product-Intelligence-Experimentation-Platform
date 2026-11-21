import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { UsageDashboard } from "@/components/usage-dashboard";

export default async function OrganizationUsagePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return notFound();
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    select: { role: true, organization: { select: { name: true, slug: true, plan: true } } },
  });
  if (!membership) return notFound();
  return <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 md:px-10">
    <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6"><Link href="/" className="text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</Link><Link href="/" className="action-secondary">← All workspaces</Link></header>
    <div className="mb-8"><p className="eyebrow">Workspace / {membership.organization.slug}</p><h1 className="mt-3 text-4xl font-extrabold tracking-tight">Usage & entitlements</h1><p className="mt-3 text-sm muted">{membership.organization.name} · Organization consumption and plan limits</p></div>
    <UsageDashboard organizationId={organizationId} planId={membership.organization.plan} />
  </main>;
}
