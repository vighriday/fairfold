import { describe, expect, it } from 'vitest';
import { EVAL_ROWS, renderEvalTable } from '../eval/table.ts';

describe('eval table', () => {
  it('has the six rows of section 10 in order', () => {
    expect(EVAL_ROWS.map((r) => r.id)).toEqual(['photos', 'complaints', 'b17_seed', 'null_seed', 'disputes', 'buyers']);
  });

  it('prints every row as not run when nothing has run', () => {
    const lines = renderEvalTable({}).trim().split('\n');
    expect(lines[0]).toBe('| Set | Size | Metric | Target | Result |');
    expect(lines[1]).toBe('|---|---|---|---|---|');
    expect(lines).toHaveLength(8);
    for (const line of lines.slice(2)) expect(line.endsWith('| not run |')).toBe(true);
    expect(lines[2]).toContain('≥ 18 of 20; ≥ 16 of 20');
    expect(lines[6]).toContain('8 of 8');
    expect(lines[7]).toContain('30 of 30');
  });

  it('prints a recorded result in place of not run', () => {
    const out = renderEvalTable({ disputes: '8 of 8 ✅' });
    expect(out).toContain('| Recommendation equals the decision table | 8 of 8 | 8 of 8 ✅ |');
  });
});
