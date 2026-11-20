import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  TicketPriority,
  IncidentSeverity,
  TicketStatus,
  AgentStatus,
} from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function getPriorityColor(priority: TicketPriority): string {
  switch (priority) {
    case "critical":
      return "border-destructive/50 bg-destructive/5 text-destructive";
    case "high":
      return "border-orange-500/50 bg-orange-500/5 text-orange-600";
    case "medium":
      return "border-amber-500/50 bg-amber-500/5 text-amber-600";
    case "low":
      return "border-emerald-500/50 bg-emerald-500/5 text-emerald-600";
    default:
      return "border-muted bg-muted text-muted-foreground";
  }
}

export function getSeverityColor(severity: IncidentSeverity): string {
  switch (severity) {
    case "critical":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "high":
      return "border-orange-500/50 bg-orange-500/10 text-orange-600";
    case "medium":
      return "border-amber-500/50 bg-amber-500/10 text-amber-600";
    case "low":
      return "border-emerald-500/50 bg-emerald-500/5 text-emerald-600";
    default:
      return "border-muted bg-muted text-muted-foreground";
  }
}

export function getStatusColor(status: TicketStatus): string {
  switch (status) {
    case "open":
      return "border-blue-500/50 bg-blue-500/5 text-blue-600";
    case "in_progress":
      return "border-indigo-500/50 bg-indigo-500/5 text-indigo-600";
    case "resolved":
      return "border-emerald-500/50 bg-emerald-500/5 text-emerald-600";
    case "closed":
      return "border-slate-500/50 bg-slate-500/5 text-slate-600";
    case "escalated":
      return "border-destructive/50 bg-destructive/5 text-destructive";
    default:
      return "border-muted bg-muted text-muted-foreground";
  }
}

export function getAgentStatusColor(status: AgentStatus): string {
  switch (status) {
    case "running":
      return "border-blue-500/50 bg-blue-500/5 text-blue-600 animate-pulse";
    case "completed":
      return "border-emerald-500/50 bg-emerald-500/5 text-emerald-600";
    case "failed":
      return "border-destructive/50 bg-destructive/5 text-destructive";
    case "waiting":
      return "border-amber-500/50 bg-amber-500/5 text-amber-600";
    case "idle":
    default:
      return "border-slate-500/50 bg-slate-500/5 text-slate-600";
  }
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}…`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
