import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, FileText, Lock, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";
import { APPROVALS, SIGNED_IN, TIER_LABEL, type FxApproval } from "@/data/fixchain";
import type { Navigate } from "@/App";
import { decisionStore, useDecisions, type Decision } from "@/data/decisions";

export function ResolutionApproval({ navigate }: { navigate: Navigate }) {
  const [expandedId, setExpandedId] = useState<string | null>(APPROVALS[0].id);
  const decisions = useDecisions();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"pending" | "decided">("pending");

  const decide = (a: FxApproval, status: Decision["status"]) => {
    const note = (notes[a.id] ?? "").trim();
    if (status === "rejected" && !note) { toast.error("Add a short reason before rejecting, so the audit log explains it."); return; }
    decisionStore.set(a.id, { status, by: SIGNED_IN.name, note, at: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) } as Decision);
    setExpandedId(null);
    if (status === "approved") toast.success(`Approved by ${SIGNED_IN.name}: ${a.title}`, { description: "Sample only. In FIXCHAIN this runs the action, then verifies it." });
    else toast(`Rejected by ${SIGNED_IN.name}: ${a.title}`, { description: "Nothing ran. The reason is in the audit log." });
  };
  const undo = (id: string) => decisionStore.undo(id);

  const pending = APPROVALS.filter((a) => !decisions[a.id]);
  const decided = APPROVALS.filter((a) => decisions[a.id]);
  const list = tab === "pending" ? pending : decided;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">Approvals</h1>
        <p className="text-muted-foreground">Consequential actions wait here. Each approval is bound to a hash of the exact action, so it can't be reused for anything else.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Waiting for you" value={pending.length} tone="warn" />
        <Stat label="Approved this session" value={decided.filter((a) => decisions[a.id].status === "approved").length} tone="good" />
        <Stat label="Rejected this session" value={decided.filter((a) => decisions[a.id].status === "rejected").length} tone="bad" />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base font-semibold text-primary">{tab === "pending" ? "Waiting for a decision" : "Decided"}</CardTitle>
            <CardDescription>{TIER_LABEL[2]}. {TIER_LABEL[3]}.</CardDescription>
          </div>
          <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            {(["pending", "decided"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-primary")}>
                {t === "pending" ? `Pending (${pending.length})` : `Decided (${decided.length})`}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border border-t border-border">
            {list.map((a) => {
              const open = expandedId === a.id;
              const d = decisions[a.id];
              const humanLed = a.tier === 3;
              return (
                <li key={a.id}>
                  <button className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/60" onClick={() => setExpandedId(open ? null : a.id)} aria-expanded={open}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-primary">{a.title}</h3>
                        <Badge variant="outline" className={cn("text-[11px]", humanLed ? "border-destructive/40 text-destructive" : "border-amber-500/40 text-amber-700")}>Tier {a.tier}</Badge>
                        {d && <Badge variant="outline" className={cn("text-[11px]", d.status === "approved" ? "border-emerald-500/40 text-emerald-700" : "border-destructive/40 text-destructive")}>{d.status} by {d.by} at {d.at}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        For {a.incidentId}. Needs an {a.role}. {a.reversible ? "Can be undone." : "Can't be undone."} Asked {a.minsAgo} min ago.
                      </p>
                    </div>
                    <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div key="detail" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="space-y-4 border-t border-border/60 bg-muted/40 p-4">
                          <div>
                            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Evidence</h4>
                            <ul className="space-y-1 text-sm">
                              {a.evidence.map((ev) => <li key={ev} className="flex items-start gap-2"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{ev}</li>)}
                            </ul>
                          </div>
                          <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div><h4 className="mb-1 text-xs font-semibold text-muted-foreground">Expected effect</h4>{a.expectedEffect}</div>
                            <div><h4 className="mb-1 text-xs font-semibold text-muted-foreground">Bound to action</h4>
                              <span className="inline-flex items-center gap-1 font-mono text-xs"><Lock className="h-3 w-3" />{a.action} · sha256 {a.payloadHash}</span></div>
                          </div>
                          {d ? (
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                              {d.note && <span className="text-muted-foreground">Note: {d.note}</span>}
                              <Button variant="outline" size="sm" onClick={() => undo(a.id)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Undo decision</Button>
                            </div>
                          ) : humanLed ? (
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                              Tier 3 is human-led. FIXCHAIN gathered the evidence and routed it; an investigator makes the call outside this queue.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <label htmlFor={`note-${a.id}`} className="text-xs font-semibold text-muted-foreground">Note for the audit log (required to reject)</label>
                              <input id={`note-${a.id}`} value={notes[a.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Why you approve or reject" />
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => decide(a, "approved")}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve as {SIGNED_IN.name}</Button>
                                <Button size="sm" variant="outline" onClick={() => decide(a, "rejected")}><XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject</Button>
                                {a.incidentId === "INC-001" && <Button size="sm" variant="ghost" onClick={() => navigate("/engineering")}>See the patch and tests</Button>}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                {tab === "pending" ? "Nothing is waiting. New consequential actions appear here before they run." : "No decisions yet in this session."}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
