import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { SecurityAlerts } from "@/components/security-alerts";

export default async function OrganizationSecurityPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return notFound();
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    select: { role: true, organization: { select: { name: true, slug: true } } },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) return notFound();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <Link href="/" className="text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</Link>
        <Link href={`/organizations/${organizationId}/activity`} className="action-secondary">← Activity timeline</Link>
      </header>
      <div className="mb-8"><p className="eyebrow">Workspace / {membership.organization.slug} / Governance</p><h1 className="mt-3 text-4xl font-extrabold tracking-tight">Security alerts</h1><p className="mt-3 text-sm muted">{membership.organization.name} · Suspicious administrative activity</p></div>
      <SecurityAlerts organizationId={organizationId} />
    </main>
  );
}
