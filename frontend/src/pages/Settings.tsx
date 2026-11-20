import { Fingerprint, Mic, ScrollText, Settings as SettingsIcon, ShieldAlert } from "lucide-react";
import { Btn, KV, Panel, Pill, Spinner, State, useRun } from "../components/kit";
import { session } from "../lib/session";
import { clock, label, useV1, v1 } from "../lib/v1";

export function SettingsPage() {
  const { data: st, reload } = useV1<any>("/settings", 5000);
  const { data: sys } = useV1<any>("/system", 5000);
  const { data: audit } = useV1<any>(session.can("audit:read") ? "/audit?limit=100" : null, 5000);
  const { busy, run } = useRun();
  if (!st || !sys) return <Spinner />;
  const admin = session.can("admin");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="System" icon={<SettingsIcon className="h-4 w-4" />}>
          <KV k="Mode" v={<Pill tone={sys.mode === "demo" ? "violet" : "good"}>{sys.mode}</Pill>} />
          <KV k="Agent reasoning" v={sys.llm} />
          <KV k="Schema version" v={sys.schema_version} />
          <KV k="Workers" v={`${st.workers.min}-${st.workers.max} in-process threads`} />
          <KV k="Connectors" v={<span className="text-[11.5px]">{sys.labels.connectors}</span>} />
          <KV k="Vision" v={sys.vision.provider} />
          <p className="mt-2 text-[11px] text-ink-3">Demo sign-in is enabled only in demo mode and is not production authentication. Set FIXCHAIN_DEMO_MODE=false and FIXCHAIN_ADMIN_PASSWORD for password-only access.</p>
        </Panel>
        <Panel title="Voice" icon={<Mic className="h-4 w-4" />}>
          <KV k="Provider" v={sys.voice.available ? <Pill tone="good">Sarvam</Pill> : <Pill tone="warn">not configured</Pill>} />
          <KV k="Speech-to-text" v={sys.voice.stt_model} />
          <KV k="Text-to-speech" v={sys.voice.tts_model} />
          <KV k="Languages" v={sys.voice.languages.join(", ")} />
          <p className="mt-2 text-[11px] text-ink-3">{sys.voice.fallback}</p>
        </Panel>
        <Panel title="Autonomy" icon={<ShieldAlert className="h-4 w-4" />}>
          <p className="text-[12.5px] text-ink-2">Tier 1 write actions (e.g. a safe Soundbox restart) run autonomously when enabled. Read-only checks always run. Tier 2 always needs approval; Tier 3 is always human-led.</p>
          <div className="mt-3 flex items-center gap-3">
            <State s={st.autonomy_enabled ? "verified" : "blocked"} /><span className="text-[12.5px] font-semibold">{st.autonomy_enabled ? "Autonomous Tier 1 actions enabled" : "Autonomous Tier 1 writes disabled"}</span>
          </div>
          {admin ? <div className="mt-3"><Btn size="sm" variant={st.autonomy_enabled ? "danger" : "good"} busy={busy === "a"} onClick={() => run("a", async () => { await v1("/settings/autonomy", { body: { enabled: !st.autonomy_enabled } }); reload(); }, "Setting saved and audited")}>{st.autonomy_enabled ? "Disable autonomy (kill switch)" : "Enable autonomy"}</Btn></div>
            : <p className="mt-3 text-[11.5px] text-ink-3">Only an admin can change this.</p>}
        </Panel>
      </div>
      <Panel title="Policy catalog" icon={<Fingerprint className="h-4 w-4" />} subtitle="Deterministic and enforced server-side. The LLM never grants itself permission; unknown actions are denied." pad={false}>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Action</th><th>Tier</th><th>Approver</th><th>Reversible</th><th className="pr-4">Description</th></tr></thead>
          <tbody>{Object.entries(st.policy_catalog).map(([k, v]: [string, any]) => (
            <tr key={k} className="border-t border-line"><td className="px-4 py-1.5 font-mono text-[11.5px]">{k}</td>
              <td><Pill tone={v.tier >= 3 ? "critical" : v.tier === 2 ? "violet" : "good"}>Tier {v.tier}</Pill></td><td>{v.approver ?? "autonomous"}</td><td>{v.reversible ? "yes" : "no"}</td><td className="pr-4 text-ink-2">{v.description}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="SLA policies" subtitle={st.sla_label}>
          {Object.entries(st.sla_policies).map(([k, v]: [string, any]) => (
            <KV key={k} k={k} v={`first response ${Math.round(v.first_response_s / 60)} min · resolution ${Math.round(v.resolution_s / 3600)} h`} />
          ))}
        </Panel>
        <Panel title="Audit log" icon={<ScrollText className="h-4 w-4" />} className="xl:col-span-2"
          right={audit && <Pill tone={audit.chain.intact ? "good" : "critical"}>{audit.chain.intact ? `hash chain intact · ${audit.chain.entries} entries` : `chain broken at #${audit.chain.broken_at}`}</Pill>}>
          {!audit ? <p className="text-[12.5px] text-ink-3">Your role cannot read the audit log.</p> : (
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-[12px]"><tbody>
                {audit.entries.map((e: any) => (
                  <tr key={e.id} className="border-b border-line/70"><td className="py-1 pr-2 font-mono text-[10.5px] text-ink-3">{clock(e.ts)}</td><td className="pr-2 font-semibold">{e.actor}</td>
                    <td className="pr-2 text-ink-3">{e.role}</td><td className="pr-2">{label(e.action)}</td><td className="pr-2 font-mono text-[11px]">{e.target}</td><td className="font-mono text-[10px] text-ink-3">{e.hash.slice(0, 10)}</td></tr>
                ))}
              </tbody></table>
              <p className="mt-2 text-[11px] text-ink-3">Append-only (database triggers reject updates and deletes); each entry hashes the previous one.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
