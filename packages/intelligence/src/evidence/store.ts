// EvidenceStore backed by Hriday's packages: drizzle tables, blobs.get and ledger.append (section 7).
import { and, eq, inArray } from 'drizzle-orm';
import { AppError, type AttestInput } from '@fairfold/contracts';
import {
  attestations,
  complaint_clusters,
  hypotheses,
  inspection_rules,
  order_items,
  orders,
  products,
} from '@fairfold/db';
import { createBlobStore, createLedger } from '@fairfold/ledger';
import type { IntelRuntime } from '../runtime.js';
import type { AttestationRow, EvidenceStore, LedgerAttestationEntry } from './handlers.js';

type Rule = NonNullable<AttestInput['inspectionRule']>;

async function ruleWithLabel(
  rt: IntelRuntime,
  where: ReturnType<typeof and>,
): Promise<Rule | null> {
  const [row] = await rt.db
    .select({
      instruction: inspection_rules.instruction,
      requiredPhotoLabel: inspection_rules.required_photo_label,
      clusterLabel: complaint_clusters.label,
    })
    .from(inspection_rules)
    .leftJoin(hypotheses, eq(hypotheses.id, inspection_rules.created_by_hypothesis_id))
    .leftJoin(complaint_clusters, eq(complaint_clusters.id, hypotheses.cluster_id))
    .where(where)
    .limit(1);
  if (!row) return null;
  return {
    instruction: row.instruction,
    requiredPhotoLabel: row.requiredPhotoLabel,
    clusterLabel: row.clusterLabel ?? 'reported issue',
  };
}

export function dbEvidenceStore(rt: IntelRuntime): EvidenceStore {
  const blobs = createBlobStore(rt.db, rt.clock);
  return {
    async loadOrderForAttestation(orderId, batchCodes) {
      const [order] = await rt.db
        .select({ merchantId: orders.merchant_id })
        .from(orders)
        .where(eq(orders.id, orderId));
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
      const items = await rt.db
        .select({
          orderItemId: order_items.id,
          name: order_items.name,
          sku: order_items.sku,
          colour: products.colour,
          size: products.size,
          quantity: order_items.quantity,
        })
        .from(order_items)
        .innerJoin(products, eq(products.id, order_items.product_id))
        .where(eq(order_items.order_id, orderId));
      const codes = [...new Set(Object.values(batchCodes))];
      const inspectionRule = codes.length
        ? await ruleWithLabel(
            rt,
            and(
              eq(inspection_rules.merchant_id, order.merchantId),
              eq(inspection_rules.active, true),
              inArray(inspection_rules.batch_code, codes),
            ),
          )
        : null;
      return { items, inspectionRule };
    },

    async loadInspectionRule(hypothesisId, batchCode) {
      const rule = await ruleWithLabel(
        rt,
        and(
          eq(inspection_rules.created_by_hypothesis_id, hypothesisId),
          eq(inspection_rules.batch_code, batchCode),
        ),
      );
      if (!rule)
        throw new AppError('INSPECTION_RULE_NOT_FOUND', 'No inspection rule for this batch', 404);
      return rule;
    },

    async loadPhoto(sha256) {
      const blob = await blobs.get(sha256);
      return { mime: blob.mime, bytes: new Uint8Array(blob.bytes!) };
    },

    async insertAttestation(
      row: AttestationRow,
      ledgerEntry?: (attestationId: string) => LedgerAttestationEntry,
    ) {
      return rt.db.transaction(async (tx) => {
        const [stored] = await tx
          .insert(attestations)
          .values(attestationValues(row, rt))
          .returning({ id: attestations.id });
        if (ledgerEntry) {
          if (!row.orderId)
            throw new Error('A ledger entry needs an order; inspection attestations have none');
          await createLedger(tx, rt.clock).append(row.orderId, ledgerEntry(stored!.id));
        }
        return stored!.id;
      });
    },
  };
}

function attestationValues(row: AttestationRow, rt: IntelRuntime) {
  return {
    order_id: row.orderId,
    hypothesis_id: row.hypothesisId,
    batch_code: row.batchCode,
    step: row.step,
    photo_shas: row.photoShas,
    photo_labels: row.photoLabels,
    model: row.model,
    result: row.result,
    status: row.status,
    confidence: row.confidence,
    created_at: rt.clock.now(),
  };
}
