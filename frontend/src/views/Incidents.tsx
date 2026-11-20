import { useState } from "react";
import { Incident, IncidentDetail, Run, TestRun, api, ago, clock, reviewerStore, rupees, usePoll } from "../api";
import { DiffViewer } from "../DiffViewer";
import {
  Badge, Button, Card, Empty, ErrorBar, Mono, gatewayTone, incidentTone, orderTone, severityTone, useAction,
} from "../ui";

const STAGES = ["Detected", "Reproduced", "Investigated", "Patched", "Verified", "Approved", "Active"] as const;

function stageIndex(run: Run | undefined): { idx: number; failed: boolean } {
  if (!run) return { idx: 0, failed: false };
  const map: Record<string, number> = {
    QUEUED: 0, REPRODUCING: 0, INVESTIGATING: 1, REPAIRING: 2, VERIFYING: 3, AWAITING_APPROVAL: 4, ACTIVE: 6, REJECTED: 4,
  };
  if (run.state === "NOT_REPRODUCIBLE") return { idx: 1, failed: false };
  if (run.state === "FAILED") {
    const reached = run.patches.length ? 3 : run.investigation ? 2 : 1;
    return { idx: reached, failed: true };
  }
  return { idx: map[run.state] ?? 0, failed: run.state === "REJECTED" };
}

