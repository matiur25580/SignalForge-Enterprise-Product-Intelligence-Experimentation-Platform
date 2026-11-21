"use client";

import { useCallback, useEffect, useState } from "react";

type Project = { id: string; name: string; slug: string; environment: string; createdAt: string };

export function ProjectWorkspace({ organizationId, canCreate }: { organizationId: string; canCreate: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [environment, setEnvironment] = useState("DEVELOPMENT");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/projects`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load projects");
      setProjects(body.projects);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load projects"); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  function changeName(value: string) {
    setName(value);
    setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48));
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/projects`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug, environment }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create project");
      setName(""); setSlug(""); setEnvironment("DEVELOPMENT");
      setNotice("Project created successfully."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create project"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-8">
    {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</p> : null}
    {canCreate ? <section className="panel p-6"><p className="eyebrow">Project registry</p><h2 className="mt-2 text-xl font-bold">Register a product surface</h2><form onSubmit={create} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
      <label className="text-sm font-semibold">Project name<input className="field mt-2" required minLength={2} maxLength={80} value={name} onChange={(event) => changeName(event.target.value)} placeholder="Web application" /></label>
      <label className="text-sm font-semibold">Project slug<input className="field mt-2 font-mono" required minLength={2} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="web-application" /></label>
      <label className="text-sm font-semibold">Environment<select className="field mt-2" value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="DEVELOPMENT">Development</option><option value="STAGING">Staging</option><option value="PRODUCTION">Production</option></select></label>
      <button className="action-primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</button>
    </form></section> : null}
    <section className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] p-6"><div><p className="eyebrow">Organization assets</p><h2 className="mt-2 text-xl font-bold">Projects</h2></div><span className="text-xs muted">{projects.length} total</span></div>
      {loading ? <p className="p-6 text-sm muted">Loading projects…</p> : projects.length ? <div className="grid gap-3 p-5 md:grid-cols-2">{projects.map((project) => <article key={project.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{project.name}</h3><span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold tracking-wider muted">{project.environment}</span></div><p className="mt-2 font-mono text-xs muted">/{project.slug}</p><p className="mt-4 text-xs muted">Created {new Date(project.createdAt).toLocaleDateString()}</p></article>)}</div> : <div className="p-10 text-center"><p className="font-semibold">No projects registered</p><p className="mt-2 text-sm muted">Create a project to establish an isolated environment for event ingestion and analytics.</p></div>}
    </section>
  </div>;
}
