import { BarChart3, LineChart as LineIcon } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Kpi, Panel, Segmented, Spinner } from "../components/kit";
import { clock, dur, label, pct, useV1 } from "../lib/v1";

const CAT_COLORS: Record<string, string> = { PAYMENTS_UPI: "#0B3D71", SOUNDBOX: "#00A8E8", MERCHANT_QR: "#7C3AED", SETTLEMENT: "#F59E0B", PLATFORM_OUTAGE: "#DC2626", FRAUD_SECURITY: "#C2511F" };
const SEV_COLORS: Record<string, string> = { "SEV-1": "#DC2626", "SEV-2": "#C2511F", "SEV-3": "#F59E0B", "SEV-4": "#94A3B8", "-": "#CBD5E1" };

export function Analytics() {
  const [scope, setScope] = useState<"all" | "live" | "simulated">("all");
  const [win, setWin] = useState<"60" | "360" | "1440">("60");
  const { data: s } = useV1<any>(`/analytics/summary?scope=${scope}`, 5000);
  const { data: series } = useV1<any[]>(`/analytics/series?minutes=${win}&bucket_s=${Number(win) <= 60 ? 60 : Number(win) <= 360 ? 300 : 1800}`, 10000);
  if (!s) return <Spinner />;
  const metrics: [string, string, string][] = [
    ["Time to first response", dur(s.time_to_first_response_s), "Ticket created → first customer-facing response"],
    ["Time to triage", dur(s.time_to_triage_s), "Ticket created → validated category and severity"],
    ["Time to correlate", dur(s.time_to_correlate_s), "First ticket in a cluster → parent incident created"],
    ["MTTA", dur(s.mtta_s), "Incident detected → operational ownership"],
    ["MTTR", dur(s.mttr_s), "Incident start → verified resolution"],
    ["Autonomous resolution rate", pct(s.autonomous_resolution_rate), "Eligible tickets resolved and verified with no human action"],
    ["Escalation rate", pct(s.escalation_rate), "Tickets escalated to a human / total"],
    ["Reopen rate", pct(s.reopen_rate), "Resolved tickets reopened / resolved"],
    ["Duplicate reduction", pct(s.duplicate_reduction), "Tickets linked to a parent incident / total"],
    ["Safety exception rate", pct(s.safety_exception_rate), "Actions blocked, rejected or failing verification / attempted"],
    ["SLA - first response met", pct(s.sla_first_response_met), "Against demo SLA targets"],
    ["SLA - resolution on track", pct(s.sla_resolution_on_track), "Against demo SLA targets"],
  ];
  const pie = (o: Record<string, number>) => Object.entries(o).map(([name, value]) => ({ name, value }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={scope} onChange={setScope} options={[{ value: "all", label: "All data" }, { value: "live", label: "Live" }, { value: "simulated", label: "Simulated" }]} />
        <Segmented value={win} onChange={setWin} options={[{ value: "60", label: "1 h" }, { value: "360", label: "6 h" }, { value: "1440", label: "24 h" }]} />
        <span className="text-[12px] text-ink-3">Metrics are computed from stored tickets, events and actions - never estimated by a model.</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Tickets" value={s.tickets} /><Kpi label="Resolved" value={s.resolved} tone="good" /><Kpi label="Escalated" value={s.escalated} tone="critical" />
        <Kpi label="Incidents" value={s.incidents} tone="info" /><Kpi label="Pending approvals" value={s.pending_approvals} tone="violet" />
        <Kpi label="Unauthorized consequential actions" value={s.unauthorized_consequential_actions} tone={s.unauthorized_consequential_actions ? "critical" : "good"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Tickets by category over time" icon={<LineIcon className="h-4 w-4" />} className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={series ?? []} margin={{ left: -20, right: 8, top: 6 }}>
                <CartesianGrid stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="t" tickFormatter={(t) => clock(t).slice(0, 5)} tick={{ fontSize: 10, fill: "#64748B" }} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748B" }} />
                <Tooltip labelFormatter={(t) => clock(Number(t))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => label(v)} />
                {Object.entries(CAT_COLORS).map(([k, c]) => <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Severity mix" icon={<BarChart3 className="h-4 w-4" />}>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie(s.by_severity)} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2}>
                  {pie(s.by_severity).map((d) => <Cell key={d.name} fill={SEV_COLORS[d.name] ?? "#94A3B8"} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Operational metrics (PRD §13.2)" className="xl:col-span-2" pad={false}>
          <table className="w-full text-[12.5px]"><tbody>
            {metrics.map(([k, v, d]) => (
              <tr key={k} className="border-b border-line last:border-0"><td className="px-4 py-2 font-semibold">{k}</td><td className="px-4 text-right text-[15px] font-bold tabular-nums">{v}</td><td className="px-4 text-[11.5px] text-ink-3">{d}</td></tr>
            ))}
          </tbody></table>
        </Panel>
        <Panel title="Categories & languages">
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={pie(s.by_category)} layout="vertical" margin={{ left: 20, right: 8 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" width={120} tickFormatter={(v) => label(v)} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>{pie(s.by_category).map((d) => <Cell key={d.name} fill={CAT_COLORS[d.name] ?? "#64748B"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
            {Object.entries(s.by_locale).map(([k, v]) => <span key={k} className="rounded-lg bg-raised px-2 py-1">{{ en: "English", hi: "Hindi", mr: "Marathi" }[k] ?? k}: <b>{v as number}</b></span>)}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">{s.roi.baseline_label}</p>
        </Panel>
      </div>
    </div>
  );
}
