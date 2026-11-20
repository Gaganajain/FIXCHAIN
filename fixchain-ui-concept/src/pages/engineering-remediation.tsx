"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Code,
  Bug,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  ArrowRight,
  Terminal,
  Search,
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

const remediationStages = [
  { name: "Operational Incident", status: "completed", icon: AlertCircle, color: "text-destructive" },
  { name: "Engineering Issue", status: "completed", icon: Bug, color: "text-orange-600" },
  { name: "Investigation", status: "completed", icon: Search, color: "text-blue-600" },
  { name: "Root Cause", status: "completed", icon: Code, color: "text-indigo-600" },
  { name: "Patch Proposal", status: "completed", icon: Terminal, color: "text-purple-600" },
  { name: "Testing", status: "running", icon: Play, color: "text-cyan-600" },
  { name: "Human Approval", status: "waiting", icon: Users, color: "text-amber-600" },
  { name: "Deployment Status", status: "idle", icon: CheckCircle2, color: "text-slate-600" },
];


export function EngineeringRemediation() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Engineering Remediation</h1>
          <p className="text-muted-foreground">Track engineering fixes from root cause to deployment</p>
        </div>
        <Button onClick={() => {}}>
          <ArrowRight className="mr-2 h-4 w-4" /> Create Remediation Task
        </Button>
      </div>

      {/* Remediation Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Remediation Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute top-10 left-2 w-0.5 h-full bg-border/50" />
            <div className="grid grid-cols-8 gap-0">
              {remediationStages.map((stage, idx) => {
                const Icon = stage.icon;
                const isCompleted = stage.status === "completed";
                const isCurrent = stage.status === "running";
                return (
                  <motion.div
                    key={stage.name}
                    whileHover={{ scale: 1.02 }}
                    className="flex flex-col items-center gap-2 relative z-10"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                      isCompleted
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                        ? "bg-blue-500 text-white animate-pulse"
                        : "bg-muted text-muted-foreground",
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="text-xs font-medium text-center max-w-[80px]">
                      {stage.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {isCompleted ? "Done" : isCurrent ? "Active" : "Pending"}
                    </div>
                    {idx < remediationStages.length - 1 && (
                      <div className="absolute -top-10 left-1/2 w-0.5 h-[120px] bg-border/50 z-0" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Remediations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Active Remediations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                whileHover={{ x: -4 }}
                className="p-4 rounded-xl border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-sm font-medium">
                        Patch: payment_gateway_handler.py
                      </h3>
                      <Badge variant="outline" className="text-xs">INC-001</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Fix UPI gateway timeout handling during peak load
                    </p>
                    <div className="mt-3 flex gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Risk:</span>
                      <Badge variant="outline" className="text-xs">Medium</Badge>
                      <span className="text-xs font-medium text-muted-foreground">Tests:</span>
                      <Badge variant="outline" className="text-xs">12/14 passing</Badge>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="text-right">
                      <div className="text-xs font-medium">68% complete</div>
                      <div className="h-1 w-24 bg-muted/50 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-blue-500" style={{ width: "68%" }} />
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setExpanded(expanded === `rem-${i}` ? null : `rem-${i}`)}>
                      {expanded === `rem-${i}` ? "Collapse" : "Details"}
                    </Button>
                  </div>
                </div>
                {expanded === `rem-${i}` && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <div className="text-muted-foreground">Lines Changed</div>
                        <div className="font-medium">42</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Files</div>
                        <div className="font-medium">1</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Test Coverage</div>
                        <div className="font-medium">86%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Est. Deploy</div>
                        <div className="font-medium">14m</div>
                      </div>
                    </div>
                    <div className="mt-4 h-32 bg-muted/50 rounded-lg p-3 font-mono text-xs text-muted-foreground overflow-y-auto">
                      {`--- git diff ---
payment_gateway_handler.py
@@ -45,7 +45,11 @@
-    return handle_upi_timeout(err)
+    if err.code === 'TIMEOUT':
+        return retry_with_backoff(err, max_retries=3)
+    return handle_upi_timeout(err)`}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Engineering Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 overflow-y-auto font-mono text-xs space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground">[14:32:05]</span>
                <span className="text-primary">[engineer]</span>
                <span className="text-muted-foreground">Initiating patch deployment to staging...</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
