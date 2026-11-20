import { useState } from "react";
import { Order, Status, api, rupees, usePoll } from "../api";
import { Badge, Button, Card, ErrorBar, Mono, gatewayTone, orderTone, useAction } from "../ui";

const EXPECTED: Record<string, string> = { SUCCESS: "PAID", PENDING: "PAYMENT_PENDING", FAILED: "PAYMENT_FAILED" };

export function Simulator({ status, refreshStatus }: { status: Status | null; refreshStatus: () => void }) {
  const { data: orders, reload } = usePoll<Order[]>("/orders?limit=40", 1500);
  const { busy, error, run } = useAction();
  const [last, setLast] = useState<string | null>(null);
  const bug = status?.bug_present?.pending_as_failed;

  const act = (key: string, fn: () => Promise<any>, describe: (r: any) => string) =>
    run(key, async () => {
      const r = await fn();
      setLast(describe(r));
      reload();
      refreshStatus();
    });

  return (
    <div className="space-y-5">
      <ErrorBar error={error} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="1 · Merchant integration">
          <p className="text-sm text-ink-2">
            Simulated merchant <span className="text-ink">ShopKart</span> handles SimPay callbacks in{" "}
            <Mono className="text-ink">payment_handler.py</Mono> (live code version #{status?.active_version?.id}).
          </p>
          <div className="mt-3 flex items-center gap-2">
            {bug ? <Badge tone="critical">Bug present: PENDING → FAILED</Badge> : <Badge tone="good">No injected bug</Badge>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="danger" disabled={bug} busy={busy === "inject"}
              onClick={() => act("inject", () => api("/bugs/pending_as_failed/inject", {}), () => "Bug injected: PENDING is now mapped to PAYMENT_FAILED")}>
              Inject PENDING→FAILED bug
            </Button>
            <Button variant="ghost" busy={busy === "reset"}
              onClick={() => act("reset", () => api("/demo/reset", { inject_bug: false }), () => "Demo reset to the original integration (memory kept)")}>
              Reset demo
            </Button>
          </div>
        </Card>

        <Card title="2 · Customer checkout">
          <p className="text-sm text-ink-2">Each checkout creates an order, a SimPay transaction and a signed callback. No real money moves.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["SUCCESS", "PENDING", "FAILED"] as const).map((o) => (
              <Button key={o} busy={busy === o} onClick={() => act(o, () => api("/checkout", { outcome: o }),
                (r) => `${r.order_id}: gateway ${r.gateway_status} → order ${r.order_status}`)}>
                {o}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" busy={busy === "batch"} onClick={() => act("batch", () => api("/simulate/batch", { count: 20 }),
              (r) => `20 random checkouts: ${Object.entries(r.by_order_status).map(([k, v]) => `${v} ${k}`).join(", ")}`)}>
              Run 20 random checkouts
            </Button>
          </div>
        </Card>

        <Card title="3 · Gateway events">
          <p className="text-sm text-ink-2">Edge cases the integration must survive.</p>
          <div className="mt-3 flex flex-col gap-2">
            <Button busy={busy === "settle"} onClick={() => act("settle", () => api("/gateway/settle", {}),
              (r) => `Gateway settled ${r.settled} pending transaction(s)`)}>
              Settle pending payments
            </Button>
            <Button busy={busy === "dup"} onClick={() => act("dup", () => api("/gateway/replay", { duplicate: true }),
              (r) => `Duplicate callback → ${r.reason} (HTTP ${r.http_status})`)}>
              Re-send last callback (duplicate)
            </Button>
            <Button busy={busy === "forge"} onClick={() => act("forge", () => api("/gateway/replay", { duplicate: false, tamper: true }),
              (r) => `Forged SUCCESS callback → ${r.reason} (HTTP ${r.http_status})`)}>
              Send forged callback (bad signature)
            </Button>
          </div>
        </Card>
      </div>

      {last && <div className="rounded-2xl border border-line bg-raised px-4 py-3 font-mono text-sm text-ink-2">› {last}</div>}

      <Card title="Simulated orders" right={<span className="text-[12px] text-ink-3">gateway is the source of truth</span>} pad={false}>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-panel text-left text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              <tr>
                {["Order", "Customer", "Amount", "Gateway status", "Order status", "Consistency"].map((h) => (
                  <th key={h} className="border-b border-line px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((o) => {
                const ok = !o.gateway_status || o.status === EXPECTED[o.gateway_status];
                return (
                  <tr key={o.order_id} className="border-b border-line/60 hover:bg-raised/50 transition-colors">
                    <td className="px-4 py-2.5"><Mono className="text-ink-2">{o.order_id}</Mono></td>
                    <td className="px-4 py-2.5 text-ink-2">{o.customer}</td>
                    <td className="px-4 py-2.5 tabular-nums text-ink">{rupees(o.amount)}</td>
                    <td className="px-4 py-2.5"><Badge tone={gatewayTone(o.gateway_status)}>{o.gateway_status}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={orderTone(o.status)}>{o.status}</Badge></td>
                    <td className="px-4 py-2.5">{ok ? <Badge tone="good">consistent</Badge> : <Badge tone="critical">mismatch</Badge>}</td>
                  </tr>
                );
              })}
              {!orders?.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-3">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
