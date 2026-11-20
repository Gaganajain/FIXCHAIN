import { FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Nav } from "../App";
import { Btn, Field, Kpi, Panel, Pill, Progress, Segmented, Sev, SimTag, State, inputCls, useRun } from "../components/kit";
import { AgentRow, EventFeed, PipelineFlow, WorkerPool } from "../components/live";
import { session } from "../lib/session";
import { label, useEvents, useV1, v1 } from "../lib/v1";

const STATE_COLORS: Record<string, string> = { RESOLVED: "#16A34A", APPROVAL_REQUIRED: "#7C3AED", NEEDS_CUSTOMER: "#F59E0B", WAITING_PARTNER: "#F59E0B",
  ESCALATED: "#DC2626", INVESTIGATING: "#00A8E8", CORRELATED: "#94A3B8", TRIAGED: "#94A3B8", INTAKE: "#94A3B8", NEW: "#CBD5E1" };

export function SimulationLab({ nav }: { nav: Nav }) {
  const { data: st, reload } = useV1<any>("/simulation", 1000);
  const { data: sum } = useV1<any>("/analytics/summary?scope=simulated", 1500);
  const { data: ag } = useV1<{ agents: AgentRow[]; workers: any; handoffs: any[] }>("/agents", 1200);
  const { data: incs } = useV1<any[]>("/incidents?scope=simulated", 1500);
  const { events } = useEvents(200);
  const [scenario, setScenario] = useState("B");
  const [size, setSize] = useState<"50" | "100" | "300">("300");
  const [seed, setSeed] = useState(42);
  const [speed, setSpeed] = useState(15);
  const { busy, run } = useRun();
  const can = session.can("simulation:run");
  const runRow = st?.run;
  const states = Object.entries(sum?.by_state ?? {}).map(([k, v]) => ({ state: k, n: v as number })).sort((a, b) => b.n - a.n);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-300 bg-violet-50 px-4 py-2.5 text-[12.5px] text-violet-900">
        <b>Simulation Lab.</b> Everything generated here is flagged <SimTag /> and labelled across the product. Generation is deterministic (same scenario, size and seed → same tickets and mock world); simulated tickets use the offline understanding path, so no LLM call is made per ticket.
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="Scenarios" icon={<FlaskConical className="h-4 w-4" />}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(st?.scenarios ?? {}).map(([k, s]: [string, any]) => (
              <button key={k} onClick={() => setScenario(k)} aria-pressed={scenario === k}
                className={`rounded-2xl border p-3 text-left transition-colors ${scenario === k ? "border-brand-2 bg-brand/5 ring-1 ring-brand-2/30" : "border-line hover:border-accentDim"}`}>
                <div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand text-[12px] font-bold text-white">{k}</span>
                  <span className="text-[13px] font-semibold">{s.title}</span></div>
                <p className="mt-1.5 text-[11.5px] text-ink-3">{s.description}</p>
                <div className="mt-2 flex gap-1">{s.engineering ? <Pill tone="serious">engineering defect path</Pill> : <Pill>operational</Pill>}<Pill tone="info">{s.customer_type}s</Pill></div>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Field label="Ticket volume"><Segmented value={size} onChange={setSize} options={[{ value: "50", label: "50" }, { value: "100", label: "100" }, { value: "300", label: "300" }]} /></Field>
            <Field label="Seed" hint="Same seed → same run"><input type="number" className={inputCls} value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></Field>
            <Field label={`Arrival rate: ${speed}/s`}><input type="range" min={1} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-[#0B3D71]" /></Field>
            <div className="flex flex-wrap items-end gap-2">
              <Btn variant="primary" disabled={!can || st?.feeding} busy={busy === "start"} onClick={() => run("start", async () => { await v1("/simulation/start", { body: { scenario, size: Number(size), seed, speed } }); reload(); }, `Scenario ${scenario} started`)}><Play className="h-4 w-4" />Start</Btn>
              <Btn disabled={!can} busy={busy === "pause"} onClick={() => run("pause", async () => { await v1("/simulation/pause", { body: { paused: !st?.paused } }); reload(); })}><Pause className="h-4 w-4" />{st?.paused ? "Resume" : "Pause"}</Btn>
              <Btn variant="danger" disabled={!can} busy={busy === "reset"} onClick={() => { if (confirm("Reset the demo environment? Tickets, incidents, actions and events are cleared; users, approved playbooks and knowledge are kept.")) run("reset", async () => { await v1("/simulation/reset", { body: {} }); reload(); }, "Environment reset to the deterministic baseline"); }}><RotateCcw className="h-4 w-4" />Reset</Btn>
            </div>
          </div>
          {!can && <p className="mt-2 text-[12px] text-ink-3">Your role can watch simulations; starting one needs an incident manager or admin.</p>}
          {runRow && (
            <div className="mt-4 rounded-2xl bg-raised p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12.5px]"><b>Run #{runRow.id}</b> scenario {runRow.scenario} · seed {runRow.seed} · <State s={runRow.status === "running" ? "in_progress" : runRow.status === "completed" ? "verified" : runRow.status} />
                {st.paused && <Pill tone="warn">paused</Pill>}<span className="ml-auto tabular-nums">{runRow.created}/{runRow.size} tickets fed</span></div>
              <Progress value={runRow.created} max={runRow.size} tone={runRow.created === runRow.size ? "good" : "accent"} />
            </div>
          )}
        </Panel>
        <Panel dark title="Worker pool" subtitle="Sized from queue depth">
          <WorkerPool w={ag?.workers} dark />
          {ag && <div className="mt-4"><PipelineFlow agents={ag.agents} handoffs={ag.handoffs} /></div>}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Tickets" value={sum?.tickets ?? 0} sub="simulated" />
        <Kpi label="Grouped into" value={sum?.incidents ?? 0} sub="incident(s)" tone="info" />
        <Kpi label="Verified resolved" value={sum?.resolved ?? 0} sub={sum?.resolution_rate != null ? `${sum.resolution_rate}%` : ""} tone="good" />
        <Kpi label="Awaiting approval" value={sum?.pending_approvals ?? 0} tone="violet" />
        <Kpi label="Escalated to humans" value={sum?.escalated ?? 0} tone="critical" />
        <Kpi label="Processing rate" value={sum?.processing_rate_per_min ?? 0} sub="tasks / min" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Ticket states" subtitle="Each bar is a live count from the database">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={states} layout="vertical" margin={{ left: 40, right: 12 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#64748B" }} />
                <YAxis type="category" dataKey="state" tickFormatter={(s) => label(s)} tick={{ fontSize: 10.5, fill: "#475569" }} width={110} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="n" radius={[0, 6, 6, 0]}>{states.map((s) => <Cell key={s.state} fill={STATE_COLORS[s.state] ?? "#0B3D71"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Incidents formed" subtitle="Severity is recalculated as the incident grows">
          {!incs?.length ? <div className="py-8 text-center text-[12.5px] text-ink-3">No simulated incidents yet.</div> : (
            <ul className="space-y-2">
              {incs.map((i) => (
                <li key={i.id}><button onClick={() => nav(`incidents/${i.id}`)} className="w-full rounded-xl border border-line p-2.5 text-left hover:border-accentDim">
                  <div className="flex items-center gap-1.5"><Sev s={i.severity} /><State s={i.state} /><span className="font-mono text-[11px] text-ink-3">{i.id}</span></div>
                  <div className="mt-1 text-[12.5px] font-semibold">{i.title}</div>
                  <div className="mt-1 text-[11px] text-ink-3">{i.affected_tickets} tickets · {i.resolved_tickets} resolved · {i.pending_approvals} awaiting approval{i.software_defect ? " · engineering" : ""}</div>
                </button></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Incoming stream">
          <div className="max-h-[260px] overflow-y-auto">
            <EventFeed events={events} max={60} filter={(e) => ["ticket.created", "ticket.triaged", "correlation.linked", "incident.created", "incident.severity_changed", "workers.scaled", "action.verified", "approval.requested", "engineering.issue_created", "simulation.started"].includes(e.type)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
