import { Inbox, Search } from "lucide-react";
import { useState } from "react";
import type { Nav } from "../App";
import { Btn, Drawer, Empty, KV, Panel, Pill, Segmented, Sev, SimTag, Spinner, State, inputCls, useRun } from "../components/kit";
import { session } from "../lib/session";
import { ago, clock, dur, label, rupees, useV1, v1 } from "../lib/v1";

const STATES = ["", "NEEDS_CUSTOMER", "INVESTIGATING", "APPROVAL_REQUIRED", "WAITING_PARTNER", "ESCALATED", "RESOLVED"];
const CATS = ["", "PAYMENTS_UPI", "MERCHANT_QR", "SOUNDBOX", "SETTLEMENT", "ACCOUNT_KYC", "FRAUD_SECURITY", "PLATFORM_OUTAGE", "GRIEVANCE", "PRIVACY_COMPLIANCE"];
const LANG: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };

export function Tickets({ nav, selected }: { nav: Nav; selected?: string }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [cat, setCat] = useState("");
  const [sev, setSev] = useState("");
  const [scope, setScope] = useState<"all" | "live" | "simulated">("all");
  const [page, setPage] = useState(0);
  const qs = new URLSearchParams({ limit: "50", offset: String(page * 50), scope, ...(q && { q }), ...(state && { state }), ...(cat && { category: cat }), ...(sev && { severity: sev }) });
  const { data, loading } = useV1<{ total: number; items: any[] }>(`/tickets?${qs}`, 2500);
  return (
    <div className="space-y-4">
      <Panel title="Customer tickets" icon={<Inbox className="h-4 w-4" />} subtitle="Every complaint is persisted before any agent runs - none is ever dropped"
        right={<Segmented value={scope} onChange={(v) => { setScope(v); setPage(0); }} options={[{ value: "all", label: "All" }, { value: "live", label: "Live" }, { value: "simulated", label: "Simulated" }]} />}>
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-3" aria-hidden />
            <input className={`${inputCls} pl-9`} placeholder="Search ticket ID, text, UTR…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search tickets" />
          </label>
          <select className={inputCls} value={state} onChange={(e) => { setState(e.target.value); setPage(0); }} aria-label="State">
            {STATES.map((s) => <option key={s} value={s}>{s ? label(s) : "Any state"}</option>)}
          </select>
          <select className={inputCls} value={cat} onChange={(e) => { setCat(e.target.value); setPage(0); }} aria-label="Category">
            {CATS.map((s) => <option key={s} value={s}>{s ? label(s) : "Any category"}</option>)}
          </select>
          <select className={inputCls} value={sev} onChange={(e) => { setSev(e.target.value); setPage(0); }} aria-label="Severity">
            {["", "SEV-1", "SEV-2", "SEV-3", "SEV-4"].map((s) => <option key={s} value={s}>{s || "Any severity"}</option>)}
          </select>
        </div>
        {loading && !data ? <Spinner /> : !data?.items.length ? <Empty icon={<Inbox className="h-6 w-6" />}>No tickets match. Raise one from the Customer App or run a simulation.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12.5px]">
              <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-3">
                <tr><th className="py-2 pr-3">Ticket</th><th className="pr-3">Issue</th><th className="pr-3">Severity</th><th className="pr-3">State</th>
                  <th className="pr-3">Language</th><th className="pr-3">Incident</th><th className="pr-3">Created</th></tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id} onClick={() => nav(`tickets/${t.id}`)} className="cursor-pointer border-b border-line/70 hover:bg-raised">
                    <td className="py-2 pr-3"><div className="font-mono text-[11.5px] font-semibold text-brand-2">{t.id}</div><SimTag on={t.simulated} /></td>
                    <td className="max-w-[340px] pr-3"><div className="truncate font-medium text-ink">{t.title ?? "Understanding…"}</div>
                      <div className="truncate text-[11.5px] text-ink-3">{t.problem}</div></td>
                    <td className="pr-3"><Sev s={t.severity} /></td>
                    <td className="pr-3"><State s={t.state} /></td>
                    <td className="pr-3">{LANG[t.locale] ?? t.locale}</td>
                    <td className="pr-3">{t.incident_id ? <span className="font-mono text-[11.5px] text-brand-2">{t.incident_id}</span> : <span className="text-ink-3">—</span>}</td>
                    <td className="pr-3 text-ink-3">{ago(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
              <span>{data.total} ticket(s)</span>
              <div className="flex gap-2">
                <Btn size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Btn>
                <Btn size="sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Next</Btn>
              </div>
            </div>
          </div>
        )}
      </Panel>
      <Drawer open={!!selected} onClose={() => nav("tickets")} title={selected ?? ""} wide>
        {selected && <TicketDetail id={selected} nav={nav} />}
      </Drawer>
    </div>
  );
}

