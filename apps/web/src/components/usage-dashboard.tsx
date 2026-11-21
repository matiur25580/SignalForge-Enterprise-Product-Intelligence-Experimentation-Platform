"use client";

import { useCallback, useEffect, useState } from "react";

type Usage = { range: { from: string; to: string }; totalEvents: number; projects: { project: { id: string; name: string; slug?: string; environment?: string }; events: number }[]; apiKeys: { id: string; name: string; keyPrefix: string; events: number; revokedAt: string | null; lastUsedAt: string | null }[] };
type Plan = { id: string; name: string; description: string; monthlyPriceUsd: number | null; ingestion: { requestsPerMinute: number; eventsPerMinute: number }; includedProjects: number | null; includedApiKeys: number | null; support: string };

export function UsageDashboard({ organizationId, planId }: { organizationId: string; planId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [usageResponse, planResponse] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/usage`, { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
      ]);
      const [usageBody, planBody] = await Promise.all([usageResponse.json(), planResponse.json()]);
      if (!usageResponse.ok) throw new Error(usageBody.error ?? "Could not load usage");
      if (!planResponse.ok) throw new Error("Could not load plan catalog");
      setUsage(usageBody); setPlans(planBody.plans);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load usage"); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const selectedPlan = plans.find(p => p.id === planId);
  const projectMax = Math.max(1, ...(usage?.projects.map(p => p.events) ?? [1]));
  const keyMax = Math.max(1, ...(usage?.apiKeys.map(k => k.events) ?? [1]));
  const activeKeys = usage?.apiKeys.filter(k => !k.revokedAt).length ?? 0;

  return <div className="space-y-8">
    {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="panel p-5"><p className="eyebrow">Events received</p><p className="mt-3 text-3xl font-extrabold tabular-nums">{loading ? "—" : (usage?.totalEvents ?? 0).toLocaleString()}</p><p className="mt-2 text-xs muted">Last 30 days · received events</p></article>
      <article className="panel p-5"><p className="eyebrow">Projects with activity</p><p className="mt-3 text-3xl font-extrabold tabular-nums">{loading ? "—" : usage?.projects.length ?? 0}</p><p className="mt-2 text-xs muted">Projects reporting events</p></article>
      <article className="panel p-5"><p className="eyebrow">Active API keys</p><p className="mt-3 text-3xl font-extrabold tabular-nums">{loading ? "—" : activeKeys}</p><p className="mt-2 text-xs muted">Non-revoked credentials</p></article>
      <article className="panel p-5"><p className="eyebrow">Current plan</p><p className="mt-3 text-3xl font-extrabold">{selectedPlan?.name ?? planId}</p><p className="mt-2 text-xs muted">Ingestion entitlement tier</p></article>
    </section>
    {selectedPlan ? <section className="panel p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Plan entitlements</p><h2 className="mt-2 text-xl font-bold">{selectedPlan.name} ingestion limits</h2><p className="mt-2 text-sm muted">{selectedPlan.description}</p></div><span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs muted">{selectedPlan.support} support</span></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-sm muted">Requests per API key / minute</p><p className="mt-2 text-2xl font-bold tabular-nums">{selectedPlan.ingestion.requestsPerMinute.toLocaleString()}</p></div><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-sm muted">Events per API key / minute</p><p className="mt-2 text-2xl font-bold tabular-nums">{selectedPlan.ingestion.eventsPerMinute.toLocaleString()}</p></div><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-sm muted">Included projects</p><p className="mt-2 text-2xl font-bold">{selectedPlan.includedProjects?.toLocaleString() ?? "Unlimited"}</p></div><div className="rounded-xl bg-[var(--surface-raised)] p-4"><p className="text-sm muted">Included API keys</p><p className="mt-2 text-2xl font-bold">{selectedPlan.includedApiKeys?.toLocaleString() ?? "Unlimited"}</p></div></div><p className="mt-4 text-xs muted">These are enforced per-key ingestion rate limits, not monthly billing allowances. No payment method or subscription checkout is connected.</p></section> : null}
    <section className="panel overflow-hidden"><div className="border-b border-[var(--border)] p-6"><p className="eyebrow">Consumption breakdown</p><h2 className="mt-2 text-xl font-bold">Events by project</h2></div>{loading ? <p className="p-6 text-sm muted">Loading usage…</p> : usage?.projects.length ? <div className="space-y-5 p-6">{usage.projects.map(item => <div key={item.project.id}><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">{item.project.name}</span><span className="tabular-nums muted">{item.events.toLocaleString()} events</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, item.events / projectMax * 100)}%` }} /></div><p className="mt-1 text-[10px] muted">{item.project.environment ?? "Project"} · {item.project.slug ?? ""}</p></div>)}</div> : <p className="p-8 text-center text-sm muted">No events received in the reporting window. Send events using a valid project-scoped API key to populate this view.</p>}</section>
    <section className="panel overflow-hidden"><div className="border-b border-[var(--border)] p-6"><p className="eyebrow">Credential consumption</p><h2 className="mt-2 text-xl font-bold">Events by API key</h2></div>{loading ? <p className="p-6 text-sm muted">Loading API key usage…</p> : usage?.apiKeys.length ? <div className="divide-y divide-[var(--border)]">{usage.apiKeys.map(key => <div key={key.id} className="p-5"><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">{key.name} <span className="font-mono text-xs muted">{key.keyPrefix}</span></span><span className="tabular-nums muted">{key.events.toLocaleString()} events</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[var(--mint)]" style={{ width: `${Math.max(key.events ? 2 : 0, key.events / keyMax * 100)}%` }} /></div></div>)}</div> : <p className="p-8 text-center text-sm muted">No API keys are registered for this organization.</p>}</section>
    <p className="text-xs muted">Usage totals are based on event receivedAt timestamps over the API's default trailing 30-day window. The API currently supports custom 90-day windows; this page displays the default window. Data refreshes when the page is loaded.</p>
  </div>;
}
