import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, Loader2, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

export function Panel({ title, icon, right, children, className = "", pad = true, dark = false, subtitle }: {
  title?: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
  dark?: boolean; subtitle?: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border ${dark ? "border-white/10 bg-night-2 text-white" : "border-line bg-panel shadow-card"} ${className}`}>
      {title && (
        <header className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${dark ? "border-white/10" : "border-line"}`}>
          <div className="min-w-0">
            <h3 className={`flex items-center gap-2 text-[13px] font-semibold ${dark ? "text-white" : "text-ink"}`}>
              {icon && <span className={dark ? "text-accentDim" : "text-brand-2"}>{icon}</span>}{title}
            </h3>
            {subtitle && <p className={`mt-0.5 text-[11.5px] ${dark ? "text-white/55" : "text-ink-3"}`}>{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = {
  critical: "bg-critical/10 text-critical border-critical/30",
  serious: "bg-serious/10 text-serious border-serious/30",
  warn: "bg-warn/10 text-[#9A6200] border-warn/40",
  good: "bg-good/10 text-[#0B7A33] border-good/30",
  info: "bg-accentDim/10 text-brand-2 border-accentDim/30",
  neutral: "bg-raised text-ink-2 border-line",
  violet: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  dark: "bg-white/10 text-white border-white/20",
};

export function Pill({ tone = "neutral", children, dot = false, className = "" }: { tone?: string; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TONE[tone] ?? TONE.neutral} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const sevTone = (s?: string | null) => ({ "SEV-1": "critical", "SEV-2": "serious", "SEV-3": "warn", "SEV-4": "neutral" } as Record<string, string>)[s ?? ""] ?? "neutral";
export function Sev({ s }: { s?: string | null }) {
  return s ? <Pill tone={sevTone(s)} dot>{s}</Pill> : <Pill>untriaged</Pill>;
}

export const stateTone = (s?: string | null) => ({
  RESOLVED: "good", ESCALATED: "critical", FAILED: "critical", REJECTED: "critical", APPROVAL_REQUIRED: "violet",
  NEEDS_CUSTOMER: "warn", WAITING_PARTNER: "warn", INVESTIGATING: "info", VERIFYING: "info", EXECUTING: "info",
  OPEN: "critical", MITIGATING: "serious", MONITORING: "info", NEW: "neutral", INTAKE: "neutral", TRIAGED: "neutral",
  CORRELATED: "neutral", REOPENED: "warn",
  pending: "violet", approved: "good", rejected: "critical", expired: "neutral", cancelled: "neutral",
  verified: "good", executed: "info", verify_failed: "critical", awaiting_approval: "violet", human_led: "serious",
  blocked: "critical", proposed: "info", fixed: "good", no_defect: "neutral", in_progress: "info", reproducing: "info",
  investigating: "info", patching: "info", testing: "info", patch_rejected: "critical", open: "warn",
} as Record<string, string>)[s ?? ""] ?? "neutral";

export function State({ s }: { s?: string | null }) {
  return <Pill tone={stateTone(s)}>{(s ?? "—").replace(/_/g, " ").toLowerCase()}</Pill>;
}

export function SimTag({ on = true, label = "Simulated" }: { on?: boolean | number; label?: string }) {
  if (!on) return null;
  return <Pill tone="violet" className="!px-2"><FlaskConical className="h-3 w-3" aria-hidden />{label}</Pill>;
}

export function Btn({ children, onClick, variant = "default", disabled, busy, title, size = "md", type = "button" }: {
  children: ReactNode; onClick?: () => unknown; variant?: "default" | "primary" | "danger" | "ghost" | "good" | "dark";
  disabled?: boolean; busy?: boolean; title?: string; size?: "sm" | "md"; type?: "button" | "submit";
}) {
  const v = {
    default: "border-line bg-panel text-brand hover:border-accentDim hover:text-brand-2",
    primary: "border-brand bg-brand text-white hover:bg-brand-2",
    good: "border-good bg-good text-white hover:brightness-95",
    danger: "border-critical/40 bg-white text-critical hover:bg-critical/5",
    ghost: "border-transparent bg-transparent text-ink-2 hover:bg-raised hover:text-brand",
    dark: "border-white/15 bg-white/5 text-white hover:bg-white/10",
  }[variant];
  const s = size === "sm" ? "px-2.5 py-1 text-[12px] rounded-lg" : "px-3.5 py-2 text-[13px] rounded-xl";
  return (
    <button type={type} title={title} disabled={disabled || busy} onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${s} ${v}`}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Kpi({ label, value, sub, icon, tone = "brand", dark = false }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: string; dark?: boolean;
}) {
  const t = { brand: "text-brand-2 bg-brand/5", critical: "text-critical bg-critical/10", good: "text-[#0B7A33] bg-good/10",
    warn: "text-[#9A6200] bg-warn/10", violet: "text-violet-700 bg-violet-500/10", info: "text-brand-2 bg-accentDim/10" }[tone];
  return (
    <div className={`rounded-2xl border p-3.5 ${dark ? "border-white/10 bg-white/[0.04]" : "border-line bg-panel shadow-card"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${dark ? "text-white/55" : "text-ink-3"}`}>{label}</span>
        {icon && <span className={`grid h-7 w-7 place-items-center rounded-lg ${dark ? "bg-white/10 text-accentDim" : t}`}>{icon}</span>}
      </div>
      <div className={`mt-1.5 text-[22px] font-bold tabular-nums leading-tight ${dark ? "text-white" : "text-ink"}`}>{value}</div>
      {sub && <div className={`mt-0.5 text-[11.5px] ${dark ? "text-white/55" : "text-ink-3"}`}>{sub}</div>}
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-[13px] text-ink-3">
      {icon && <span className="text-ink-3/70">{icon}</span>}
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 text-[13px] text-ink-3"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}

export function ErrorNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return <div role="alert" className="rounded-xl border border-critical/30 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">{error}</div>;
}

export function Segmented<T extends string>({ value, options, onChange, dark = false }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; dark?: boolean;
}) {
  return (
    <div role="tablist" className={`inline-flex rounded-xl border p-0.5 ${dark ? "border-white/15 bg-white/5" : "border-line bg-raised"}`}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${value === o.value
            ? dark ? "bg-white text-brand" : "bg-panel text-brand shadow-sm" : dark ? "text-white/70 hover:text-white" : "text-ink-3 hover:text-brand"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, wide = false }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <motion.div className="absolute inset-0 bg-night/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}
            className={`relative flex h-full w-full flex-col bg-bg shadow-2xl ${wide ? "max-w-5xl" : "max-w-3xl"}`}
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.18 }}>
            <header className="flex items-center justify-between gap-3 border-b border-line bg-panel px-5 py-3">
              <div className="min-w-0 text-[15px] font-bold text-ink">{title}</div>
              <button aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-raised hover:text-ink"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

type Toast = { id: number; tone: "good" | "critical" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`pointer-events-auto max-w-sm rounded-xl border px-4 py-2.5 text-[13px] font-medium shadow-card ${
                t.tone === "good" ? "border-good/30 bg-white text-[#0B7A33]" : t.tone === "critical" ? "border-critical/30 bg-white text-critical" : "border-line bg-white text-brand"}`}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an async action with busy state and toast feedback. */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast("good", ok);
      return r;
    } catch (e) {
      toast("critical", (e as Error).message);
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-line bg-panel px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:border-accentDim focus:outline-none focus:ring-2 focus:ring-accentDim/20";

export function Progress({ value, max, tone = "brand" }: { value: number; max: number; tone?: string }) {
  const w = max ? Math.min(100, (100 * value) / max) : 0;
  const c = { brand: "bg-brand-2", good: "bg-good", warn: "bg-warn", critical: "bg-critical", accent: "bg-accentDim" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${c}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[12.5px]">
      <span className="shrink-0 text-ink-3">{k}</span>
      <span className="min-w-0 text-right font-medium text-ink">{v}</span>
    </div>
  );
}
