// Dispute narrative (section 10): the model writes only from a code-built fact list; a post-check rejects any
// number or date not in the facts and falls back to the template. The fact list never mentions shared causes.
import { z } from 'zod';
import { generateStructured, type LanguageModel } from '@fairfold/ai';
import type { Money } from '@fairfold/contracts';

export const MAX_NARRATIVE = 2000;

const REASON_TEXT: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'item not as described',
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'item not received',
  UNAUTHORISED: 'unauthorised transaction',
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export interface NarrativeInput {
  reason: string;
  amount: Money;
  invoiceId: string | null;
  capturedAt: Date | null;
  sealedAt: Date | null;
  shipment: { carrier: string; trackingNumber: string; deliveredAt: Date | null } | null;
  attestation: { status: string; photoCount: number } | null;
  ledger: { verified: boolean; entries: number } | null;
}

export function narrativeFacts(i: NarrativeInput): string[] {
  const facts = [
    `The buyer opened a dispute for ${REASON_TEXT[i.reason] ?? i.reason} for ${i.amount.currency_code} ${i.amount.value}.`,
  ];
  if (i.invoiceId && i.capturedAt)
    facts.push(`Order ${i.invoiceId} was paid on ${day(i.capturedAt)}.`);
  if (i.sealedAt) facts.push(`The parcel was sealed on ${day(i.sealedAt)}.`);
  if (i.attestation) {
    const verdict =
      i.attestation.status === 'match'
        ? 'were checked against the order items and matched'
        : i.attestation.status === 'mismatch'
          ? 'were checked against the order items and did not match'
          : 'were taken but could not be fully verified';
    facts.push(`Before sealing, ${i.attestation.photoCount} packing photos ${verdict}.`);
  }
  if (i.shipment) {
    facts.push(
      `It was shipped with ${i.shipment.carrier}, tracking number ${i.shipment.trackingNumber}.`,
    );
    if (i.shipment.deliveredAt)
      facts.push(`The carrier recorded delivery on ${day(i.shipment.deliveredAt)}.`);
  }
  if (i.ledger)
    facts.push(
      `The order's tamper-evident record has ${i.ledger.entries} entries and its hash chain ${i.ledger.verified ? 'verifies' : 'does not verify'}.`,
    );
  return facts;
}

const numbers = (text: string) => (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Every number in the narrative (dates included, compared by value) must appear in the facts. */
export function isGrounded(narrative: string, facts: string[]): boolean {
  const allowed = new Set(numbers(facts.join(' ')));
  return numbers(narrative).every((n) => allowed.has(n));
}

export function templateNarrative(facts: string[]): string {
  const text = facts.join(' ');
  return text.length <= MAX_NARRATIVE ? text : `${text.slice(0, MAX_NARRATIVE - 1).trimEnd()}…`;
}

const NarrativeSchema = z.object({ narrative: z.string().min(1).max(MAX_NARRATIVE) });

const SYSTEM = [
  'You write the short statement a merchant files with PayPal in a buyer dispute.',
  'Use only the facts given, in plain neutral English, in at most 6 sentences.',
  'Do not add any number, date, name or claim that is not in the facts. Do not argue or speculate.',
].join(' ');

export async function writeNarrative(
  facts: string[],
  model?: LanguageModel,
): Promise<{ text: string; usedTemplate: boolean }> {
  const template = templateNarrative(facts);
  const out = await generateStructured({
    schema: NarrativeSchema,
    system: SYSTEM,
    user: `Facts:\n${facts.map((f) => `- ${f}`).join('\n')}`,
    kind: 'text',
    component: 'dispute_narrative',
    fallback: () => ({ narrative: template }),
    model,
  });
  const text = out.value.narrative.trim();
  if (out.usedFallback || !isGrounded(text, facts)) return { text: template, usedTemplate: true };
  return { text, usedTemplate: false };
}
