import { Download, FileText, Megaphone, RefreshCw, Siren } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Nav } from "../App";
import { Btn, Drawer, Empty, KV, Panel, Pill, Segmented, Sev, SimTag, Spinner, State, useRun } from "../components/kit";
import { session } from "../lib/session";
import { ago, clock, label, useV1, v1 } from "../lib/v1";

export function Incidents({ nav, selected }: { nav: Nav; selected?: string }) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const { data } = useV1<any[]>(`/incidents${filter === "open" ? "?state=open" : ""}`, 2500);
  return (
    <div className="space-y-4">
      <Panel title="Operational incidents" icon={<Siren className="h-4 w-4" />} subtitle="Parent incidents formed by clustering related tickets - each ticket keeps its own SLA and conversation"
        right={<Segmented value={filter} onChange={setFilter} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />}>
        {!data ? <Spinner /> : !data.length ? <Empty icon={<Siren className="h-6 w-6" />}>No incidents. Incidents open when 3+ similar tickets arrive within 30 minutes, or for a single high-impact report.</Empty> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.map((i) => (
              <button key={i.id} onClick={() => nav(`incidents/${i.id}`)} className="rounded-2xl border border-line bg-panel p-4 text-left shadow-card transition-shadow hover:shadow-cardHover">
                <div className="flex flex-wrap items-center gap-1.5"><Sev s={i.severity} /><State s={i.state} /><SimTag on={i.simulated} />
                  {i.kind === "platform" && <Pill tone="critical">platform</Pill>}</div>
                <div className="mt-2 text-[14px] font-semibold text-ink">{i.title}</div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-3">{i.id} · {i.fingerprint}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-raised py-1.5"><div className="text-[16px] font-bold">{i.affected_tickets}</div><div className="text-[10.5px] text-ink-3">tickets</div></div>
                  <div className="rounded-xl bg-raised py-1.5"><div className="text-[16px] font-bold text-[#0B7A33]">{i.resolved_tickets}</div><div className="text-[10.5px] text-ink-3">resolved</div></div>
                  <div className="rounded-xl bg-raised py-1.5"><div className="text-[16px] font-bold text-violet-700">{i.pending_approvals}</div><div className="text-[10.5px] text-ink-3">approvals</div></div>
                </div>
                {i.hypothesis && <p className="mt-3 line-clamp-2 text-[12px] text-ink-2"><Pill tone={i.hypothesis_status === "confirmed" ? "good" : "warn"}>{i.hypothesis_status}</Pill> {i.hypothesis}</p>}
                <div className="mt-2 text-[11px] text-ink-3">{i.regions?.join(", ")} · last report {ago(i.last_seen)}</div>
              </button>
            ))}
          </div>
        )}
      </Panel>
      <Drawer open={!!selected} onClose={() => nav("incidents")} title={selected ?? ""} wide>
        {selected && <IncidentDetail id={selected} nav={nav} />}
      </Drawer>
    </div>
  );
}

