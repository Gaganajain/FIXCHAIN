import { AlertTriangle, Bot, CheckCircle2, Clock, Gauge, Inbox, Percent, ShieldCheck, Siren, Timer, TrendingUp, Users, Zap } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Nav } from "../App";
import { Btn, Kpi, Panel, Pill, Sev, SimTag, State } from "../components/kit";
import { AgentCard, AgentRow, EventFeed, LiveDot, PipelineFlow, WorkerPool } from "../components/live";
import { ago, clock, dur, pct, useEvents, useV1 } from "../lib/v1";
import { CustomerApp } from "./CustomerApp";

export function MissionControl({ nav }: { nav: Nav }) {
  const { data: s } = useV1<any>("/analytics/summary", 2500);
  const { data: ag } = useV1<{ agents: AgentRow[]; workers: any; handoffs: any[] }>("/agents", 1500);
  const { data: inc } = useV1<any[]>("/incidents?state=open", 2500);
  const { data: series } = useV1<any[]>("/analytics/series?minutes=15&bucket_s=20", 5000);
  const { events, connected } = useEvents(250);
  const { data: alertRows } = useV1<any[]>("/events?important=true&limit=8", 3000);
  const alerts = alertRows ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-night p-4 text-white md:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-bold">Operations overview</h2>
          <LiveDot on={connected} dark />
          <span className="text-[11.5px] text-white/45">Every number below is computed from persisted records.</span>
          <div className="ml-auto flex gap-2">
            <Btn variant="dark" size="sm" onClick={() => nav("simulation")}>Open Simulation Lab</Btn>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi dark label="Total tickets" value={s?.tickets ?? "—"} sub={`${s?.open_tickets ?? 0} open`} icon={<Inbox className="h-4 w-4" />} />
          <Kpi dark label="Open incidents" value={s?.open_incidents ?? "—"} sub={`${s?.incidents ?? 0} total`} icon={<Siren className="h-4 w-4" />} />
          <Kpi dark label="Critical (SEV-1)" value={<span className={s?.critical_incidents ? "text-[#FF8A8A]" : ""}>{s?.critical_incidents ?? "—"}</span>} sub="open" icon={<AlertTriangle className="h-4 w-4" />} />
          <Kpi dark label="Affected customers" value={(s?.affected_customers ?? 0) + (s?.affected_merchants ?? 0)} sub={`${s?.affected_merchants ?? 0} merchants with open tickets`} icon={<Users className="h-4 w-4" />} />
          <Kpi dark label="Resolution rate" value={pct(s?.resolution_rate)} sub="verified resolutions" icon={<CheckCircle2 className="h-4 w-4" />} />
          <Kpi dark label="Avg resolution time" value={dur(s?.avg_resolution_s)} sub="ticket → verified" icon={<Timer className="h-4 w-4" />} />
          <Kpi dark label="SLA on track" value={pct(s?.sla_resolution_on_track)} sub="demo SLA targets" icon={<Percent className="h-4 w-4" />} />
          <Kpi dark label="Active agents" value={s?.active_agents ?? "—"} sub="working in the last 10 s" icon={<Bot className="h-4 w-4" />} />
          <Kpi dark label="Pending approvals" value={<span className={s?.pending_approvals ? "text-violet-300" : ""}>{s?.pending_approvals ?? "—"}</span>} sub="human decisions waiting" icon={<ShieldCheck className="h-4 w-4" />} />
          <Kpi dark label="Processing rate" value={s?.processing_rate_per_min ?? "—"} sub="agent tasks / min" icon={<Gauge className="h-4 w-4" />} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <Panel title="Customer device" icon={<Zap className="h-4 w-4" />} subtitle="Live customer / merchant app (separate demo session)" pad={false}>
            <div className="p-3"><CustomerApp compact /></div>
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <Panel dark title="Agent control room" icon={<Bot className="h-4 w-4" />} right={<Btn variant="dark" size="sm" onClick={() => nav("agents")}>Command center</Btn>}>
            {ag && <PipelineFlow agents={ag.agents} handoffs={ag.handoffs} />}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ag?.agents.filter((a) => a.id !== "copilot").map((a) => <AgentCard key={a.id} a={a} dark compact />)}
            </div>
            <div className="mt-4 border-t border-white/10 pt-3"><WorkerPool w={ag?.workers} dark /></div>
          </Panel>
          <Panel dark title="Live activity" icon={<TrendingUp className="h-4 w-4" />} right={<LiveDot on={connected} dark />}>
            <div className="max-h-[360px] overflow-y-auto pr-1">
              <EventFeed events={events} dark max={80} onOpen={(e) => e.incident_id ? nav(`incidents/${e.incident_id}`) : e.ticket_id && nav(`tickets/${e.ticket_id}`)} />
            </div>
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Incident board" icon={<Siren className="h-4 w-4" />} right={<Btn size="sm" variant="ghost" onClick={() => nav("incidents")}>All incidents</Btn>} pad={false}>
            {!inc?.length ? <div className="p-6 text-center text-[12.5px] text-ink-3">No open incidents. Start a scenario in the Simulation Lab or raise a ticket from the customer app.</div> : (
              <ul className="divide-y divide-line">
                {inc.slice(0, 7).map((i) => (
                  <li key={i.id}>
                    <button onClick={() => nav(`incidents/${i.id}`)} className="w-full px-4 py-3 text-left hover:bg-raised">
                      <div className="flex items-center gap-2">
                        <Sev s={i.severity} /><span className="font-mono text-[11.5px] text-ink-3">{i.id}</span><State s={i.state} />
                        <SimTag on={i.simulated} />
                      </div>
                      <div className="mt-1 text-[13px] font-semibold text-ink">{i.title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-ink-3">
                        <span>{i.affected_tickets} tickets</span><span>{i.resolved_tickets} resolved</span>
                        {i.pending_approvals > 0 && <span className="font-semibold text-violet-700">{i.pending_approvals} awaiting approval</span>}
                        {i.software_defect ? <span className="font-semibold text-serious">software defect suspected</span> : null}
                        <span>last {ago(i.last_seen)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Operational alerts" icon={<AlertTriangle className="h-4 w-4" />}>
            {alerts.length ? (
              <ul className="space-y-1.5">
                {alerts.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-[12px]">
                    <Pill tone={e.level === "error" ? "critical" : e.level === "warn" ? "warn" : "info"}>{e.type.split(".")[0]}</Pill>
                    <span className="min-w-0 flex-1 text-ink-2">{e.message}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{clock(e.ts)}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-[12.5px] text-ink-3">No alerts.</div>}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Ticket flow (last 15 min)" icon={<TrendingUp className="h-4 w-4" />} className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={series ?? []} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => clock(t).slice(0, 5)} tick={{ fontSize: 11, fill: "#64748B" }} minTickGap={30} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip labelFormatter={(t) => clock(Number(t))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="created" name="Tickets in" stroke="#0B3D71" fill="#0B3D71" fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="resolved" name="Verified resolved" stroke="#16A34A" fill="#16A34A" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Outcome card" icon={<Clock className="h-4 w-4" />} subtitle={s?.roi?.baseline_label}>
          {s?.roi && (
            <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div><dt className="text-ink-3">Reports grouped</dt><dd className="text-[20px] font-bold">{s.roi.tickets_grouped}<span className="ml-1 text-[12px] font-medium text-ink-3">into {s.roi.incidents} incident(s)</span></dd></div>
              <div><dt className="text-ink-3">Verified autonomously</dt><dd className="text-[20px] font-bold text-[#0B7A33]">{s.roi.verified_autonomous}</dd></div>
              <div><dt className="text-ink-3">Routed for human review</dt><dd className="text-[20px] font-bold text-violet-700">{s.roi.routed_for_review}</dd></div>
              <div><dt className="text-ink-3">Unauthorized financial actions</dt><dd className="text-[20px] font-bold">{s.roi.unauthorized_financial_actions}</dd></div>
              <div className="col-span-2 rounded-xl bg-raised p-3"><dt className="text-ink-3">Estimated handling time saved</dt>
                <dd className="text-[20px] font-bold">{Math.round(s.roi.minutes_saved_estimate / 60 * 10) / 10} h</dd></div>
            </dl>
          )}
        </Panel>
      </div>
    </div>
  );
}
