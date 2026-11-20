import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { cn } from "@/lib/utils";

const RANGES = { "7d": "Last 7 days", "30d": "Last 30 days" } as const;
type Range = keyof typeof RANGES;

const daily: Record<Range, { day: string; tickets: number; resolved: number }[]> = {
  "7d": [
    { day: "14 Nov", tickets: 210, resolved: 198 }, { day: "15 Nov", tickets: 186, resolved: 180 }, { day: "16 Nov", tickets: 240, resolved: 222 },
    { day: "17 Nov", tickets: 198, resolved: 190 }, { day: "18 Nov", tickets: 265, resolved: 241 }, { day: "19 Nov", tickets: 230, resolved: 219 }, { day: "20 Nov", tickets: 300, resolved: 164 },
  ],
  "30d": [
    { day: "Week 44", tickets: 1310, resolved: 1240 }, { day: "Week 45", tickets: 1405, resolved: 1338 }, { day: "Week 46", tickets: 1492, resolved: 1420 }, { day: "Week 47", tickets: 1629, resolved: 1414 },
  ],
};
const categoryData = [
  { name: "UPI payments", value: 41, fill: "#002970" },
  { name: "Soundbox", value: 24, fill: "#00BAF2" },
  { name: "Merchant QR", value: 14, fill: "#5B8DEF" },
  { name: "Settlement", value: 12, fill: "#94C9E8" },
  { name: "Platform outage", value: 9, fill: "#C7D2FE" },
];
const languageData = [
  { name: "Hindi", tickets: 46 }, { name: "English", tickets: 33 }, { name: "Marathi", tickets: 21 },
];

export function HistoricalAnalytics() {
  const [range, setRange] = useState<Range>("7d");
  const data = daily[range];
  const total = data.reduce((a, d) => a + d.tickets, 0);
  const resolved = data.reduce((a, d) => a + d.resolved, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Analytics</h1>
          <p className="text-muted-foreground">Every figure comes from saved records, never a model's estimate. Sample data here.</p>
        </div>
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", range === r ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-primary")}>{RANGES[r]}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tickets" value={total.toLocaleString("en-IN")} sub={RANGES[range].toLowerCase()} />
        <Stat label="Resolved with proof" value={`${Math.round((100 * resolved) / total)}%`} tone="good" sub={`${resolved.toLocaleString("en-IN")} tickets`} />
        <Stat label="Duplicate reports grouped" value="88%" tone="sky" sub="Linked to a parent incident" />
        <Stat label="Unapproved payment actions" value="0" tone="good" sub="Blocked by the policy engine" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold text-primary">Tickets in and resolved</CardTitle><CardDescription>{RANGES[range]}</CardDescription></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="tickets" name="Tickets in" fill="#002970" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved with proof" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold text-primary">Tickets by category</CardTitle><CardDescription>Share of all tickets, {RANGES[range].toLowerCase()}</CardDescription></CardHeader>
          <CardContent className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={260} className="sm:!w-1/2">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {categoryData.map((c) => <Cell key={c.name} fill={c.fill} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="w-full space-y-3 sm:w-1/2">
              {categoryData.map((cat) => (
                <li key={cat.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.fill }} />{cat.name}</span>
                  <span className="font-semibold tabular-nums">{cat.value}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">Tickets by language</CardTitle><CardDescription>Customers write in the language they're comfortable with; replies go back in the same language.</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {languageData.map((l) => (
              <div key={l.name} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-muted-foreground">{l.name}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#00BAF2]" style={{ width: `${l.tickets}%` }} /></div>
                <span className="w-10 text-right font-semibold tabular-nums">{l.tickets}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