function IncidentDetail({ id, nav }: { id: string; nav: Nav }) {
  const { data, reload } = useV1<any>(`/incidents/${id}`, 2500);
  const [tab, setTab] = useState<"brief" | "tickets" | "timeline" | "report">("brief");
  const [report, setReport] = useState<string | null>(null);
  const { busy, run } = useRun();
  if (!data) return <Spinner />;
  const inc = data.incident;
  const manage = session.can("incident:manage");
  const loadReport = () => run("report", async () => setReport(await v1<string>(`/incidents/${id}/report`, { text: true })));
  const download = () => {
    if (!report) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
    a.download = `${id}-incident-report-DRAFT.md`;
    a.click();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sev s={inc.severity} /><State s={inc.state} /><SimTag on={inc.simulated} /><span className="text-[15px] font-bold">{inc.title}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Tickets", inc.affected_tickets], ["Merchants", inc.affected_merchants], ["Customers", inc.affected_customers], ["Regions", inc.regions.length]].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-line bg-panel p-3"><div className="text-[11px] text-ink-3">{k}</div><div className="text-[20px] font-bold">{v}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {manage && <Btn size="sm" busy={busy === "inv"} onClick={() => run("inv", async () => { await v1(`/incidents/${id}/investigate`, { body: {} }); reload(); }, "Re-investigation queued")}><RefreshCw className="h-3.5 w-3.5" />Re-investigate</Btn>}
        {manage && <Btn size="sm" busy={busy === "bc"} onClick={() => run("bc", async () => { const r = await v1<any>(`/incidents/${id}/status-update`, { body: { template: inc.kind === "platform" ? "outage" : "linked_incident" } }); return r; }, "Approved status update sent in each customer's language")}><Megaphone className="h-3.5 w-3.5" />Send status update</Btn>}
        {data.pending_approvals.length > 0 && <Btn size="sm" variant="primary" onClick={() => nav("approvals")}>Review {data.pending_approvals.length} approval(s)</Btn>}
        {data.engineering && <Btn size="sm" variant="ghost" onClick={() => nav(`engineering/${data.engineering.id}`)}>Engineering {data.engineering.id}: {label(data.engineering.status)} →</Btn>}
      </div>
      <Segmented value={tab} onChange={(v) => { setTab(v); if (v === "report" && !report) loadReport(); }} options={[{ value: "brief", label: "Copilot brief" }, { value: "tickets", label: "Linked tickets" }, { value: "timeline", label: "Timeline" }, { value: "report", label: "Report (draft)" }]} />
      {tab === "brief" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Summary" subtitle="Operations Copilot - facts and hypotheses are kept separate">
            <p className="text-[13px] leading-relaxed text-ink">{data.summary ?? "Investigation pending…"}</p>
            <div className="mt-3 space-y-2">
              <div className="text-[12px] font-semibold">Root-cause hypotheses</div>
              {!data.hypotheses.length ? <div className="text-[12px] text-ink-3">None yet.</div> : data.hypotheses.map((h: any, i: number) => (
                <div key={i} className="rounded-xl border border-line p-2.5 text-[12.5px]"><Pill tone={h.status === "confirmed" ? "good" : h.status === "rejected" ? "neutral" : "warn"}>{h.status}</Pill> {h.summary}</div>
              ))}
              <p className="text-[10.5px] text-ink-3">A hypothesis is confirmed only by reproduction plus a verified, approved fix, or a verified mitigation.</p>
            </div>
          </Panel>
          <Panel title="Why this severity" subtitle="Computed by rules from observable factors - not by the model">
            <KV k="Severity" v={<Sev s={data.severity_explanation.severity} />} />
            <KV k="Score" v={data.severity_explanation.score} />
            <div className="mt-2 flex flex-wrap gap-1">{data.severity_explanation.factors.map((f: string) => <Pill key={f}>{f}</Pill>)}</div>
            <div className="mt-4 text-[12px] font-semibold">Recommended next actions</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-2">{data.next_actions.map((n: string) => <li key={n}>{n}</li>)}</ul>
          </Panel>
          <Panel title="Evidence" subtitle="Facts from connectors and records; observations are interpretations">
            <ul className="space-y-1.5 text-[12.5px]">
              {[...data.facts, ...data.observations].map((e: any, i: number) => (
                <li key={i} className="flex gap-2"><Pill tone={e.kind === "fact" ? "good" : "info"}>{e.kind}</Pill><span className="text-ink-2">{e.summary} <span className="text-[11px] text-ink-3">({e.source})</span></span></li>
              ))}
            </ul>
          </Panel>
          <Panel title="Growth & spread">
            <div className="h-36">
              <ResponsiveContainer>
                <BarChart data={data.growth} margin={{ left: -24, right: 4 }}>
                  <XAxis dataKey="t" tickFormatter={(t) => `+${t}s`} tick={{ fontSize: 10, fill: "#64748B" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748B" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} labelFormatter={(t) => `+${t}s after first report`} />
                  <Bar dataKey="n" name="Reports" fill="#0B3D71" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
              {data.regions.map((r: any) => <Pill key={r.region}>{r.region}: {r.n}</Pill>)}
              {data.languages.map((r: any) => <Pill key={r.locale} tone="info">{{ en: "English", hi: "Hindi", mr: "Marathi" }[r.locale as string] ?? r.locale}: {r.n}</Pill>)}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">{data.ticket_states.map((s: any) => <span key={s.state} className="text-[11.5px]"><State s={s.state} /> {s.n}</span>)}</div>
            <div className="mt-3 text-[12px] font-semibold">Actions</div>
            <ul className="mt-1 text-[12px] text-ink-2">{data.actions.map((a: any, i: number) => <li key={i}>{label(a.action_type)} · Tier {a.tier} · <State s={a.status} /> ×{a.n}</li>)}</ul>
          </Panel>
        </div>
      )}
      {tab === "tickets" && (
        <Panel pad={false}>
          <table className="w-full text-[12.5px]"><tbody>
            {data.tickets.map((t: any) => (
              <tr key={t.id} className="cursor-pointer border-b border-line hover:bg-raised" onClick={() => nav(`tickets/${t.id}`)}>
                <td className="px-4 py-2 font-mono text-[11.5px] text-brand-2">{t.id}</td><td>{t.title}</td><td><State s={t.state} /></td><td>{t.locale}</td><td>{t.region}</td><td className="pr-4 text-ink-3">{ago(t.created_at)}</td>
              </tr>
            ))}
          </tbody></table>
          {inc.affected_tickets > data.tickets.length && <div className="p-3 text-[12px] text-ink-3">Showing the latest {data.tickets.length} of {inc.affected_tickets}. Filter by incident in Customer Tickets for the full list.</div>}
        </Panel>
      )}
      {tab === "timeline" && (
        <Panel>
          <ol className="space-y-1 text-[12px]">
            {data.timeline.map((e: any) => (
              <li key={e.id} className="flex gap-2"><span className="w-[70px] shrink-0 font-mono text-[10.5px] text-ink-3">{clock(e.ts)}</span>
                <Pill tone={e.level === "error" ? "critical" : e.level === "warn" ? "warn" : "neutral"}>{e.type}</Pill><span className="text-ink-2"><b className="text-brand-2">{e.actor_id}</b> {e.message}</span></li>
            ))}
          </ol>
        </Panel>
      )}
      {tab === "report" && (
        <Panel title="Incident report - draft for human review" icon={<FileText className="h-4 w-4" />}
          right={<div className="flex gap-2"><Btn size="sm" busy={busy === "report"} onClick={loadReport}><RefreshCw className="h-3.5 w-3.5" />Regenerate</Btn><Btn size="sm" variant="primary" disabled={!report} onClick={download}><Download className="h-3.5 w-3.5" />Download .md</Btn></div>}>
          <p className="mb-2 rounded-xl border border-warn/40 bg-warn/10 p-2 text-[12px]">Not filed with any regulator or partner. Regulatory filing is human-led (Tier 3).</p>
          {report ? <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-raised p-3 font-mono text-[11.5px] leading-relaxed text-ink">{report}</pre> : <Spinner label="Preparing draft…" />}
        </Panel>
      )}
    </div>
  );
}
