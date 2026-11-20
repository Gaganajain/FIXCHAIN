import { useState } from "react";
import { Status, reviewerStore, usePoll } from "./api";

function ReviewerField({ tokenRequired }: { tokenRequired: boolean }) {
  const [name, setName] = useState(reviewerStore.get("name"));
  const [token, setToken] = useState(reviewerStore.get("token"));
  const cls = "w-36 rounded-full border bg-panel px-3 py-1 text-[12.5px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none";
  return (
    <div className="flex items-center gap-1.5" title="Recorded on every approve / reject / rollback / reconcile">
      <label className="text-[12px] text-ink-3" htmlFor="reviewer-name">Reviewer</label>
      <input id="reviewer-name" value={name} placeholder="your name" maxLength={60}
        className={`${cls} ${name ? "border-line" : "border-warn"}`}
        onChange={(e) => { setName(e.target.value); reviewerStore.set("name", e.target.value); }} />
      {tokenRequired && (
        <input type="password" value={token} placeholder="reviewer token" aria-label="Reviewer token"
          className={`${cls} ${token ? "border-line" : "border-warn"}`}
          onChange={(e) => { setToken(e.target.value); reviewerStore.set("token", e.target.value); }} />
      )}
    </div>
  );
}
import { Badge } from "./ui";
import { History } from "./views/History";
import { Incidents } from "./views/Incidents";
import { Overview } from "./views/Overview";
import { Simulator } from "./views/Simulator";

type View = "overview" | "incidents" | "simulator" | "history";
const NAV: { id: View; label: string; hint: string; icon: string }[] = [
  { id: "overview", label: "Overview", hint: "Health & impact", icon: "◔" },
  { id: "incidents", label: "Incidents", hint: "Detect → repair → verify", icon: "⚑" },
  { id: "simulator", label: "Simulator", hint: "Checkout & gateway", icon: "₹" },
  { id: "history", label: "Code & history", hint: "Versions, rollback, memory", icon: "⟲" },
];

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [incident, setIncident] = useState<number | null>(null);
  const { data: status, error, reload } = usePoll<Status>("/status", 2000);
  const openIncident = (id: number) => { setIncident(id); setView("incidents"); };

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="hidden w-60 shrink-0 flex-col bg-brand text-white md:flex">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-mono text-[14px] font-bold text-brand">FX</span>
            <div>
              <div className="text-[17px] font-bold tracking-wide">FIXCHAIN</div>
              <div className="text-[11px] text-white/60">Payment reliability agent</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === n.id ? "bg-white/12 bg-white/10 shadow-[inset_3px_0_0_#00A8E8]" : "text-white/80 hover:bg-white/5"}`}>
              <span aria-hidden className={`grid h-8 w-8 place-items-center rounded-lg text-[15px] ${view === n.id ? "bg-accent text-brand" : "bg-white/10"}`}>{n.icon}</span>
              <span>
                <span className="block text-[13.5px] font-semibold">{n.label}</span>
                <span className="block text-[11px] text-white/55">{n.hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="m-3 space-y-1.5 rounded-xl bg-white/5 p-3 text-[11px] text-white/65">
          <div>Verifier suite {status?.verifier_suite_intact ? <span className="font-semibold text-[#7CE0A6]">✓ locked</span> : <span className="font-semibold text-[#FF9A9A]">✕ changed</span>}</div>
          <div className="font-mono text-white/50">{status?.verifier_suite_sha256.slice(0, 16)}…</div>
          <div>Allowlist: <span className="font-mono">{status?.approved_files.join(", ")}</span></div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-3 shadow-card md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand font-mono text-[11px] font-bold text-accent">FX</span>
            <select value={view} onChange={(e) => setView(e.target.value as View)}
              className="rounded-full border border-line bg-panel px-3 py-1 text-[13px] text-brand">
              {NAV.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <h1 className="hidden text-[18px] font-bold text-brand md:block">{NAV.find((n) => n.id === view)?.label}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ReviewerField tokenRequired={!!status?.reviewer_token_required} />
            <Badge tone="warn">Simulated environment · no real money</Badge>
            {status && (status.agent_mode === "llm"
              ? <Badge tone="accent">Agents: {status.agent_label}</Badge>
              : <Badge tone="neutral">Agents: offline deterministic mode</Badge>)}
            {status?.active_run && (
              <button onClick={() => openIncident(status.active_run!.incident_id)}>
                <Badge tone="accent">Run #{status.active_run.id}: {status.active_run.state.replace("_", " ").toLowerCase()}</Badge>
              </button>
            )}
            {error && <Badge tone="critical">{["localhost", "127.0.0.1"].includes(location.hostname)
              ? "API unreachable — is the backend running on :8000?"
              : "API unreachable — the backend may be waking up (free hosting sleeps when idle). Retrying…"}</Badge>}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          {!status && error && !["localhost", "127.0.0.1"].includes(location.hostname) && (
            <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-[14px] text-ink-2">
              <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-warn border-t-transparent" />
              <span>
                <span className="font-semibold text-ink">Waking up the demo backend…</span>{" "}
                Free hosting sleeps when idle, so the first visit can take up to a minute. This page fills in on its own.
              </span>
            </div>
          )}
          {view === "overview" && <Overview openIncident={openIncident} />}
          {view === "incidents" && <Incidents selected={incident} select={setIncident} />}
          {view === "simulator" && <Simulator status={status} refreshStatus={reload} />}
          {view === "history" && <History />}
        </main>
      </div>
    </div>
  );
}
