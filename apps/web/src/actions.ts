import type { OrderDetail, HypothesisDetail, Message } from '@fairfold/contracts';
import { ApiClient, ApiError } from './api.js';
import { shortId, type PackState, type DisputeRecord } from './models.js';
import { review, capturePhoto, downloadPdf, type Field } from './interactions.js';

interface Site {
  api: ApiClient;
  order?: OrderDetail;
  pack?: PackState;
  dispute?: DisputeRecord;
  hypothesis?: HypothesisDetail;
  batch: string;
  busy: boolean;
  loading: boolean;
  generation: number;
  selectedOffer: string;
  pollRemaining: number;
  mutate(path: string, body: object | FormData): Promise<void>;
  loadView(): Promise<void>;
  redraw(): void;
  fail(error: unknown): void;
}
export function createActions(app: Site, dialogs = { review, capturePhoto, downloadPdf }) {
  let interacting = false;
  let generation = 0;
  const batchesByOrder: Record<string, Record<string, string>> = {};
  const submittedInspections: Record<string, string[]> = {};
  const run = (work: () => Promise<void>) => {
    if (interacting || app.busy || app.loading) return;
    interacting = true;
    generation = app.generation;
    void work()
      .catch((error: unknown) =>
        app.fail(
          error instanceof ApiError
            ? error
            : new ApiError(
                'INTERACTION_UNAVAILABLE',
                'Could not complete this interaction. Camera capture requires HTTPS or localhost and camera permission. Refresh before retrying.',
                409,
              ),
        ),
      )
      .finally(() => {
        interacting = false;
        app.redraw();
      });
  };
  const save = async (path: string, body: object | FormData) => {
    if (generation !== app.generation)
      throw new ApiError('VIEW_CHANGED', 'The view changed. Review the current record again.', 409);
    await app.mutate(path, body);
  };
  const batchFields = (): Field[] =>
    app.order?.items.map((item) => ({
      key: item.id,
      label: `${item.name} (${item.sku}) · batch code`,
      value: batchesByOrder[app.order!.id]?.[item.id] ?? item.batchCode ?? app.batch,
      required: true,
    })) ?? [];
  return {
    submittedInspections,
    shootPack: (label: string) =>
      run(async () => {
        const order = app.order;
        if (!order) return;
        const batches = await dialogs.review({
          title: `Capture ${label} · ${shortId(order.id)}`,
          text: 'Confirm the actual batch for every ordered item. The camera image will be hashed, timestamped and attested by the server.',
          approve: 'Open camera',
          fields: batchFields(),
        });
        if (!batches) return;
        batchesByOrder[order.id] = batches;
        const photo = await dialogs.capturePhoto(label);
        if (!photo) return;
        const form = new FormData();
        form.append('labels', label);
        form.append('batchCodes', JSON.stringify(batches));
        form.append('photos', photo, `${label}.jpg`);
        app.pollRemaining = 6;
        await save(`/api/orders/${order.id}/pack/photos`, form);
      }),
    seal: () =>
      run(async () => {
        const order = app.order,
          pack = app.pack;
        if (!order || !pack || order.shipment) return;
        if (
          pack.blockers.includes('ATTESTATION_MISMATCH') &&
          pack.attestation &&
          pack.attestation.status !== 'match'
        ) {
          const override = await dialogs.review({
            title: 'Review attestation override',
            text: `${pack.attestation.status}\n${JSON.stringify(pack.attestation.result, null, 2)}\n\nAn override is recorded in the proof ledger. It does not bypass any other seal check.`,
            approve: 'Record my override',
            fields: [
              { key: 'reason', label: 'Reason for overriding this attestation', required: true },
            ],
          });
          if (override)
            await save(`/api/orders/${order.id}/pack/override`, { reason: override.reason });
          return;
        }
        const result = await dialogs.review({
          title: `Seal ${shortId(order.id)}`,
          text: `Seal this order and queue its sandbox tracking push.\n${order.items.map((i) => `${i.name} × ${i.quantity}`).join('\n')}\n\nCurrent server blockers: ${pack.blockers.join(', ') || 'none'}. The server rechecks evidence, inventory and holds. Sealing does not confirm PayPal tracking success.`,
          approve: 'Seal and queue tracking',
          fields: [
            ...batchFields(),
            {
              key: 'carrier',
              label: 'Carrier',
              choices: ['DHL', 'FEDEX', 'UPS', 'INDIA_POST', 'IND_DELHIVERY', 'BLUEDART', 'OTHER'],
            },
            { key: 'carrierNameOther', label: 'Carrier name (required for OTHER)' },
            { key: 'trackingNumber', label: 'Actual tracking number', required: true },
            { key: 'packer', label: 'Packer / station', value: 'station-1', required: true },
          ],
        });
        if (!result) return;
        const batchCodes = Object.fromEntries(order.items.map((i) => [i.id, result[i.id]!]));
        batchesByOrder[order.id] = batchCodes;
        await save(`/api/orders/${order.id}/pack/seal`, {
          batchCodes,
          carrier: result.carrier,
          ...(result.carrierNameOther ? { carrierNameOther: result.carrierNameOther } : {}),
          trackingNumber: result.trackingNumber,
          packer: result.packer,
        });
      }),
    dispute: () =>
      run(async () => {
        const detail = app.dispute;
        if (!detail) return;
        const id = encodeURIComponent(detail.dispute.id),
          pack = detail.packs[0];
        if (!pack || pack.status === 'failed' || pack.status === 'stale') {
          await save(`/api/disputes/${id}/packs`, {});
          return;
        }
        if (pack.status !== 'draft') {
          await dialogs.review({
            title: `Pack ${pack.status}`,
            text: 'This pack has an approval or execution record. Refresh to observe the outcome. It is never automatically resubmitted.',
            approve: 'Close',
          });
          return;
        }
        if (pack.recommendation === 'inspect_first') {
          await dialogs.review({
            title: 'Inspection required',
            text: pack.narrative,
            approve: 'Close and inspect in Shared Cause',
          });
          return;
        }
        const params = pack.actionParams;
        const fields: Field[] = [];
        if (pack.recommendation === 'merchant_decides')
          fields.push({
            key: 'recommendation',
            label: 'Your decision',
            choices: ['provide_evidence', 'make_offer', 'accept_claim'],
          });
        if (pack.recommendation === 'make_offer' || pack.recommendation === 'merchant_decides')
          fields.push({
            key: 'offerType',
            label: 'PayPal allowed offer type (for make_offer)',
            choices: ['', ...(detail.dispute.allowedResponseOptions?.makeOffer?.offerTypes ?? [])],
            value: app.selectedOffer || params?.offerType,
          });
        if (pack.recommendation === 'accept_claim' || pack.recommendation === 'merchant_decides')
          fields.push({
            key: 'acceptClaimType',
            label: 'PayPal allowed accept-claim type (for accept_claim)',
            choices: [
              '',
              ...(detail.dispute.allowedResponseOptions?.acceptClaim?.acceptClaimTypes ?? []),
            ],
            value: params?.acceptClaimType,
          });
        if (pack.recommendation !== 'provide_evidence')
          fields.push(
            {
              key: 'amount',
              label: `Amount in ${params?.amount?.currency_code ?? detail.dispute.amount?.currency_code ?? 'USD'} (when required by the selected action)`,
              value: params?.amount?.value,
            },
            { key: 'note', label: 'Merchant note', value: params?.note },
          );
        const result = await dialogs.review({
          title: `Approve exact pack · ${detail.dispute.id}`,
          text: `${pack.narrative}\n\nRecommendation: ${pack.recommendation}\n${JSON.stringify({ evidences: pack.evidences, files: pack.files, actionParams: params }, null, 2)}\n\nApproval queues this exact pack for a sandbox PayPal action. PayPal decides the dispute.`,
          approve: 'Approve this exact pack and queue action',
          fields,
          attachment: pack.files.some((f) => f.mime === 'application/pdf')
            ? async () =>
                dialogs.downloadPdf(
                  await app.api.pdf(`/api/disputes/${id}/packs/${pack.id}/pdf`),
                  `fairfold-${detail.dispute.id}.pdf`,
                )
            : undefined,
        });
        if (!result) return;
        const recommendation = result.recommendation || pack.recommendation;
        app.pollRemaining = 4;
        await save(`/api/disputes/${id}/packs/${pack.id}/approve`, {
          ...(pack.recommendation === 'merchant_decides' ? { recommendation } : {}),
          ...(recommendation === 'make_offer' && result.offerType
            ? { offerType: result.offerType }
            : {}),
          ...(recommendation === 'accept_claim' && result.acceptClaimType
            ? { acceptClaimType: result.acceptClaimType }
            : {}),
          ...(result.amount
            ? {
                amount: {
                  currency_code:
                    params?.amount?.currency_code ?? detail.dispute.amount?.currency_code ?? 'USD',
                  value: result.amount,
                },
              }
            : {}),
          ...(result.note ? { note: result.note } : {}),
        });
      }),
    approve: (action: HypothesisDetail['actions'][number]) =>
      run(async () => {
        const hypothesis = app.hypothesis;
        if (!hypothesis || action.status !== 'proposed') return;
        const messages =
          action.type === 'send_buyer_messages'
            ? (await app.api.list<Message>('/api/merchant/messages')).filter(
                (m) => m.actionId === action.id,
              )
            : [];
        const accepted = await dialogs.review({
          title: `Approve ${action.type.replaceAll('_', ' ')}`,
          text: `${hypothesis.headline}\n\n${JSON.stringify(action.payload, null, 2)}\n${
            messages.length
              ? JSON.stringify(
                  messages.map((m) => ({
                    channel: m.channel,
                    orderId: m.orderId,
                    subject: m.subject,
                    body: m.body,
                  })),
                  null,
                  2,
                )
              : ''
          }\n\nOnly this proposed action is approved. Other actions require separate approval.`,
          approve: 'Approve this exact action',
        });
        if (accepted) {
          app.pollRemaining = 4;
          await save(`/api/shared-causes/${hypothesis.id}/actions/${action.id}/approve`, {});
        }
      }),
    inspect: () =>
      run(async () => {
        const hypothesis = app.hypothesis;
        if (!hypothesis) return;
        const batch =
          hypothesis.stats.primary.dimension === 'batch_code' ? hypothesis.stats.primary.value : '';
        const accepted = await dialogs.review({
          title: 'Photograph a distinct stock unit',
          text: 'An approved inspection rule must exist. Capture the exact view required by that rule. Only completed server attestations count toward confirmation.',
          approve: 'Open camera',
          fields: [
            { key: 'batch', label: 'Batch code', value: batch, required: true },
            {
              key: 'label',
              label: 'Required inspection photo label',
              value: 'seam_closeup',
              required: true,
            },
          ],
        });
        if (!accepted) return;
        const photo = await dialogs.capturePhoto(accepted.label!);
        if (!photo) return;
        const form = new FormData();
        form.append('labels', accepted.label!);
        form.append('photos', photo, 'inspection.jpg');
        if (generation !== app.generation) return;
        app.busy = true;
        try {
          const result = await app.api.request<{ photoShas: string[] }>(
            `/api/shared-causes/${hypothesis.id}/inspections?batchCode=${encodeURIComponent(accepted.batch!)}`,
            form,
          );
          submittedInspections[hypothesis.id] = [
            ...(submittedInspections[hypothesis.id] ?? []),
            ...result.photoShas,
          ];
          await app.loadView();
        } finally {
          app.busy = false;
        }
      }),
    decide: (decision: 'confirm' | 'dismiss') =>
      run(async () => {
        const hypothesis = app.hypothesis;
        if (!hypothesis || hypothesis.status !== 'open') return;
        const result = await dialogs.review({
          title: `${decision === 'confirm' ? 'Confirm' : 'Dismiss'} shared cause`,
          text: `${hypothesis.headline}\n\n${hypothesis.explanation}\n\nConfirmation requires actual inspection attestations. Resulting actions still need separate approval.`,
          approve:
            decision === 'confirm'
              ? 'Confirm from server inspection results'
              : 'Dismiss with my reason',
          fields:
            decision === 'dismiss' ? [{ key: 'reason', label: 'Reason', required: true }] : [],
        });
        if (result)
          await save(
            `/api/shared-causes/${hypothesis.id}/${decision}`,
            decision === 'dismiss' ? { reason: result.reason } : {},
          );
      }),
  };
}
