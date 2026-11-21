import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ organizationId: string }> };
const labels: Record<string, string> = {
  "organization.created": "created the workspace", "project.created": "created a project",
  "api_key.created": "created an API key", "api_key.revoked": "revoked an API key",
  "api_key.rotated": "rotated an API key", "organization.invitation.created": "sent a team invitation",
  "organization.invitation.resent": "resent a team invitation", "organization.invitation.accepted": "accepted a team invitation",
  "organization.invitation.revoked": "revoked a team invitation", "organization.member.role_updated": "updated a member role",
  "organization.member.removed": "removed a team member",
};

export default async function OrganizationActivityPage({ params }: Props) {
  const { organizationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return notFound();
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.user.id } },
    select: { organization: { select: { name: true, slug: true } } },
  });
  if (!membership) return notFound();
  const entries = await prisma.auditLog.findMany({
    where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
    select: { id: true, action: true, resourceType: true, createdAt: true, actor: { select: { name: true } } },
  });
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <Link href="/" className="text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</Link>
        <div className="flex gap-2"><Link href={`/organizations/${organizationId}/security`} className="action-secondary">Security alerts</Link><Link href={`/organizations/${organizationId}/team`} className="action-secondary">← Team & access</Link></div>
      </header>
      <div className="mb-8"><p className="eyebrow">Workspace / {membership.organization.slug} / Governance</p><h1 className="mt-3 text-4xl font-extrabold tracking-tight">Activity timeline</h1><p className="mt-3 text-sm muted">{membership.organization.name} · Recent administrative and security events</p></div>
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-bold">Recent activity</h2><span className="text-xs muted">Latest 50 events</span></div>
        {entries.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-12 text-center"><p className="font-semibold">No activity recorded yet</p><p className="mt-2 text-sm muted">Workspace changes and security events will appear here.</p></div> :
          <ol className="divide-y divide-[var(--border)]">{entries.map((entry) => <li key={entry.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-sm font-bold">A</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{entry.actor?.name ?? "Former or unavailable member"} <span className="font-normal muted">{labels[entry.action] ?? entry.action.replace(/[._]/g, " ")}</span></p>
              <p className="mt-1 text-xs muted">{entry.resourceType.replace(/_/g, " ")} · {entry.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</p></div>
          </li>)}</ol>}
      </section>
      <p className="mt-5 text-xs muted">This feed intentionally excludes raw audit metadata, credentials, invitation tokens, and event payloads. Use the activity API for cursor-based pagination.</p>
    </main>
  );
}
