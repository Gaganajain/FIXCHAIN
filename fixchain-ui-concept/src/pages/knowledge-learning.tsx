"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";

const knowledgeItems = [
  {
    id: "KB-001",
    title: "UPI Gateway Timeout Handling",
    category: "Playbook",
    confidence: 94,
    status: "verified",
    incidentsResolved: 12,
    lastUpdated: "2024-11-15",
    description: "Standard procedure for handling UPI gateway timeouts during peak transaction volumes.",
    tags: ["upi", "gateway", "timeout", "peak-load"],
  },
  {
    id: "KB-002",
    title: "Soundbox Firmware Rollback",
    category: "Solution",
    confidence: 88,
    status: "verified",
    incidentsResolved: 8,
    lastUpdated: "2024-11-14",
    description: "Steps to rollback Soundbox firmware when connectivity issues occur after updates.",
    tags: ["soundbox", "firmware", "rollback", "ota"],
  },
  {
    id: "KB-003",
    title: "Settlement File Processing Lag",
    category: "Investigation",
    confidence: 72,
    status: "pending",
    incidentsResolved: 3,
    lastUpdated: "2024-11-10",
    description: "Diagnosis steps for bank settlement file processing delays.",
    tags: ["settlement", "bank", "processing", "lag"],
  },
  {
    id: "KB-004",
    title: "Merchant QR Code Scanning Issues",
    category: "Playbook",
    confidence: 91,
    status: "verified",
    incidentsResolved: 15,
    lastUpdated: "2024-11-12",
    description: "Troubleshooting merchant QR code scanning failures at point of sale.",
    tags: ["qr", "merchant", "scanning", "pos"],
  },
  {
    id: "KB-005",
    title: "Platform Outage Runbook",
    category: "Runbook",
    confidence: 97,
    status: "verified",
    incidentsResolved: 4,
    lastUpdated: "2024-11-08",
    description: "Complete runbook for full platform outage scenarios and failover procedures.",
    tags: ["outage", "failover", "datacenter", "dr"],
  },
];

const statusConfig: Record<string, { color: string; bg: string }> = {
  verified: { color: "text-emerald-600", bg: "bg-emerald-500/10" },
  pending: { color: "text-amber-600", bg: "bg-amber-500/10" },
};

export function KnowledgeLearning() {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = knowledgeItems.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge & Learning</h1>
          <p className="text-muted-foreground">Historical incidents, verified solutions, and reusable playbooks</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            left={<Search className="h-4 w-4 text-muted-foreground" />}
            className="w-64"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Articles", value: knowledgeItems.length },
          { label: "Verified", value: knowledgeItems.filter((i) => i.status === "verified").length },
          { label: "Pending Review", value: knowledgeItems.filter((i) => i.status === "pending").length },
          { label: "Avg Confidence", value: "88%" },
        ].map((stat) => (
          <Card key={stat.label} className="p-4">
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Knowledge Items */}
      <div className="grid gap-6 md:grid-cols-3">
        {filtered.map((item) => {
          const config = statusConfig[item.status];
          return (
            <motion.div
              key={item.id}
              whileHover={{ y: -4 }}
              className={cn(
                "rounded-xl border p-5 transition-all hover:shadow-sm",
                config.bg,
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <Badge variant="outline" className="text-xs">{item.category}</Badge>
                <Badge variant="outline" className={cn("text-xs", config.color)}>
                  {item.status}
                </Badge>
              </div>
              <h3 className="text-sm font-bold mb-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                {item.description}
              </p>
              <div className="flex flex-wrap gap-1 mb-4">
                {item.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 rounded bg-muted text-xs text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-3">
                <div>
                  <div className="font-medium">{item.confidence}%</div>
                  <div>Confidence</div>
                </div>
                <div>
                  <div className="font-medium">{item.incidentsResolved}</div>
                  <div>Resolved</div>
                </div>
                <div>
                  <div className="font-medium">{item.lastUpdated}</div>
                  <div>Updated</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => {}}>
                  <ChevronRight className="mr-1 h-3 w-3" /> View
                </Button>
                <Button variant="outline" size="sm" onClick={() => {}}>
                  <AlertCircle className="mr-1 h-3 w-3" />
                </Button>
              </div>
            </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 py-12 text-center text-muted-foreground">
            No knowledge articles found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
