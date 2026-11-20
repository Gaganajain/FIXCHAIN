"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  Users,
  MapPin,
  Activity,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Percent,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";

const incidents = [
  {
    id: "INC-001",
    title: "UPI Payment Failures - West Region",
    severity: "critical",
    status: "investigating",
    confidence: 92,
    affectedMerchants: 1240,
    affectedCustomers: 18400,
    affectedRegions: ["Maharashtra", "Gujarat", "Rajasthan"],
    rootCause: "Gateway timeout on UPI switch during peak load",
    detectedAt: "2024-11-19T06:00:00Z",
    relatedTickets: 45,
    recommendedActions: [
      "Failover to backup gateway",
      "Scale up UPI switch instances",
      "Notify affected merchants",
    ],
    clusterSize: 45,
    growth: +12,
  },
  {
    id: "INC-002",
    title: "Soundbox Device Offline",
    severity: "high",
    status: "detected",
    confidence: 78,
    affectedMerchants: 340,
    affectedCustomers: 2100,
    affectedRegions: ["Delhi", "NCR"],
    rootCause: "Firmware update v2.4.1 connectivity issue",
    detectedAt: "2024-11-19T09:45:00Z",
    relatedTickets: 23,
    recommendedActions: [
      "Rollback firmware to v2.4.0",
      "Push OTA update to affected devices",
    ],
    clusterSize: 23,
    growth: -5,
  },
  {
    id: "INC-003",
    title: "Settlement Delay",
    severity: "medium",
    status: "investigating",
    confidence: 85,
    affectedMerchants: 890,
    affectedCustomers: 0,
    affectedRegions: ["Karnataka", "Tamil Nadu"],
    rootCause: "Bank settlement file processing lag",
    detectedAt: "2024-11-19T07:10:00Z",
    relatedTickets: 12,
    recommendedActions: [
      "Contact partner bank",
      "Reprocess pending settlement files",
    ],
    clusterSize: 12,
    growth: 0,
  },
  {
    id: "INC-004",
    title: "Platform Outage - Complete",
    severity: "critical",
    status: "detected",
    confidence: 99,
    affectedMerchants: 5200,
    affectedCustomers: 85000,
    affectedRegions: ["All India"],
    rootCause: "Primary data center network partition",
    detectedAt: "2024-11-19T06:00:00Z",
    relatedTickets: 156,
    recommendedActions: [
      "Failover to secondary data center",
      "Engage network infrastructure team",
    ],
    clusterSize: 156,
    growth: +24,
  },
];

const severityConfig: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-destructive", bg: "bg-destructive/10" },
  high: { color: "text-orange-600", bg: "bg-orange-500/10" },
  medium: { color: "text-amber-600", bg: "bg-amber-500/10" },
  low: { color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

const statusConfig: Record<string, string> = {
  detected: "Detected",
  investigating: "Investigating",
  resolved: "Resolved",
  approved: "Approved",
  deployed: "Deployed",
};

export function IncidentIntelligence() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incident Intelligence</h1>
          <p className="text-muted-foreground">Cluster, triage, and track payment incidents with AI-powered insights</p>
        </div>
        <Button onClick={() => {}}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh Cluster
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Total Incidents</div>
          <div className="text-3xl font-bold">{incidents.length}</div>
          <div className="text-xs text-emerald-600 mt-1">
            <Activity className="mr-1 h-3 w-3" /> 2 resolved today
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Critical Incidents</div>
          <div className="text-3xl font-bold text-destructive">
            {incidents.filter((i) => i.severity === "critical").length}
          </div>
          <div className="text-xs text-destructive mt-1">
            <AlertCircle className="mr-1 h-3 w-3" /> Requires immediate attention
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Avg Confidence</div>
          <div className="text-3xl font-bold">
            {Math.round(
              incidents.reduce((a, b) => a + b.confidence, 0) / incidents.length,
            )}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            <Percent className="mr-1 h-3 w-3" /> AI detection confidence
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Affected Merchants</div>
          <div className="text-3xl font-bold">
            {incidents.reduce((a, b) => a + b.affectedMerchants, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            <Users className="mr-1 h-3 w-3" /> Across all regions
          </div>
        </Card>
      </div>

      {/* Incident Clustering Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Incident Clustering Map</CardTitle>
          <CardDescription>
            Visual grouping of related incidents by region and severity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {incidents.map((inc) => {
              const config = severityConfig[inc.severity];
              return (
                <motion.div
                  key={inc.id}
                  whileHover={{ scale: 1.02 }}
                  className={cn(
                    "relative rounded-xl border p-4 transition-all cursor-pointer",
                    config.bg,
                  )}
                  onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}
                >
                  <div className="absolute top-3 right-3 flex gap-1">
                    <Badge variant="outline" className="text-xs">
                      {inc.clusterSize} tickets
                    </Badge>
                    <span className="text-xs font-medium">{inc.growth > 0 ? "↑" : "↓"}{Math.abs(inc.growth)}%</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">{inc.severity}</span>
                  </div>
                  <h3 className="text-sm font-medium">{inc.title}</h3>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {inc.affectedRegions.join(", ")}
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {inc.affectedCustomers.toLocaleString()} customers
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-muted/50 rounded-full h-1.5">
                      <div
                        className={cn("h-1.5 rounded-full transition-all duration-500", config.color.replace("text", "bg"))}
                        style={{ width: `${Math.min((inc.confidence / 100) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>AI Confidence</span>
                      <span>{inc.confidence}%</span>
                    </div>
                  </div>
                  {expandedId === inc.id && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="text-xs font-medium mb-2">Recommended Actions</div>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {inc.recommendedActions.map((action, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Incident Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Incident Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground bg-muted/50">
                  <th className="pb-3 pr-4 font-medium">Incident</th>
                  <th className="pb-3 pr-4 font-medium">Severity</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Confidence</th>
                  <th className="pb-3 pr-4 font-medium">Affected Merchants</th>
                  <th className="pb-3 pr-4 font-medium">Affected Customers</th>
                  <th className="pb-3 pr-4 font-medium">Detected</th>
                  <th className="pb-3 pr-4 font-medium">Growth</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {incidents.map((inc) => {
                  const config = severityConfig[inc.severity];
                  return (
                    <tr key={inc.id} className="hover:bg-accent/50 transition-colors">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center text-muted-foreground">
                            <ShieldAlert className="h-3 w-3" />
                          </div>
                          <div className="font-medium">{inc.title}</div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <Badge variant="outline" className={cn("text-xs", config.color)}>
                          {inc.severity}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4">
                        <Badge variant="outline" className="text-xs">{statusConfig[inc.status]}</Badge>
                      </td>
                      <td className="py-4 pr-4">{inc.confidence}%</td>
                      <td className="py-4 pr-4">{inc.affectedMerchants.toLocaleString()}</td>
                      <td className="py-4 pr-4">{inc.affectedCustomers.toLocaleString()}</td>
                      <td className="py-4 pr-4 text-xs text-muted-foreground">
                        {new Date(inc.detectedAt).toLocaleString()}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={inc.growth > 0 ? "text-destructive" : "text-emerald-600"}>
                          {inc.growth > 0 ? "+" : ""}{inc.growth}%
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === inc.id ? null : inc.id)}>
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
