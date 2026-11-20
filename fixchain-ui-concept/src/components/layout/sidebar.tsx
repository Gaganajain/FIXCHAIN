import {
  BookOpen,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  LineChart,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePendingCount } from "@/data/decisions";
import type { Navigate } from "@/App";

const navigation = [
  { name: "Mission control", href: "/", icon: LayoutDashboard },
  { name: "Tickets", href: "/tickets", icon: Inbox },
  { name: "Incidents", href: "/incidents", icon: ShieldAlert },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Approvals", href: "/approvals", icon: ShieldCheck, badge: true },
  { name: "Code fixes", href: "/engineering", icon: Wrench },
  { name: "Knowledge", href: "/knowledge", icon: BookOpen },
  { name: "Simulation lab", href: "/simulation", icon: FlaskConical },
  { name: "Analytics", href: "/analytics", icon: LineChart },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  currentPath: string;
  width: number;
  navigate: Navigate;
}

export function Sidebar({ collapsed, setCollapsed, currentPath, width, navigate }: SidebarProps) {
  const pending = usePendingCount();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex flex-col border-r border-border bg-card transition-[width] duration-300" style={{ width }}>
      <div className={cn("flex h-16 shrink-0 items-center border-b border-border", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2.5" aria-label="FIXCHAIN home">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#00BAF2] text-white">
            <Zap className="h-5 w-5" strokeWidth={2.5} />
          </span>
          {!collapsed && (
            <span className="leading-none">
              <span className="block text-[20px] font-extrabold tracking-tight">
                <span className="text-primary">FIX</span><span className="text-[#00BAF2]">CHAIN</span>
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">for Paytm merchants</span>
            </span>
          )}
        </a>
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-primary" aria-label="Collapse menu" title="Collapse menu">
            <ChevronsLeft className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {navigation.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              title={collapsed ? item.name : undefined}
              aria-current={isActive ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); navigate(item.href); }}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-primary",
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", isActive && "text-[#00BAF2]")} />
              {!collapsed && <span className="flex-1 truncate">{item.name}</span>}
              {item.badge && pending > 0 ? (
                <span className={cn(
                  "rounded-full px-1.5 text-[11px] font-bold leading-5",
                  collapsed && "absolute right-1.5 top-1 leading-4",
                  isActive ? "bg-white text-primary" : "bg-amber-500 text-white",
                )}>{pending}</span>
              ) : null}
            </a>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="mb-1 flex w-full justify-center rounded-xl p-2.5 text-muted-foreground hover:bg-accent hover:text-primary" aria-label="Expand menu" title="Expand menu">
            <ChevronsRight className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={() => toast.info("This concept has no sign-in. Run the FIXCHAIN dashboard for demo roles.")}
          className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/5 hover:text-destructive", collapsed && "justify-center px-0")}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        {!collapsed && <p className="mt-2 px-3 text-[11px] leading-snug text-muted-foreground">Sample data. Independent hackathon project, not an official Paytm product.</p>}
      </div>
    </aside>
  );
}
