"use client";

import { useCallback, useEffect, useState } from "react";

type SessionItem = { id: string; expiresAt: string; isCurrent: boolean };

export function AccountSessions() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/account/sessions", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load sessions");
      setSessions(body.sessions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revoke(id: string) {
    if (!window.confirm("Revoke this session? The device using it will need to sign in again.")) return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/account/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not revoke session");
      setNotice("Session revoked successfully.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke session");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--border)] p-6">
        <p className="eyebrow">Identity controls</p>
        <h2 className="mt-2 text-xl font-bold">Active sessions</h2>
        <p className="mt-2 text-sm muted">Review active sign-ins for your account and revoke sessions you no longer recognize.</p>
      </div>
      {error ? <p role="alert" className="m-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
      {notice ? <p role="status" className="m-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</p> : null}
      {loading ? <p className="p-6 text-sm muted">Loading active sessions…</p> : sessions.length ? (
        <ul className="divide-y divide-[var(--border)]">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">{session.isCurrent ? "This device" : "Signed-in session"}</p>
                  {session.isCurrent ? <span className="rounded-full border border-[var(--mint)]/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--mint)]">Current</span> : null}
                </div>
                <p className="mt-1 text-xs muted">Expires {new Date(session.expiresAt).toLocaleString()}</p>
              </div>
              {!session.isCurrent ? <button className="action-danger" disabled={busy !== ""} onClick={() => void revoke(session.id)}>{busy === session.id ? "Revoking…" : "Revoke session"}</button> : <span className="text-xs muted">Use Sign out to end this session</span>}
            </li>
          ))}
        </ul>
      ) : <div className="p-8 text-center"><p className="font-semibold">No active sessions found</p><p className="mt-2 text-sm muted">Your current sign-in may have expired.</p></div>}
      <div className="border-t border-[var(--border)] p-5 text-xs leading-6 muted">Session identifiers are derived as one-way SHA-256 digests. Raw session tokens are never returned to the browser. The current session is protected from accidental remote revocation.</div>
    </section>
  );
}
