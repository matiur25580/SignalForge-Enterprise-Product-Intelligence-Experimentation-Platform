const modules = [
  { name: "Event intelligence", detail: "Ingestion health, event contracts, and schema quality", status: "Foundation" },
  { name: "Funnels & journeys", detail: "Understand where users convert, pause, and drop off", status: "Planned" },
  { name: "Cohorts & retention", detail: "Measure activation, engagement, and long-term value", status: "Planned" },
  { name: "Experiments", detail: "Plan, validate, and evaluate controlled experiments", status: "Planned" },
];

const metrics = [
  { label: "Events processed", value: "—", note: "Awaiting event pipeline" },
  { label: "Active experiments", value: "—", note: "No experiment data yet" },
  { label: "Conversion rate", value: "—", note: "Connect a project to begin" },
  { label: "Data quality", value: "—", note: "No ingestion checks yet" },
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-[1440px] px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-lg font-extrabold text-[#091020]">S</div>
          <div>
            <p className="m-0 text-sm font-extrabold tracking-[.18em]">SIGNALFORGE</p>
            <p className="m-0 mt-1 text-xs text-[var(--muted)]">PRODUCT INTELLIGENCE PLATFORM</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
          <span className="h-2 w-2 rounded-full bg-amber-300" /> FOUNDATION IN PROGRESS
        </div>
      </header>

      <section className="grid gap-8 py-12 lg:grid-cols-[1.4fr_.6fr] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.22em] text-[var(--mint)]">Decision intelligence for product teams</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Turn product signals into <span className="text-[var(--accent)]">confident decisions.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">
            Understand every user journey. Measure every product decision.
            Build experiments on evidence, not intuition.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">Workspace status</p>
          <p className="mt-3 text-2xl font-bold">Your workspace is taking shape.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Connect the event pipeline in a later milestone to replace these empty states with verified live metrics.
          </p>
        </div>
      </section>

      <section aria-label="Platform metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm text-[var(--muted)]">{metric.label}</p>
            <p className="mt-4 text-3xl font-extrabold tracking-tight">{metric.value}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--mint)]">Platform modules</p>
            <h2 className="mt-2 text-2xl font-bold">Build the full product intelligence loop</h2>
          </div>
          <span className="hidden text-xs text-[var(--muted)] sm:block">Implementation roadmap</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {modules.map((module, index) => (
            <article key={module.name} className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-raised)] font-mono text-sm text-[var(--mint)]">
                0{index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">{module.name}</h3>
                  <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">{module.status}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{module.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-14 border-t border-[var(--border)] py-6 text-xs text-[var(--muted)]">
        SignalForge · Evidence first. Metrics are intentionally empty until real data is connected.
      </footer>
    </main>
  );
}
