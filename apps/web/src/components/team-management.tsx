"use client";

import { useCallback, useEffect, useState } from "react";

type Member = { id: string; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"; user: { id: string; name: string | null; email: string | null; image: string | null } };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string };
type Props = { organizationId: string; currentRole: string };

export function TeamManagement({ organizationId, currentRole }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [memberResponse, inviteResponse] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/members`, { cache: "no-store" }),
        fetch(`/api/organizations/${organizationId}/invitations`, { cache: "no-store" }),
      ]);
      const [memberBody, inviteBody] = await Promise.all([memberResponse.json(), inviteResponse.json()]);
      if (!memberResponse.ok) throw new Error(memberBody.error ?? "Could not load team members");
      if (!inviteResponse.ok) throw new Error(inviteBody.error ?? "Could not load invitations");
      setMembers(memberBody.members);
      setInvitations(inviteBody.invitations);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load team");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setToken("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitations`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create invitation");
      setToken(body.invitation.acceptanceUrl ?? body.invitation.acceptanceToken ?? "");
      setNotice(body.invitation.delivery === "EMAIL_SENT" ? "Invitation email sent successfully." : "Invitation created. Email is not configured; copy the one-time link and share it securely.");
      setEmail(""); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invitation");
    } finally { setBusy(false); }
  }

  async function memberAction(memberId: string, method: "PATCH" | "DELETE", nextRole?: string) {
    if (method === "DELETE" && !window.confirm("Remove this member from the organization?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/members/${memberId}`, {
        method, headers: method === "PATCH" ? { "content-type": "application/json" } : undefined,
        body: method === "PATCH" ? JSON.stringify({ role: nextRole }) : undefined,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Member action failed");
      setNotice(method === "DELETE" ? "Member removed." : "Member role updated.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Member action failed"); }
    finally { setBusy(false); }
  }


  async function transferOwnership(member: Member) {
    const confirmation = window.prompt(`Transfer workspace ownership to ${member.user.email ?? member.user.name ?? "this member"}? Type TRANSFER OWNERSHIP to confirm. The current owner will become an administrator.`);
    if (confirmation === null) return;
    if (confirmation !== "TRANSFER OWNERSHIP") {
      setError("Ownership transfer cancelled: confirmation text did not match.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/ownership-transfer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetMemberId: member.id, confirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Ownership transfer failed");
      setNotice("Ownership transferred. Your role is now ADMIN.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ownership transfer failed");
    } finally { setBusy(false); }
  }

  async function revoke(invitationId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/invitations/${invitationId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not revoke invitation");
      setNotice("Invitation revoked."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke invitation"); }
    finally { setBusy(false); }
  }

  async function copyToken() {
    await navigator.clipboard.writeText(token);
    setNotice("One-time invitation token copied.");
  }

  return (
    <div className="space-y-8">
      {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</p> : null}
      {token ? <section className="panel p-5"><p className="eyebrow">One-time invitation link</p><p className="mt-2 text-sm muted">Email delivery is not configured. Copy this link now and share it through a secure channel.</p><div className="mt-3 flex flex-wrap gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-black/30 p-3 text-sm">{token}</code><button className="action-primary" onClick={copyToken}>Copy invitation link</button></div></section> : null}

      {canManage ? <section className="panel p-6"><p className="eyebrow">Invite a teammate</p><h2 className="mt-2 text-xl font-bold">Grow your workspace</h2><form onSubmit={invite} className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end"><label className="text-sm font-semibold">Email address<input className="field mt-2" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" /></label><label className="text-sm font-semibold">Organization role<select className="field mt-2" value={role} onChange={(event) => setRole(event.target.value)}><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option>{currentRole === "OWNER" ? <option value="ADMIN">Admin</option> : null}</select></label><button className="action-primary" disabled={busy}>{busy ? "Working…" : "Create invitation"}</button></form><p className="mt-3 text-xs muted">Invitations expire after seven days. When configured, SignalForge emails a single-use acceptance link. The invitee must sign in using the matching account email.</p></section> : null}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-6"><div><p className="eyebrow">Access control</p><h2 className="mt-2 text-xl font-bold">Organization members</h2></div><span className="text-xs muted">{members.length} members</span></div>
        {loading ? <p className="p-6 text-sm muted">Loading organization team…</p> : members.length ? <div className="divide-y divide-[var(--border)]">{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-raised)] font-bold text-[var(--mint)]">{(member.user.name ?? member.user.email ?? "?").slice(0,1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{member.user.name ?? "Unnamed user"}</p><p className="truncate text-xs muted">{member.user.email ?? "No email available"}</p></div></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs muted">{member.role}</span>{currentRole === "OWNER" && member.role !== "OWNER" ? <button className="action-secondary" disabled={busy} onClick={() => void transferOwnership(member)}>Transfer ownership</button> : null}{canManage && member.role !== "OWNER" && (currentRole === "OWNER" || member.role !== "ADMIN") ? <><select aria-label={`Role for ${member.user.email ?? member.id}`} className="field !w-auto !py-2 text-xs" value={member.role} disabled={busy} onChange={(event) => void memberAction(member.id, "PATCH", event.target.value)}><option value="ADMIN" disabled={currentRole !== "OWNER"}>Admin</option><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option></select><button className="action-danger" disabled={busy} onClick={() => void memberAction(member.id, "DELETE")}>Remove</button></> : null}</div></div>)}</div> : <p className="p-6 text-sm muted">No members found.</p>}
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--border)] p-6"><p className="eyebrow">Pending access</p><h2 className="mt-2 text-xl font-bold">Invitations</h2></div>
        {loading ? <p className="p-6 text-sm muted">Loading invitations…</p> : invitations.length ? <div className="divide-y divide-[var(--border)]">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="text-sm font-semibold">{invitation.email}</p><p className="mt-1 text-xs muted">{invitation.role} · {invitation.status} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div>{canManage && invitation.status === "PENDING" ? <button className="action-danger" disabled={busy} onClick={() => void revoke(invitation.id)}>Revoke</button> : null}</div>)}</div> : <p className="p-6 text-sm muted">No invitations have been issued.</p>}
      </section>
    </div>
  );
}
