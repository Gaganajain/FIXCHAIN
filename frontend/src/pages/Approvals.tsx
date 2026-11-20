import { CheckCheck, Lock, ShieldCheck, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { Btn, Empty, Panel, Pill, Segmented, Sev, SimTag, Spinner, State, inputCls, useRun } from "../components/kit";
import { session } from "../lib/session";
import { ago, label, rupees, useV1, v1 } from "../lib/v1";

const TIER_TONE: Record<number, string> = { 2: "violet", 3: "critical" };

function ApprovalCard({ a, onDone, nav }: { a: any; onDone: () => void; nav: Nav }) {
  const [note, setNote] = useState("");
  const { busy, run } = useRun();
  const decide = (approve: boolean) => run(approve ? "a" : "r", async () => { await v1(`/approvals/${a.id}/${approve ? "approve" : "reject"}`, { body: { note } }); onDone(); },
    approve ? (a.tier === 3 ? "Ownership recorded - human-led case" : "Approved - execution queued, then verified") : "Rejected - customer will be routed to a specialist");
  const p = a.payload ?? {};
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={TIER_TONE[a.tier] ?? "neutral"}>Tier {a.tier}{a.tier === 3 ? " · human-led" : " · approval"}</Pill>
        <span className="font-semibold">{label(a.action_type)}</span>
        {a.incident_severity && <Sev s={a.incident_severity} />}
        <SimTag on={p._simulated} />
        <span className="ml-auto text-[11px] text-ink-3">#{a.id} · {ago(a.created_at)} · expires {ago(a.expires_at).replace(" ago", "") === "0s" ? "now" : new Date(a.expires_at * 1000).toLocaleTimeString()}</span>
      </div>
      <div className="mt-2 text-[13.5px] font-semibold text-ink">{a.summary}</div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
        <div><dt className="inline text-ink-3">Evidence: </dt><dd className="inline text-ink-2">{a.evidence_summary ?? "—"}</dd></div>
        <div><dt className="inline text-ink-3">Expected effect: </dt><dd className="inline text-ink-2">{a.expected_effect ?? "—"}</dd></div>
        <div><dt className="inline text-ink-3">Reversible: </dt><dd className="inline font-semibold">{a.reversible ? "yes" : "no"}</dd></div>
        <div><dt className="inline text-ink-3">Requested by: </dt><dd className="inline">{a.requested_by} agent</dd></div>
        {p.amount_paise && <div><dt className="inline text-ink-3">Amount: </dt><dd className="inline font-semibold">{rupees(p.amount_paise)}</dd></div>}
        <div className="sm:col-span-2"><dt className="inline text-ink-3">Policy: </dt><dd className="inline text-ink-2">{a.policy_reason}</dd></div>
        <div className="sm:col-span-2 text-[11px] text-ink-3">
          {a.ticket_id && <button className="mr-3 font-mono text-brand-2 hover:underline" onClick={() => nav(`tickets/${a.ticket_id}`)}>{a.ticket_id}</button>}
          {(a.incident_id) && <button className="mr-3 font-mono text-brand-2 hover:underline" onClick={() => nav(`incidents/${a.incident_id}`)}>{a.incident_id}</button>}
          <span className="font-mono">payload sha256 {a.payload_hash.slice(0, 16)}…</span> - any change to the action invalidates this approval
        </div>
      </dl>
      {a.status === "pending" ? (a.can_decide ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input className={`${inputCls} max-w-sm`} placeholder="Note for the audit trail (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision note" />
          <Btn variant="good" busy={busy === "a"} onClick={() => decide(true)}>{a.tier === 3 ? "Take ownership" : "Approve & execute"}</Btn>
          <Btn variant="danger" busy={busy === "r"} onClick={() => decide(false)}>Reject</Btn>
        </div>
      ) : <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[12px] text-ink-3"><Lock className="h-3.5 w-3.5" />Requires role: {a.required_role}. Your role ({session.user()?.role}) can view but not decide.</div>)
        : <div className="mt-3 border-t border-line pt-3 text-[12px]"><State s={a.status} /> {a.decided_by && <>by <b>{a.decided_by}</b> ({a.decided_role})</>} {a.note && `- "${a.note}"`}</div>}
    </div>
  );
}

export function Approvals({ nav }: { nav: Nav }) {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const { data, reload } = useV1<any[]>(`/approvals?status=${tab}&limit=1000`, 2500);
  const { busy, run } = useRun();
  const groups = useMemo(() => {
    const g = new Map<string, any[]>();
    (data ?? []).forEach((a) => {
      const k = `${a.incident_id ?? (a.ticket_id && a.incident_title ? "inc" : "")}|${a.action_type}`;
      const key = a.incident_title ? `${a.incident_title}|${a.action_type}` : k;
      g.set(key, [...(g.get(key) ?? []), a]);
    });
    return Array.from(g.entries());
  }, [data]);
  const canDecide = session.can("approval:decide");
  return (
    <div className="space-y-4">
      <Panel title="Resolution & approvals" icon={<ShieldCheck className="h-4 w-4" />}
        subtitle="Tier 2 actions run only after an authorised approval; Tier 3 decisions stay human-led. Every decision is audited."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: "pending", label: `Pending${tab === "pending" && data ? ` (${data.length})` : ""}` }, { value: "all", label: "History" }]} />}>
        {!data ? <Spinner /> : !data.length ? <Empty icon={<CheckCheck className="h-6 w-6" />}>{tab === "pending" ? "No decisions waiting." : "No approvals yet."}</Empty> : (
          <div className="space-y-5">
            {groups.map(([key, items]) => {
              const first = items[0];
              const incId = first.incident_id ?? null;
              const bulkable = tab === "pending" && items.length > 1 && first.tier === 2 && canDecide && items.every((x) => x.can_decide);
              const incidentForBulk = incId ?? (first.ticket_id ? null : null);
              return (
                <section key={key}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-bold">{label(first.action_type)}</h3>
                    <Pill>{items.length} request(s)</Pill>
                    {first.incident_title && <span className="text-[12px] text-ink-3">in {first.incident_title}</span>}
                    {bulkable && (incidentForBulk || first.ticket_id) && (
                      <Btn size="sm" variant="good" busy={busy === key} onClick={() => run(key, async () => {
                        const inc = incId ?? (await v1<any>(`/tickets/${first.ticket_id}`)).ticket.incident_id;
                        if (!inc) throw new Error("These requests are not part of one incident - decide them individually");
                        const r = await v1<any>("/approvals/bulk", { body: { action_type: first.action_type, incident_id: inc, approve: true, note: "bulk approval" } });
                        reload();
                        return r;
                      }, `Approved ${items.length} - each checked and audited individually`)}><CheckCheck className="h-3.5 w-3.5" />Approve all {items.length}</Btn>
                    )}
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {items.slice(0, 6).map((a) => <ApprovalCard key={a.id} a={a} onDone={reload} nav={nav} />)}
                  </div>
                  {items.length > 6 && <p className="mt-2 text-[12px] text-ink-3"><Undo2 className="mr-1 inline h-3 w-3" />{items.length - 6} more identical-policy requests in this group.</p>}
                </section>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
