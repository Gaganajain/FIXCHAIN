"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Clock,
  Percent,
  PieChart,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
} from "recharts";
import { Button } from "@/lib/shadcn";

const monthlyData = [
  { month: "Jan", tickets: 1200, resolved: 1100, incidents: 15 },
  { month: "Feb", tickets: 1400, resolved: 1300, incidents: 18 },
  { month: "Mar", tickets: 1600, resolved: 1450, incidents: 22 },
  { month: "Apr", tickets: 1800, resolved: 1700, incidents: 25 },
  { month: "May", tickets: 2100, resolved: 1950, incidents: 28 },
  { month: "Jun", tickets: 2400, resolved: 2200, incidents: 31 },
  { month: "Jul", tickets: 2800, resolved: 2600, incidents: 35 },
  { month: "Aug", tickets: 3200, resolved: 2900, incidents: 40 },
  { month: "Sep", tickets: 2900, resolved: 2700, incidents: 36 },
  { month: "Oct", tickets: 3100, resolved: 2950, incidents: 38 },
  { month: "Nov", tickets: 2847, resolved: 2680, incidents: 23 },
];

const categoryData = [
  { name: "UPI Payments", value: 35, fill: "#3b82f6" },
  { name: "Soundbox", value: 25, fill: "#10b981" },
  { name: "Merchant QR", value: 20, fill: "#f59e0b" },
  { name: "Settlement", value: 12, fill: "#ef4444" },
  { name: "Platform Outage", value: 8, fill: "#8b5cf6" },
];

export function HistoricalAnalytics() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Historical Analytics</h1>
          <p className="text-muted-foreground">Analyze trends, SLA performance, and incident patterns</p>
        </div>
        <Button variant="outline" onClick={() => {}}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh Data
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Tickets (30d)", value: "28,847", change: "+12%", trend: "up" as const, icon: Activity, color: "text-primary" },
          { label: "Resolution Rate", value: "94.2%", change: "+1.2%", trend: "up" as const, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Avg Resolution Time", value: "14m", change: "-2m", trend: "down" as const, icon: Clock, color: "text-indigo-600" },
          { label: "SLA Compliance", value: "98.1%", change: "+0.5%", trend: "up" as const, icon: Percent, color: "text-emerald-600" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} whileHover={{ y: -2 }} className="rounded-xl border p-5 bg-card shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <Badge variant="outline" className="text-xs">
                  {stat.trend === "up" ? "▲" : "▼"} {stat.change}
                </Badge>
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-sm font-medium text-muted-foreground">{stat.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Ticket Volume & Resolution (12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tickets" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
          <CardFooter>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>Tickets Received</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Resolved</span>
              </div>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Incidents by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-300 flex items-center">
              <PieChart className="h-24 w-24 text-muted-foreground" />
              <div className="ml-6 space-y-4">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.fill }} />
                    <div>
                      <div className="text-sm font-medium">{cat.name}</div>
                      <div className="text-xs text-muted-foreground">{cat.value}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Regional Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Regional Incident Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { region: "North", incidents: 45, customers: "12.4K" },
              { region: "South", incidents: 38, customers: "9.8K" },
              { region: "East", incidents: 52, customers: "15.2K" },
              { region: "West", incidents: 61, customers: "18.4K" },
              { region: "Central", incidents: 29, customers: "7.1K" },
              { region: "Northeast", incidents: 18, customers: "4.5K" },
            ].map((r) => (
              <Card key={r.region} className="p-3">
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{r.region}</div>
                      <div className="text-xs text-muted-foreground">{r.incidents} incidents</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{r.customers}</div>
                      <div className="text-xs text-muted-foreground">customers</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

