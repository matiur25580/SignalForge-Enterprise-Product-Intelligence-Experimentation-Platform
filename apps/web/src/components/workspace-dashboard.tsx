"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Organization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
};

export function WorkspaceDashboard({ organizations }: { organizations: Organization[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  function updateName(value: string) {
    setName(value);
    setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48));
  }

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create workspace");
      setName("");
      setSlug("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="panel p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Your organizations</p>
            <h2 className="mt-2 text-2xl font-bold">Workspaces built for collaboration</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 muted">Create an organization, invite your team, and manage access from one place.</p>
          </div>
          <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs muted">{organizations.length} workspace{organizations.length === 1 ? "" : "s"}</span>
        </div>
        {organizations.length ? (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {organizations.map((organization) => (
              <article key={organization.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold">{organization.name}</h3>
                    <p className="mt-1 font-mono text-xs muted">/{organization.slug}</p>
                  </div>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--mint)]">{organization.role}</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a className="action-primary" href={`/organizations/${organization.id}/team`}>Manage team <span aria-hidden="true">↗</span></a>
                  <a className="action-secondary" href={`/organizations/${organization.id}/projects`}>Projects</a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <p className="font-semibold">No organization yet</p>
            <p className="mt-2 text-sm muted">Create your first workspace to start inviting teammates and registering projects.</p>
          </div>
        )}
      </section>

      <section className="panel p-6 md:p-8">
        <div className="mb-5">
          <p className="eyebrow">Workspace setup</p>
          <h2 className="mt-2 text-xl font-bold">Create an organization</h2>
        </div>
        <form onSubmit={createOrganization} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="block text-sm font-semibold">
            Organization name
            <input className="field mt-2" required minLength={2} maxLength={80} value={name} onChange={(event) => updateName(event.target.value)} placeholder="Acme Product Team" />
          </label>
          <label className="block text-sm font-semibold">
            Workspace slug
            <input className="field mt-2 font-mono" required minLength={2} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="acme-product-team" />
          </label>
          <button className="action-primary min-h-11" disabled={creating}>{creating ? "Creating…" : "Create workspace"}</button>
        </form>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </section>
    </div>
  );
}
