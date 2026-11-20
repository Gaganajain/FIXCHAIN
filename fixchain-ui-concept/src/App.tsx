import { Component, ReactNode, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
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

export type Navigate = (href: string) => void;
type PageProps = { navigate: Navigate };

const RouteMap: Record<string, React.ComponentType<PageProps>> = {
  "/": MissionControl,
  "/tickets": TicketCenter,
  "/incidents": IncidentIntelligence,
  "/agents": AgentCommandCenter,
  "/approvals": ResolutionApproval,
  "/engineering": EngineeringRemediation,
  "/knowledge": KnowledgeLearning,
  "/simulation": SimulationLab,
  "/analytics": HistoricalAnalytics,
};

/** Keeps one broken screen from blanking the whole app. */
class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-destructive">This screen failed to load</h2>
        <p className="mt-1 text-sm text-muted-foreground">{this.state.error.message}</p>
        <p className="mt-3 text-sm text-muted-foreground">Other screens still work. Pick one from the menu.</p>
      </div>
    );
  }
}

export default function App() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  const navigate = useCallback<Navigate>((href) => {
    window.history.pushState({}, "", href);
    setCurrentPath(href.split("?")[0]);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const Page = RouteMap[currentPath] ?? MissionControl;
  const sidebarWidth = collapsed ? 72 : 264;

  return (
    <div className="relative flex h-screen bg-background text-foreground selection:bg-sky/30">
      <Toaster position="top-right" richColors className="z-[100]" />
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} currentPath={currentPath} width={sidebarWidth} navigate={navigate} />
      <div className="flex min-w-0 flex-1 flex-col transition-[margin] duration-300" style={{ marginLeft: sidebarWidth }}>
        <Topbar navigate={navigate} />
        <main className="flex-1 overflow-y-auto p-5 md:p-8">
          <motion.div key={currentPath} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <PageBoundary resetKey={currentPath}>
              <Page navigate={navigate} />
            </PageBoundary>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
