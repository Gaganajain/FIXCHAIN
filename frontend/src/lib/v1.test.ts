import { afterEach, describe, expect, it, vi } from "vitest";
import { sevTone, stateTone } from "../components/kit";
import { session } from "./session";
import { ApiError, dur, label, pct, rupees, v1 } from "./v1";

describe("formatting", () => {
  it("formats rupees from paise and handles missing values", () => {
    expect(rupees(50000)).toBe("₹500");
    expect(rupees(1234500)).toBe("₹12,345");
    expect(rupees(null)).toBe("—");
  });
  it("formats durations including sub-second", () => {
    expect(dur(0.3)).toBe("<1s");
    expect(dur(42)).toBe("42s");
    expect(dur(125)).toBe("2m 5s");
    expect(dur(3 * 3600 + 600)).toBe("3h 10m");
    expect(dur(null)).toBe("—");
  });
  it("labels and percentages", () => {
    expect(label("APPROVAL_REQUIRED")).toBe("Approval required");
    expect(pct(97.5)).toBe("97.5%");
    expect(pct(null)).toBe("—");
  });
});

describe("status tones", () => {
  it("maps severities and states to semantic tones", () => {
    expect(sevTone("SEV-1")).toBe("critical");
    expect(sevTone("SEV-4")).toBe("neutral");
    expect(stateTone("RESOLVED")).toBe("good");
    expect(stateTone("APPROVAL_REQUIRED")).toBe("violet");
    expect(stateTone("something-new")).toBe("neutral");
  });
});

describe("api client", () => {
  afterEach(() => { vi.unstubAllGlobals(); session.set("ops", null); });
  const user = { id: 1, username: "a", display_name: "A", role: "support", locale: "en", customer_id: null, merchant_id: null, demo: true, permissions: ["ticket:read"] };

  it("sends the bearer token and returns JSON", async () => {
    session.set("ops", { token: "tok-123", user });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await v1("/tickets")).toEqual({ ok: 1 });
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/tickets");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-123");
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });

  it("surfaces the server's detail message and clears an expired session on 401", async () => {
    session.set("ops", { token: "old", user });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Sign in required" }), { status: 401 })));
    await expect(v1("/tickets")).rejects.toMatchObject({ status: 401, message: "Sign in required" });
    expect(session.token("ops")).toBeNull();
  });

  it("posts JSON bodies and reads structured error details", async () => {
    session.set("ops", { token: "t", user });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { error: "Voice not configured", fallback: "text" } }), { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const err = await v1("/voice/speak", { body: { text: "hi" } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Voice not configured");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ text: "hi" });
  });

  it("keeps operator and customer sessions separate", () => {
    session.set("ops", { token: "ops-token", user });
    session.set("customer", { token: "cust-token", user: { ...user, role: "customer" } });
    expect(session.token("ops")).toBe("ops-token");
    expect(session.token("customer")).toBe("cust-token");
    expect(session.can("ticket:read")).toBe(true);
    session.set("customer", null);
  });
});
