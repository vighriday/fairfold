// The section 10 eval table. Results are filled in by the eval runner as each phase lands.
export const EVAL_ROWS = [
  { id: 'photos', set: 'Packing photos the team takes of 4 garments, with labels', size: '20 sets, 5 with a deliberate mismatch',
    metric: 'Mismatch caught; batch label read', target: '≥ 18 of 20; ≥ 16 of 20' },
  { id: 'complaints', set: 'Complaint texts', size: '24, written to form 3 true clusters plus noise',
    metric: 'Pairwise clustering precision', target: '≥ 0.85' },
  { id: 'b17_seed', set: 'B17 seed (section 19)', size: '1 scenario',
    metric: 'Primary hypothesis is batch_code = B17, strong', target: 'Exact' },
  { id: 'null_seed', set: 'Null seed (same volume, no defect)', size: '1 scenario',
    metric: 'No hypothesis raised', target: 'Exact' },
  { id: 'disputes', set: 'Disputes', size: '8 scripted cases',
    metric: 'Recommendation equals the decision table', target: '8 of 8' },
  { id: 'buyers', set: 'Buyer profiles', size: '30 synthetic',
    metric: 'Band equals the expected band', target: '30 of 30' },
] as const;

export type EvalRowId = (typeof EVAL_ROWS)[number]['id'];

export function renderEvalTable(results: Partial<Record<EvalRowId, string>>): string {
  const lines = ['| Set | Size | Metric | Target | Result |', '|---|---|---|---|---|'];
  for (const row of EVAL_ROWS) {
    lines.push(`| ${row.set} | ${row.size} | ${row.metric} | ${row.target} | ${results[row.id] ?? 'not run'} |`);
  }
  return `${lines.join('\n')}\n`;
}
