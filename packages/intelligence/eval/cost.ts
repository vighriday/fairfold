// Cost note from the call logs (section 10): every model call through packages/ai writes one JSON line
// (event ai_call / ai_embed). This summarises a captured log by component and model — calls, outcomes,
// tokens and median latency — so the README's cost note is measured, not estimated. Prices are not
// built in: multiply the token totals by the provider's current published rates.
//   pnpm --filter @fairfold/intelligence eval > eval.log && pnpm --filter @fairfold/intelligence cost eval.log
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export interface CostRow {
  component: string;
  model: string;
  calls: number;
  ok: number;
  failed: number;
  notConfigured: number;
  inputTokens: number;
  outputTokens: number;
  medianLatencyMs: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export function summariseCalls(lines: string[]): CostRow[] {
  const groups = new Map<string, CostRow & { latencies: number[] }>();
  for (const raw of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (e.event !== 'ai_call' && e.event !== 'ai_embed') continue;
    const component = typeof e.component === 'string' ? e.component : 'unknown';
    const model =
      e.embedding === 'local'
        ? 'local'
        : e.model === 'none'
          ? 'none'
          : `${String(e.provider ?? 'unknown')}/${String(e.model ?? 'unknown')}`;
    const key = `${component}\u0000${model}`;
    const g = groups.get(key) ?? {
      component,
      model,
      calls: 0,
      ok: 0,
      failed: 0,
      notConfigured: 0,
      inputTokens: 0,
      outputTokens: 0,
      medianLatencyMs: 0,
      latencies: [],
    };
    g.calls += 1;
    if (e.event === 'ai_embed') {
      g.ok += 1;
      g.inputTokens += num(e.tokens);
      if (model !== 'local') g.latencies.push(num(e.latencyMs));
    } else if (e.error === 'model_not_configured') {
      g.notConfigured += 1;
    } else {
      if (e.ok === true) g.ok += 1;
      else g.failed += 1;
      g.inputTokens += num(e.inputTokens);
      g.outputTokens += num(e.outputTokens);
      g.latencies.push(num(e.latencyMs));
    }
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ latencies, ...row }) => ({ ...row, medianLatencyMs: median(latencies) }))
    .sort((a, b) => a.component.localeCompare(b.component) || a.model.localeCompare(b.model));
}

export function renderCostTable(rows: CostRow[]): string {
  if (!rows.length) return 'No model calls in the log.\n';
  const lines = [
    '| Component | Model | Calls | OK | Failed | Not configured | Input tokens | Output tokens | Median latency (ms) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.component} | ${r.model} | ${r.calls} | ${r.ok} | ${r.failed} | ${r.notConfigured} | ${r.inputTokens} | ${r.outputTokens} | ${r.medianLatencyMs} |`,
    ),
  ];
  const sum = (k: keyof CostRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  lines.push(
    `| **Total** | | ${sum('calls')} | ${sum('ok')} | ${sum('failed')} | ${sum('notConfigured')} | ${sum('inputTokens')} | ${sum('outputTokens')} | |`,
  );
  return `${lines.join('\n')}\n`;
}

async function main(path: string | undefined): Promise<void> {
  if (!path) throw new Error('Usage: cost <log file of JSON lines>');
  const text = await readFile(path, 'utf8');
  process.stdout.write(renderCostTable(summariseCalls(text.split(/\r?\n/))));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv[2]);
