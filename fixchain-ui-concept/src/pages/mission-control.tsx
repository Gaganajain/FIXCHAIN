import { useState } from "react";
import { AlertCircle, ArrowRight, Bot, CheckCircle2, Clock, Inbox, Percent, ShieldCheck, Users, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/lib/shadcn";
import { cn, getSeverityColor } from "@/lib/utils";
import { APPROVALS, INCIDENTS, TICKETS } from "@/data/fixchain";
import type { Navigate } from "@/App";

const open = INCIDENTS.filter((i) => i.status !== "resolved");
const statItems = [
  { title: "Tickets today", value: "300", change: "136 still open", tone: "neutral", icon: Inbox },
  { title: "Open incidents", value: String(open.length), change: `${open.filter((i) => i.kind === "external").length} external, not a code bug`, tone: "neutral", icon: AlertCircle },
  { title: "Critical", value: String(open.filter((i) => i.severity === "critical").length), change: "INC-001, paid orders marked failed", tone: "bad", icon: AlertCircle },
  { title: "Merchants affected", value: String(open.reduce((a, i) => a + i.affectedMerchants, 0)), change: "with an open ticket", tone: "neutral", icon: Users },
  { title: "Resolved with proof", value: "54.7%", change: "164 of 300 tickets", tone: "good", icon: CheckCircle2 },
  { title: "Typical time to resolve", value: "4m 10s", change: "ticket in to verified", tone: "neutral", icon: Clock },
  { title: "On track for deadline", value: "100%", change: "demo SLA targets", tone: "good", icon: Percent },
  { title: "Agents working", value: "2", change: "of 9", tone: "neutral", icon: Bot },
  { title: "Waiting for approval", value: String(APPROVALS.length), change: "consequential actions", tone: "warn", icon: ShieldCheck },
  { title: "Unapproved payment actions", value: "0", change: "the policy engine blocks them", tone: "good", icon: Wrench },
] as const;
const TONE = { neutral: "text-muted-foreground", good: "text-emerald-600", bad: "text-destructive", warn: "text-amber-600" } as const;

const trendData = [
  { name: "08:00", tickets: 12, resolved: 9 }, { name: "08:05", tickets: 48, resolved: 21 }, { name: "08:10", tickets: 96, resolved: 40 },
  { name: "08:15", tickets: 71, resolved: 52 }, { name: "08:20", tickets: 40, resolved: 30 }, { name: "08:25", tickets: 22, resolved: 9 }, { name: "08:30", tickets: 11, resolved: 3 },
];
const regionData = [
  { region: "Maharashtra", incidents: 42, color: "#002970" },
  { region: "Delhi NCR", incidents: 23, color: "#00BAF2" },
  { region: "Karnataka", incidents: 15, color: "#5B8DEF" },
  { region: "Tamil Nadu", incidents: 6, color: "#94C9E8" },
  { region: "Gujarat", incidents: 4, color: "#C7D2FE" },
];
/** Mock connectors FIXCHAIN reads (all simulated in the demo). */
const healthItems = [
  { name: "Merchant callback contract check", what: "Every callback compared with the gateway contract", status: "Mismatches found", tone: "bg-destructive", text: "text-destructive" },
  { name: "Payment status API", what: "Authoritative transaction status", status: "Healthy", tone: "bg-emerald-500", text: "text-emerald-600" },
  { name: "Soundbox telemetry", what: "Device online, battery, firmware", status: "19 devices offline", tone: "bg-amber-500", text: "text-amber-600" },
  { name: "QR and VPA registry", what: "Which VPA each QR points at", status: "9 inactive VPAs", tone: "bg-amber-500", text: "text-amber-600" },
  { name: "Settlement batches", what: "Partner bank batch status", status: "1 batch held", tone: "bg-amber-500", text: "text-amber-600" },
];
const agentActivity = [
  { name: "Understand", value: 300 }, { name: "Triage", value: 300 }, { name: "Group", value: 296 }, { name: "Resolve", value: 164 }, { name: "Verify", value: 164 },
];

export function MissionControl({ navigate }: { navigate: Navigate }) {
  const [activeTab, setActiveTab] = useState<"overview" | "brief">("overview");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Mission control</h1>
          <p className="text-muted-foreground">What's broken for merchants right now, and what needs a person.</p>
        </div>
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {([["overview", "Overview"], ["brief", "Copilot brief"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}
              className={cn("rounded-md px-4 py-2 text-sm font-medium transition-colors", activeTab === id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-primary")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "brief" ? <CopilotBrief navigate={navigate} /> : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {statItems.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.title} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{stat.title}</span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className={cn("text-2xl font-bold tracking-tight", stat.tone === "bad" ? "text-destructive" : "text-primary")}>{stat.value}</div>
                  <p className={cn("mt-0.5 text-xs", TONE[stat.tone])}>{stat.change}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-semibold text-primary">Open incidents</CardTitle>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00BAF2]" /> Live</span>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border/60">
                    {open.map((item) => (
                      <li key={item.id}>
                        <button onClick={() => navigate(`/incidents?q=${item.id}`)} className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/60">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground group-hover:text-primary">{item.title}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {item.id}, {item.tickets} tickets, detected {item.detectedMinsAgo} min ago
                              {item.kind === "external" && ", external: no patch"}
                              {item.kind === "code_defect" && ", code defect"}
                            </div>
                          </div>
                          <Badge variant="outline" className={cn("text-xs capitalize", getSeverityColor(item.severity))}>{item.severity}</Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-semibold text-primary">Recent tickets</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {TICKETS.slice(0, 5).map((t) => (
                    <button key={t.id} onClick={() => navigate(`/tickets?q=${t.id}`)} className="flex w-full items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-3 text-left hover:bg-accent/60">
                      <span className="mt-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-primary">{t.language}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" lang={t.language}>“{t.message}”</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{t.id}, {t.customerName}{t.incidentId ? `, grouped into ${t.incidentId}` : ""}</div>
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6 lg:col-span-5">
              <Card>
                <CardHeader><CardTitle className="text-base font-semibold text-primary">What FIXCHAIN is watching</CardTitle><CardDescription>Simulated connectors in this demo</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {healthItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <div className="font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.what}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", item.tone)} />
                        <span className={cn("text-xs font-semibold", item.text)}>{item.status}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-semibold text-primary">Agent tasks completed today</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={agentActivity} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="value" name="Tasks" fill="#00BAF2" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-semibold text-primary">Tickets by region</CardTitle></CardHeader>
                <CardContent className="flex items-center gap-4">
                  <ResponsiveContainer width="45%" height={170}>
                    <PieChart>
                      <Pie data={regionData} dataKey="incidents" nameKey="region" innerRadius={42} outerRadius={75} paddingAngle={2}>
                        {regionData.map((e) => <Cell key={e.region} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="flex-1 space-y-2 text-xs">
                    {regionData.map((e) => (
                      <li key={e.region} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />{e.region}</span>
                        <span className="font-medium text-foreground">{e.incidents}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="lg:col-span-12">
              <CardHeader><CardTitle className="text-base font-semibold text-primary">Tickets in and resolved, last 30 minutes</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="tickets" name="Tickets in" stroke="#002970" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="resolved" name="Resolved with proof" stroke="#10B981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 flex gap-6 text-xs">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-muted-foreground">Tickets in</span></span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Resolved with proof</span></span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** The "AI summary" tab now shows the operations copilot brief: facts kept apart from hypotheses. */
function CopilotBrief({ navigate }: { navigate: Navigate }) {
  const inc = INCIDENTS[0];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-primary">{inc.id}: {inc.title}</CardTitle>
          <CardDescription>{inc.tickets} reports grouped into one incident. Severity critical, set by rule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Facts, each with a source</h3>
            <ul className="space-y-1.5">{inc.facts.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{f}</li>)}</ul>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Root cause (confirmed by reproduction)</h3>
            <p>{inc.rootCause}</p>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">What happens next</h3>
            <ol className="list-decimal space-y-1 pl-5">{inc.actions.map((a) => <li key={a}>{a}</li>)}</ol>
          </section>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/approvals")}>Review approvals</Button>
            <Button variant="outline" onClick={() => navigate("/engineering")}>See the patch</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">Other incidents</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {INCIDENTS.slice(1).map((i) => (
            <div key={i.id} className="border-l-2 border-border pl-3">
              <div className="font-medium">{i.id}: {i.title}</div>
              <div className="text-xs text-muted-foreground">{i.kind === "external" ? "External. The merchant code behaved correctly; no patch." : i.actions[0]}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
