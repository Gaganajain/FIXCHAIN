"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Percent,
  Bot,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  MapPin,
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

const statItems = [
  {
    title: "Total Tickets",
    value: "2,847",
    change: "+12% vs last week",
    changePositive: true,
    icon: CreditCard,
    color: "text-primary",
    bg: "bg-blue-50",
  },
  {
    title: "Open Incidents",
    value: "23",
    change: "-3 resolved today",
    changePositive: true,
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  {
    title: "Critical Incidents",
    value: "4",
    change: "Requires immediate action",
    changePositive: false,
    icon: AlertCircle,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
  {
    title: "Affected Customers",
    value: "18.4K",
    change: "+2.1K today",
    changePositive: false,
    icon: Users,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    title: "Resolution Rate",
    value: "94.2%",
    change: "+1.2% this month",
    changePositive: true,
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    title: "Avg Resolution Time",
    value: "14m 32s",
    change: "-2m vs yesterday",
    changePositive: true,
    icon: Clock,
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    title: "SLA Performance",
    value: "98.1%",
    change: "Above target",
    changePositive: true,
    icon: Percent,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    title: "Active AI Agents",
    value: "9",
    change: "All operational",
    changePositive: true,
    icon: Bot,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    title: "Pending Approvals",
    value: "6",
    change: "Awaiting review",
    changePositive: false,
    icon: ShieldCheck,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    title: "Processing Rate",
    value: "340/min",
    change: "+15% peak",
    changePositive: true,
    icon: Activity,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
  },
];

const trendData = [
  { name: "Mon", incidents: 45, resolved: 40 },
  { name: "Tue", incidents: 52, resolved: 48 },
  { name: "Wed", incidents: 38, resolved: 35 },
  { name: "Thu", incidents: 61, resolved: 55 },
  { name: "Fri", incidents: 74, resolved: 68 },
  { name: "Sat", incidents: 89, resolved: 82 },
  { name: "Sun", incidents: 67, resolved: 63 },
];

const regionData = [
  { region: "West", incidents: 61, customers: "18.4K", color: "#3b82f6" },
  { region: "East", incidents: 52, customers: "15.2K", color: "#10b981" },
  { region: "South", incidents: 45, customers: "12.4K", color: "#f59e0b" },
  { region: "North", incidents: 38, customers: "9.8K", color: "#ef4444" },
  { region: "Central", incidents: 29, customers: "7.1K", color: "#8b5cf6" },
  { region: "Northeast", incidents: 18, customers: "4.5K", color: "#ec4899" },
];

const healthItems = [
  { name: "Gateway API US-East", status: "Healthy", color: "text-emerald-600" },
  { name: "Gateway API US-West", status: "Healthy", color: "text-emerald-600" },
  { name: "Gateway API EU-Central", status: "Degraded", color: "text-amber-600" },
  { name: "Gateway API AP-South", status: "Healthy", color: "text-emerald-600" },
];

const feedItems = [
  {
    title: "Payment processing delay - Region West",
    meta: "42 tickets · Critical · 14m ago",
    severity: "Critical",
    time: "14m ago",
  },
  {
    title: "Soundbox device offline - Delhi NCR",
    meta: "23 tickets · High · 1h ago",
    severity: "High",
    time: "1h ago",
  },
  {
    title: "Settlement delay - Karnataka",
    meta: "12 tickets · Medium · 2h ago",
    severity: "Medium",
    time: "2h ago",
  },
  {
    title: "Merchant QR scanning failures",
    meta: "8 tickets · Low · 3h ago",
    severity: "Low",
    time: "3h ago",
  },
];

export function MissionControl() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mission Control</h1>
          <p className="text-muted-foreground">
            Real-time incident intelligence and AI agent orchestration
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === "overview"
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground border border-transparent",
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={cn(
              "px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
              activeTab === "ai"
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground border border-transparent",
            )}
          >
            AI Summary
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {statItems.map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div
              whileHover={{ y: -2 }}
              key={stat.title}
              className={cn(
                "rounded-2xl border border-border bg-card p-5 transition-all hover:shadow-sm",
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className={cn(
                    "p-2.5 rounded-xl flex items-center justify-center",
                    stat.bg,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <Badge
                  variant="outline"
                  className="text-xs"
                >
                  {stat.changePositive ? "▲" : "▼"}
                </Badge>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground">{stat.title}</h3>
              <p className="text-xs text-muted-foreground">
                {stat.change}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Live Incident Feed + Recent Events */}
        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2.5">
              <CardTitle className="text-sm font-semibold text-foreground">
                Live Incident Feed
              </CardTitle>
              <CardDescription className="text-xs flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-muted-foreground">Live</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <div className="divide-y divide-border/50">
                {feedItems.map((item) => {
                  const severityConfig: Record<string, string> = {
                    Critical: "border-destructive/50 bg-destructive/10 text-destructive",
                    High: "border-orange-500/50 bg-orange-500/10 text-orange-600",
                    Medium: "border-amber-500/50 bg-amber-500/10 text-amber-600",
                    Low: "border-emerald-500/50 bg-emerald-500/10 text-emerald-600",
                  };
                  return (
                    <div
                      key={item.title}
                      className="p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      <div className="h-10 w-10 rounded-xl border border-border/50 flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                          {item.title}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.meta}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", severityConfig[item.severity])}>
                        {item.severity}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">Recent Operational Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/50">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-medium text-primary bg-blue-50/50 border border-blue-100/50">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        AI agent auto-resolved ticket TK-2024-00{i}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        UPI payment retry succeeded · {i * 12}m ago
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: System Health + Agent Activity + Regional Distribution */}
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {healthItems.map((item) => (
                  <div key={item.name} className="flex items-center justify-between py-2">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">{item.name}</span>
                      <div className="text-xs text-muted-foreground">Payment Gateway</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" />
                      <span className={cn("text-xs font-semibold", item.color)}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">AI Agent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { name: "Understanding", value: 400 },
                  { name: "Triage", value: 320 },
                  { name: "Investigation", value: 280 },
                  { name: "Resolution", value: 360 },
                  { name: "Verification", value: 310 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">Regional Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <PieChart width={260} height={220}>
                  <Pie
                    data={regionData}
                    dataKey="incidents"
                    nameKey="region"
                    cx={130}
                    cy={110}
                    outerRadius={80}
                    fill="#8884d8"
                    labelLine={false}
                  >
                    {regionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                {regionData.map((entry) => (
                  <div key={entry.region} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{entry.region}</span>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="font-medium text-foreground">{entry.incidents}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Full Width: Incident Trends */}
        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Incident Trend Analytics (7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="incidents" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <CardFooter>
              <div className="flex gap-6 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Incidents Detected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Resolved</span>
                </div>
              </div>
            </CardFooter>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
