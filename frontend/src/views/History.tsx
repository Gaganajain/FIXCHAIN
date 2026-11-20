import { useState } from "react";
import { Memory, Version, api, ago, usePoll } from "../api";
import { DiffViewer } from "../DiffViewer";
import { Badge, Button, Card, Empty, ErrorBar, Mono, useAction } from "../ui";

const SOURCE_TONE: Record<string, string> = { baseline: "neutral", bug_injection: "critical", patch: "good", rollback: "warn" };

export function History() {
  const { data: versions, reload } = usePoll<Version[]>("/versions", 2000);
  const { data: patches } = usePoll<any[]>("/patches", 2000);
  const { data: memory } = usePoll<Memory[]>("/memory", 3000);
  const { busy, error, run } = useAction();
  const [view, setView] = useState<number | null>(null);
  const viewed = versions?.find((v) => v.id === view);
  const prev = viewed && versions?.find((v) => v.id < viewed.id);

  return (
    <div className="space-y-5">
      <ErrorBar error={error} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Code versions · payment_handler.py" pad={false}>
          {!versions?.length ? <Empty>No versions.</Empty> : (
            <div className="divide-y divide-line">
              {versions.map((v) => (
                <div key={v.id} className={`flex items-center gap-3 px-4 py-3 ${view === v.id ? "bg-panel shadow-[inset_3px_0_0_#00F0FF] border border-brand/20" : "hover:bg-raised/50 transition-colors"}`}>
                  <Mono className="w-8 text-ink-3">v{v.id}</Mono>
                  <Badge tone={SOURCE_TONE[v.source] ?? "neutral"}>{v.source.replace("_", " ")}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2" title={v.note}>{v.note}</span>
                  <span className="text-[11px] text-ink-3">{ago(v.created_at)}</span>
                  {v.active ? <Badge tone="accent">live</Badge> : (
                    <Button busy={busy === `rb${v.id}`} onClick={() => run(`rb${v.id}`, async () => { await api(`/versions/${v.id}/rollback`, {}); reload(); })}>
                      Restore
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setView(view === v.id ? null : v.id)}>{view === v.id ? "Hide" : "Diff"}</Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Repair history" pad={false}>
          {!patches?.length ? <Empty>No patches generated yet.</Empty> : (
            <div className="divide-y divide-line">
              {patches.map((p) => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Mono className="text-ink-3">patch #{p.id}</Mono>
                    <Badge tone={p.status === "approved" ? "good" : p.status === "verified" ? "accent" : p.status === "rolled_back" ? "warn" : ["rejected", "verify_failed", "policy_rejected"].includes(p.status) ? "critical" : "neutral"}>
                      {p.status.replace("_", " ")}
                    </Badge>
                    <span className="truncate text-sm text-ink-2">incident #{p.incident_id} · {p.incident_title}</span>
                  </div>
                  {p.decided_by && <div className="mt-1 text-[11px] text-ink-3">decided by {p.decided_by} {ago(p.decided_at)}{p.decision_note ? ` — “${p.decision_note}”` : ""}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {viewed && (
        <Card title={`v${viewed.id} compared with ${prev ? `v${prev.id}` : "nothing (first version)"}`}>
          <DiffViewer original={prev?.code ?? ""} patched={viewed.code} file={viewed.file} context={3} />
        </Card>
      )}

      <Card title="Incident memory" right={<span className="text-[12px] text-ink-3">persists across demo resets</span>} pad={false}>
        {!memory?.length ? <Empty>No resolved defects remembered yet. Approve a verified patch to store one.</Empty> : (
          <div className="divide-y divide-line">
            {memory.map((m) => (
              <div key={m.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Mono className="text-ink">{m.fingerprint}</Mono>
                  <Badge tone={m.times_seen > 1 ? "warn" : "neutral"}>seen {m.times_seen}×</Badge>
                  <Mono className="text-brand-2">{m.file}::{m.function}()</Mono>
                </div>
                <div className="mt-1 text-ink-2">{m.root_cause}</div>
                <div className="mt-0.5 text-[12px] text-ink-3">Fix: {m.fix_summary?.split("\n")[0]}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
