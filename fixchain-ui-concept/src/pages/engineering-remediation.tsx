import { AlertCircle, Bug, CheckCircle2, Code, FlaskConical, PlayCircle, Search, ShieldCheck, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";
import { PATCH_ATTEMPTS, PATCH_DIFF, RUN_LOG } from "@/data/fixchain";
import type { Navigate } from "@/App";

/** The orchestrator's real stages (backend/app/orchestrator.py), in order. */
const STAGES = [
  { name: "Detect", note: "Contract check on every callback", status: "done", icon: AlertCircle },
  { name: "Reproduce", note: "Replay in a sandbox: 10 of 22", status: "done", icon: Bug },
  { name: "Investigate", note: "map_gateway_status()", status: "done", icon: Search },
  { name: "Patch", note: "2 attempts", status: "done", icon: Code },
  { name: "Verify", note: "22 of 22 locked tests", status: "done", icon: FlaskConical },
  { name: "Approve", note: "Named person required", status: "current", icon: Users },
  { name: "Activate", note: "Simulated live code", status: "todo", icon: PlayCircle },
  { name: "Reconcile", note: "Re-sync 31 orders", status: "todo", icon: ShieldCheck },
] as const;

const AGENT_COLOR: Record<string, string> = { detection: "text-amber-600", orchestrator: "text-primary", verifier: "text-[#0098CC]", investigator: "text-indigo-600", repairer: "text-violet-600" };

export function EngineeringRemediation({ navigate }: { navigate: Navigate }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Code fixes</h1>
          <p className="text-muted-foreground">When an incident is a bug in the merchant's code, FIXCHAIN reproduces it, writes a fix and proves it before anyone switches it on.</p>
        </div>
        <Button onClick={() => navigate("/approvals")}><Users className="mr-2 h-4 w-4" /> Review for approval</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Locked tests on the fix" value="22 / 22" tone="good" sub="Baseline code: 10 / 22" />
        <Stat label="Wrong patches caught" value="1" tone="bad" sub="Never shipped" />
        <Stat label="Bug to verified patch" value="20 s" tone="sky" sub="This run" />
        <Stat label="Orders to reconcile" value="31" sub="After activation" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-primary">ENG-001 for INC-001: paid UPI orders marked failed</CardTitle>
          <CardDescription>payment_handler.py, simulated merchant ShopKart. Nothing goes live until a person approves.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-4 lg:grid-cols-8">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.name} className="relative flex flex-col items-center text-center">
                  {i < STAGES.length - 1 && <span aria-hidden className={cn("absolute left-1/2 top-5 hidden h-0.5 w-full lg:block", s.status === "done" ? "bg-emerald-400" : "bg-border")} />}
                  <span className={cn("relative z-10 grid h-10 w-10 place-items-center rounded-full",
                    s.status === "done" ? "bg-emerald-500 text-white" : s.status === "current" ? "bg-amber-500 text-white ring-4 ring-amber-200" : "bg-muted text-muted-foreground")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="mt-2 text-xs font-semibold">{i + 1}. {s.name}</span>
                  <span className="mt-0.5 max-w-[110px] text-[11px] leading-tight text-muted-foreground">{s.note}</span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-primary">Patch attempts</CardTitle>
            <CardDescription>The verifier is a locked test suite the repair agent can't read or edit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PATCH_ATTEMPTS.map((p) => (
              <div key={p.n} className={cn("rounded-xl border p-4", p.verdict === "verified" ? "border-emerald-500/40 bg-emerald-50" : "border-destructive/30 bg-destructive/5")}>
                <div className="flex flex-wrap items-center gap-2">
                  {p.verdict === "verified" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  <h3 className="text-sm font-semibold">Patch #{p.n}</h3>
                  <Badge variant="outline" className="text-[11px]">{p.passed} / {p.total} tests</Badge>
                  <Badge variant="outline" className={cn("text-[11px]", p.verdict === "verified" ? "text-emerald-700" : "text-destructive")}>{p.verdict === "verified" ? "Verified" : "Rejected by verifier"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.by}. {p.note}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <div className={cn("h-full", p.verdict === "verified" ? "bg-emerald-500" : "bg-destructive")} style={{ width: `${(100 * p.passed) / p.total}%` }} />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(PATCH_DIFF); toast.success("Diff copied"); }}>Copy diff</Button>
              <Button size="sm" variant="ghost" onClick={() => toast("Sample only: in FIXCHAIN, Reject keeps the live code unchanged and reopens the incident.")}>What does reject do?</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold text-primary">Verified diff (patch #2)</CardTitle></CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-[#0B1B3F] p-4 font-mono text-[12px] leading-relaxed">
              {PATCH_DIFF.split("\n").map((line, i) => (
                <div key={i} className={line.startsWith("+") && !line.startsWith("+++") ? "text-emerald-300" : line.startsWith("-") && !line.startsWith("---") ? "text-rose-300" : line.startsWith("@@") ? "text-cyan-300" : "text-slate-300"}>{line || " "}</div>
              ))}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">Run log</CardTitle></CardHeader>
        <CardContent>
          <ol className="max-h-72 space-y-1.5 overflow-y-auto font-mono text-xs">
            {RUN_LOG.map(([t, agent, msg], i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">{t}</span>
                <span className={cn("w-24 shrink-0 font-semibold", AGENT_COLOR[agent])}>{agent}</span>
                <span className="text-foreground">{msg}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
