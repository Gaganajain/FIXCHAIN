"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  ShieldAlert,
  CircuitBoard,
  ClipboardList,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Mission Control", href: "/", icon: LayoutDashboard },
  { name: "Ticket Center", href: "/tickets", icon: FileText },
  { name: "Incident Intelligence", href: "/incidents", icon: ShieldAlert },
  { name: "AI Agent Command", href: "/agents", icon: CircuitBoard },
  { name: "Resolution & Approval", href: "/approvals", icon: ClipboardList },
  { name: "Engineering Remediation", href: "/engineering", icon: BookOpen },
  { name: "Knowledge & Learning", href: "/knowledge", icon: BarChart3 },
  { name: "Simulation Lab", href: "/simulation", icon: Settings },
  { name: "Historical Analytics", href: "/analytics", icon: BarChart3 },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  currentPath: string;
  width: number;
}

export function Sidebar({ collapsed, setCollapsed, currentPath, width }: SidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex flex-col transition-all duration-300",
        `w-${width}`,
      )}
      style={{ width }}
    >
        <div className="flex items-center justify-between h-16 border-b border-border px-5 bg-background shrink-0">
          <div className="flex flex-col items-center gap-1">
            <img src="/paytm-logo.svg" alt="Paytm" width="120" height="auto" className="block" />
            {!collapsed && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                FIXCHAIN
              </span>
            )}
          </div>
          <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navigation.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;
          return (
            <div
              key={item.name}
              className="relative"
              onMouseEnter={() => setHoveredItem(item.href)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <a
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                    : hoveredItem === item.href && !collapsed
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                {!collapsed && <span>{item.name}</span>}
                {isActive && !collapsed && (
                  <div className="w-0.5 h-5 bg-primary absolute right-0 top-1 bottom-1" />
                )}
              </a>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border bg-background/80 backdrop-blur shrink-0 p-4">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200">
          <LogOut className="h-5 w-5" />
          <span className="text-muted-foreground hover:text-destructive transition-colors">Sign out</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="p-2 rounded-md hover:bg-accent text-muted-foreground"
            aria-label="Toggle theme"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
