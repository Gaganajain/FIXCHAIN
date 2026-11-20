import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Incident, LogLine, Metrics, ago, clock, rupees, usePoll } from "../api";
import { Badge, Card, Empty, Kpi, incidentTone, severityTone } from "../ui";

const SERIES = [
  { key: "SUCCESS", color: "#00C851" },
  { key: "PENDING", color: "#F59E0B" },
  { key: "FAILED", color: "#EF4444" },
];

const axis = { stroke: "#CBD5E1", fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm shadow-card">
      <div className="mb-2 text-ink-3">until {clock(label)}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-ink">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="ml-auto pl-4 tabular-nums font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-6 text-sm text-ink-2">
      {SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.key}
        </span>
      ))}
    </div>
  );
}

export function Overview({ openIncident }: { openIncident: (id: number) => void }) {
  const { data: m } = usePoll<Metrics>("/metrics", 2000);
  const { data: incidents } = usePoll<Incident[]>("/incidents", 2000);
  const { data: logs } = usePoll<LogLine[]>("/logs?limit=14", 2000);

  const healthTone = !m ? undefined : m.health_score >= 99 ? "good" : m.health_score >= 90 ? "warn" : "critical";
  const atRisk = (incidents ?? []).filter((i) => i.status !== "resolved").reduce((s, i) => s + i.impact.revenue_at_risk, 0);

  return (
    <div className="space-y-5">
      {/* KPI Row */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Kpi label="Integration health" value={m ? `${m.health_score}%` : "—"} tone={m && m.health_window ? healthTone : undefined}
          sub={m ? (m.health_window ? `last ${m.health_window} callbacks` : "no callbacks yet") : ""} />
        <Kpi label="Callbacks processed" value={m?.callbacks ?? "—"} sub={`${m?.orders ?? 0} orders`} />
        <Kpi label="State mismatches" value={m?.mismatches ?? "—"} sub="gateway ≠ order" />
        <Kpi label="Open incidents" value={m?.open_incidents ?? "—"} sub={`${m?.resolved_incidents ?? 0} resolved`} />
        <Kpi label="Revenue at risk" value={rupees(atRisk)} sub="simulated estimate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Callbacks chart */}
        <Card title="Callbacks by gateway status" right={<Legend />} className="lg:col-span-2">
          {m && m.series.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.series} barCategoryGap={6}>
                <CartesianGrid vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="t" tickFormatter={clock} {...axis} minTickGap={40} />
                <YAxis allowDecimals={false} {...axis} width={28} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#0f172a0a" }} />
                {SERIES.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} name={s.key} stackId="a" fill={s.color} stroke="#ffffff" strokeWidth={1}
                    radius={[8, 8, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>No callbacks yet. Run a checkout from the Simulator.</Empty>
          )}
        </Card>

        {/* Mismatches */}
        <Card title="Payment-state mismatches">
          {m && m.series.length ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={m.series} barCategoryGap={6}>
                  <CartesianGrid vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="t" hide />
                  <YAxis allowDecimals={false} {...axis} width={24} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#0f172a0a" }} />
                  <Bar dataKey="mismatches" name="Mismatches" fill="#EF4444" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {Object.entries(m.mismatch_types).length === 0 && <div className="text-[12px] text-ink-3">✓ No mismatches recorded</div>}
                {Object.entries(m.mismatch_types).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-ink-2">{k}</span>
                    <span className="tabular-nums font-semibold text-ink">{v}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty>—</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Incidents list */}
        <Card title="Incidents" pad={false}>
          {!incidents?.length ? (
            <Empty>No incidents detected.</Empty>
          ) : (
            <div className="divide-y divide-line">
              {incidents.slice(0, 6).map((i) => (
                <button key={i.id} onClick={() => openIncident(i.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised/50 transition-colors">
                  <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">#{i.id} {i.title}</span>
                  <span className="text-[12px] text-ink-3">{i.impact.affected_orders} orders</span>
                  <Badge tone={incidentTone(i.status)}>{i.status.replace("_", " ")}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Live log */}
        <Card title="Application log (live)" pad={false}>
          <div className="max-h-[260px] overflow-auto px-4 py-2 font-mono text-[11px] leading-5">
            {(logs ?? []).map((l) => (
              <div key={l.id} className="flex gap-2">
                <span className="shrink-0 text-ink-3">{ago(l.ts)}</span>
                <span className={`shrink-0 ${l.level === "ERROR" ? "text-critical" : l.level === "WARN" ? "text-warn" : "text-ink-3"}`}>{l.level}</span>
                <span className="shrink-0 text-brand-2">{l.source}</span>
                <span className="truncate text-ink-2" title={l.message}>{l.message}</span>
              </div>
            ))}
            {!logs?.length && <Empty>No log lines yet.</Empty>}
          </div>
        </Card>
      </div>
    </div>
  );
}
