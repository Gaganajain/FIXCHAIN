import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";
import { SCENARIOS, SIM_SIZES } from "@/data/fixchain";

type Scenario = (typeof SCENARIOS)[number];
type Event = { t: string; level: "info" | "alert" | "ok"; text: string };

/** Small seeded RNG so the same scenario, size and seed always replay the same way (like ops/simulation.py). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const LINES: Record<string, string[]> = {
  upi_payment: ["Paise kat gaye lekin order fail", "Debited but order failed", "पैसे कापले पण ऑर्डर मिळाले नाही"],
  soundbox: ["Soundbox bol nahi raha", "No announcement after payment", "साउंडबॉक्स बोलत नाही"],
  merchant_qr: ["QR scan nahi ho raha", "Customers can't scan our QR", "क्यूआर स्कॅन होत नाही"],
  settlement: ["Settlement jama nahi hua", "Yesterday's settlement not credited", "सेटलमेंट जमा झाले नाही"],
  platform_outage: ["App nahi chal raha", "Payments page not loading", "ॲप चालत नाही"],
};
const LANGS = ["hi", "en", "mr"] as const;
const clock = () => new Date().toLocaleTimeString("en-IN", { hour12: false });

export function SimulationLab() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [size, setSize] = useState<number>(100);
  const [seed, setSeed] = useState(42);
  const [running, setRunning] = useState(false);
  const [arrived, setArrived] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [events, setEvents] = useState<Event[]>([]);
  const rand = useRef(rng(seed));

  const reset = () => { setRunning(false); setArrived(0); setProcessed(0); setEvents([]); rand.current = rng(seed); arrivedRef.current = 0; processedRef.current = 0; };
  // Changing what is being simulated starts over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [scenario.id, size, seed]);

  // Counters live in refs so each tick computes once (state updaters must stay pure under StrictMode).
  const arrivedRef = useRef(0);
  const processedRef = useRef(0);
  useEffect(() => { arrivedRef.current = arrived; processedRef.current = processed; }, [arrived, processed]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const r = rand.current;
      const p = processedRef.current;
      if (p >= size) return; // already finished; the interval stops on the next render
      const a = Math.min(size, arrivedRef.current + Math.max(3, Math.round(size / 25)));
      const next = Math.min(size, a, p + Math.max(2, Math.round(size / 30)));
      const lang = LANGS[Math.floor(r() * 3)];
      const line = LINES[scenario.category][LANGS.indexOf(lang)];
      const n = Math.floor(r() * 900) + 100;
      const add: Event[] = [{ t: clock(), level: "info", text: `TK-${n} [${lang}] “${line}” → understood, triaged` }];
      if (p < 10 && next >= 10) add.push({ t: clock(), level: "alert", text: `Spike detected: tickets grouped into one ${scenario.name.toLowerCase()} incident` });
      if (scenario.defect && p < size / 2 && next >= size / 2) add.push({ t: clock(), level: "alert", text: "Code defect suspected: engineering remediation started (reproduce, patch, 22 locked tests)" });
      if (next >= size) add.push({ t: clock(), level: "ok", text: `Done: ${size} tickets, 1 incident. Consequential actions are waiting for approval.` });
      arrivedRef.current = a;
      processedRef.current = next;
      setArrived(a);
      setProcessed(next);
      setEvents((ev) => [...add.reverse(), ...ev].slice(0, 60));
      if (next >= size) setRunning(false);
    }, 700);
    return () => clearInterval(iv);
  }, [running, size, scenario]);

  const queue = Math.max(0, arrived - processed);
  const workers = Math.min(12, Math.max(1, Math.ceil(queue / 4)));
  const finished = processed >= size;
  const grouped = processed >= 10 ? 1 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Simulation lab</h1>
          <p className="text-muted-foreground">Replay a seeded scenario and watch tickets group into one incident. Simulated data is always labelled and never mixed with live data.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (finished ? (reset(), setTimeout(() => setRunning(true), 0)) : setRunning((r) => !r))}>
            {running ? <><Pause className="mr-2 h-4 w-4" /> Pause</> : finished ? <><RotateCcw className="mr-2 h-4 w-4" /> Run again</> : <><Play className="mr-2 h-4 w-4" /> {processed ? "Resume" : "Start"}</>}
          </Button>
          <Button variant="outline" onClick={reset} disabled={!processed && !running}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">Scenario</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {SCENARIOS.map((sc) => (
              <button key={sc.id} onClick={() => setScenario(sc)} aria-pressed={scenario.id === sc.id}
                className={cn("rounded-xl border p-3 text-left transition-colors", scenario.id === sc.id ? "border-primary bg-primary text-white" : "border-border bg-card hover:border-[#00BAF2] hover:bg-accent")}>
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-md text-xs font-bold", scenario.id === sc.id ? "bg-[#00BAF2] text-white" : "bg-primary/10 text-primary")}>{sc.id}</span>
                  <span className="text-sm font-semibold">{sc.name}</span>
                </div>
                <div className={cn("mt-1 text-xs", scenario.id === sc.id ? "text-white/75" : "text-muted-foreground")}>{sc.note}</div>
              </button>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-6">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Ticket volume</div>
              <div className="flex gap-1.5">
                {SIM_SIZES.map((c) => <Button key={c} size="sm" variant={size === c ? "default" : "outline"} onClick={() => setSize(c)}>{c}</Button>)}
              </div>
            </div>
            <label className="text-xs font-medium text-muted-foreground">Seed
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} className="mt-1.5 block h-9 w-24 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <div className="text-xs text-muted-foreground">Same scenario, size and seed replay the same run.</div>
            <Badge variant="outline" className={cn("ml-auto", running ? "border-[#00BAF2] text-[#0098CC]" : finished ? "border-emerald-500/40 text-emerald-700" : "")}>
              {running ? "Running" : finished ? "Finished" : processed ? "Paused" : "Ready"}
            </Badge>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((100 * processed) / size)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-[#00BAF2] transition-[width] duration-500" style={{ width: `${(100 * processed) / size}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Tickets arrived" value={`${arrived} / ${size}`} />
        <Stat label="Processed" value={processed} tone="good" />
        <Stat label="Grouped into" value={`${grouped} incident${grouped === 1 ? "" : "s"}`} tone="sky" />
        <Stat label="Queue, workers" value={`${queue}, ${workers}`} tone="warn" sub="Workers scale 1 to 12 with queue depth" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold text-primary">Event stream</CardTitle><CardDescription>Newest first</CardDescription></CardHeader>
        <CardContent>
          {events.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Press Start to replay scenario {scenario.id} with {size} tickets.</p> : (
            <ol className="h-80 space-y-1 overflow-y-auto font-mono text-xs">
              {events.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground">{e.t}</span>
                  <span className={cn("w-12 shrink-0 font-semibold", e.level === "alert" ? "text-destructive" : e.level === "ok" ? "text-emerald-600" : "text-[#0098CC]")}>{e.level}</span>
                  <span className="text-foreground">{e.text}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
