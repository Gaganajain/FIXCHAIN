import { useState } from "react";
import { Status, reviewerStore, usePoll } from "./api";
import { Badge } from "./ui";
import { History } from "./views/History";
import { Incidents } from "./views/Incidents";
import { Overview } from "./views/Overview";
import { Simulator } from "./views/Simulator";

type View = "overview" | "incidents" | "simulator" | "history";
const NAV: { id: View; label: string; hint: string; icon: string }[] = [
  { id: "overview", label: "Dashboard", hint: "Health & impact", icon: "📊" },
  { id: "incidents", label: "Incidents", hint: "Detect → repair → verify", icon: "⚑" },
  { id: "simulator", label: "Simulator", hint: "Checkout & gateway", icon: "₹" },
  { id: "history", label: "History", hint: "Versions & memory", icon: "⟲" },
];

function ReviewerField({ tokenRequired }: { tokenRequired: boolean }) {
  const [name, setName] = useState(reviewerStore.get("name"));
  const [token, setToken] = useState(reviewerStore.get("token"));
  const cls = "w-40 rounded-xl border bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
  const nameBorder = name ? "border-line" : "border-critical/30";
  const tokenBorder = token ? "border-line" : "border-critical/30";
  return (
    <div className="flex items-center gap-2" title="Recorded on every approve / reject / rollback / reconcile">
      <label className="text-[12px] font-medium text-ink-2" htmlFor="reviewer-name">Reviewer</label>
      <input id="reviewer-name" value={name} placeholder="Name" maxLength={60}
        className={`${cls} ${nameBorder}`}
        onChange={(e) => { setName(e.target.value); reviewerStore.set("name", e.target.value); }} />
      {tokenRequired && (
        <input type="password" value={token} placeholder="Token" aria-label="Reviewer token"
          className={`${cls} ${tokenBorder}`}
          onChange={(e) => { setToken(e.target.value); reviewerStore.set("token", e.target.value); }} />
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [incident, setIncident] = useState<number | null>(null);
  const { data: status, error, reload } = usePoll<Status>("/status", 2000);
  const openIncident = (id: number) => { setIncident(id); setView("incidents"); };

  const isActive = (n: { id: View }) => view === n.id;

  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="hidden w-64 shrink-0 flex-col bg-brand text-white md:flex shadow-sidebar">
        <div className="px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent font-mono text-[16px] font-bold text-brand">FX</span>
            <div>
              <div className="text-[18px] font-bold tracking-tight">FIXCHAIN</div>
              <div className="text-[11px] text-cyan-300/90 uppercase tracking-wider">Payment reliability</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${isActive(n)
                ? "bg-white text-brand shadow-card border border-brand/10"
                : "text-cyan-100/90 hover:bg-raised/50"}`}>
              <span aria-hidden className={`grid h-9 w-9 place-items-center rounded-xl ${isActive(n) ? "bg-brand-2 text-brand" : "bg-white/5"}`}>{n.icon}</span>
              <div>
                <div className={`block text-[14px] font-semibold ${isActive(n) ? "text-white" : "text-cyan-100/90"}`}>{n.label}</div>
                <div className="block text-[10.5px] text-cyan-200/70">{n.hint}</div>
              </div>
            </button>
          ))}
        </nav>
        <div className="m-4 space-y-1.5 rounded-2xl bg-brand/40 p-3 text-[10.5px] text-cyan-200/80 border border-brand/20">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] ${status?.verifier_suite_intact ? "text-green-400" : "text-red-400"} font-semibold`}>
              {status?.verifier_suite_intact ? "✓" : "✕"}
            </span>
            <span>Verifier suite locked</span>
          </div>
          <div className="font-mono text-cyan-200/60">{status?.verifier_suite_sha256.slice(0, 16)}…</div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold">Allowlist:</span>
            <span className="font-mono">{status?.approved_files.join(", ")}</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-5 py-3.5 shadow-card md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-brand font-mono text-[11px] font-bold text-accent">FX</span>
            <select value={view} onChange={(e) => setView(e.target.value as View)}
              className="rounded-xl border border-line bg-panel px-3 py-1.5 text-sm font-medium text-brand focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
              {NAV.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <h1 className="hidden text-[17px] font-bold text-brand md:block">{NAV.find((n) => n.id === view)?.label}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ReviewerField tokenRequired={!!status?.reviewer_token_required} />
            <Badge tone="accent">Simulated · no real money</Badge>
            {status && (status.agent_mode === "llm"
              ? <Badge tone="accent">Agents: {status.agent_label}</Badge>
              : <Badge tone="neutral">Agents: offline</Badge>)}
            {status?.active_run && (
              <button onClick={() => openIncident(status.active_run!.incident_id)}>
                <Badge tone="accent">Run #{status.active_run.id}</Badge>
              </button>
            )}
            {error && <Badge tone="critical">API unreachable — retrying…</Badge>}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          {view === "overview" && <Overview openIncident={openIncident} />}
          {view === "incidents" && <Incidents selected={incident} select={setIncident} />}
          {view === "simulator" && <Simulator status={status} refreshStatus={reload} />}
          {view === "history" && <History />}
        </main>
      </div>
    </div>
  );
}
