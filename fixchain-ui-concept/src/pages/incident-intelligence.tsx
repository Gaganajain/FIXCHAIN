import { Fragment, useState } from "react";
import { ArrowRight, ChevronDown, MapPin, RefreshCw, ShieldAlert, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn, getSeverityColor } from "@/lib/utils";
import { INCIDENTS, type FxIncident } from "@/data/fixchain";
import type { Navigate } from "@/App";

const KIND: Record<FxIncident["kind"], { label: string; cls: string }> = {
  code_defect: { label: "Code defect", cls: "border-destructive/40 text-destructive" },
  operational: { label: "Operational", cls: "border-border text-muted-foreground" },
  external: { label: "External, no patch", cls: "border-amber-500/40 text-amber-700" },
};
const STATUS: Record<FxIncident["status"], string> = { detected: "Detected", investigating: "Investigating", awaiting_approval: "Waiting for approval", resolved: "Resolved" };
const BAR: Record<FxIncident["severity"], string> = { critical: "bg-destructive", high: "bg-orange-500", medium: "bg-amber-500", low: "bg-emerald-500" };

export function IncidentIntelligence({ navigate }: { navigate: Navigate }) {
  const initial = new URLSearchParams(window.location.search).get("q")?.toUpperCase() ?? null;
  const [expandedId, setExpandedId] = useState<string | null>(INCIDENTS.some((i) => i.id === initial) ? initial : null);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Incidents</h1>
          <p className="text-muted-foreground">Many complaints about the same problem become one incident, with facts kept apart from guesses.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Updated {refreshedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <Button variant="outline" onClick={() => { setRefreshedAt(new Date()); toast.success("Grouping re-checked: no new incidents"); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Re-check grouping
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Open incidents" value={INCIDENTS.length} sub={`from ${INCIDENTS.reduce((a, i) => a + i.tickets, 0)} tickets`} />
        <Stat label="Critical" value={INCIDENTS.filter((i) => i.severity === "critical").length} tone="bad" sub="Needs action now" />
        <Stat label="Code defects" value={INCIDENTS.filter((i) => i.kind === "code_defect").length} tone="sky" sub="Sent to engineering remediation" />
        <Stat label="Merchants affected" value={INCIDENTS.reduce((a, b) => a + b.affectedMerchants, 0)} sub="Across 5 states" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-primary">Incident groups</CardTitle>
          <CardDescription>Click a group for the facts, root cause and next actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {INCIDENTS.map((inc) => {
              const open = expandedId === inc.id;
              return (
                <div key={inc.id} className={cn("rounded-xl border bg-card transition-shadow", open ? "border-[#00BAF2] shadow-md" : "border-border hover:shadow-sm")}>
                  <button className="w-full p-4 text-left" onClick={() => toggle(inc.id)} aria-expanded={open}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("text-[11px] capitalize", getSeverityColor(inc.severity))}>{inc.severity}</Badge>
                      <Badge variant="outline" className={cn("text-[11px]", KIND[inc.kind].cls)}>{KIND[inc.kind].label}</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">{inc.id}</span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold leading-snug text-primary">{inc.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{inc.tickets} tickets, {inc.affectedMerchants} merchants</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{inc.regions.join(", ")}</span>
                    </div>
                    <div className="mt-3">
                      <div className="h-1.5 w-full rounded-full bg-muted"><div className={cn("h-1.5 rounded-full", BAR[inc.severity])} style={{ width: `${inc.confidence}%` }} /></div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Grouping confidence</span><span>{inc.confidence}%</span></div>
                    </div>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-border p-4 text-sm">
                      <div><div className="mb-1 text-xs font-semibold text-muted-foreground">Facts</div>
                        <ul className="space-y-1 text-xs">{inc.facts.map((f) => <li key={f}>• {f}</li>)}</ul></div>
                      <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{inc.kind === "code_defect" ? "Root cause (reproduced)" : "Leading hypothesis"}</div><p className="text-xs">{inc.rootCause}</p></div>
                      <div><div className="mb-1 text-xs font-semibold text-muted-foreground">Next actions</div>
                        <ul className="space-y-1 text-xs">{inc.actions.map((a) => <li key={a} className="flex items-start gap-1"><ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />{a}</li>)}</ul></div>
                      {inc.kind === "code_defect" && <Button size="sm" onClick={() => navigate("/engineering")}><Wrench className="mr-1.5 h-3.5 w-3.5" /> Open the code fix</Button>}
                      {inc.kind !== "external" && inc.kind !== "code_defect" && <Button size="sm" variant="outline" onClick={() => navigate("/approvals")}>Review its approvals</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">All incidents</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                  {["Incident", "Severity", "Type", "Status", "Tickets", "Merchants", "Detected", "Trend", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {INCIDENTS.map((inc) => (
                  <Fragment key={inc.id}>
                    <tr className="cursor-pointer transition-colors hover:bg-accent/50" onClick={() => toggle(inc.id)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div><div className="font-medium">{inc.title}</div><div className="text-xs text-muted-foreground">{inc.id}, {inc.category}</div></div></div>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className={cn("text-xs capitalize", getSeverityColor(inc.severity))}>{inc.severity}</Badge></td>
                      <td className="px-4 py-3"><Badge variant="outline" className={cn("text-xs", KIND[inc.kind].cls)}>{KIND[inc.kind].label}</Badge></td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{STATUS[inc.status]}</Badge></td>
                      <td className="px-4 py-3 tabular-nums">{inc.tickets}</td>
                      <td className="px-4 py-3 tabular-nums">{inc.affectedMerchants}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{inc.detectedMinsAgo} min ago</td>
                      <td className="px-4 py-3"><span className={inc.growth > 0 ? "text-destructive" : inc.growth < 0 ? "text-emerald-600" : "text-muted-foreground"}>{inc.growth > 0 ? "+" : ""}{inc.growth}%</span></td>
                      <td className="px-4 py-3"><ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedId === inc.id && "rotate-180")} /></td>
                    </tr>
                    {expandedId === inc.id && (
                      <tr className="bg-muted/30"><td colSpan={9} className="px-4 py-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Root cause: </span>{inc.rootCause}</td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
