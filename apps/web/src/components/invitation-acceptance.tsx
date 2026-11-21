"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Result = { state: "accepting" | "success" | "error"; message: string; organizationId?: string };

export function InvitationAcceptance({ token }: { token: string }) {
  const [result, setResult] = useState<Result>({
    state: "accepting",
    message: "Verifying your invitation and joining the workspace…",
  });

  useEffect(() => {
    // Remove the bearer-like invitation token from the visible URL and browser history
    // immediately after hydration; the token is submitted only in the POST body.
    window.history.replaceState(null, "", "/invitations/accept");
    const controller = new AbortController();

    async function accept() {
      try {
        const response = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
          signal: controller.signal,
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "This invitation could not be accepted.");
        setResult({
          state: "success",
          message: "You are now a member of this workspace. Your organization access is ready.",
          organizationId: body.organizationId,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({
          state: "error",
          message: error instanceof Error ? error.message : "This invitation could not be accepted.",
        });
      }
    }

    void accept();
    return () => controller.abort();
  }, [token]);

  return (
    <div className="mt-6 space-y-5">
      <div role="status" aria-live="polite" className={`rounded-xl border p-4 text-sm leading-6 ${result.state === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : result.state === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-[var(--border)] bg-black/20 text-[var(--muted)]"}`}>
        {result.message}
      </div>
      {result.state === "accepting" ? (
        <p className="text-xs muted">Keep this page open while SignalForge verifies the invitation.</p>
      ) : result.state === "success" && result.organizationId ? (
        <Link className="inline-flex rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[#091020]" href={`/organizations/${result.organizationId}/team`}>Open your team workspace</Link>
      ) : result.state === "error" ? (
        <p className="text-sm muted">Check that you signed in with the invited email address, or ask the workspace administrator for a fresh invitation.</p>
      ) : null}
    </div>
  );
}
