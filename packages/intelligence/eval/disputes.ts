// Dispute eval (section 10 row "disputes"): 8 scripted cases against the decision table. No model involved.
import { readFile } from 'node:fs/promises';
import { decide, type DisputeFacts } from '../src/dispute/decide.js';

interface Case {
  id: string;
  facts: Omit<DisputeFacts, 'dueAt'> & { dueAt: string | null };
  expectedRecommendation: string;
  expectedEvidenceType: string | null;
}

export async function runDisputeEval() {
  const { now, cases } = JSON.parse(
    await readFile(new URL('./fixtures/disputes.json', import.meta.url), 'utf8'),
  ) as { now: string; cases: Case[] };
  const wrong = cases
    .filter((c) => {
      const d = decide(
        { ...c.facts, dueAt: c.facts.dueAt ? new Date(c.facts.dueAt) : null },
        new Date(now),
      );
      return (
        d.recommendation !== c.expectedRecommendation || d.evidenceType !== c.expectedEvidenceType
      );
    })
    .map((c) => c.id);
  const correct = cases.length - wrong.length;
  return {
    total: cases.length,
    correct,
    summary:
      `${correct} of ${cases.length}` + (wrong.length ? ` (wrong: ${wrong.join(', ')})` : ''),
  };
}
