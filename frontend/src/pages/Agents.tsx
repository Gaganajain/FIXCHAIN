import { ArrowRight, Bot, Cpu, ListTree, RotateCw } from "lucide-react";
import { useState } from "react";
import type { Nav } from "../App";
import { Btn, Empty, Panel, Pill, Segmented, State, useRun } from "../components/kit";
import { AgentCard, AgentRow, EventFeed, LiveDot, PipelineFlow, WorkerPool } from "../components/live";
import { session } from "../lib/session";
import { ago, clock, useEvents, useV1, v1 } from "../lib/v1";

export function Agents({ nav }: { nav: Nav }) {
  const { data } = useV1<{ agents: AgentRow[]; workers: any; handoffs: any[] }>("/agents", 1200);
  const [filter, setFilter] = useState<"all" | "dead" | "running">("all");
  const { data: tasks, reload } = useV1<any[]>(`/agents/tasks?limit=80${filter === "dead" ? "&status=dead" : filter === "running" ? "&status=running" : ""}`, 2000);
  const { events, connected } = useEvents(200);
  const { busy, run } = useRun();
  return (
    <div className="space-y-4">
      <Panel dark title="Workflow" icon={<Bot className="h-4 w-4" />} subtitle="Orchestrator-driven: agents never transition state themselves" right={<LiveDot on={connected} dark />}>
        {data && <PipelineFlow agents={data.agents} handoffs={data.handoffs} />}
        <div className="mt-4 border-t border-white/10 pt-3"><WorkerPool w={data?.workers} dark /></div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data?.agents.map((a) => <AgentCard key={a.id} a={a} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Agent-to-agent handoffs" icon={<ArrowRight className="h-4 w-4" />} subtitle="Typed, persisted handoffs - each carries a summary of what was passed">
          {!data?.handoffs.length ? <Empty>No handoffs yet.</Empty> : (
            <ul className="max-h-[420px] space-y-1 overflow-y-auto text-[12px]">
              {data.handoffs.map((h) => (
                <li key={h.id} className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-raised">
                  <span className="w-[62px] shrink-0 font-mono text-[10.5px] text-ink-3">{clock(h.ts)}</span>
                  <span className="shrink-0 font-semibold text-brand-2">{h.from_agent}</span><ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-accentDim" />
                  <span className="shrink-0 font-semibold text-brand-2">{h.to_agent}</span>
                  <button className="shrink-0 font-mono text-[11px] text-ink-3 hover:underline" onClick={() => nav(`${h.subject_kind === "ticket" ? "tickets" : "incidents"}/${h.subject_id}`)}>{h.subject_id}</button>
                  <span className="min-w-0 text-ink-2">{h.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Execution log" icon={<ListTree className="h-4 w-4" />} right={<Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "Recent" }, { value: "running", label: "Running" }, { value: "dead", label: "Dead-letter" }]} />}>
          {!tasks?.length ? <Empty icon={<Cpu className="h-6 w-6" />}>{filter === "dead" ? "No dead-lettered tasks." : "No tasks."}</Empty> : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-[11.5px]">
                <thead className="sticky top-0 bg-panel text-left text-[10.5px] uppercase text-ink-3"><tr><th className="py-1">Agent</th><th>Task</th><th>Subject</th><th>Status</th><th>Time</th><th>Worker</th><th /></tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-t border-line/70">
                      <td className="py-1 font-semibold">{t.agent}</td><td>{t.task_type}</td>
                      <td className="font-mono text-[10.5px]">{t.subject_id}</td>
                      <td><State s={t.status === "succeeded" ? "verified" : t.status === "dead" ? "blocked" : t.status === "retrying" ? "pending" : "in_progress"} />
                        {t.attempts > 1 && <span className="ml-1 text-[10px] text-ink-3">×{t.attempts}</span>}</td>
                      <td className="tabular-nums">{t.duration_ms != null ? `${t.duration_ms} ms` : ago(t.queued_at)}</td><td>{t.worker ?? "—"}</td>
                      <td>{t.status === "dead" && session.can("incident:manage") && (
                        <Btn size="sm" busy={busy === `r${t.id}`} onClick={() => run(`r${t.id}`, async () => { await v1(`/agents/tasks/${t.id}/retry`, { body: {} }); reload(); }, "Task re-queued")}><RotateCw className="h-3 w-3" />Retry</Btn>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tasks.some((t) => t.error) && <p className="mt-2 text-[11px] text-ink-3">Errors are shown masked in the ticket timeline.</p>}
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Agent events" subtitle="Started, completed, retried and failed tasks from the persisted event log">
        <div className="max-h-[360px] overflow-y-auto"><EventFeed events={events} filter={(e) => e.type.startsWith("agent.") || e.type.startsWith("workers.")} max={120} /></div>
        <div className="mt-2"><Pill tone="info">{events.filter((e) => e.type === "agent.task.retrying").length} retries</Pill> <Pill tone="critical">{events.filter((e) => e.type === "agent.task.failed").length} failures</Pill></div>
      </Panel>
    </div>
  );
}
