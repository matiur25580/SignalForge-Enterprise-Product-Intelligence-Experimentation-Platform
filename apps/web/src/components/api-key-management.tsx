"use client";

import { useCallback, useEffect, useState } from "react";

type ApiKey = { id: string; name: string; keyPrefix: string; projectId: string | null; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string };
type Project = { id: string; name: string; slug: string; environment: string };
type CreatedKey = ApiKey & { secret: string; warning: string };

export function ApiKeyManagement({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyResponse, projectResponse] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/api-keys`, { cache: "no-store" }),
        fetch(`/api/organizations/${organizationId}/projects`, { cache: "no-store" }),
      ]);
      const [keyBody, projectBody] = await Promise.all([keyResponse.json(), projectResponse.json()]);
      if (!keyResponse.ok) throw new Error(keyBody.error ?? "Could not load API keys");
      if (!projectResponse.ok) throw new Error(projectBody.error ?? "Could not load projects");
      setKeys(keyBody.apiKeys); setProjects(projectBody.projects); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load API keys"); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setSecret("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/api-keys`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, ...(projectId ? { projectId } : {}), ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not create API key");
      const created = body.apiKey as CreatedKey;
      setSecret(created.secret); setName(""); setProjectId(""); setExpiresAt("");
      setNotice("API key created. Copy the secret now; it will not be available again.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create API key"); }
    finally { setBusy(false); }
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(`Revoke ${key.name}? Any integration using this key will stop authenticating.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/api-keys/${key.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not revoke API key");
      setNotice(`Key ${key.keyPrefix} revoked.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke API key"); }
    finally { setBusy(false); }
  }

  async function copySecret() {
    await navigator.clipboard.writeText(secret);
    setNotice("API key secret copied to clipboard.");
  }

  return <div className="space-y-8">
    {error ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</p> : null}
    {secret ? <section className="panel border-emerald-400/30 p-6"><p className="eyebrow">New credential · shown once</p><h2 className="mt-2 text-lg font-bold">Store this secret securely</h2><p className="mt-2 text-sm muted">SignalForge stores only a SHA-256 hash. Navigate away and this raw value cannot be retrieved again.</p><div className="mt-4 flex flex-wrap gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-black/30 p-3 text-sm">{secret}</code><button className="action-primary" onClick={copySecret}>Copy secret</button></div></section> : null}
    {canManage ? <section className="panel p-6"><p className="eyebrow">Credential provisioning</p><h2 className="mt-2 text-xl font-bold">Create an API key</h2><form onSubmit={create} className="mt-5 grid gap-3 md:grid-cols-2">
      <label className="text-sm font-semibold">Key name<input className="field mt-2" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Production ingestion" /></label>
      <label className="text-sm font-semibold">Project scope<select className="field mt-2" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">All organization projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.environment}</option>)}</select></label>
      <label className="text-sm font-semibold">Optional expiry<input className="field mt-2" type="date" min={new Date().toISOString().slice(0,10)} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
      <div className="flex items-end"><button className="action-primary w-full" disabled={busy}>{busy ? "Creating…" : "Generate secure key"}</button></div>
    </form><p className="mt-3 text-xs muted">Only OWNER and ADMIN roles can create or revoke keys. Use project-scoped credentials for production integrations.</p></section> : null}
    <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-6"><div><p className="eyebrow">Credential inventory</p><h2 className="mt-2 text-xl font-bold">API keys</h2></div><span className="text-xs muted">{keys.filter(k => !k.revokedAt).length} active · {keys.length} total</span></div>
      {loading ? <p className="p-6 text-sm muted">Loading credentials…</p> : keys.length ? <div className="divide-y divide-[var(--border)]">{keys.map((key) => <article key={key.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{key.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${key.revokedAt ? "bg-rose-400/10 text-rose-300" : key.expiresAt && new Date(key.expiresAt) < new Date() ? "bg-amber-400/10 text-amber-300" : "bg-emerald-400/10 text-emerald-300"}`}>{key.revokedAt ? "REVOKED" : key.expiresAt && new Date(key.expiresAt) < new Date() ? "EXPIRED" : "ACTIVE"}</span></div><p className="mt-1 font-mono text-xs muted">{key.keyPrefix}••••••••</p><p className="mt-2 text-xs muted">{key.projectId ? `Project: ${projects.find(p => p.id === key.projectId)?.name ?? "Scoped project"}` : "Organization-wide"} · Created {new Date(key.createdAt).toLocaleDateString()} · {key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : "Never used"}{key.expiresAt ? ` · Expires ${new Date(key.expiresAt).toLocaleDateString()}` : " · No expiry"}</p></div>{canManage && !key.revokedAt ? <button className="action-danger" disabled={busy} onClick={() => void revoke(key)}>Revoke key</button> : null}</article>)}</div> : <p className="p-8 text-center text-sm muted">No API keys yet. Create a project-scoped credential to start sending events.</p>}
    </section>
  </div>;
}
