import { useState } from "react";
import { Bell, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SIGNED_IN } from "@/data/fixchain";
import { usePendingCount } from "@/data/decisions";
import type { Navigate } from "@/App";

/** Search jumps to the right screen: INC-… → incidents, APR-… → approvals, anything else → tickets. */
function routeFor(q: string): string {
  const s = q.trim().toUpperCase();
  if (s.startsWith("INC-")) return `/incidents?q=${encodeURIComponent(q.trim())}`;
  if (s.startsWith("APR-")) return "/approvals";
  return `/tickets?q=${encodeURIComponent(q.trim())}`;
}

export function Topbar({ navigate }: { navigate: Navigate }) {
  const [q, setQ] = useState("");
  const pending = usePendingCount();
  return (
    <header className="sticky top-0 z-10 h-16 w-full shrink-0 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-4 px-5 md:px-6">
        <form
          className="relative w-full max-w-[320px]"
          role="search"
          onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(routeFor(q)); }}
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a ticket, customer or INC-001"
            aria-label="Search tickets and incidents"
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </form>

        <div className="flex items-center gap-3">
          <Badge variant="outline" className="hidden border-amber-500/40 bg-amber-500/10 text-amber-700 sm:inline-flex">Sample data</Badge>
          <button
            onClick={() => { toast.message(pending ? `${pending} actions are waiting for an approver` : "Nothing is waiting for approval"); navigate("/approvals"); }}
            className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
            aria-label={`${pending} approvals waiting`}
          >
            <Bell className="h-5 w-5" />
            {pending > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />}
          </button>
          <div className="flex items-center gap-3 border-l border-border pl-4">
            <div className="hidden flex-col items-end text-right md:flex">
              <p className="text-sm font-medium text-foreground">{SIGNED_IN.name}</p>
              <p className="text-xs text-muted-foreground">{SIGNED_IN.role}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-white">{SIGNED_IN.initials}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
