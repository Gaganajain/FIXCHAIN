import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small figure card used on every screen (replaces Card + CardContent, which doubled the padding). */
export function Stat({ label, value, sub, tone, className }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "bad" | "warn" | "sky"; className?: string;
}) {
  const t = { default: "text-foreground", good: "text-emerald-600", bad: "text-destructive", warn: "text-amber-600", sky: "text-[#0098CC]" }[tone ?? "default"];
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tracking-tight tabular-nums", t)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
