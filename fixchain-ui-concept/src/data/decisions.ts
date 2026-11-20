import { useSyncExternalStore } from "react";
import { APPROVALS } from "@/data/fixchain";

/** In-memory approval decisions shared by the Approvals page, sidebar badge and bell (sample only, resets on reload). */
export type Decision = { status: "approved" | "rejected"; by: string; note: string; at: string };

let decisions: Record<string, Decision> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const decisionStore = {
  get: () => decisions,
  set(id: string, d: Decision) { decisions = { ...decisions, [id]: d }; emit(); },
  undo(id: string) { const { [id]: _, ...rest } = decisions; decisions = rest; emit(); },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};

export const useDecisions = () => useSyncExternalStore(decisionStore.subscribe, decisionStore.get);
export const usePendingCount = () => {
  const d = useDecisions();
  return APPROVALS.filter((a) => !d[a.id]).length;
};
