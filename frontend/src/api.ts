import { useCallback, useEffect, useRef, useState } from "react";
import { session } from "./lib/session";

export type Status = {
  environment: string;
  agent_mode: "llm" | "offline";
  model: string | null;
  provider: "anthropic" | "sarvam" | null;
  agent_label: string;
  active_version: { id: number; source: string; note: string; created_at: number } | null;
  bug_present: Record<string, boolean>;
  verifier_suite_sha256: string;
  verifier_suite_intact: boolean;
  approved_files: string[];
  reviewer_token_required?: boolean;
  active_run: { id: number; incident_id: number; state: string } | null;
};

export type Impact = {
  affected_orders: number;
  affected_amount: number;
  still_pending_at_gateway: number;
  paid_but_marked_failed: number;
  revenue_at_risk: number;
  reconciled: number;
  label: string;
  orders?: { order_id: string; txn_id: string; amount: number; order_status: string; gateway_status: string; reconciled: number }[];
};

export type Incident = {
  id: number;
  fingerprint: string;
  rule: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  gateway_status: string;
  observed_order_status: string;
  expected_order_status: string;
  first_seen: number;
  last_seen: number;
  occurrences: number;
  similar_memory_id: number | null;
  resolved_at: number | null;
  category?: "merchant_integration" | "external";
  impact: Impact;
  latest_run?: { id: number; state: string; agent_mode: string } | null;
};

export type Step = { id: number; ts: number; agent: string; status: string; message: string; data: any };
export type Patch = {
  id: number; attempt: number; file: string; original_code: string; patched_code: string; diff: string;
  explanation: string; status: string; created_at: number; decided_at: number | null; decided_by: string | null;
  decision_note: string | null;
};
export type TestRun = {
  id: number; patch_id: number | null; target: "baseline" | "patched"; passed: number; failed: number; errors: number;
  total: number; duration_s: number; suite_sha256: string; created_at: number;
  results: { name: string; outcome: string; message: string; time: number }[];
};
export type Investigation = {
  file: string; function: string; line_start: number; line_end: number; root_cause: string; explanation: string;
  evidence: string[]; confidence: number; fix_strategy: string; analysis_method?: string;
  evidence_checks?: { status: "verified" | "unverified" | "unchecked"; unknown_ids: string[] }[];
  evidence_unverified?: number;
};
export type Run = {
  id: number; state: string; agent_mode: string; agent_label: string | null; started_at: number; finished_at: number | null;
  verified_at: number | null; error: string | null; investigation: Investigation | null; steps: Step[]; classification?: string | null;
  patches: Patch[]; tests: TestRun[]; time_to_verified_s: number | null; pipeline_duration_s: number | null;
};
export type IncidentDetail = Incident & { runs: Run[]; similar_memory: Memory | null };
export type Memory = {
  id: number; fingerprint: string; rule: string; file: string; function: string; root_cause: string;
  fix_summary: string; times_seen: number; created_at: number; last_seen: number; incident_id: number; patch_id: number;
};
export type Metrics = {
  callbacks: number; state_checked: number; mismatches: number; health_score: number; health_window: number; health_scope: string;
  open_incidents: number; resolved_incidents: number; orders: number; order_status: Record<string, number>;
  gateway_status: Record<string, number>; rejections: Record<string, number>;
  series: { t: number; SUCCESS: number; FAILED: number; PENDING: number; mismatches: number }[];
  mismatch_types: Record<string, number>;
};
export type Order = {
  order_id: string; customer: string; amount: number; status: string; txn_id: string; gateway_status: string;
  created_at: number; updated_at: number;
};
export type Version = {
  id: number; file: string; source: string; patch_id: number | null; note: string; created_at: number;
  active: number; code: string;
};
export type LogLine = { id: number; ts: number; level: string; source: string; message: string };

/** Reviewer identity sent with every action; the backend requires it for decisions. */
export const reviewerStore = {
  get(key: "name" | "token"): string {
    try { return localStorage.getItem(`fixchain_reviewer_${key}`) ?? ""; } catch { return ""; }
  },
  set(key: "name" | "token", value: string) {
    try { localStorage.setItem(`fixchain_reviewer_${key}`, value); } catch { /* storage unavailable */ }
  },
};

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const token = session.token("ops");
  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? auth : {
      ...auth,
      "Content-Type": "application/json",
      // The signed-in user is the reviewer of record; the manual name field remains as a fallback.
      "X-Reviewer": session.user("ops")?.display_name || reviewerStore.get("name"),
      "X-Reviewer-Token": reviewerStore.get("token"),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** Poll an endpoint. Data is always live from the backend - no client-side mocks. */
export function usePoll<T>(path: string | null, ms = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    setData(null);
    load();
    const t = setInterval(load, ms);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, ms]);
  return { data, error, reload: load };
}

export const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
export const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString();
export const ago = (ts: number) => {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};
