import { ReactNode, useState } from "react";

export function Card({ title, right, children, className = "", pad = true }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`rounded-3xl border border-line bg-panel shadow-card ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
          {right}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  good: "text-good border-good bg-white",
  warn: "text-warn border-warn bg-white",
  serious: "text-serious border-serious bg-white",
  critical: "text-critical border-critical bg-white",
  accent: "text-brand border-brand bg-white",
  neutral: "text-ink-2 border-line bg-raised",
};
const ICONS: Record<string, string> = { good: "✓", warn: "!", serious: "▲", critical: "✕", accent: "●", neutral: "○" };

/** Status badge: icon + label. */
export function Badge({ tone = "neutral", children, icon = true }: { tone?: string; children: ReactNode; icon?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold ${TONES[tone]}`}>
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
    default: "border-line bg-panel text-brand hover:border-accent hover:text-accent hover:shadow-sm",
    primary: "border-brand bg-brand text-white hover:bg-brand-2 hover:shadow-lg hover:shadow-brand/20",
    good: "border-good bg-good text-white hover:bg-green-600 hover:shadow-lg hover:shadow-good/20",
    danger: "border-critical/30 bg-transparent text-critical hover:bg-critical/5 hover:shadow-critical/10",
    ghost: "border-transparent bg-transparent text-ink-2 hover:bg-raised hover:text-brand",
  }[variant];
  return (
    <button title={title} disabled={disabled || busy} onClick={onClick}
      className={`btn-paytm ${styles} disabled:opacity-50 disabled:cursor-not-allowed`}>
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

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
  return <div className="rounded-xl border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">✕ {error}</div>;
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="kpi-card">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-ink">{value}</span>
        {tone && <Badge tone={tone}>{{ good: "Healthy", warn: "Degraded", serious: "At risk", critical: "Critical" }[tone] ?? ""}</Badge>}
      </div>
      {sub && <div className="mt-2 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[13px] text-ink-3">{children}</div>;
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] ${className}`}>{children}</span>;
}

export function StatRow({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="text-right">
        <div className="text-sm font-semibold text-ink tabular-nums">{value}</div>
        {delta && <div className="text-[11px]">{delta}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-lg font-bold text-ink">{children}</h2>
      {right}
    </div>
  );
}

export function NavLink({ active, children, onClick }: { active: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`sidebar-link ${active ? "sidebar-link active" : "sidebar-link inactive"}`}>
      {children}
    </button>
  );
}
