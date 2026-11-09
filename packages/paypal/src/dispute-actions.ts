import { AppError, type PayPalClient } from '@fairfold/contracts';
import { type PayPalTransport } from './transport.js';
import { formatMoney, moneyMinor } from './money.js';
import { inputText, invalidInput, object } from './validation.js';
import { disputeId, inputObject } from './dispute-validation.js';

type Actions = Omit<PayPalClient['disputes'], 'list' | 'get'>;
function positiveMoney(input: Parameters<typeof moneyMinor>[0]) {
  const minor = moneyMinor(input);
  if (minor === 0n) return invalidInput('positive dispute amount');
  return formatMoney(input.currency_code, minor);
}
function returnReview(): never {
  throw new AppError(
    'PAYPAL_RETURN_ADDRESS_REVIEW_REQUIRED',
    'Return-based action requires the existing Q2 contract review',
    409,
  );
}

/** Low-level bindings only. H4 must supply approved ownership/stage/replay control. */
export function createDisputeActionOperations(transport: PayPalTransport): Actions {
  function post(
    id: string,
    action: string,
    body: unknown,
    opts: Parameters<Actions['sendMessage']>[2],
  ) {
    disputeId(id);
    return transport.requestValidated(
      {
        method: 'POST',
        path: `/v1/customer/disputes/${id}/${action}`,
        body,
        opts,
        retrySafe: false,
      },
      object,
    );
  }
  return {
    async provideEvidence(id, evidences, files, opts) {
      disputeId(id);
      if (!Array.isArray(evidences) || evidences.length < 1 || evidences.length > 100)
        return invalidInput('evidence count');
      if (!Array.isArray(files) || files.some((file) => !file || typeof file !== 'object'))
        return invalidInput('evidence files');
      for (const item of evidences) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          return invalidInput('evidence');
        const evidence = item as Record<string, unknown>;
        const type = inputText(evidence.evidence_type, 'evidence type', 255);
        if (!/^[A-Z_]+$/.test(type)) return invalidInput('evidence type');
        if (evidence.notes !== undefined) inputText(evidence.notes, 'evidence notes', 2000);
        if (evidence.documents !== undefined) {
          if (!Array.isArray(evidence.documents) || !evidence.documents.length)
            return invalidInput('evidence documents');
          for (const document of evidence.documents) {
            const name = inputText(
              inputObject(document, ['name'], 'evidence document').name,
              'evidence document name',
              2000,
            );
            if (!Array.isArray(files) || !files.some((file) => file.filename === name))
              return invalidInput('evidence document attachment');
          }
        }
      }
      return transport.requestValidated(
        {
          method: 'POST',
          path: `/v1/customer/disputes/${id}/provide-evidence`,
          multipart: { input: { evidences }, files },
          opts,
          retrySafe: false,
        },
        object,
      );
    },
    makeOffer(id, input, opts) {
      inputObject(input, ['note', 'offerType', 'offerAmount', 'invoiceId'], 'offer');
      const note = inputText(input.note, 'offer note', 2000);
      if (input.offerType === 'REFUND_WITH_RETURN') return returnReview();
      if (
        !['REFUND', 'REFUND_WITH_REPLACEMENT', 'REPLACEMENT_WITHOUT_REFUND'].includes(
          input.offerType,
        )
      )
        return invalidInput('offer type');
      const body: Record<string, unknown> = { note, offer_type: input.offerType };
      if (input.offerType === 'REPLACEMENT_WITHOUT_REFUND') {
        if (input.offerAmount !== undefined)
          return invalidInput('replacement without refund amount');
      } else {
        if (input.offerAmount === undefined) return invalidInput('required offer amount');
        body.offer_amount = positiveMoney(input.offerAmount);
      }
      if (input.invoiceId !== undefined)
        body.invoice_id = inputText(input.invoiceId, 'offer invoice ID', 127);
      return post(id, 'make-offer', body, opts);
    },
    acceptClaim(id, input, opts) {
      inputObject(input, ['note', 'acceptClaimType', 'refundAmount'], 'accept claim');
      const body: Record<string, unknown> = {
        note: inputText(input.note, 'accept claim note', 2000),
      };
      if (input.acceptClaimType === 'REFUND_WITH_RETURN') return returnReview();
      if (input.acceptClaimType !== undefined) {
        if (!['REFUND', 'PARTIAL_REFUND'].includes(input.acceptClaimType))
          return invalidInput('accept claim type');
        body.accept_claim_type = input.acceptClaimType;
      }
      if (input.acceptClaimType === 'PARTIAL_REFUND') {
        if (input.refundAmount === undefined) return invalidInput('required partial refund amount');
        body.refund_amount = positiveMoney(input.refundAmount);
      } else if (input.refundAmount !== undefined) return invalidInput('full claim refund amount');
      return post(id, 'accept-claim', body, opts);
    },
    sendMessage(id, message, opts) {
      return post(
        id,
        'send-message',
        { message: inputText(message, 'dispute message', 2000) },
        opts,
      );
    },
    sandboxAdjudicate(id, outcome, opts) {
      if (!['BUYER_FAVOR', 'SELLER_FAVOR'].includes(outcome))
        return invalidInput('sandbox adjudication outcome');
      return post(id, 'adjudicate', { adjudication_outcome: outcome }, opts);
    },
    sandboxRequireEvidence(id, action, opts) {
      if (!['BUYER_EVIDENCE', 'SELLER_EVIDENCE'].includes(action))
        return invalidInput('sandbox evidence action');
      return post(id, 'require-evidence', { action }, opts);
    },
  };
}
