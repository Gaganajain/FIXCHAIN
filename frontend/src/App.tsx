import {
  Activity, Bot, BookOpen, FlaskConical, Inbox, LayoutDashboard, LineChart, LogOut, Radar, Settings as SettingsIcon,
  ShieldCheck, Siren, Smartphone, Wrench, Zap,
} from "lucide-react";
import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Btn, ErrorNote, Pill, ToastHost, inputCls } from "./components/kit";
import { Session, session } from "./lib/session";
import { useV1, v1 } from "./lib/v1";
import { Agents } from "./pages/Agents";
import { Analytics } from "./pages/Analytics";
import { Approvals } from "./pages/Approvals";
import { CustomerApp } from "./pages/CustomerApp";
import { Engineering } from "./pages/Engineering";
import { Incidents } from "./pages/Incidents";
import { Intelligence } from "./pages/Intelligence";
import { Knowledge } from "./pages/Knowledge";
import { MissionControl } from "./pages/MissionControl";
import { SettingsPage } from "./pages/Settings";
import { SimulationLab } from "./pages/SimulationLab";
import { Tickets } from "./pages/Tickets";

export type Nav = (route: string) => void;

const NAV: { id: string; label: string; icon: ReactNode; perm?: string; staff?: boolean }[] = [
  { id: "overview", label: "Mission Control", icon: <LayoutDashboard className="h-4 w-4" />, staff: true },
  { id: "customer", label: "Customer App", icon: <Smartphone className="h-4 w-4" /> },
  { id: "tickets", label: "Customer Tickets", icon: <Inbox className="h-4 w-4" />, perm: "ticket:read" },
  { id: "incidents", label: "Operational Incidents", icon: <Siren className="h-4 w-4" />, perm: "incident:read" },
  { id: "intelligence", label: "Incident Intelligence", icon: <Radar className="h-4 w-4" />, perm: "incident:read" },
  { id: "agents", label: "Agent Command Center", icon: <Bot className="h-4 w-4" />, perm: "agent:read" },
  { id: "approvals", label: "Resolution & Approvals", icon: <ShieldCheck className="h-4 w-4" />, perm: "approval:read" },
  { id: "engineering", label: "Engineering Remediation", icon: <Wrench className="h-4 w-4" />, perm: "engineering:read" },
  { id: "knowledge", label: "Knowledge & Learning", icon: <BookOpen className="h-4 w-4" />, perm: "knowledge:read" },
  { id: "simulation", label: "Simulation Lab", icon: <FlaskConical className="h-4 w-4" />, staff: true },
  { id: "analytics", label: "Historical Analytics", icon: <LineChart className="h-4 w-4" />, perm: "analytics:read" },
  { id: "settings", label: "Settings & Audit", icon: <SettingsIcon className="h-4 w-4" />, staff: true },
];

function useRoute(): [string, string | undefined, Nav] {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/");
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const f = () => setParts(read());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const nav: Nav = (r) => { window.location.hash = `/${r}`; };
  return [parts[0] || "", parts[1] ? decodeURIComponent(parts[1]) : undefined, nav];
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid place-items-center rounded-xl bg-gradient-to-br from-accentDim to-accent font-mono font-bold text-night ${small ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-[13px]"}`}>
        <Zap className={small ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.5} />
      </span>
      {!small && (
        <div className="leading-tight">
          <div className="text-[16px] font-bold tracking-wide text-white">FIXCHAIN</div>
          <div className="text-[10.5px] text-white/55">Incident intelligence platform</div>
        </div>
      )}
    </div>
  );
}

/** Free hosting sleeps when idle: explain the wait instead of showing errors (hosted deployments only). */
function WakingBanner({ show }: { show: boolean }) {
  if (!show || ["localhost", "127.0.0.1"].includes(location.hostname)) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-[14px] text-ink-2">
      <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-warn border-t-transparent" />
      <span><span className="font-semibold text-ink">Waking up the demo backend…</span>{" "}
        Free hosting sleeps when idle, so the first visit can take up to a minute. This page fills in on its own.</span>
    </div>
  );
}

