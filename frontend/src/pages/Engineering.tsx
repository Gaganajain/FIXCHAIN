import { CheckCircle2, Circle, GitPullRequest, Loader2, ShieldCheck, Wrench, XCircle } from "lucide-react";
import { useState } from "react";
import type { Nav } from "../App";
import { IncidentDetail as LegacyDetail, Status, usePoll } from "../api";
import { DiffViewer } from "../DiffViewer";
import { Btn, Empty, KV, Panel, Pill, Segmented, Sev, SimTag, Spinner, State, inputCls, useRun } from "../components/kit";
import { session } from "../lib/session";
import { ago, label, useV1, v1 } from "../lib/v1";
import { History } from "../views/History";
import { Incidents as LegacyConsole, Repro, TestMatrix, Timeline } from "../views/Incidents";
import { Overview as LegacyHealth } from "../views/Overview";
import { Simulator } from "../views/Simulator";

const STEPS = [
  ["reproducing", "Reproduce"], ["investigating", "Investigate"], ["patching", "Patch"], ["testing", "Locked tests"],
  ["awaiting_approval", "Human approval"], ["fixed", "Activated & verified"],
] as const;

function Stepper({ status }: { status: string }) {
  const order = STEPS.map((s) => s[0]) as string[];
  const idx = status === "in_progress" || status === "open" ? 0 : status === "activated" ? 5 : order.indexOf(status);
  const failed = ["failed", "patch_rejected"].includes(status);
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STEPS.map(([k, l], i) => {
        const done = idx > i || status === "fixed";
        const cur = idx === i && status !== "fixed";
        return (
          <li key={k} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11.5px] font-semibold ${done ? "border-good/40 bg-good/10 text-[#0B7A33]" : cur ? (failed ? "border-critical/40 bg-critical/10 text-critical" : "border-accentDim/50 bg-accentDim/10 text-brand-2") : "border-line text-ink-3"}`}>
            {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : cur ? (failed ? <XCircle className="h-3.5 w-3.5" /> : k === "awaiting_approval" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />) : <Circle className="h-3.5 w-3.5" />}{l}
          </li>
        );
      })}
      {status === "no_defect" && <Pill>no code defect - hypothesis rejected</Pill>}
    </ol>
  );
}

function IssueDetail({ issue, onDone, nav }: { issue: any; onDone: () => void; nav: Nav }) {
  const { data } = usePoll<LegacyDetail>(issue.eng_incident_id ? `/incidents/${issue.eng_incident_id}` : null, 2000);
  const [note, setNote] = useState("");
  const { busy, run } = useRun();
  const r = data?.runs?.[0];
  const patch = r?.patches.find((p) => p.status === "verified" || p.status === "approved") ?? r?.patches.at(-1);
  const base = r?.tests.find((t) => t.target === "baseline");
  const patched = patch ? r?.tests.filter((t) => t.patch_id === patch.id).at(-1) : undefined;
  const canApprove = session.can("engineering:approve");
  return (
    <div className="space-y-4">
      <Panel title={<span className="flex items-center gap-2">{issue.id}: {issue.title}</span>} subtitle={`Component: ${issue.component}`}>
        <div className="flex flex-wrap items-center gap-2"><State s={issue.status} /><Sev s={issue.severity} />
          <Btn size="sm" variant="ghost" onClick={() => nav(`incidents/${issue.incident_id}`)}>Operational incident {issue.incident_id} ({issue.affected_tickets} tickets) →</Btn></div>
        <div className="mt-3"><Stepper status={issue.status} /></div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="text-[12px] font-semibold">Root-cause hypothesis handed over</div>
            <p className="mt-1 text-[12.5px] text-ink-2">{issue.hypothesis}</p>
            {issue.outcome && <p className="mt-2 rounded-xl bg-good/10 p-2 text-[12px] text-[#0B7A33]">{issue.outcome}</p>}
          </div>
          <div>
            <div className="text-[12px] font-semibold">Evidence bundle</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-2">{issue.evidence.slice(0, 6).map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
          </div>
        </div>
        {r && <div className="mt-3 grid gap-2 sm:grid-cols-3"><KV k="Pipeline run" v={`#${r.id} · ${label(r.state)}`} /><KV k="Agents" v={r.agent_label ?? r.agent_mode} /><KV k="Started" v={ago(r.started_at)} /></div>}
      </Panel>
      {r && <Panel title="Reproduction (isolated subprocess)"><Repro run={r} /></Panel>}
      {patch && (
        <Panel title={<span className="flex items-center gap-2"><GitPullRequest className="h-4 w-4" />Proposed fix - patch #{patch.id} <State s={patch.status === "verified" ? "awaiting_approval" : patch.status} /></span>} pad={false}>
          <div className="p-4"><p className="whitespace-pre-wrap text-[12.5px] text-ink-2">{patch.explanation}</p></div>
          <DiffViewer original={patch.original_code} patched={patch.patched_code} file={patch.file} />
        </Panel>
      )}
      {r && (base || patched) && <Panel title="Locked verifier suite - original vs patched"><TestMatrix baseline={base} patched={patched} /></Panel>}
      {r?.state === "AWAITING_APPROVAL" && patch?.status === "verified" && (
        <Panel title="Human approval" subtitle="Activation in the SIMULATED merchant environment only; never deployed to production">
          {canApprove ? (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${inputCls} max-w-md`} placeholder="Approval note (recorded in the audit trail)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Approval note" />
              <Btn variant="good" busy={busy === "a"} onClick={() => run("a", async () => { await v1(`/engineering/${issue.id}/approve`, { body: { patch_id: patch.id, note } }); onDone(); }, "Patch approved and activated - post-fix verification running")}>Approve & activate</Btn>
              <Btn variant="danger" busy={busy === "r"} onClick={() => run("r", async () => { await v1(`/engineering/${issue.id}/reject`, { body: { patch_id: patch.id, note } }); onDone(); }, "Patch rejected - live code unchanged")}>Reject</Btn>
            </div>
          ) : <p className="text-[12.5px] text-ink-3">Requires the approver role. Your role ({session.user()?.role}) can review but not approve.</p>}
        </Panel>
      )}
      {r && <Panel title="Pipeline timeline"><Timeline run={r} /></Panel>}
    </div>
  );
}

export function Engineering({ nav, selected }: { nav: Nav; selected?: string }) {
  const [view, setView] = useState<"issues" | "console" | "simulator" | "history" | "health">("issues");
  const { data, reload } = useV1<any>("/engineering", 2500);
  const { data: status, reload: reloadStatus } = usePoll<Status>(view === "simulator" ? "/status" : null, 2500);
  const [legacySel, setLegacySel] = useState<number | null>(null);
  const issue = data?.issues.find((i: any) => i.id === selected) ?? data?.issues[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[
          { value: "issues", label: "Remediation (ops-linked)" }, { value: "console", label: "Classic pipeline console" },
          { value: "simulator", label: "Payment simulator" }, { value: "history", label: "Code & history" }, { value: "health", label: "Integration health" }]} />
        <span className="text-[12px] text-ink-3">The classic views are the original FIXCHAIN engineering workflow, kept intact.</span>
      </div>
      {view === "issues" && (
        !data ? <Spinner /> : !data.issues.length ? (
          <Panel title="Engineering remediation" icon={<Wrench className="h-4 w-4" />}>
            <Empty icon={<Wrench className="h-6 w-6" />}>No engineering issues yet. The Investigation agent opens one only when evidence points to a software defect - try Simulation Lab scenario A or B.</Empty>
            {data.engineering_incidents.length > 0 && <p className="text-[12px] text-ink-3">{data.engineering_incidents.length} engineering monitor incident(s) exist - see the classic console.</p>}
          </Panel>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <Panel title="Issues" icon={<Wrench className="h-4 w-4" />} pad={false}>
              <ul className="divide-y divide-line">
                {data.issues.map((i: any) => (
                  <li key={i.id}><button onClick={() => nav(`engineering/${i.id}`)} className={`w-full px-4 py-3 text-left hover:bg-raised ${issue?.id === i.id ? "bg-raised" : ""}`}>
                    <div className="flex items-center gap-2"><span className="font-mono text-[12px] font-semibold text-brand-2">{i.id}</span><State s={i.status} /></div>
                    <div className="mt-1 line-clamp-2 text-[12.5px]">{i.title}</div>
                    <div className="mt-1 text-[11px] text-ink-3">{i.incident_id} · {ago(i.updated_at)}</div>
                  </button></li>
                ))}
              </ul>
            </Panel>
            {issue && <IssueDetail issue={issue} onDone={reload} nav={nav} />}
          </div>
        )
      )}
      {view === "console" && <LegacyConsole selected={legacySel} select={setLegacySel} />}
      {view === "simulator" && <Simulator status={status} refreshStatus={reloadStatus} />}
      {view === "history" && <History />}
      {view === "health" && <LegacyHealth openIncident={(id) => { setLegacySel(id); setView("console"); }} />}
      <SimTag label="All engineering changes apply to the simulated merchant environment only" />
    </div>
  );
}

