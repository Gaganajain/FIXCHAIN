import { useCallback, useEffect, useRef, useState } from "react";
import { session } from "./session";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Slot = "ops" | "customer";

/** Typed-enough client for /api/v1. Sends the bearer token; never stores provider secrets in the browser. */
export async function v1<T = any>(path: string, opts: { body?: unknown; method?: string; slot?: Slot; form?: FormData; text?: boolean } = {}): Promise<T> {
  const slot = opts.slot ?? "ops";
  const token = session.token(slot);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && token) session.set(slot, null);
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : j.detail?.error ?? JSON.stringify(j.detail ?? j);
    } catch { /* non-JSON error */ }
    throw new ApiError(res.status, msg);
  }
  return (opts.text ? res.text() : res.json()) as Promise<T>;
}

/** Poll an endpoint; `deps` changes reload immediately. Pauses while the tab is hidden. */
export function useV1<T = any>(path: string | null, ms = 2000, slot: Slot = "ops") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await v1<T>(path, { slot });
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path, slot]);
  useEffect(() => {
    alive.current = true;
    setLoading(true);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, ms);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, ms]);
  return { data, error, loading, reload: load };
}

export type OpsEvent = {
  id: number; ts: number; type: string; level: string; actor_type: string; actor_id: string;
  ticket_id: string | null; incident_id: string | null; message: string; data: any; simulated: number;
};

/**
 * Live event stream (Server-Sent Events) from the persisted event log. EventSource reconnects on its own and
 * resumes from Last-Event-ID, so no event is lost. If SSE is unavailable, falls back to polling /events.
 */
export function useEvents(max = 300, slot: Slot = "ops") {
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const lastId = useRef(0);
  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const seen = new Set<number>();
    const push = (incoming: OpsEvent[]) => {
      const batch = incoming.filter((e) => !seen.has(e.id));  // reconnects and polling overlap must not duplicate
      batch.forEach((e) => seen.add(e.id));
      if (!batch.length) return;
      lastId.current = Math.max(lastId.current, ...batch.map((e) => e.id));
      setEvents((prev) => [...batch.reverse(), ...prev].slice(0, max));
    };
    (async () => {
      try {
        const initial = await v1<OpsEvent[]>(`/events?tail=true&limit=80`, { slot });
        push(initial);
      } catch { /* not signed in yet */ }
      if (closed) return;
      const token = session.token(slot);
      if (!token) return;
      const startPolling = () => {
        if (poll || closed) return;
        es?.close();
        poll = setInterval(async () => {
          try { push(await v1<OpsEvent[]>(`/events?after=${lastId.current}&limit=200`, { slot })); setConnected(true); }
          catch { setConnected(false); }
        }, 1500);
      };
      try {
        let opened = false;
        es = new EventSource(`/api/v1/events/stream?token=${encodeURIComponent(token)}&after=${lastId.current}`);
        es.addEventListener("ops", (m) => push([JSON.parse((m as MessageEvent).data)]));
        es.onopen = () => { opened = true; setConnected(true); };
        es.onerror = () => { setConnected(false); if (!opened) startPolling(); };
        // A proxy that buffers streams (some rewrites do) never opens the stream: switch to polling the same log.
        setTimeout(() => { if (!opened) startPolling(); }, 6000);
      } catch {
        startPolling();
      }
    })();
    return () => { closed = true; es?.close(); if (poll) clearInterval(poll); };
  }, [max, slot]);
  return { events, connected };
}

export const rupees = (paise: number | null | undefined) =>
  paise == null ? "—" : "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const ago = (ts: number | null | undefined) => {
  if (!ts) return "—";
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const dur = (s: number | null | undefined) => {
  if (s == null) return "—";
  if (s < 1) return "<1s";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
};
export const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
export const label = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
