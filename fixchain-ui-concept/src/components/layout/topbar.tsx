"use client";

import { Bell, Search, User, Maximize, MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar() {
  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-blur]:bg-background/95 sticky top-0 z-10 w-full flex-shrink-0">
      <div className="flex items-center justify-between px-6 h-full">
        <div className="flex items-center gap-4 min-w-0">
          <div className="relative w-[260px] flex-shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tickets, incidents, agents..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-card text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          </button>
          <button className="hidden md:p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <Maximize className="h-5 w-5" />
          </button>
          <button className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors">
            <MoreVertical className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <div className="hidden md:flex flex-col items-end text-right">
              <p className="text-sm font-medium text-foreground">Jordan Smith</p>
              <p className="text-xs text-muted-foreground">Lead Incident Manager</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white border border-border/50">
              JS
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
