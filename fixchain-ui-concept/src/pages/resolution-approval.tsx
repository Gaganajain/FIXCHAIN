"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";

const approvals = [
  {
    id: "APR-001",
    incidentId: "INC-001",
    title: "Failover to backup UPI gateway",
    proposedResolution:
      "Route all UPI transactions through backup gateway ( Razorpay Backup ) while primary gateway is restored.",
    supportingEvidence: [
      "Gateway timeout logs from 06:00-06:45 IST",
      "45 tickets reporting payment failures in West region",
      "Health check showing 100% failure on primary gateway",
    ],
    riskClassification: "high" as const,
    expectedImpact: "Restore payments for 18,400 customers across 1,240 merchants",
    approvalsRequired: 2,
    approvalsReceived: 1,
    status: "pending" as const,
    createdAt: "2024-11-19T06:30:00Z",
    reviewer: "Sarah Chen (Lead Ops)",
  },
  {
    id: "APR-002",
    incidentId: "INC-002",
    title: "Rollback Soundbox firmware to v2.4.0",
    proposedResolution:
      "Push OTA rollback to firmware v2.4.0 for 340 affected Soundbox devices.",
    supportingEvidence: [
      "23 tickets reporting no payment announcements",
      "Firmware v2.4.1 introduced Bluetooth connectivity regression",
      "Rollback tested on 10 devices with 100% success",
    ],
    riskClassification: "medium" as const,
    expectedImpact: "Restore payment announcements for 2,100 customers",
    approvalsRequired: 1,
    approvalsReceived: 0,
    status: "pending" as const,
    createdAt: "2024-11-19T10:15:00Z",
    reviewer: "Marcus Liu (Device Ops)",
  },
  {
    id: "APR-003",
    incidentId: "INC-004",
    title: "Failover to secondary data center",
    proposedResolution:
      "Execute DNS failover to secondary data center in Mumbai region.",
    supportingEvidence: [
      "Network partition detected in primary DC",
      "156 tickets reporting complete platform outage",
      "Secondary DC health checks passing at 99.9%",
    ],
    riskClassification: "critical" as const,
    expectedImpact: "Restore platform access for 85,000 customers across 5,200 merchants",
    approvalsRequired: 3,
    approvalsReceived: 2,
    status: "pending" as const,
    createdAt: "2024-11-19T06:15:00Z",
    reviewer: "Elena Rodriguez (CTO)",
  },
];

const riskConfig: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/10" },
  high: { color: "text-orange-600", bg: "bg-orange-500/10" },
  medium: { color: "text-amber-600", bg: "bg-amber-500/10" },
  low: { color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

export function ResolutionApproval({ navigate }: any) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resolution & Approval</h1>
          <p className="text-muted-foreground">Review and approve proposed incident resolutions before execution</p>
        </div>
        <Button onClick={() => {}}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Approvals", value: approvals.filter((a) => a.status === "pending").length, color: "text-amber-600" },
          { label: "Approved Today", value: 3, color: "text-emerald-600" },
          { label: "Rejected Today", value: 0, color: "text-destructive" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <CardContent>
              <div className="text-2xl font-bold {stat.color}">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approvals List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Pending Approvals ({approvals.filter((a) => a.status === 'pending').length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          <div className="divide-y divide-border">
            {approvals.map((approval) => {
              const config = riskConfig[approval.riskClassification];
              const isExpanded = expandedId === approval.id;
              return (
                <motion.div
                  key={approval.id}
                  initial={{ height: 0 }}
                  animate={{ height: isExpanded ? "auto" : 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-b border-border/50 last:border-0"
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setExpandedId(expandedId === approval.id ? null : approval.id)}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-sm font-medium">{approval.title}</h3>
                          <Badge variant="outline" className="text-xs">{approval.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate md:max-w-[60%]">
                          {approval.proposedResolution}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>
                            <Users className="mr-1 h-3 w-3" />
                            {approval.approvalsReceived}/{approval.approvalsRequired} approvals
                          </span>
                          <span>
                            <Clock className="mr-1 h-3 w-3" />
                            {approval.reviewer}
                          </span>
                          <Badge variant="outline" className={cn("text-xs", config.color)}>
                            {approval.riskClassification} risk
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(expandedId === approval.id ? null : approval.id)}
                        >
                          {isExpanded ? "Collapse" : "Review"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <CardContent className="p-4 bg-muted/50 border-t border-border/50">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Supporting Evidence</h4>
                          <ul className="space-y-1 text-sm">
                            {approval.supportingEvidence.map((ev, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <FileText className="h-3 w-3 text-muted-foreground mt-0.5" />
                                <span>{ev}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expected Impact</h4>
                          <p className="text-sm">{approval.expectedImpact}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => {}}>
                            <AlertTriangle className="mr-1 h-3 w-3" /> Reject
                          </Button>
                          <Button size="sm" onClick={() => {}}>
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </motion.div>
              );
            })}
            {approvals.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No pending approvals.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
