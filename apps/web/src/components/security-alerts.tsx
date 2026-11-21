"use client";

import { useEffect, useState } from "react";

type Alert = {
  id: string; type: string; severity: "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "RESOLVED"; summary: string; occurrenceCount: number;
  firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null;
};

const severityClass: Record<Alert["severity"], string> = {
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-700",
  CRITICAL: "border-rose-500/30 bg-rose-500/10 text-rose-700",
};

export function SecurityAlerts({ organizationId }: { organizationId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/security-alerts`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load security alerts");
      setAlerts(body.alerts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load security alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [organizationId]);

  async function resolve(alertId: string) {
    setResolving(alertId);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/security-alerts`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to resolve alert");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resolve alert");
    } finally {
      setResolving(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">Detected security alerts</h2><p className="mt-1 text-sm muted">Signals are derived from committed workspace audit events.</p></div>
        <button className="action-secondary" onClick={() => void refresh()} disabled={loading}>Refresh</button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 p-3 text-sm text-rose-700">{error}</p>}
      {loading ? <p className="text-sm muted">Loading security signals…</p> : alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-5 py-10 text-center"><p className="font-semibold">No suspicious activity detected</p><p className="mt-2 text-sm muted">New signals will appear here when activity crosses a detection threshold.</p></div>
      ) : (
        <ol className="divide-y divide-[var(--border)]">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${severityClass[alert.severity]}`}>{alert.severity}</span>
                  <span className="text-xs font-semibold muted">{alert.type.replace(/_/g, " ")}</span>
                  <span className="text-xs muted">{alert.status}</span>
                </div>
                <p className="text-sm font-semibold">{alert.summary}</p>
                <p className="mt-1 text-xs muted">{alert.occurrenceCount} event(s) · Last seen {new Date(alert.lastSeenAt).toLocaleString()}</p>
              </div>
              {alert.status === "OPEN" && <button className="action-secondary shrink-0" onClick={() => void resolve(alert.id)} disabled={resolving === alert.id}>{resolving === alert.id ? "Resolving…" : "Mark resolved"}</button>}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-5 text-xs muted">Detection window: 15 minutes. Alerts are deduplicated per organization and actor. Review the activity timeline for the underlying audit history.</p>
    </section>
  );
}
