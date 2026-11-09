// Clustering eval (section 10 row "complaints"): the Complaint Reader extracts each of the 24 texts, code embeds
// and groups them exactly as the scan does, and pairwise precision is measured against the written clusters.
import { readFile } from 'node:fs/promises';
import {
  embed,
  hasModelConfig,
  type EmbeddingModel,
  type Env,
  type LanguageModel,
} from '@fairfold/ai';
import { assignClusters } from '../src/sharedCause/grouping.js';
import { embeddingText, extractComplaint, localEmbedding } from '../src/sharedCause/reader.js';
import { sharedCauseConfig } from '../src/sharedCause/stats.js';

interface EvalComplaint {
  id: string;
  product: string;
  expectedCluster: string | null;
  text: string;
}

/** Pairwise precision: of the pairs placed together, the share that belong together. 1 when no pair was formed. */
export function pairwisePrecision(
  predicted: Map<string, string>,
  truth: Map<string, string | null>,
): { precision: number; pairs: number } {
  const ids = [...predicted.keys()];
  let together = 0;
  let correct = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      if (predicted.get(ids[i]!) !== predicted.get(ids[j]!)) continue;
      together += 1;
      const a = truth.get(ids[i]!);
      const b = truth.get(ids[j]!);
      if (a !== null && a !== undefined && a === b) correct += 1;
    }
  return { precision: together ? correct / together : 1, pairs: together };
}

export function complaintEvalConfigured(env: Env = process.env): boolean {
  return hasModelConfig('text', env);
}

export async function runComplaintEval(
  opts: { model?: LanguageModel; embedder?: EmbeddingModel; env?: Env } = {},
) {
  const env = opts.env ?? process.env;
  const { eval: items } = JSON.parse(
    await readFile(new URL('./fixtures/complaints.json', import.meta.url), 'utf8'),
  ) as { eval: EvalComplaint[] };
  const extracted = [];
  for (const c of items) extracted.push({ c, ...(await extractComplaint(c.text, [], opts.model)) });
  const texts = extracted.map((x) => embeddingText(x.extraction));
  const useProvider = Boolean(opts.embedder) || hasModelConfig('embedding', env);
  const vectors = useProvider
    ? await embed(texts, { model: opts.embedder, component: 'complaint_eval' })
    : texts.map(localEmbedding);
  const base = new Date('2026-11-01T00:00:00Z');
  let n = 0;
  const { assignments } = assignClusters(
    extracted.map((x, i) => ({
      id: x.c.id,
      orderId: x.c.id,
      productId: x.c.product,
      category: x.extraction.category,
      createdAt: new Date(base.getTime() + i * 60_000),
      embedding: vectors[i]!,
      clusterId: null,
    })),
    [],
    sharedCauseConfig(env).clusterSimilarity,
    new Date('2026-11-09T00:00:00Z'),
    () => `cl-${++n}`,
  );
  const truth = new Map(items.map((c) => [c.id, c.expectedCluster]));
  const { precision, pairs } = pairwisePrecision(assignments, truth);
  const summary = `${precision.toFixed(2)} over ${pairs} grouped pairs (${useProvider ? 'provider' : 'local'} embeddings)`;
  return { precision, pairs, summary };
}
