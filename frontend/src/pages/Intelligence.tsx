import { Activity, GitMerge, Map as MapIcon, Radar, ScanSearch } from "lucide-react";
import type { Nav } from "../App";
import { Empty, Panel, Pill, Spinner } from "../components/kit";
import { ago, label, useV1 } from "../lib/v1";

export function Intelligence({ nav }: { nav: Nav }) {
  const { data } = useV1<any>("/intelligence", 3000);
  if (!data) return <Spinner />;
  const regions = Array.from(new Set<string>(data.regions.map((r: any) => r.region)));
  const cats = Array.from(new Set<string>(data.regions.map((r: any) => r.category)));
  const cell = (r: string, c: string) => data.regions.find((x: any) => x.region === r && x.category === c)?.n ?? 0;
  const max = Math.max(1, ...data.regions.map((r: any) => r.n));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Symptom clusters (last 3 h)" icon={<GitMerge className="h-4 w-4" />} subtitle={`Linked at similarity ≥ ${data.thresholds.attach}; ${data.thresholds.review}-${data.thresholds.attach} goes to review; new incident at ${data.thresholds.burst_min}+ similar reports`}>
          {!data.clusters.length ? <Empty>No clusters yet.</Empty> : (
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="pb-1">Fingerprint</th><th>Reports</th><th>Unlinked</th><th>Window</th></tr></thead>
              <tbody>
                {data.clusters.map((c: any) => (
                  <tr key={c.fingerprint} className="border-t border-line">
                    <td className="py-1.5 font-mono text-[11.5px]">{c.fingerprint}</td>
                    <td className="font-semibold tabular-nums">{c.tickets}</td>
                    <td>{c.unlinked ? <Pill tone="warn">{c.unlinked}</Pill> : <Pill tone="good">0</Pill>}</td>
                    <td className="text-ink-3">{ago(c.first)} → {ago(c.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Emerging-incident detector (last 5 min vs previous hour)" icon={<Activity className="h-4 w-4" />}>
          {!data.bursts.length ? <Empty>No recent reports.</Empty> : (
            <ul className="space-y-2">
              {data.bursts.map((b: any) => (
                <li key={b.fingerprint} className="flex items-center gap-3">
                  <span className="w-56 truncate font-mono text-[11.5px]">{b.fingerprint}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><div className={`h-full rounded-full ${b.spike ? "bg-critical" : "bg-brand-2"}`} style={{ width: `${Math.min(100, b.last_5m * 2)}%` }} /></div>
                  <span className="w-28 text-right text-[11.5px] tabular-nums">{b.last_5m} vs {b.baseline_per_5m}/5m</span>
                  {b.spike ? <Pill tone="critical">spike</Pill> : <Pill>normal</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="Geographic pattern (reports by region × category, last 3 h)" icon={<MapIcon className="h-4 w-4" />}>
        {!regions.length ? <Empty>No regional data yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="text-[12px]">
              <thead><tr><th className="pr-4" />{cats.map((c) => <th key={c} className="px-2 pb-1 text-left text-[11px] font-semibold text-ink-3">{label(c)}</th>)}</tr></thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r}><td className="pr-4 font-semibold">{r}</td>
                    {cats.map((c) => { const n = cell(r, c); return (
                      <td key={c} className="p-1"><div className="grid h-9 min-w-[64px] place-items-center rounded-lg text-[12px] font-semibold tabular-nums"
                        style={{ background: n ? `rgba(11,61,113,${0.08 + 0.7 * n / max})` : "#EEF2F7", color: n / max > 0.5 ? "white" : "#0F172A" }}>{n || ""}</div></td>
                    ); })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Correlation review queue" icon={<ScanSearch className="h-4 w-4" />} subtitle="Similar but below the merge threshold - never merged silently">
        {!data.review_queue.length ? <Empty icon={<Radar className="h-6 w-6" />}>Nothing waiting for review.</Empty> : (
          <ul className="divide-y divide-line">
            {data.review_queue.map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                <button className="font-mono text-brand-2 hover:underline" onClick={() => nav(`tickets/${r.id}`)}>{r.id}</button>
                <span>{r.title}</span><span className="text-ink-3">resembles</span>
                <button className="font-mono text-brand-2 hover:underline" onClick={() => nav(`incidents/${r.review.candidate}`)}>{r.review.candidate}</button>
                <Pill tone="warn">similarity {r.review.score}</Pill>
                <span className="text-[11px] text-ink-3">{Object.entries(r.review.features ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