function Pipeline({ run }: { run?: Run }) {
  const { idx, failed } = stageIndex(run);
  const running = run && ["QUEUED", "REPRODUCING", "INVESTIGATING", "REPAIRING", "VERIFYING"].includes(run.state);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STAGES.map((s, i) => {
        const done = i <= idx;
        const isNext = i === idx + 1;
        const tone = done ? "border-good/50 text-good" : isNext && failed ? "border-critical/60 text-critical"
          : isNext && running ? "border-accent/60 text-brand-2" : "border-line text-ink-3";
        return (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-medium ${tone}`}>
              <span aria-hidden>{done ? "✓" : isNext && failed ? "✕" : isNext && running ? "◌" : "○"}</span>
              {s}
              {isNext && running && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            </div>
            {i < STAGES.length - 1 && <span className={`h-[1px] w-4 ${done ? "bg-good/50" : "bg-line"}`} />}
          </div>
        );
      })}
    </div>
  );
}

const AGENT_COLOR: Record<string, string> = {
  detection: "text-critical", orchestrator: "text-ink-3", verifier: "text-[#6250d6]", investigator: "text-brand-2", repairer: "text-[#c2511f]",
  policy: "text-serious", human: "text-good", memory: "text-warn",
};
const STEP_ICON: Record<string, string> = { started: "▸", info: "·", succeeded: "✓", failed: "✕", blocked: "⛔", handoff: "⇢" };

const AGENTS: { id: string; label: string; role: string }[] = [
  { id: "detection", label: "Detection", role: "contract monitor" },
  { id: "investigator", label: "Investigation", role: "root cause" },
  { id: "repairer", label: "Repair", role: "sandboxed patch" },
  { id: "policy", label: "Policy gate", role: "static safety" },
  { id: "verifier", label: "Verification", role: "locked test suite" },
  { id: "human", label: "Developer", role: "approval" },
  { id: "memory", label: "Memory", role: "past defects" },
];

function agentState(run: Run, agent: string) {
  const steps = run.steps.filter((s) => s.agent === agent);
  const last = steps.at(-1);
  const active = ["QUEUED", "REPRODUCING", "INVESTIGATING", "REPAIRING", "VERIFYING"].includes(run.state);
  if (agent === "human" && run.state === "AWAITING_APPROVAL") return { tone: "warn", label: "waiting for you", last: steps.at(-1) ?? run.steps.at(-1) };
  if (!last) {
    const skipped = run.state === "NOT_REPRODUCIBLE" && ["investigator", "repairer", "policy"].includes(agent);
    return { tone: "neutral", label: skipped ? "not needed" : active ? "waiting" : "idle", last: undefined };
  }
  if (last.status === "failed") return { tone: "critical", label: "failed", last };
  if (last.status === "blocked") return { tone: active ? "warn" : "critical", label: active ? "retrying" : "blocked", last };
  if (last.status === "started") return active ? { tone: "accent", label: "running", last } : { tone: "critical", label: "interrupted", last };
  return { tone: "good", label: last.status === "handoff" ? "handed off" : "done", last };
}

function AgentBoard({ run }: { run: Run }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {AGENTS.map((a) => {
        const st = agentState(run, a.id);
        return (
          <div key={a.id} className={`rounded-2xl border px-4 py-3 ${st.label === "running" ? "border-accent/50 bg-accent/5" : st.tone === "critical" ? "border-critical/30" : "border-line"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-semibold ${AGENT_COLOR[a.id] ?? "text-ink"}`}>{a.label}</span>
              {st.label === "running" && <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent text-brand-2" />}
            </div>
            <div className="text-[10px] text-ink-3">{a.role}</div>
            <div className="mt-2"><Badge tone={st.tone}>{st.label}</Badge></div>
            {st.last && <div className="mt-1.5 line-clamp-2 text-[11px] text-ink-2" title={st.last.message}>{st.last.message}</div>}
            {st.last && <div className="text-[10px] text-ink-3">{clock(st.last.ts)}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function Timeline({ run }: { run: Run }) {
  return (
    <ol className="max-h-[440px] space-y-0 overflow-auto pr-2">
      {run.steps.map((s) => (
        <li key={s.id} className="relative border-l border-line pb-4 pl-5">
          <span className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-panel ${s.status === "failed" || s.status === "blocked" ? "bg-critical" : s.status === "succeeded" ? "bg-good" : s.status === "started" || s.status === "handoff" ? "bg-accent" : "bg-line"}`} />
          <div className="flex items-baseline gap-2 text-xs">
            <span className={`font-semibold uppercase tracking-wider ${AGENT_COLOR[s.agent] ?? "text-ink-3"}`}>{s.agent}</span>
            {s.status === "handoff" && s.data?.to && (
              <><span className="text-ink-3">→</span><span className={`font-semibold uppercase tracking-wider ${AGENT_COLOR[s.data.to] ?? "text-ink-3"}`}>{s.data.to}</span>
                <Badge tone="accent">handoff</Badge></>
            )}
            <span className="text-ink-3">{clock(s.ts)}</span>
          </div>
          <div className={`text-sm ${s.status === "failed" || s.status === "blocked" ? "text-critical" : s.agent === "orchestrator" && s.status === "info" ? "text-ink-3" : "text-ink-2"}`}>
            <span aria-hidden className="mr-1">{STEP_ICON[s.status]}</span>{s.message}
          </div>
          {s.data?.problems && <ul className="ml-5 list-disc text-sm text-critical">{s.data.problems.map((p: string) => <li key={p}>{p}</li>)}</ul>}
          {s.data?.failed_tests?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">{s.data.failed_tests.map((t: string) => <Mono key={t} className="rounded bg-critical/10 px-2 py-0.5 text-critical">{t}</Mono>)}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TestMatrix({ baseline, patched }: { baseline?: TestRun; patched?: TestRun }) {
  const names = Array.from(new Set([...(baseline?.results ?? []), ...(patched?.results ?? [])].map((r) => r.name)));
  const cell = (t: TestRun | undefined, n: string) => {
    const r = t?.results.find((x) => x.name === n);
    if (!r) return <span className="text-ink-3">—</span>;
    return r.outcome === "passed" ? <Badge tone="good">pass</Badge> : <span title={r.message}><Badge tone="critical">{r.outcome}</Badge></span>;
  };
  const summary = (t?: TestRun) => t ? `${t.passed}/${t.total} passed · ${t.duration_s}s` : "not run";
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-ink-3">
          <tr>
            <th className="border-b border-line pb-2 font-medium">Independent test</th>
            <th className="border-b border-line pb-2 font-medium">Original code<div className="normal-case tracking-normal text-ink-3">{summary(baseline)}</div></th>
            <th className="border-b border-line pb-2 font-medium">Patched code<div className="normal-case tracking-normal text-ink-3">{summary(patched)}</div></th>
          </tr>
        </thead>
        <tbody>
          {names.map((n) => (
            <tr key={n} className="border-b border-line/50">
              <td className="py-2"><Mono className="text-ink-2">{n.replace(/^test_/, "")}</Mono></td>
              <td className="py-2">{cell(baseline, n)}</td>
              <td className="py-2">{cell(patched, n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {patched && (
        <div className="mt-2 text-[11px] text-ink-3">
          Results parsed from pytest JUnit XML · suite sha256 <Mono>{patched.suite_sha256.slice(0, 16)}…</Mono> (locked; repair agent has no access)
        </div>
      )}
    </div>
  );
}

export function Repro({ run }: { run: Run }) {
  const before = run.steps.find((s) => s.data?.reproduction)?.data.reproduction;
  const after = run.steps.find((s) => s.data?.reproduction_after)?.data.reproduction_after;
  if (!before) return null;
  const Box = ({ title, r, tone }: { title: string; r: any; tone: string }) => (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2">{title}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">gateway</span><Badge tone={gatewayTone(r.gateway_status)}>{r.gateway_status}</Badge>
        <span className="text-ink-3">→</span>
        <span className="text-ink-2">order</span>{r.order_status ? <Badge tone={orderTone(r.order_status)}>{r.order_status}</Badge> : <Badge tone="critical">error</Badge>}
      </div>
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Box title="Original failure (replayed)" r={before} tone="border-critical/30 bg-critical/5" />
      {after ? <Box title="Repaired result (replayed)" r={after} tone="border-good/30 bg-good/5" /> : <div className="rounded-xl border border-line p-4 text-sm text-ink-3">Repaired result pending…</div>}
    </div>
  );
}

function Approval({ run, onDone }: { run: Run; onDone: () => void }) {
  const patch = run.patches.find((p) => p.status === "verified");
  const [note, setNote] = useState("");
  const { busy, error, run: act } = useAction();
  if (!patch || run.state !== "AWAITING_APPROVAL") return null;
  return (
    <Card title={<span className="flex items-center gap-2">Developer approval required <Badge tone="warn">awaiting decision</Badge></span>}
      className="border-warn/30">
      <ErrorBar error={error} />
      <p className="whitespace-pre-wrap text-sm text-ink-2">{patch.explanation}</p>
      <ul className="mt-3 space-y-1.5 text-[12px] text-ink-3">
        <li>✓ Patch generated in an isolated sandbox; only <Mono>{patch.file}</Mono> (allowlisted) was modified</li>
        <li>✓ Passed the safety policy (compiles, no forbidden imports/calls, public interface intact)</li>
        <li>✓ {run.tests.filter((t) => t.patch_id === patch.id).at(-1)?.passed} / {run.tests.filter((t) => t.patch_id === patch.id).at(-1)?.total} independent tests passed</li>
        <li>• Approving activates the patch in the <span className="text-ink">simulated</span> demo environment only</li>
        <li>• Deciding as <span className="font-medium text-ink">{reviewerStore.get("name") || "— enter your name in the top bar first"}</span> (recorded in the audit trail)</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)"
          className="min-w-[240px] flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
        <Button variant="good" busy={busy === "approve"} onClick={() => act("approve", async () => { await api(`/patches/${patch.id}/approve`, { note }); onDone(); })}>
          ✓ Approve & activate
        </Button>
        <Button variant="danger" busy={busy === "reject"} onClick={() => act("reject", async () => { await api(`/patches/${patch.id}/reject`, { note }); onDone(); })}>
          Reject
        </Button>
      </div>
    </Card>
  );
}

function ExternalPanel({ id, status, onDone }: { id: number; status: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { busy, error, run: act } = useAction();
  return (
    <div className="mt-4 rounded-2xl border border-accent/50 bg-accent/5 p-4 text-sm text-ink-2">
      <ErrorBar error={error} />
      <p>
        The merchant handler <span className="text-ink">correctly rejected</span> these callbacks, so FIXCHAIN does not
        generate a patch. Likely causes are outside the merchant code: the gateway webhook secret was rotated or misconfigured, or
        someone is sending forged callbacks. Check the gateway configuration, then close the incident.
      </p>
      {status !== "resolved" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check? (recorded)"
            className="min-w-[240px] flex-1 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          <Button variant="primary" busy={busy === "close"} onClick={() => act("close", async () => { await api(`/incidents/${id}/close`, { note }); onDone(); })}>
            Close external incident
          </Button>
        </div>
      )}
    </div>
  );
}

function Detail({ id }: { id: number }) {
  const { data: d, reload } = usePoll<IncidentDetail>(`/incidents/${id}`, 1200);
  const { busy, error, run: act } = useAction();
  const [recon, setRecon] = useState<any[] | null>(null);
  if (!d) return <Card><Empty>Loading…</Empty></Card>;
  const run = d.runs[0];
  const patch = run ? run.patches.find((p) => ["verified", "approved", "rejected", "rolled_back"].includes(p.status)) ?? run.patches.at(-1) : undefined;
  const baseline = run?.tests.find((t) => t.target === "baseline");
  const patchedTests = patch ? run?.tests.filter((t) => t.patch_id === patch.id).at(-1) : undefined;
  const external = d.category === "external";
  const canRun = !external && (!run || ["FAILED", "REJECTED"].includes(run.state));
  const unreconciled = d.impact.affected_orders - d.impact.reconciled;
  const CLASS: Record<string, [string, string]> = {
    merchant_code_defect: ["critical", "merchant code defect"], no_code_defect: ["good", "no code defect"],
  };
  const reconcileBtn = unreconciled > 0 && (
    <Button variant="primary" busy={busy === "recon"} onClick={() => act("recon", async () => {
      const r = await api<{ reconciled: any[] }>(`/incidents/${id}/reconcile`, {}); setRecon(r.reconciled); reload();
    })}>
      Reconcile {unreconciled} affected order{unreconciled > 1 ? "s" : ""} with gateway
    </Button>
  );
  const reconList = recon && (
    <div className="mt-3 space-y-1 font-mono text-sm">
      {recon.map((r) => (
        <div key={r.order_id} className="text-ink-2">{r.order_id}: {r.before} → <span className="text-good">{r.after}</span> (gateway says {r.gateway_status})</div>
      ))}
    </div>
  );

  return (
    <div className="min-w-0 space-y-5">
      <ErrorBar error={error} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={severityTone(d.severity)}>{d.severity}</Badge>
              <Badge tone={incidentTone(d.status)}>{d.status.replace("_", " ")}</Badge>
              {external ? <Badge tone="accent">external · not a merchant code defect</Badge>
                : run?.classification && CLASS[run.classification] && <Badge tone={CLASS[run.classification][0]}>{CLASS[run.classification][1]}</Badge>}
              <Mono className="text-ink-3">{d.fingerprint}</Mono>
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-ink">#{d.id} · {d.title}</h2>
            <div className="mt-1 text-[12px] text-ink-3">
              first seen {ago(d.first_seen)} · {d.occurrences} occurrence{d.occurrences > 1 ? "s" : ""} · rule {d.rule}
              {run && <> · agents: {run.agent_label ?? (run.agent_mode === "llm" ? "LLM" : "offline deterministic")}</>}
            </div>
          </div>
          <div className="flex gap-2">
            {canRun && d.status !== "resolved" && (
              <Button variant="primary" busy={busy === "run"} onClick={() => act("run", async () => { await api(`/incidents/${id}/run`, {}); reload(); })}>
                {run ? "Re-run FIXCHAIN" : "Run FIXCHAIN"}
              </Button>
            )}
          </div>
        </div>
        {external ? <ExternalPanel id={id} status={d.status} onDone={reload} /> : <div className="mt-4"><Pipeline run={run} /></div>}
        {run && <div className="mt-4"><AgentBoard run={run} /></div>}
        {run?.error && <div className="mt-3 rounded-xl border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">✕ {run.error}</div>}
      </Card>

      {d.similar_memory && (
        <div className="rounded-2xl border border-warn/50 bg-warn/5 px-4 py-3 text-sm text-ink-2">
          <span className="font-medium text-warn">! Recurring defect</span> — incident memory has a similar resolved issue
          (seen {d.similar_memory.times_seen}×, <Mono>{d.similar_memory.function}()</Mono>): {d.similar_memory.root_cause}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {[
          ["Affected orders", d.impact.affected_orders],
          ["Affected amount", rupees(d.impact.affected_amount)],
          ["Still pending at gateway", d.impact.still_pending_at_gateway],
          ["Paid but marked failed", d.impact.paid_but_marked_failed],
          ["Revenue at risk", rupees(d.impact.revenue_at_risk)],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl border border-line bg-panel p-3 shadow-card">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{k}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="-mt-1 text-[11px] text-ink-3">Business impact: {d.impact.label}.</div>

      {run && <Approval run={run} onDone={reload} />}

      {run?.state === "ACTIVE" && (
        <Card className="border-good/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink-2">
              <span className="font-medium text-good">✓ Verified repair active in the simulated environment.</span>{" "}
              Time from detection to verified patch: <span className="text-ink">{run.time_to_verified_s}s</span>
              {" "}(pipeline {run.pipeline_duration_s}s).
            </div>
            {reconcileBtn}
          </div>
          {reconList}
        </Card>
      )}

      {run?.state === "NOT_REPRODUCIBLE" && (
        <Card className={d.status === "resolved" ? "border-good/50" : "border-warn/50"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink-2">
              <span className="font-medium text-good">✓ No code defect.</span>{" "}
              The current code passes every independent test and handles this callback correctly, so no patch is needed.
              {d.status === "resolved"
                ? " All affected orders match the gateway."
                : " These orders were finalised earlier by an already-fixed defect and need reconciliation."}
            </div>
            {d.status !== "resolved" && reconcileBtn}
          </div>
          {reconList}
        </Card>
      )}

      {run && (
        <div className="grid gap-5 xl:grid-cols-5">
          <Card title="Agent activity" className="xl:col-span-2"><Timeline run={run} /></Card>
          <Card title="Root cause (investigation agent)" className="xl:col-span-3"
            right={run.investigation ? <Badge tone="accent">confidence {Math.round(run.investigation.confidence * 100)}%</Badge> : null}>
            {run.investigation ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Mono className="rounded bg-raised px-2 py-0.5 text-ink">{run.investigation.file}</Mono>
                  <Mono className="rounded bg-raised px-2 py-0.5 text-brand-2">{run.investigation.function}()</Mono>
                  <span className="text-ink-3">lines {run.investigation.line_start}–{run.investigation.line_end}</span>
                  {run.investigation.analysis_method && <Badge>{run.investigation.analysis_method}</Badge>}
                </div>
                <p className="font-medium text-ink">{run.investigation.root_cause}</p>
                <p className="text-ink-2">{run.investigation.explanation}</p>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Evidence</div>
                  <ul className="space-y-1">
                    {run.investigation.evidence.map((e, i) => {
                      const chk = run.investigation!.evidence_checks?.[i];
                      return (
                        <li key={i} className="flex gap-2 text-ink-2">
                          <span className="text-ink-3">›</span>
                          <span className="min-w-0">
                            {e}{" "}
                            {chk?.status === "verified" && <Badge tone="good">IDs verified</Badge>}
                            {chk?.status === "unverified" && (
                              <span title={`Not among this incident's orders: ${chk.unknown_ids.join(", ")}`}>
                                <Badge tone="warn">unverified ID {chk.unknown_ids.join(", ")}</Badge>
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Fix strategy</div>
                  <p className="text-ink-2">{run.investigation.fix_strategy}</p>
                </div>
                <Repro run={run} />
              </div>
            ) : (
              <Empty>{["QUEUED", "REPRODUCING", "INVESTIGATING"].includes(run.state) ? "Investigating…"
                : run.state === "NOT_REPRODUCIBLE" ? "Not needed: the current code has no defect for this incident."
                : "No investigation result."}</Empty>
            )}
          </Card>
        </div>
      )}

      {patch && (
        <Card title={`Generated patch #${patch.id} (attempt ${patch.attempt})`} right={<Badge tone={patch.status === "verified" || patch.status === "approved" ? "good" : patch.status === "rejected" || patch.status.includes("fail") ? "critical" : "neutral"}>{patch.status.replace("_", " ")}</Badge>}>
          <DiffViewer original={patch.original_code} patched={patch.patched_code} file={patch.file} />
        </Card>
      )}

      {(baseline || patchedTests) && (
        <Card title="Independent verification"><TestMatrix baseline={baseline} patched={patchedTests} /></Card>
      )}

      <Card title={`Affected orders (${d.impact.affected_orders})`} pad={false}>
        <div className="max-h-[260px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              <tr>
                <th className="border-b border-line px-4 py-3">Order</th>
                <th className="border-b border-line px-4 py-3 tabular-nums">Amount</th>
                <th className="border-b border-line px-4 py-3">Gateway status</th>
                <th className="border-b border-line px-4 py-3">Order status</th>
                <th className="border-b border-line px-4 py-3">Reconciled</th>
              </tr>
            </thead>
            <tbody>
              {(d.impact.orders ?? []).map((o) => (
                <tr key={o.order_id} className="border-b border-line/60 hover:bg-raised/50 transition-colors">
                  <td className="px-4 py-2.5"><Mono className="text-ink-2">{o.order_id}</Mono></td>
                  <td className="px-4 py-2.5 tabular-nums text-ink">{rupees(o.amount)}</td>
                  <td className="px-4 py-2.5"><Badge tone={gatewayTone(o.gateway_status)}>{o.gateway_status}</Badge></td>
                  <td className="px-4 py-2.5"><Badge tone={orderTone(o.order_status)}>{o.order_status}</Badge></td>
                  <td className="px-4 py-2.5">{o.reconciled ? <Badge tone="good">reconciled</Badge> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function Incidents({ selected, select }: { selected: number | null; select: (id: number) => void }) {
  const { data: incidents } = usePoll<Incident[]>("/incidents", 1500);
  const current = selected ?? incidents?.[0]?.id ?? null;
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card title="Incidents" pad={false} className="self-start">
        {!incidents?.length ? (
          <Empty>No incidents. Inject the bug and run a PENDING checkout.</Empty>
        ) : (
          <div className="divide-y divide-line">
            {incidents.map((i) => (
              <button key={i.id} onClick={() => select(i.id)}
                className={`w-full px-4 py-3.5 text-left hover:bg-raised/50 transition-colors ${current === i.id ? "bg-panel shadow-[inset_3px_0_0_#00F0FF] border border-brand/20" : ""}`}>
                <div className="flex items-center gap-2">
                  <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                  <Badge tone={incidentTone(i.status)}>{i.status.replace("_", " ")}</Badge>
                </div>
                <div className="mt-1 text-sm text-ink">#{i.id} {i.title}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">{i.impact.affected_orders} orders · {rupees(i.impact.affected_amount)} · {ago(i.first_seen)}</div>
              </button>
            ))}
          </div>
        )}
      </Card>
      {current ? <Detail key={current} id={current} /> : <Card><Empty>Select an incident.</Empty></Card>}
    </div>
  );
}
