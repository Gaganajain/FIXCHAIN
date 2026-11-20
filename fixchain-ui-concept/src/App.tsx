"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MissionControl } from "@/pages/mission-control";
import { TicketCenter } from "@/pages/ticket-center";
import { IncidentIntelligence } from "@/pages/incident-intelligence";
import { AgentCommandCenter } from "@/pages/agent-command-center";
import { ResolutionApproval } from "@/pages/resolution-approval";
import { EngineeringRemediation } from "@/pages/engineering-remediation";
import { KnowledgeLearning } from "@/pages/knowledge-learning";
import { SimulationLab } from "@/pages/simulation-lab";
import { HistoricalAnalytics } from "@/pages/historical-analytics";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const routes: { path: string; component: React.ComponentType }[] = [
  { path: "/", component: MissionControl },
  { path: "/tickets", component: TicketCenter },
  { path: "/incidents", component: IncidentIntelligence },
  { path: "/agents", component: AgentCommandCenter },
  { path: "/approvals", component: ResolutionApproval },
  { path: "/engineering", component: EngineeringRemediation },
  { path: "/knowledge", component: KnowledgeLearning },
  { path: "/simulation", component: SimulationLab },
  { path: "/analytics", component: HistoricalAnalytics },
];

const RouteMap: Record<string, React.ComponentType> = {};
routes.forEach((r) => {
  RouteMap[r.path] = r.component;
});

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  const navigate = useCallback(
    (href: string) => {
      window.history.pushState({}, "", href);
      setCurrentPath(href);
    },
    [],
  );

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const Component = (RouteMap[currentPath] || MissionControl) as React.ComponentType<{ navigate?: (href: string) => void }>;

  const sidebarWidth = collapsed ? 64 : 280;

  return (
    <div className="relative h-screen flex bg-background text-foreground selection:bg-primary selection:text-white">
      <Toaster
        position="top-right"
        richColors
        className="z-[100]"
      />
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        currentPath={currentPath}
        width={sidebarWidth}
      />
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0",
          `ml-${sidebarWidth}`,
          collapsed ? "ml-[64px]" : "ml-[280px]",
        )}
      >
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <Component navigate={navigate} />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
