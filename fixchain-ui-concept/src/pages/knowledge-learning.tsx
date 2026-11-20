import { useState } from "react";
import { CheckCircle2, ChevronDown, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";
import { KNOWLEDGE, SIGNED_IN } from "@/data/fixchain";

type Item = (typeof KNOWLEDGE)[number] & { status: string };

export function KnowledgeLearning() {
  const [items, setItems] = useState<Item[]>(KNOWLEDGE.map((k) => ({ ...k })));
  const [searchQuery, setSearchQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = searchQuery.toLowerCase();
  const filtered = items.filter((i) => !q || i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q)));
  const avg = Math.round(items.reduce((a, b) => a + b.confidence, 0) / items.length);
  const decide = (id: string, ok: boolean) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, status: ok ? "verified" : "rejected", category: ok ? "Playbook change approved" : i.category } : i)));
    toast[ok ? "success" : "message"](ok ? `Approved by ${SIGNED_IN.name}. The playbook gets a new version.` : "Proposal rejected. The playbook stays as it is.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Knowledge</h1>
          <p className="text-muted-foreground">Versioned playbooks, remembered defects and learning proposals. Nothing changes a playbook without a person.</p>
        </div>
        <div className="w-full md:w-72">
          <Input placeholder="Search playbooks and lessons" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} left={<Search className="h-4 w-4" />} aria-label="Search knowledge" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Entries" value={items.length} />
        <Stat label="Verified" value={items.filter((i) => i.status === "verified").length} tone="good" />
        <Stat label="Waiting for a person" value={items.filter((i) => i.status === "pending").length} tone="warn" />
        <Stat label="Average confidence" value={`${avg}%`} tone="sky" />
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => {
          const open = openId === item.id;
          return (
            <div key={item.id} className={cn("flex flex-col rounded-xl border bg-card p-5", item.status === "pending" ? "border-amber-400/60" : "border-border")}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <Badge variant="outline" className="text-xs">{item.category}</Badge>
                <Badge variant="outline" className={cn("text-xs", item.status === "verified" ? "text-emerald-700" : item.status === "rejected" ? "text-destructive" : "text-amber-700")}>{item.status === "pending" ? "needs approval" : item.status}</Badge>
              </div>
              <h3 className="mb-2 text-sm font-semibold text-primary">{item.title}</h3>
              <p className={cn("text-xs text-muted-foreground", !open && "line-clamp-2")}>{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>)}</div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Confidence</dt><dd className="font-semibold">{item.confidence}%</dd></div>
                <div><dt className="text-muted-foreground">Times used</dt><dd className="font-semibold">{item.resolved}</dd></div>
                <div><dt className="text-muted-foreground">Updated</dt><dd className="font-semibold">{item.updated}</dd></div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}>
                  <ChevronDown className={cn("mr-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} /> {open ? "Show less" : "Read more"}
                </Button>
                {item.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => decide(item.id, true)}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(item.id, false)}><XCircle className="mr-1 h-3.5 w-3.5" /> Reject</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="col-span-full py-12 text-center text-muted-foreground">Nothing matches “{searchQuery}”. Try upi, soundbox or qr.</div>}
      </div>
    </div>
  );
}
