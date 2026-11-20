/** Session storage for the operator console and (separately) the embedded customer phone preview. */
export type SessionUser = {
  id: number; username: string; display_name: string; role: string; locale: string;
  customer_id: number | null; merchant_id: number | null; demo: boolean; permissions: string[];
};
export type Session = { token: string; user: SessionUser };

const KEY = { ops: "fixchain_session", customer: "fixchain_customer_session" } as const;
type Slot = keyof typeof KEY;

function read(slot: Slot): Session | null {
  try {
    const raw = localStorage.getItem(KEY[slot]);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

export const session = {
  get: (slot: Slot = "ops") => read(slot),
  set(slot: Slot, s: Session | null) {
    try {
      if (s) localStorage.setItem(KEY[slot], JSON.stringify(s));
      else localStorage.removeItem(KEY[slot]);
    } catch { /* storage unavailable - session lives in memory only */ }
    memory[slot] = s;
    listeners.forEach((l) => l());
  },
  token: (slot: Slot = "ops") => (memory[slot] ?? read(slot))?.token ?? null,
  user: (slot: Slot = "ops") => (memory[slot] ?? read(slot))?.user ?? null,
  can: (perm: string, slot: Slot = "ops") => !!(memory[slot] ?? read(slot))?.user.permissions.includes(perm),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
const memory: Record<Slot, Session | null> = { ops: read("ops"), customer: read("customer") };
