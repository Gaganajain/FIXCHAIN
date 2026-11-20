import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, Edge, Handle, MarkerType, Node, NodeProps, Position } from "reactflow";
import "reactflow/dist/style.css";
import { Activity, Bot, Brain, CheckCircle2, MessageSquare, Pause, Play, Search, ShieldCheck, Sparkles, Users, Wrench, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";

type Status = "idle" | "running" | "completed" | "waiting" | "failed";
type AgentDef = { id: string; name: string; does: string; icon: typeof Bot; done: number; x: number; y: number };

/** Mirrors the backend agents (backend/app/ops/runtime.py). The main path runs left to right. */
const AGENTS: AgentDef[] = [
  { id: "understand", name: "Customer understanding", does: "Reads the complaint in English, Hindi or Marathi and extracts amount, UTR and device", icon: MessageSquare, done: 300, x: 0, y: 0 },
  { id: "triage", name: "Triage", does: "Sets severity and deadline by rule, never by model", icon: Zap, done: 300, x: 300, y: 0 },
  { id: "intel", name: "Incident intelligence", does: "Groups related tickets into one parent incident", icon: Brain, done: 296, x: 600, y: 0 },
  { id: "investigate", name: "Investigation", does: "Keeps facts separate from hypotheses", icon: Search, done: 5, x: 900, y: 0 },
  { id: "resolve", name: "Resolution", does: "Proposes playbook actions; the policy engine decides the tier", icon: ShieldCheck, done: 164, x: 900, y: 190 },
  { id: "verify", name: "Verification", does: "Closes a ticket only with a named proof source", icon: CheckCircle2, done: 164, x: 600, y: 190 },
  { id: "comms", name: "Customer communication", does: "Updates the customer in their own language", icon: Users, done: 164, x: 300, y: 190 },
  { id: "learn", name: "Learning", does: "Turns verified outcomes into proposals a person approves", icon: Sparkles, done: 2, x: 0, y: 190 },
  { id: "engineering", name: "Engineering remediation", does: "Reproduce, patch, 22 locked tests, approval, post-fix replay", icon: Wrench, done: 1, x: 1200, y: 95 },
];
const PIPELINE = ["understand", "triage", "intel", "investigate", "resolve", "verify", "comms", "learn"];
const EDGES: [string, string, string][] = [
  ["understand", "triage", "300 tickets"], ["triage", "intel", "300 triaged"], ["intel", "investigate", "5 incidents"],
  ["investigate", "resolve", "4 operational"], ["investigate", "engineering", "1 code defect"], ["resolve", "verify", "actions run"],
  ["verify", "comms", "164 verified"], ["comms", "learn", "outcomes"],
];

const STATUS: Record<Status, string> = {
  running: "border-[#00BAF2] bg-[#E6F7FE]",
  completed: "border-emerald-500/50 bg-emerald-50",
  waiting: "border-amber-500/50 bg-amber-50",
  failed: "border-destructive/50 bg-destructive/5",
  idle: "border-border bg-card",
};
const STATUS_LABEL: Record<Status, string> = { running: "Working", completed: "Done", waiting: "Waiting for approval", failed: "Failed", idle: "Idle" };

type NodeData = { agent: AgentDef; status: Status };

function AgentNode({ data }: NodeProps<NodeData>) {
  const { agent, status } = data;
  const Icon = agent.icon;
  return (
    <div className={cn("w-60 rounded-xl border-2 p-3 shadow-sm transition-colors", STATUS[status])}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-primary/40" />
      <Handle type="target" id="top" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-primary/40" />
      <div className="flex items-start gap-2.5">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", status === "running" ? "bg-[#00BAF2] text-white" : "bg-primary/10 text-primary")}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-primary">{agent.name}</div>
          <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{STATUS_LABEL[status]}, {agent.done} done</div>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">{agent.does}</p>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-primary/40" />
      <Handle type="source" id="bottom" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-primary/40" />
    </div>
  );
}
// Defined once, outside render, as React Flow requires.
const nodeTypes = { agentCard: AgentNode };

export function AgentCommandCenter() {
  const [step, setStep] = useState(-1); // index into PIPELINE while a run is playing
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= PIPELINE.length - 1) { setRunning(false); toast.success("Run finished: every step handed off and was verified"); return s; }
        return s + 1;
      });
    }, 1100);
    return () => clearInterval(t);
  }, [running]);

  const statusOf = (id: string): Status => {
    if (id === "engineering") return "waiting";
    if (step < 0) return id === "triage" || id === "intel" ? "running" : "idle";
    const i = PIPELINE.indexOf(id);
    return i < step ? "completed" : i === step ? "running" : "idle";
  };

  const nodes: Node<NodeData>[] = useMemo(
    () => AGENTS.map((a) => ({ id: a.id, type: "agentCard", position: { x: a.x, y: a.y }, data: { agent: a, status: statusOf(a.id) }, draggable: false })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step],
  );
  const edges: Edge[] = useMemo(() => EDGES.map(([s, t, label]) => {
    const active = live && (statusOf(s) === "running" || statusOf(t) === "running");
    const sameRowBack = AGENTS.find((a) => a.id === s)!.y === 190 && AGENTS.find((a) => a.id === t)!.y === 190;
    const down = s === "investigate" && t === "resolve";
    return {
      id: `${s}-${t}`, source: s, target: t, label,
      sourceHandle: down ? "bottom" : undefined, targetHandle: down ? "top" : undefined,
      animated: active,
      type: sameRowBack ? "straight" : "smoothstep",
      style: { stroke: active ? "#00BAF2" : "#94A3B8", strokeWidth: active ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: active ? "#00BAF2" : "#94A3B8" },
      labelStyle: { fontSize: 11, fill: "#475569" },
      labelBgStyle: { fill: "#F8FAFC" },
    } as Edge;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [step, live]);

  const working = AGENTS.filter((a) => statusOf(a.id) === "running").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Agents</h1>
          <p className="text-muted-foreground">Each agent does one job and hands off. Consequential steps stop for a person.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setLive((v) => !v)} aria-pressed={live}>
            <Activity className="mr-1.5 h-3.5 w-3.5" /> {live ? "Animate handoffs: on" : "Animate handoffs: off"}
          </Button>
          <Button size="sm" onClick={() => { if (running) { setRunning(false); return; } setStep(0); setRunning(true); }}>
            {running ? <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pause run</> : <><Play className="mr-1.5 h-3.5 w-3.5" /> Replay a ticket's journey</>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Working now" value={working} tone="sky" sub="Agents with a task running" />
        <Stat label="Tasks completed" value={AGENTS.reduce((a, b) => a + b.done, 0).toLocaleString("en-IN")} tone="good" sub="Across all agents today" />
        <Stat label="Waiting for a person" value={1} tone="warn" sub="Verified patch for INC-001" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-primary">How a complaint moves through FIXCHAIN</CardTitle>
          <CardDescription>The top row hears and groups; the bottom row fixes and closes the loop. A code defect branches to engineering remediation.</CardDescription>
        </CardHeader>
        <CardContent className="h-[460px] p-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
          >
            <Controls showInteractive={false} />
            <Background gap={16} color="#E2E8F0" />
          </ReactFlow>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((agent) => {
          const st = statusOf(agent.id);
          const Icon = agent.icon;
          return (
            <div key={agent.id} className={cn("rounded-xl border p-4 transition-colors", STATUS[st])}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-primary">{agent.name}</h3>
                    <Badge variant="outline" className="text-[11px]">{STATUS_LABEL[st]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{agent.does}</p>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">{agent.done.toLocaleString("en-IN")} tasks completed</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
