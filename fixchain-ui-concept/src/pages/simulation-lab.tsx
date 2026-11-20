"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Play,
  RefreshCw,
  Users,
  AlertCircle,
  Activity,
  CreditCard,
  Zap,
  Settings,
  BarChart2,
  CheckCircle2,
  StopCircle,
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

const scenarios = [
  { id: "upi", name: "UPI Payment Failures", countOptions: [50, 100, 300], defaultCount: 100 },
  { id: "soundbox", name: "Soundbox Failures", countOptions: [50, 100, 300], defaultCount: 50 },
  { id: "qr", name: "Merchant QR Failures", countOptions: [50, 100, 300], defaultCount: 75 },
  { id: "settlement", name: "Settlement Delays", countOptions: [50, 100, 300], defaultCount: 50 },
  { id: "outage", name: "Platform Outage", countOptions: [50, 100, 300], defaultCount: 200 },
];

export function SimulationLab() {
  const [selectedScenario, setSelectedScenario] = useState(scenarios[0]);
  const [ticketCount, setTicketCount] = useState(100);
  const [isRunning, setIsRunning] = useState(false);
  const [ticketsProcessed, setTicketsProcessed] = useState(0);
  const [incidentsDetected, setIncidentsDetected] = useState(0);
  const [queueDepth, setQueueDepth] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTicketsProcessed((prev) => {
        if (prev >= ticketCount) {
          setIsRunning(false);
          return ticketCount;
        }
        return Math.min(prev + 5, ticketCount);
      });
      setQueueDepth((prev) => Math.max(0, prev - 3));
      setIncidentsDetected((prev) => prev + Math.floor(Math.random() * 3));
    }, 800);
    return () => clearInterval(interval);
  }, [isRunning, ticketCount]);

  const progress = (ticketsProcessed / ticketCount) * 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Simulation Lab</h1>
          <p className="text-muted-foreground">Simulate payment incidents and observe AI agent response</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isRunning ? "destructive" : "default"}
            onClick={() => setIsRunning(!isRunning)}
            disabled={ticketsProcessed >= ticketCount && !isRunning}
          >
            {isRunning ? (
              <>
                <StopCircle className="mr-2 h-4 w-4" /> Stop Simulation
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Start Simulation
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => {}}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      {/* Scenario Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Select Incident Scenario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {scenarios.map((sc) => (
              <Button
                key={sc.id}
                variant={selectedScenario.id === sc.id ? "default" : "outline"}
                className="w-full flex items-center justify-start gap-2 text-left"
                onClick={() => setSelectedScenario(sc)}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{sc.name}</div>
                  <div className="text-xs text-muted-foreground">{sc.countOptions.join(", ")} tickets</div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Simulation Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">Ticket Volume</label>
              <div className="flex items-center gap-2">
                {selectedScenario.countOptions.map((c) => (
                  <Button
                    key={c}
                    variant={ticketCount === c ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTicketCount(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">Scenario</label>
              <div className="text-sm font-medium">{selectedScenario.name}</div>
              <div className="text-xs text-muted-foreground">{selectedScenario.id}</div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Badge variant={isRunning ? "default" : "outline"} className="text-xs">
                {isRunning ? "Running" : "Ready"}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-muted-foreground">Progress</label>
              <div className="text-sm font-medium">{Math.round(progress)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Tickets Incoming", value: ticketCount, icon: CreditCard, color: "text-blue-600" },
          { label: "Processed", value: ticketsProcessed, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Incidents Detected", value: incidentsDetected, icon: AlertCircle, color: "text-destructive" },
          { label: "Queue Depth", value: queueDepth, icon: Activity, color: "text-amber-600" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-4">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold {stat.color}">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Live Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Live Event Stream</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 overflow-y-auto font-mono text-xs space-y-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground">[14:32:{String(60 - i).padStart(2, "0")}]</span>
                <span className={i % 3 === 0 ? "text-destructive" : "text-primary"}>
                  [{i % 3 === 0 ? "ALERT" : "INFO"}]
                </span>
                <span className="text-muted-foreground">
                  Ticket TK-2024-{String(800 + i).padStart(4, "0")} processed - UPI payment failure detected
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

