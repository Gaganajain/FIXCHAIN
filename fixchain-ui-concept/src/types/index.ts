export type TicketPriority = "low" | "medium" | "high" | "critical";
export type TicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"
  | "escalated";
export type TicketCategory =
  | "upi_payment"
  | "soundbox"
  | "merchant_qr"
  | "settlement"
  | "platform_outage"
  | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus =
  | "detected"
  | "investigating"
  | "resolved"
  | "approved"
  | "deployed";
export type AgentStatus = "idle" | "running" | "completed" | "failed" | "waiting";
export type AgentRole =
  | "customer_understanding"
  | "triage"
  | "incident_intelligence"
  | "investigation"
  | "resolution"
  | "verification"
  | "learning"
  | "engineering_remediation"
  | "human_operations";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  amount?: number;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  assignedTo?: string;
  incidentId?: string;
  satisfactionScore?: number;
  channel: "app" | "web" | "call" | "email";
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  confidence: number;
  affectedMerchants: number;
  affectedCustomers: number;
  affectedRegions: string[];
  rootCause?: string;
  detectedAt: string;
  resolvedAt?: string;
  relatedTickets: string[];
  recommendedActions: string[];
  clusterSize: number;
  growth: number;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  currentTask: string;
  progress: number;
  completedTasks: number;
  failedTasks: number;
  handoffs: number;
  lastActive: string;
  x: number;
  y: number;
}

export interface Approval {
  id: string;
  incidentId: string;
  title: string;
  proposedResolution: string;
  supportingEvidence: string[];
  riskClassification: "low" | "medium" | "high" | "critical";
  expectedImpact: string;
  approvalsRequired: number;
  approvalsReceived: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewer?: string;
}

export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  ticketCounts: number[];
  defaultTicketCount: number;
}

export interface MetricCard {
  title: string;
  value: string | number;
  change: string;
  changePositive: boolean;
  trend: "up" | "down" | "neutral";
}
