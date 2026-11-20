import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock, Loader2, PauseCircle, RotateCw, XCircle } from "lucide-react";
import { OpsEvent, ago, clock } from "../lib/v1";
import { Pill, SimTag } from "./kit";

export type AgentRow = {
  id: string; name: string; role: string; state: string; running_count: number; running: { task_type: string; subject_id: string; started_at: number; worker: string }[];
  tasks_total: number; succeeded: number; dead: number; queued: number; avg_ms: number; waiting_approvals: number;
  last_event: { message: string; ts: number; level: string } | null;
};

const STATE: Record<string, { label: string; cls: string; icon: JSX.Element }> = {
  working: { label: "Working", cls: "border-accentDim/60 bg-accentDim/10 text-brand-2", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  waiting: { label: "Waiting for approval", cls: "border-violet-400/60 bg-violet-500/10 text-violet-700", icon: <PauseCircle className="h-3.5 w-3.5" /> },
  retrying: { label: "Retrying", cls: "border-warn/60 bg-warn/10 text-[#9A6200]", icon: <RotateCw className="h-3.5 w-3.5" /> },
  failed: { label: "Failed", cls: "border-critical/50 bg-critical/10 text-critical", icon: <XCircle className="h-3.5 w-3.5" /> },
  completed: { label: "Completed", cls: "border-good/50 bg-good/10 text-[#0B7A33]", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  idle: { label: "Idle", cls: "border-line bg-raised text-ink-3", icon: <CircleDashed className="h-3.5 w-3.5" /> },
};

export function AgentCard({ a, dark = false, compact = false }: { a: AgentRow; dark?: boolean; compact?: boolean }) {
  const st = STATE[a.state] ?? STATE.idle;
  const active = a.state === "working";
  return (
    <motion.div layout className={`relative rounded-xl border p-3 ${dark ? "border-white/10 bg-white/[0.04]" : "border-line bg-panel"} ${active ? (dark ? "ring-1 ring-accentDim/60" : "ring-1 ring-accentDim/40") : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 text-[12.5px] font-semibold ${dark ? "text-white" : "text-ink"}`}>
            <span className="relative flex h-2 w-2">
              {active && <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-accentDim" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${active ? "bg-accentDim" : a.state === "failed" ? "bg-critical" : a.state === "waiting" ? "bg-violet-500" : a.state === "completed" ? "bg-good" : dark ? "bg-white/30" : "bg-ink-3/40"}`} />
            </span>
            <span className="truncate">{a.name}</span>
          </div>
          {!compact && <div className={`mt-0.5 text-[11px] ${dark ? "text-white/50" : "text-ink-3"}`}>{a.role}</div>}
        </div>
        <span title={st.label} className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${st.cls}`}>{st.icon}{compact ? null : st.label}</span>
      </div>
      {!compact && (
        <>
          <div className={`mt-2 min-h-[18px] truncate text-[11.5px] ${dark ? "text-white/70" : "text-ink-2"}`}>
            {a.running[0] ? <>▸ {a.running[0].task_type.replace(/_/g, " ")} · <span className="font-mono">{a.running[0].subject_id}</span>{a.running_count > 1 && ` +${a.running_count - 1}`}</>
              : a.last_event ? <span title={a.last_event.message}>{a.last_event.message}</span> : "No activity yet"}
          </div>
          <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] tabular-nums ${dark ? "text-white/45" : "text-ink-3"}`}>
            <span>{a.succeeded} done</span>
            {a.queued > 0 && <span>{a.queued} queued</span>}
            {a.dead > 0 && <span className="text-critical">{a.dead} dead-lettered</span>}
            {a.avg_ms > 0 && <span><Clock className="mr-0.5 inline h-3 w-3" />{a.avg_ms} ms avg</span>}
            {a.waiting_approvals > 0 && <span className="text-violet-500">{a.waiting_approvals} awaiting approval</span>}
          </div>
        </>
      )}
    </motion.div>
  );
}

const PIPE = ["customer_agent", "triage", "incident_intel", "investigation", "resolution", "verifier", "communication"];

