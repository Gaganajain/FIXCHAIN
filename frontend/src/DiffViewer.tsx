type Row = { l?: { n: number; text: string; kind: "same" | "del" }; r?: { n: number; text: string; kind: "same" | "add" } };

/** Line-level LCS diff aligned into side-by-side rows. */
function diffRows(a: string, b: string): Row[] {
  const A = a.split("\n"), B = b.split("\n");
  const m = A.length, n = B.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: Row[] = [];
  let i = 0, j = 0;
  let dels: Row["l"][] = [], adds: Row["r"][] = [];
  const flush = () => {
    const k = Math.max(dels.length, adds.length);
    for (let x = 0; x < k; x++) rows.push({ l: dels[x], r: adds[x] });
    dels = [];
    adds = [];
  };
  while (i < m || j < n) {
    if (i < m && j < n && A[i] === B[j]) {
      flush();
      rows.push({ l: { n: i + 1, text: A[i], kind: "same" }, r: { n: j + 1, text: B[j], kind: "same" } });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      adds.push({ n: j + 1, text: B[j], kind: "add" }); j++;
    } else {
      dels.push({ n: i + 1, text: A[i], kind: "del" }); i++;
    }
  }
  flush();
  return rows;
}

/** Keep changed rows plus `ctx` lines of context; collapse the rest. */
function withContext(rows: Row[], ctx: number) {
  const changed = rows.map((r) => r.l?.kind === "del" || r.r?.kind === "add");
  const keep = rows.map((_, idx) => changed.slice(Math.max(0, idx - ctx), idx + ctx + 1).some(Boolean));
  const out: (Row | { gap: number })[] = [];
  let gap = 0;
  rows.forEach((r, idx) => {
    if (keep[idx]) {
      if (gap) out.push({ gap });
      gap = 0;
      out.push(r);
    } else gap++;
  });
  if (gap) out.push({ gap });
  return out;
}

function Cell({ side, c }: { side: "l" | "r"; c?: { n: number; text: string; kind: string } }) {
  const bg = !c ? "bg-raised/40" : c.kind === "del" ? "bg-critical/15" : c.kind === "add" ? "bg-good/15" : "";
  const mark = !c ? "" : c.kind === "del" ? "−" : c.kind === "add" ? "+" : " ";
  const markColor = c?.kind === "del" ? "text-critical" : "text-good";
  return (
    <div className={`flex min-w-0 ${bg} ${side === "l" ? "border-r border-line" : ""}`}>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-ink-3">{c?.n ?? ""}</span>
      <span className={`w-4 shrink-0 select-none ${markColor}`}>{mark}</span>
      <span className="whitespace-pre-wrap break-all pr-3 text-ink">{c?.text ?? ""}</span>
    </div>
  );
}

export function DiffViewer({ original, patched, file, context = 4 }: {
  original: string; patched: string; file: string; context?: number;
}) {
  const rows = withContext(diffRows(original, patched), context);
  return (
    <div className="overflow-hidden rounded-md border border-line font-mono text-[12px] leading-5">
      <div className="grid grid-cols-2 border-b border-line bg-raised text-[11px] font-sans font-medium text-ink-2">
        <div className="border-r border-line px-3 py-1.5">Original · {file} <span className="text-critical">(live, buggy)</span></div>
        <div className="px-3 py-1.5">Patched · {file} <span className="text-good">(sandbox)</span></div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {rows.map((r, idx) =>
          "gap" in r ? (
            <div key={idx} className="border-y border-line bg-raised/60 px-3 py-0.5 text-center text-[11px] text-ink-3">
              ⋯ {r.gap} unchanged line{r.gap > 1 ? "s" : ""}
            </div>
          ) : (
            <div key={idx} className="grid grid-cols-2">
              <Cell side="l" c={r.l} />
              <Cell side="r" c={r.r} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
