import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ChevronRight, Download, Plus, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn, getPriorityColor, getStatusColor } from "@/lib/utils";
import { TicketCategory, TicketPriority, TicketStatus } from "@/types";
import { LANG_LABEL, TICKETS, type FxTicket } from "@/data/fixchain";
import type { Navigate } from "@/App";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  upi_payment: "UPI payment", soundbox: "Soundbox", merchant_qr: "Merchant QR", settlement: "Settlement", platform_outage: "Platform outage", other: "Fraud or other",
};
const PRIORITY_LABELS: Record<TicketPriority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed", escalated: "With a person" };

/** Reply templates in the customer's language (FIXCHAIN only sends approved templates). */
const REPLY: Record<string, string> = {
  en: "We found the problem and are fixing it. We'll update you as soon as your order is confirmed.",
  hi: "Humne samasya pehchaan li hai aur use theek kar rahe hain. Order confirm hote hi aapko bataenge.",
  mr: "आम्हाला समस्या सापडली आहे आणि ती दुरुस्त करत आहोत. ऑर्डर निश्चित होताच कळवू.",
};

/** Severity by rule (mirrors ops/taxonomy.py): category base + amount, never a model guess. */
function priorityFor(cat: TicketCategory, amount: number): TicketPriority {
  const base = { upi_payment: 2, merchant_qr: 2, settlement: 2, soundbox: 1, platform_outage: 3, other: 3 }[cat];
  const score = base + (amount >= 1000 ? 1 : 0);
  return score >= 4 ? "critical" : score === 3 ? "high" : score === 2 ? "medium" : "low";
}

const relTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export function TicketCenter({ navigate }: { navigate: Navigate }) {
  const [tickets, setTickets] = useState<FxTicket[]>(TICKETS);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [selected, setSelected] = useState<FxTicket | null>(null);
  const [replies, setReplies] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); setCreating(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => tickets.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || [t.subject, t.customerName, t.id, t.message, t.incidentId ?? ""].some((v) => v.toLowerCase().includes(q));
    return matchesSearch && (priorityFilter === "all" || t.priority === priorityFilter)
      && (categoryFilter === "all" || t.category === categoryFilter) && (statusFilter === "all" || t.status === statusFilter);
  }), [tickets, searchQuery, priorityFilter, categoryFilter, statusFilter]);

  const anyFilter = searchQuery || priorityFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => { setSearchQuery(""); setPriorityFilter("all"); setCategoryFilter("all"); setStatusFilter("all"); };

  const exportCsv = () => {
    const rows = [["id", "customer", "language", "category", "priority", "status", "amount", "incident", "created"],
      ...filtered.map((t) => [t.id, t.customerName, LANG_LABEL[t.language], CATEGORY_LABELS[t.category], t.priority, t.status, String(t.amount ?? ""), t.incidentId ?? "", t.createdAt])];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "fixchain-tickets-sample.csv" });
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${filtered.length} tickets`);
  };

  const sendReply = (t: FxTicket) => {
    setReplies((r) => ({ ...r, [t.id]: [...(r[t.id] ?? []), REPLY[t.language]] }));
    toast.success(`Reply sent to ${t.customerName} in ${LANG_LABEL[t.language]}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Tickets</h1>
          <p className="text-muted-foreground">Complaints from customers and merchants in English, Hindi and Marathi.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
          <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" /> Raise a ticket</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Input placeholder="Search name, message, TK- or INC-" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} left={<Search className="h-4 w-4" />} aria-label="Search tickets" />
            </div>
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as TicketPriority | "all")}>
              <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as TicketCategory | "all")}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any category</SelectItem>
                {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | "all")}>
              <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {anyFilter && <button onClick={clearFilters} className="mt-3 text-sm font-medium text-[#0098CC] hover:underline">Clear filters</button>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="All tickets" value={tickets.length} />
        <Stat label="Open" value={tickets.filter((t) => t.status === "open").length} tone="warn" />
        <Stat label="Grouped into an incident" value={tickets.filter((t) => t.incidentId).length} tone="sky" />
        <Stat label="Resolved with proof" value={tickets.filter((t) => t.status === "resolved").length} tone="good" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">Tickets ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Ticket</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Incident</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} onClick={() => setSelected(t)} className="cursor-pointer" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(t)}>
                    <TableCell className="pl-4 font-medium">{t.id}</TableCell>
                    <TableCell>
                      <div className="font-medium">{t.customerName}</div>
                      <div className="max-w-[260px] truncate text-xs text-muted-foreground" lang={t.language}>{LANG_LABEL[t.language]}: “{t.message}”</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{CATEGORY_LABELS[t.category]}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-xs", getPriorityColor(t.priority))}>{PRIORITY_LABELS[t.priority]}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={cn("text-xs", getStatusColor(t.status))}>{STATUS_LABELS[t.status]}</Badge></TableCell>
                    <TableCell className="text-sm">{t.incidentId ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.amount ? `₹${t.amount.toLocaleString("en-IN")}` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{relTime(t.createdAt)}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      No tickets match these filters. <button onClick={clearFilters} className="font-medium text-[#0098CC] hover:underline">Clear filters</button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Ticket detail drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div key="backdrop" className="fixed inset-0 z-40 bg-primary/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)} />
            <motion.aside key="drawer" role="dialog" aria-modal="true" aria-label={`Ticket ${selected.id}`}
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.25 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-2xl md:w-[520px]">
              <div className="flex items-center justify-between border-b border-border p-5">
                <div>
                  <div className="text-xs text-muted-foreground">{selected.id}, {CATEGORY_LABELS[selected.category]}</div>
                  <h2 className="text-lg font-bold text-primary">{selected.subject}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-md p-2 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-medium text-muted-foreground">What {selected.customerName} wrote, in {LANG_LABEL[selected.language]}</div>
                  <p className="mt-1 text-[15px]" lang={selected.language}>“{selected.message}”</p>
                  <p className="mt-2 text-sm text-muted-foreground">Understood as: {selected.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-border bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Transaction</div><div className="font-medium">{selected.transactionId ?? "—"}</div><div className="text-xs text-muted-foreground">{selected.amount ? `₹${selected.amount.toLocaleString("en-IN")}` : "No amount"}, via {selected.channel}</div></div>
                  <div className="rounded-lg border border-border bg-muted/50 p-3"><div className="text-xs text-muted-foreground">With</div><div className="font-medium">{selected.assignedTo}</div><div className="text-xs text-muted-foreground">Phone {selected.customerPhone}</div></div>
                </div>
                {selected.incidentId && (
                  <button onClick={() => navigate("/incidents")} className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm hover:bg-amber-100">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span><span className="font-medium text-amber-800">Part of {selected.incidentId}.</span> <span className="text-amber-700">Fixing the incident resolves this ticket.</span></span>
                  </button>
                )}
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Timeline</h3>
                  <ol className="space-y-2 border-l-2 border-border pl-4 text-sm">
                    <li>Received at {relTime(selected.createdAt)} and understood</li>
                    <li>Priority set to {PRIORITY_LABELS[selected.priority].toLowerCase()} by rule</li>
                    {selected.incidentId && <li>Grouped into {selected.incidentId}</li>}
                    {selected.status === "escalated" && <li>Handed to a human investigator (Tier 3)</li>}
                    {selected.resolvedAt && <li>Resolved at {relTime(selected.resolvedAt)}, verified by the payment status API</li>}
                    {(replies[selected.id] ?? []).map((r, i) => <li key={i} className="text-[#0098CC]" lang={selected.language}>Reply sent: “{r}”</li>)}
                  </ol>
                </div>
              </div>
              <div className="border-t border-border p-4">
                <div className="mb-2 text-xs text-muted-foreground">Approved reply template in {LANG_LABEL[selected.language]}</div>
                <p className="mb-3 rounded-lg bg-muted/60 p-3 text-sm" lang={selected.language}>{REPLY[selected.language]}</p>
                <Button onClick={() => sendReply(selected)} className="w-full"><Send className="mr-2 h-4 w-4" /> Send reply</Button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {creating && <RaiseTicket onClose={() => setCreating(false)} onCreate={(t) => { setTickets((ts) => [t, ...ts]); setCreating(false); toast.success(`${t.id} raised with ${t.priority} priority`); }} nextId={`TK-${1001 + tickets.length}`} />}
    </div>
  );
}

function RaiseTicket({ onClose, onCreate, nextId }: { onClose: () => void; onCreate: (t: FxTicket) => void; nextId: string }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<FxTicket["language"]>("hi");
  const [category, setCategory] = useState<TicketCategory>("upi_payment");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const amt = Number(amount) || 0;
  const priority = priorityFor(category, amt);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) { toast.error("Add the customer's name and what they said."); return; }
    const now = new Date().toISOString();
    onCreate({ id: nextId, customerId: "C-NEW", customerName: name.trim(), customerEmail: "", customerPhone: "—", category, priority, status: "open", subject: message.trim().slice(0, 60), description: "Raised from the console (sample).", message: message.trim(), language, amount: amt, createdAt: now, updatedAt: now, assignedTo: "Customer understanding", channel: "web" });
  };
  const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-primary/20 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Raise a ticket" className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-primary">Raise a ticket</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button></div>
        <label className="block text-sm font-medium">Customer or merchant name<input autoFocus className={cn(field, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Language
            <select className={cn(field, "mt-1")} value={language} onChange={(e) => setLanguage(e.target.value as FxTicket["language"])}>
              <option value="en">English</option><option value="hi">Hindi</option><option value="mr">Marathi</option>
            </select></label>
          <label className="block text-sm font-medium">Category
            <select className={cn(field, "mt-1")} value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
              {(Object.keys(CATEGORY_LABELS) as TicketCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select></label>
        </div>
        <label className="block text-sm font-medium">Amount in ₹ (optional)<input inputMode="numeric" className={cn(field, "mt-1")} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} /></label>
        <label className="block text-sm font-medium">What they said<textarea rows={3} className={cn(field, "mt-1 h-auto py-2")} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Paise kat gaye lekin order fail" /></label>
        <p className="text-xs text-muted-foreground">Priority by rule: <span className="font-semibold text-foreground">{PRIORITY_LABELS[priority]}</span> (category plus amount; a model never sets it).</p>
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Raise ticket</Button></div>
      </form>
    </div>
  );
}