export function TicketDetail({ id, nav }: { id: string; nav: Nav }) {
  const { data, reload } = useV1<any>(`/tickets/${id}`, 2000);
  const [tab, setTab] = useState<"conversation" | "timeline" | "actions" | "evidence">("conversation");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const { busy, run } = useRun();
  if (!data) return <Spinner />;
  const t = data.ticket;
  const facts = t.extracted?.facts ?? {};
  const tri = t.extracted?.triage ?? {};
  const canReply = session.can("ticket:reply");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sev s={t.severity} /><State s={t.state} /><Pill>{label(t.category)}</Pill><Pill tone="info">{LANG[t.locale] ?? t.locale}</Pill>
        <SimTag on={t.simulated} />
        {t.incident_id && <Btn size="sm" variant="ghost" onClick={() => nav(`incidents/${t.incident_id}`)}>Parent incident {t.incident_id} →</Btn>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Understanding" className="lg:col-span-1">
          <KV k="Issue" v={t.title} />
          <KV k="Subcategory" v={t.subcategory} />
          <KV k="Amount" v={rupees(t.amount)} />
          <KV k="Transaction ref" v={<span className="font-mono">{t.txn_ref ?? "—"}</span>} />
          <KV k="Device" v={t.device_model ?? "—"} />
          <KV k="Region" v={t.region ?? "—"} />
          <KV k="Confidence" v={t.confidence != null ? `${Math.round(t.confidence * 100)}%` : "—"} />
          <KV k="Method" v={<span className="text-[11.5px]">{t.extraction_method}</span>} />
          {t.missing_fields?.length > 0 && <KV k="Missing" v={<Pill tone="warn">{t.missing_fields.join(", ")}</Pill>} />}
          {facts.approx_time && <KV k="When" v={facts.approx_time} />}
        </Panel>
        <Panel title="Triage & SLA">
          <KV k="Severity (rule-based)" v={<Sev s={t.severity} />} />
          <KV k="Fingerprint" v={<span className="font-mono text-[11px]">{t.fingerprint}</span>} />
          <KV k="Playbook" v={tri.suggested_playbook ?? "—"} />
          <KV k="Human review" v={tri.human_review_required ? "required" : "not required"} />
          <KV k="First response due" v={t.first_response_due ? clock(t.first_response_due) : "—"} />
          <KV k="Resolution due" v={t.resolution_due ? new Date(t.resolution_due * 1000).toLocaleString() : "—"} />
          <KV k="First responded" v={t.first_responded_at ? `${dur(t.first_responded_at - t.created_at)} after creation` : "—"} />
          <div className="mt-2 flex flex-wrap gap-1">{(t.reason_codes ?? []).map((r: string) => <Pill key={r}>{r.toLowerCase()}</Pill>)}</div>
          <p className="mt-2 text-[10.5px] text-ink-3">{t.sla_policy} - demo targets, not regulatory deadlines</p>
        </Panel>
        <Panel title="Outcome">
          <KV k="State" v={<State s={t.state} />} />
          <KV k="Resolution" v={<span className="text-[11.5px]">{t.resolution_summary ?? "—"}</span>} />
          {t.extracted?.escalation_reason && <KV k="Escalation" v={<span className="text-[11.5px]">{t.extracted.escalation_reason}</span>} />}
          {t.extracted?.correlation_review && <KV k="Correlation review" v={<span className="text-[11.5px]">resembles {t.extracted.correlation_review.candidate} ({t.extracted.correlation_review.score})</span>} />}
          {canReply && t.state !== "RESOLVED" && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              <input className={inputCls} placeholder="Reason / verification note (min 5 chars)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision note" />
              <div className="flex flex-wrap gap-2">
                <Btn size="sm" variant="good" disabled={note.length < 5} busy={busy === "resolve"}
                  onClick={() => run("resolve", async () => { await v1(`/tickets/${id}/resolve`, { body: { note } }); setNote(""); reload(); }, "Resolved with your confirmation as verification")}>Confirm resolved</Btn>
                <Btn size="sm" variant="danger" disabled={note.length < 5} busy={busy === "esc"}
                  onClick={() => run("esc", async () => { await v1(`/tickets/${id}/escalate`, { body: { note } }); setNote(""); reload(); }, "Escalated")}>Escalate</Btn>
              </div>
            </div>
          )}
        </Panel>
      </div>
      <Segmented value={tab} onChange={setTab} options={[{ value: "conversation", label: `Conversation (${data.messages.length})` },
        { value: "timeline", label: `Event history (${data.events?.length ?? 0})` }, { value: "actions", label: `Actions (${data.actions?.length ?? 0})` },
        { value: "evidence", label: `Evidence (${data.evidence?.length ?? 0})` }]} />
      {tab === "conversation" && (
        <Panel>
          <div className="space-y-2">
            {data.messages.map((m: any) => (
              <div key={m.id} className={`flex ${m.role === "customer" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-[12.5px] ${m.role === "customer" ? "bg-raised" : m.role === "operator" ? "bg-violet-50 border border-violet-200" : m.kind === "safety" ? "border border-warn/40 bg-warn/10" : "bg-brand/5 border border-brand/10"}`}>
                  <div className="mb-0.5 text-[10.5px] font-semibold text-ink-3">{m.role === "agent" ? "FIXCHAIN assistant" : m.author} · {clock(m.created_at)}{m.meta && JSON.parse(m.meta || "{}").template ? ` · template ${JSON.parse(m.meta).template}` : ""}</div>
                  {m.body}
                </div>
              </div>
            ))}
          </div>
          {canReply && (
            <div className="mt-3 flex gap-2">
              <input className={inputCls} placeholder="Reply to the customer as an operator…" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Operator reply" />
              <Btn variant="primary" disabled={!reply.trim()} busy={busy === "reply"} onClick={() => run("reply", async () => { await v1(`/tickets/${id}/messages`, { body: { message: reply } }); setReply(""); reload(); })}>Send</Btn>
            </div>
          )}
        </Panel>
      )}
      {tab === "timeline" && (
        <Panel>
          <ol className="space-y-1 text-[12px]">
            {(data.events ?? []).map((e: any) => (
              <li key={e.id} className="flex gap-2"><span className="w-[70px] shrink-0 font-mono text-[10.5px] text-ink-3">{clock(e.ts)}</span>
                <Pill tone={e.level === "error" ? "critical" : e.level === "warn" ? "warn" : "neutral"}>{e.type}</Pill>
                <span className="text-ink-2"><b className="text-brand-2">{e.actor_id}</b> {e.message}</span></li>
            ))}
          </ol>
          {data.tasks?.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 text-[12px] font-semibold">Agent tasks</div>
              <table className="w-full text-[11.5px]"><tbody>
                {data.tasks.map((k: any) => (
                  <tr key={k.id} className="border-b border-line/60"><td className="py-1 pr-2">{k.agent}</td><td className="pr-2">{k.task_type}</td>
                    <td className="pr-2"><State s={k.status === "succeeded" ? "verified" : k.status === "dead" ? "blocked" : "in_progress"} /></td>
                    <td className="pr-2 tabular-nums">{k.duration_ms != null ? `${k.duration_ms} ms` : "—"}</td><td>attempt {k.attempts}</td>
                    <td className="text-critical">{k.error}</td></tr>
                ))}
              </tbody></table>
            </div>
          )}
        </Panel>
      )}
      {tab === "actions" && (
        <Panel>
          {!data.actions?.length ? <Empty>No actions yet.</Empty> : (
            <ul className="space-y-2">
              {data.actions.map((a: any) => {
                const ap = data.approvals.find((p: any) => p.action_id === a.id);
                return (
                  <li key={a.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{label(a.action_type)}</span><Pill>Tier {a.tier}</Pill><State s={a.status} />
                      {a.playbook_key && <span className="text-[11px] text-ink-3">{a.playbook_key} v{a.playbook_version}</span>}</div>
                    <div className="mt-1 text-[12px] text-ink-2">{a.rationale}</div>
                    {ap && <div className="mt-1 text-[11.5px] text-ink-3">Approval #{ap.id}: <State s={ap.status} /> {ap.decided_by && `by ${ap.decided_by} (${ap.decided_role})`} {ap.note && `- "${ap.note}"`}</div>}
                    {a.result && <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-raised p-2 font-mono text-[10.5px] text-ink-2">{JSON.stringify(a.result, null, 1)}</pre>}
                  </li>
                );
              })}
            </ul>
          )}
          {data.verifications?.length > 0 && (
            <div className="mt-3 text-[12px]"><b>Verifications:</b> {data.verifications.map((v: any) => `${v.method} → ${v.passed === 1 ? "passed" : v.passed === 0 ? "failed" : "pending external"} (${v.source})`).join("; ")}</div>
          )}
        </Panel>
      )}
      {tab === "evidence" && (
        <Panel>
          {!data.evidence?.length ? <Empty>No evidence collected yet.</Empty> : (
            <ul className="space-y-1.5 text-[12.5px]">
              {data.evidence.map((e: any) => (
                <li key={e.id} className="flex gap-2"><Pill tone={e.kind === "fact" ? "good" : e.kind === "hypothesis" ? "warn" : "info"}>{e.kind}</Pill>
                  <span className="text-ink-2">{e.summary} <span className="text-[11px] text-ink-3">({e.source})</span></span></li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