export function Login({ slot = "ops", compact = false, roles }: { slot?: "ops" | "customer"; compact?: boolean; roles?: string[] }) {
  const { data: users, error: usersError } = useV1<{ username: string; display_name: string; role: string; locale: string }[]>("/auth/demo-users", 10000, slot);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = async (u: string, pw?: string) => {
    setBusy(true); setError(null);
    try {
      const r = await v1<Session>(pw === undefined ? "/auth/demo-login" : "/auth/login", { body: { username: u, password: pw ?? null }, slot });
      session.set(slot, r);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const list = (users ?? []).filter((u) => !roles || roles.includes(u.role));
  return (
    <div className={compact ? "" : "w-full max-w-md"}>
      {!compact && <WakingBanner show={!users && !!usersError} />}
      {!compact && <h1 className="text-[22px] font-bold text-white">Sign in to FIXCHAIN</h1>}
      {list.length > 0 && (
        <div className={compact ? "" : "mt-5"}>
          <div className={`mb-2 flex items-center gap-2 text-[12px] ${compact ? "text-ink-3" : "text-white/60"}`}>
            <Pill tone="violet">Demo mode</Pill> Pick a role - demo sign-in is not production authentication.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((u) => (
              <button key={u.username} disabled={busy} onClick={() => signIn(u.username)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${compact ? "border-line bg-panel hover:border-accentDim" : "border-white/10 bg-white/5 hover:border-accentDim hover:bg-white/10"}`}>
                <div className={`text-[13px] font-semibold ${compact ? "text-ink" : "text-white"}`}>{u.display_name}</div>
                <div className={`text-[11.5px] ${compact ? "text-ink-3" : "text-white/55"}`}>{u.role.replace("_", " ")} · {u.locale}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {!compact && (
        <form className="mt-6 space-y-2 border-t border-white/10 pt-5" onSubmit={(e) => { e.preventDefault(); if (username) signIn(username, password); }}>
          <div className="text-[12px] text-white/60">Password sign-in</div>
          <input className={inputCls} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <input className={inputCls} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Btn type="submit" variant="primary" busy={busy} disabled={!username || !password}>Sign in</Btn>
        </form>
      )}
      <div className="mt-3"><ErrorNote error={error} /></div>
    </div>
  );
}

function Shell({ s }: { s: Session }) {
  const [route, param, nav] = useRoute();
  const { data: sys, error: sysError } = useV1<any>("/system", 4000);
  const { data: apr } = useV1<any[]>(s.user.permissions.includes("approval:read") ? "/approvals?status=pending&limit=1000" : null, 5000);
  const isStaff = !["customer", "merchant"].includes(s.user.role);
  const items = NAV.filter((n) => (n.perm ? s.user.permissions.includes(n.perm) : n.staff ? isStaff : true));
  const current = items.find((n) => n.id === route)?.id ?? items[0].id;
  const pending = apr?.length ?? 0;
  const logout = async () => { try { await v1("/auth/logout", { body: {} }); } catch { /* ignore */ } session.set("ops", null); };
  const page = (() => {
    switch (current) {
      case "overview": return <MissionControl nav={nav} />;
      case "customer": return <CustomerApp />;
      case "tickets": return <Tickets nav={nav} selected={param} />;
      case "incidents": return <Incidents nav={nav} selected={param} />;
      case "intelligence": return <Intelligence nav={nav} />;
      case "agents": return <Agents nav={nav} />;
      case "approvals": return <Approvals nav={nav} />;
      case "engineering": return <Engineering nav={nav} selected={param} />;
      case "knowledge": return <Knowledge />;
      case "simulation": return <SimulationLab nav={nav} />;
      case "analytics": return <Analytics />;
      default: return <SettingsPage />;
    }
  })();
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-night text-white lg:flex">
        <div className="px-5 py-5"><Logo /></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
          {items.map((n) => (
            <a key={n.id} href={`#/${n.id}`} aria-current={current === n.id ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${current === n.id
                ? "bg-white/10 text-white shadow-[inset_3px_0_0_#00A8E8]" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
              <span className={current === n.id ? "text-accentDim" : "text-white/45 group-hover:text-white/80"}>{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {n.id === "approvals" && pending > 0 && <span className="rounded-full bg-violet-500 px-1.5 text-[10.5px] font-bold">{pending}</span>}
            </a>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
          <div className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-accentDim" /> {sys?.workers?.workers ?? "—"} worker(s) · queue {sys?.workers?.queue_depth ?? "—"}</div>
          <div className="mt-1 text-white/40">In-process worker pool - not cloud autoscaling</div>
        </div>
        <p className="px-5 pb-4 text-[10.5px] leading-snug text-white/40">Built for Paytm merchants · independent hackathon project, not an official Paytm product.</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-white/10 bg-night px-4 py-2.5 text-white md:px-6">
          <div className="lg:hidden"><Logo small /></div>
          <select aria-label="Navigate" value={current} onChange={(e) => nav(e.target.value)}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[13px] text-white lg:hidden">
            {items.map((n) => <option key={n.id} value={n.id} className="text-ink">{n.label}</option>)}
          </select>
          <h1 className="hidden text-[15px] font-semibold lg:block">{items.find((n) => n.id === current)?.label}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sys && <Pill tone={sys.mode === "demo" ? "violet" : "good"}>{sys.mode === "demo" ? "Demo mode · simulated payment environment" : "Production mode"}</Pill>}
            {sys && <Pill tone="dark">Agents: {sys.llm}</Pill>}
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-1 pl-3 pr-1">
              <div className="leading-tight">
                <div className="text-[12.5px] font-semibold">{s.user.display_name}</div>
                <div className="text-[10.5px] text-white/55">{s.user.role.replace("_", " ")}{s.user.demo ? " · demo" : ""}</div>
              </div>
              <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6"><WakingBanner show={!sys && !!sysError} />{page}</main>
      </div>
    </div>
  );
}

export default function App() {
  const s = useSyncExternalStore(session.subscribe, () => session.get("ops")?.token ?? null);
  const current = s ? session.get("ops") : null;
  return (
    <ToastHost>
      {current ? <Shell s={current} /> : (
        <div className="grid min-h-screen place-items-center bg-night px-4 py-10">
          <div className="w-full max-w-md">
            <div className="mb-8"><Logo /></div>
            <Login />
            <p className="mt-8 text-[11.5px] leading-relaxed text-white/40">
              Simulated payment environment. Connectors to banks, NPCI, payment and device systems are mocks; no real money moves.
            </p>
          </div>
        </div>
      )}
    </ToastHost>
  );
}