/** Horizontal pipeline whose nodes light up from backend agent state; the most recent handoffs are listed under it. */
export function PipelineFlow({ agents, handoffs, dark = true }: { agents: AgentRow[]; handoffs: { from_agent: string; to_agent: string; ts: number; subject_id: string; summary: string }[]; dark?: boolean }) {
  const by = Object.fromEntries(agents.map((a) => [a.id, a]));
  const recent = new Set(handoffs.filter((h) => Date.now() / 1000 - h.ts < 6).map((h) => `${h.from_agent}>${h.to_agent}`));
  return (
    <div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {PIPE.map((id, i) => {
          const a = by[id];
          const on = a?.state === "working";
          const linkOn = i < PIPE.length - 1 && recent.has(`${id}>${PIPE[i + 1]}`);
          return (
            <div key={id} className="flex items-center gap-1">
              <div className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${on
                ? "border-accentDim bg-accentDim/20 text-white" : dark ? "border-white/10 bg-white/[0.03] text-white/65" : "border-line bg-raised text-ink-2"}`}>
                {a?.name.replace("Customer ", "").replace("Incident ", "") ?? id}
                {a && a.running_count > 0 && <span className="ml-1 rounded bg-accentDim/30 px-1 text-[10px]">{a.running_count}</span>}
              </div>
              {i < PIPE.length - 1 && (
                <svg width="22" height="10" aria-hidden className="shrink-0">
                  <line x1="0" y1="5" x2="18" y2="5" stroke={linkOn ? "#00A8E8" : dark ? "rgba(255,255,255,.2)" : "#CBD5E1"} strokeWidth="2"
                    strokeDasharray="4 4" className={linkOn ? "animate-flow" : ""} />
                  <path d="M16 1 L21 5 L16 9" fill="none" stroke={linkOn ? "#00A8E8" : dark ? "rgba(255,255,255,.3)" : "#CBD5E1"} strokeWidth="1.5" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      <p className={`mt-1 text-[10.5px] ${dark ? "text-white/40" : "text-ink-3"}`}>Nodes light up only from backend task state; arrows pulse for handoffs recorded in the last 6 s.</p>
    </div>
  );
}

const LEVEL_ICON: Record<string, JSX.Element> = {
  warn: <AlertTriangle className="h-3.5 w-3.5 text-warn" />, error: <XCircle className="h-3.5 w-3.5 text-critical" />,
};

export function EventFeed({ events, dark = false, max = 60, onOpen, filter }: {
  events: OpsEvent[]; dark?: boolean; max?: number; onOpen?: (e: OpsEvent) => void; filter?: (e: OpsEvent) => boolean;
}) {
  const list = events.filter(filter ?? ((e) => !e.type.startsWith("agent.task.started"))).slice(0, max);
  if (!list.length) return <div className={`py-8 text-center text-[12.5px] ${dark ? "text-white/45" : "text-ink-3"}`}>Waiting for events…</div>;
  return (
    <ol className="space-y-0.5" aria-live="polite">
      {list.map((e) => (
        <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }}
          onClick={() => onOpen?.(e)}
          className={`flex cursor-default items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] ${onOpen ? "cursor-pointer" : ""} ${dark ? "hover:bg-white/5" : "hover:bg-raised"}`}>
          <span className={`mt-0.5 shrink-0 font-mono text-[10.5px] tabular-nums ${dark ? "text-white/40" : "text-ink-3"}`}>{clock(e.ts)}</span>
          <span className="mt-0.5 shrink-0">{LEVEL_ICON[e.level] ?? (e.type === "agent.handoff" ? <ArrowRight className="h-3.5 w-3.5 text-accentDim" /> : <span className={`block h-1.5 w-1.5 translate-y-1 rounded-full ${dark ? "bg-white/30" : "bg-ink-3/40"}`} />)}</span>
          <span className={`min-w-0 flex-1 ${dark ? "text-white/80" : "text-ink-2"}`}>
            <span className={`mr-1.5 font-semibold ${dark ? "text-accentDim" : "text-brand-2"}`}>{e.actor_id}</span>{e.message}
          </span>
          {e.simulated ? <SimTag label="sim" /> : null}
        </motion.li>
      ))}
    </ol>
  );
}

export function LiveDot({ on, dark = false }: { on: boolean; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${on ? (dark ? "text-accentDim" : "text-brand-2") : "text-critical"}`}>
      <span className="relative flex h-2 w-2">
        {on && <span className="absolute inline-flex h-full w-full animate-ping2 rounded-full bg-accentDim" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${on ? "bg-accentDim" : "bg-critical"}`} />
      </span>
      {on ? "Live" : "Reconnecting…"}
    </span>
  );
}

export function WorkerPool({ w, dark = false }: { w: any; dark?: boolean }) {
  if (!w) return null;
  const slots = Array.from({ length: w.max }, (_, i) => i < w.busy ? "busy" : i < w.workers ? "idle" : "off");
  return (
    <div>
      <div className="flex flex-wrap gap-1" aria-label={`${w.workers} workers running, ${w.busy} busy`}>
        {slots.map((s, i) => (
          <motion.span key={i} layout className={`h-5 w-5 rounded-md border ${s === "busy" ? "border-accentDim bg-accentDim/70" : s === "idle" ? (dark ? "border-white/30 bg-white/10" : "border-brand-2/30 bg-brand-2/10") : dark ? "border-white/10" : "border-line"}`} />
        ))}
      </div>
      <div className={`mt-2 flex flex-wrap gap-x-3 text-[11px] tabular-nums ${dark ? "text-white/60" : "text-ink-3"}`}>
        <span><b className={dark ? "text-white" : "text-ink"}>{w.workers}</b>/{w.max} workers</span>
        <span><b className={dark ? "text-white" : "text-ink"}>{w.busy}</b> busy</span>
        <span>queue <b className={dark ? "text-white" : "text-ink"}>{w.queue_depth}</b></span>
        <span><b className={dark ? "text-white" : "text-ink"}>{w.tasks_per_min}</b> tasks/min</span>
        <span>peak {w.peak}</span>
        {w.paused && <Pill tone="warn">paused</Pill>}
      </div>
      <p className={`mt-1 text-[10.5px] ${dark ? "text-white/40" : "text-ink-3"}`}>{w.label}</p>
    </div>
  );
}

export { ago };
