"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ReactFlow, Controls, Background, useReactFlow, Edge } from "reactflow";
import "reactflow/dist/style.css";
import {
  Bot,
  Activity,
  CheckCircle2,
  Zap,
  Brain,
  ShieldCheck,
  Users,
  Heading,
  Layout,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";

const agents = [
  {
    id: "agent-1",
    name: "Customer Understanding",
    role: "customer_understanding",
    status: "completed" as const,
    currentTask: "Analyzed 2,847 incoming tickets",
    progress: 100,
    completedTasks: 2847,
    failedTasks: 0,
    handoffs: 2847,
    lastActive: "2m ago",
    x: 250,
    y: 100,
    icon: Bot,
    color: "text-blue-600",
  },
  {
    id: "agent-2",
    name: "Intelligent Triage",
    role: "triage",
    status: "running" as const,
    currentTask: "Prioritizing 45 new tickets",
    progress: 72,
    completedTasks: 32,
    failedTasks: 0,
    handoffs: 12,
    lastActive: "active",
    x: 500,
    y: 100,
    icon: Zap,
    color: "text-indigo-600",
  },
  {
    id: "agent-3",
    name: "Incident Intelligence",
    role: "incident_intelligence",
    status: "running" as const,
    currentTask: "Clustering 4 related incidents",
    progress: 58,
    completedTasks: 3,
    failedTasks: 0,
    handoffs: 3,
    lastActive: "active",
    x: 750,
    y: 100,
    icon: Brain,
    color: "text-purple-600",
  },
  {
    id: "agent-4",
    name: "Investigation",
    role: "investigation",
    status: "waiting" as const,
    currentTask: "Awaiting incident intelligence data",
    progress: 0,
    completedTasks: 0,
    failedTasks: 0,
    handoffs: 0,
    lastActive: "queued",
    x: 250,
    y: 300,
    icon: ShieldCheck,
    color: "text-amber-600",
  },
  {
    id: "agent-5",
    name: "Resolution",
    role: "resolution",
    status: "idle" as const,
    currentTask: "Ready to propose fixes",
    progress: 0,
    completedTasks: 12,
    failedTasks: 0,
    handoffs: 0,
    lastActive: "1h ago",
    x: 500,
    y: 300,
    icon: CheckCircle2,
    color: "text-emerald-600",
  },
  {
    id: "agent-6",
    name: "Verification",
    role: "verification",
    status: "idle" as const,
    currentTask: "Standing by for validation",
    progress: 0,
    completedTasks: 8,
    failedTasks: 0,
    handoffs: 0,
    lastActive: "45m ago",
    x: 750,
    y: 300,
    icon: Activity,
    color: "text-cyan-600",
  },
  {
    id: "agent-7",
    name: "Learning",
    role: "learning",
    status: "idle" as const,
    currentTask: "Processing resolved patterns",
    progress: 0,
    completedTasks: 156,
    failedTasks: 0,
    handoffs: 0,
    lastActive: "3h ago",
    x: 100,
    y: 300,
    icon: Heading,
    color: "text-violet-600",
  },
  {
    id: "agent-8",
    name: "Engineering Remediation",
    role: "engineering_remediation",
    status: "idle" as const,
    currentTask: "No active patches",
    progress: 0,
    completedTasks: 4,
    failedTasks: 0,
    handoffs: 0,
    lastActive: "6h ago",
    x: 100,
    y: 100,
    icon: Layout,
    color: "text-rose-600",
  },
  {
    id: "agent-9",
    name: "Human Ops Copilot",
    role: "human_operations",
    status: "idle" as const,
    currentTask: "Monitoring approvals",
    progress: 0,
    completedTasks: 6,
    failedTasks: 0,
    handoffs: 0,
    lastActive: "1h ago",
    x: 100,
    y: 500,
    icon: Users,
    color: "text-gray-600",
  },
];

const edges: Edge[] = [
  { id: "e1-2", source: "agent-1", target: "agent-2", label: "2,847 tickets" },
  { id: "e2-3", source: "agent-2", target: "agent-3", label: "45 prioritized" },
  { id: "e2-4", source: "agent-2", target: "agent-4", label: "12 critical" },
  { id: "e3-4", source: "agent-3", target: "agent-4", label: "4 clusters" },
  { id: "e4-5", source: "agent-4", target: "agent-5", label: "3 investigations" },
  { id: "e5-6", source: "agent-5", target: "agent-6", label: "2 resolutions" },
  { id: "e6-7", source: "agent-6", target: "agent-7", label: "1 verified" },
  { id: "e8-2", source: "agent-8", target: "agent-2", label: "Patch feedback" },
  { id: "e9-2", source: "agent-9", target: "agent-2", label: "Override input" },
];

const statusColors: Record<string, string> = {
  running: "border-blue-500/50 bg-blue-500/5 text-blue-600 animate-pulse",
  completed: "border-emerald-500/50 bg-emerald-500/5 text-emerald-600",
  failed: "border-destructive/50 bg-destructive/5 text-destructive",
  waiting: "border-amber-500/50 bg-amber-500/5 text-amber-600",
  idle: "border-slate-500/50 bg-slate-500/5 text-slate-600",
};

const nodeTypes: Record<string, React.FC<any>> = {
  agentCard: ({ id, data }: any) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return null;
    const statusColor = statusColors[agent.status];
    const Icon = agent.icon;
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={cn(
          "w-72 rounded-xl border p-4 shadow-sm transition-all bg-card",
          statusColor,
        )}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-bold">{agent.name}</h3>
              <Badge variant="outline" className="text-xs">
                {agent.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{agent.role.replace(/_/g, " ")}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Current Task</span>
            <span className="text-sm font-medium">{agent.currentTask}</span>
          </div>
          <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${agent.progress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-1.5 rounded-lg bg-muted/50 text-center">
              <div className="text-xs font-bold text-muted-foreground">{agent.completedTasks}</div>
              <div className="text-[10px] text-muted-foreground">Completed</div>
            </div>
            <div className="p-1.5 rounded-lg bg-muted/50 text-center">
              <div className="text-xs font-bold text-muted-foreground">{agent.failedTasks}</div>
              <div className="text-[10px] text-muted-foreground">Failed</div>
            </div>
            <div className="p-1.5 rounded-lg bg-muted/50 text-center">
              <div className="text-xs font-bold text-muted-foreground">{agent.handoffs}</div>
              <div className="text-[10px] text-muted-foreground">Handoffs</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
            <span>Last Active</span>
            <span>{agent.lastActive}</span>
          </div>
        </div>
      </motion.div>
    );
  },
};

export function AgentCommandCenter() {
  const { setNodes, setEdges, getNodes } = useReactFlow();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Agent Command Center</h1>
          <p className="text-muted-foreground">Visual orchestration of AI agents across the incident resolution pipeline</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {}}>
            <Activity className="mr-1 h-3 w-3" /> Live Mode
          </Button>
          <Button size="sm" onClick={() => {}}>
            <Zap className="mr-1 h-3 w-3" /> Run Pipeline
          </Button>
        </div>
      </div>

      {/* Agent Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active Agents", value: agents.filter((a) => a.status === "running").length, color: "text-blue-600" },
          { label: "Completed Tasks", value: agents.reduce((a, b) => a + b.completedTasks, 0), color: "text-emerald-600" },
          { label: "Failed Tasks", value: agents.reduce((a, b) => a + b.failedTasks, 0), color: "text-destructive" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <CardContent>
              <div className="text-2xl font-bold {stat.color}">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* React Flow Workflow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Agent Workflow Graph</CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[600px]">
          <div className="relative h-full w-full">
            <ReactFlow
              nodes={agents.map((a) => ({
                id: a.id,
                type: "agentCard",
                position: { x: a.x, y: a.y },
                data: { label: a.name },
              }))}
              edges={edges}
              fitView
              panOnScroll
              onInit={() => {
                setNodes(agents.map((a) => ({
                  id: a.id,
                  type: "agentCard",
                  position: { x: a.x, y: a.y },
                  data: { label: a.name },
                })));
                setEdges(edges);
              }}
            >
              <Controls />
              <Background gap={12} />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      {/* Agent Detail Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const statusColor = statusColors[agent.status];
          const Icon = agent.icon;
          return (
            <motion.div
              key={agent.id}
              whileHover={{ y: -2 }}
              className={cn(
                "rounded-xl border p-4 transition-all",
                statusColor,
              )}
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="text-sm font-bold">{agent.name}</h3>
                    <Badge variant="outline" className="text-xs">{agent.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{agent.currentTask}</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${agent.progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{agent.completedTasks} completed</span>
                <span>{agent.handoffs} handoffs</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
