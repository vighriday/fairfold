// pnpm --filter intelligence eval — prints the section 10 eval table as Markdown for the README.
// Each phase registers its eval here as it lands; rows without one print "not run".
import { fileURLToPath } from 'node:url';
import { runBuyerEval } from './buyers.js';
import { complaintEvalConfigured, runComplaintEval } from './complaints.js';
import { runDisputeEval } from './disputes.js';
import { photoEvalConfigured, runPhotoEval } from './photos.js';
import { runB17Eval, runNullEval } from './sharedCause.js';
import { renderEvalTable, type EvalRowId } from './table.js';

type EvalFn = () => Promise<string>;

// Model answers are cached by input hash so a run cut short by free-tier quota resumes without paying twice
// (packages/ai cache, DECISIONS.md I-D15). The cache lives in the ignored .work/ directory.
process.env.AI_CACHE_DIR ||= fileURLToPath(new URL('../../../.work/ai-cache', import.meta.url));

const NOT_CONFIGURED = 'not run (set AI_PROVIDER, AI_MODEL_VISION and the provider key)';

const evals: Partial<Record<EvalRowId, EvalFn>> = {
  buyers: async () => (await runBuyerEval()).summary,
  disputes: async () => (await runDisputeEval()).summary,
  complaints: async () =>
    complaintEvalConfigured()
      ? (await runComplaintEval()).summary
      : 'not run (set AI_PROVIDER, AI_MODEL_TEXT and the provider key)',
  b17_seed: runB17Eval,
  null_seed: runNullEval,
  photos: async () => (photoEvalConfigured() ? (await runPhotoEval()).summary : NOT_CONFIGURED),
};

async function main(): Promise<void> {
  const results: Partial<Record<EvalRowId, string>> = {};
  for (const [id, run] of Object.entries(evals) as Array<[EvalRowId, EvalFn]>) {
    try {
      results[id] = await run();
    } catch (err) {
      results[id] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  process.stdout.write(renderEvalTable(results));
}

await main();
