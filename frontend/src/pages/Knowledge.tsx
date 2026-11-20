import { BookOpen, Brain, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { Btn, Empty, Panel, Pill, Segmented, Spinner, State, inputCls, useRun } from "../components/kit";
import { session } from "../lib/session";
import { ago, label, useV1, v1 } from "../lib/v1";

export function Knowledge() {
  const [tab, setTab] = useState<"knowledge" | "playbooks">("knowledge");
  const [q, setQ] = useState("");
  const { data, reload } = useV1<any[]>(`/knowledge${q ? `?q=${encodeURIComponent(q)}` : ""}`, 4000);
  const { data: pbs, reload: reloadPb } = useV1<any[]>("/playbooks", 6000);
  const { busy, run } = useRun();
  const canApprove = session.can("knowledge:approve");
  const decide = (id: number, ok: boolean) => run(`k${id}`, async () => { await v1(`/knowledge/${id}/${ok ? "approve" : "reject"}`, { body: { note: "" } }); reload(); reloadPb(); }, ok ? "Published" : "Rejected");
  const byKey = new Map<string, any[]>();
  (pbs ?? []).forEach((p) => byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]));
  return (
    <div className="space-y-4">
      <Panel title="Knowledge & learning" icon={<Brain className="h-4 w-4" />}
        subtitle="The Learning agent records verified outcomes and proposes improvements. Nothing is published - and no policy or safety rule changes - without an authorised human."
        right={<div className="flex gap-2">
          {session.can("knowledge:propose") && <Btn size="sm" busy={busy === "an"} onClick={() => run("an", async () => { const r = await v1<any>("/knowledge/analyse", { body: {} }); reload(); return r; }, "Pattern analysis complete")}><Sparkles className="h-3.5 w-3.5" />Analyse outcomes</Btn>}
          <Segmented value={tab} onChange={setTab} options={[{ value: "knowledge", label: "Knowledge base" }, { value: "playbooks", label: "Playbooks" }]} /></div>}>
        {tab === "knowledge" ? (
          <>
            <label className="relative mb-3 block max-w-md"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-3" />
              <input className={`${inputCls} pl-9`} placeholder="Search findings, articles, proposals…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search knowledge" /></label>
            {!data ? <Spinner /> : !data.length ? <Empty icon={<BookOpen className="h-6 w-6" />}>No knowledge yet. Findings are recorded when an incident's resolution is verified.</Empty> : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.map((k) => (
                  <article key={k.id} className="rounded-2xl border border-line bg-panel p-4">
                    <div className="flex flex-wrap items-center gap-2"><Pill tone={k.kind === "playbook_proposal" ? "violet" : "info"}>{label(k.kind)}</Pill><State s={k.status} />
                      {k.category && <Pill>{label(k.category)}</Pill>}{k.review_overdue && <Pill tone="warn">review overdue</Pill>}
                      <span className="ml-auto text-[11px] text-ink-3">confidence {Math.round((k.confidence ?? 0) * 100)}% · {ago(k.created_at)}</span></div>
                    <h3 className="mt-2 text-[13.5px] font-semibold">{k.title}</h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{k.body}</p>
                    <div className="mt-2 text-[11px] text-ink-3">by {k.created_by} agent{k.source_incident_id && ` · from ${k.source_incident_id}`}{k.decided_by && ` · decided by ${k.decided_by}`}</div>
                    {k.status === "proposed" && (canApprove ? (
                      <div className="mt-3 flex gap-2 border-t border-line pt-3">
                        <Btn size="sm" variant="good" busy={busy === `k${k.id}`} onClick={() => decide(k.id, true)}>{k.playbook_key ? "Approve & publish playbook version" : "Approve"}</Btn>
                        <Btn size="sm" variant="danger" onClick={() => decide(k.id, false)}>Reject</Btn>
                      </div>) : <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-ink-3">Awaiting an approver.</p>)}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {Array.from(byKey.entries()).map(([key, versions]) => (
              <div key={key} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12.5px] font-semibold">{key}</span><Pill>Tier {versions[0].risk_tier}</Pill><Pill>{label(versions[0].category)}</Pill></div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {versions.map((v) => (
                    <div key={v.id} className={`rounded-xl border p-3 text-[12px] ${v.status === "approved" ? "border-good/40 bg-good/5" : "border-line"}`}>
                      <div className="flex items-center gap-2"><b>v{v.version}</b><State s={v.status} /><span className="text-ink-3">source {v.source}{v.approved_by && ` · approved by ${v.approved_by}`}</span></div>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-2">{(v.steps.steps ?? []).map((s: string) => <li key={s}>{s}</li>)}</ol>
                      {Object.keys(v.steps.options ?? {}).length > 0 && <div className="mt-1 font-mono text-[11px] text-ink-3">options {JSON.stringify(v.steps.options)}</div>}
                      {v.steps.rationale && <p className="mt-1 text-[11.5px] text-violet-700">{v.steps.rationale}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
