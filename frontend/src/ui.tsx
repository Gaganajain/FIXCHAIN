import { ReactNode, useState } from "react";

export function Card({ title, right, children, className = "", pad = true }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-card ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {right}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  good: "text-good border-good/40 bg-good/10",
  warn: "text-warn border-warn/40 bg-warn/10",
  serious: "text-serious border-serious/40 bg-serious/10",
  critical: "text-critical border-critical/50 bg-critical/10",
  accent: "text-brand-2 border-accent/50 bg-accent/10",
  neutral: "text-ink-2 border-line bg-raised",
};
const ICONS: Record<string, string> = { good: "✓", warn: "!", serious: "▲", critical: "✕", accent: "●", neutral: "○" };

/** Status badge: always icon + label, never colour alone. */
export function Badge({ tone = "neutral", children, icon = true }: { tone?: string; children: ReactNode; icon?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>
      {icon && <span aria-hidden className="text-[10px]">{ICONS[tone]}</span>}
      {children}
    </span>
  );
}

export const severityTone = (s: string) =>
  ({ critical: "critical", high: "serious", medium: "warn", low: "neutral" } as Record<string, string>)[s] ?? "neutral";

export const orderTone = (s: string) =>
  ({ PAID: "good", PAYMENT_FAILED: "critical", PAYMENT_PENDING: "warn", PAYMENT_INITIATED: "neutral" } as Record<string, string>)[s] ?? "neutral";

export const gatewayTone = (s: string) =>
  ({ SUCCESS: "good", FAILED: "critical", PENDING: "warn" } as Record<string, string>)[s] ?? "neutral";

export const incidentTone = (s: string) =>
  ({ open: "critical", investigating: "accent", awaiting_approval: "warn", needs_reconciliation: "warn", resolved: "good", rejected: "neutral" } as Record<string, string>)[s] ?? "neutral";

export function Button({ children, onClick, variant = "default", disabled, busy, title }: {
  children: ReactNode; onClick?: () => unknown; variant?: "default" | "primary" | "danger" | "ghost" | "good";
  disabled?: boolean; busy?: boolean; title?: string;
}) {
  const styles = {
    default: "border-line bg-panel text-brand hover:border-accent hover:text-accent",
    primary: "border-brand bg-brand text-white hover:bg-brand-2",
    good: "border-good bg-good text-white hover:brightness-110",
    danger: "border-critical/60 bg-transparent text-critical hover:bg-critical/10",
    ghost: "border-transparent bg-transparent text-ink-2 hover:text-ink",
  }[variant];
  return (
    <button title={title} disabled={disabled || busy} onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/** Wraps an async action with busy state + error surface. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run, setError };
}

export function ErrorBar({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-md border border-critical/50 bg-critical/10 px-3 py-2 text-[13px] text-critical">✕ {error}</div>;
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-card">
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        {tone && <Badge tone={tone}>{{ good: "Healthy", warn: "Degraded", serious: "At risk", critical: "Critical" }[tone] ?? ""}</Badge>}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-[13px] text-ink-3">{children}</div>;
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] ${className}`}>{children}</span>;
}
