import { createHash } from 'node:crypto';
import { AppError } from '@fairfold/contracts';
import { canonicalJson } from '@fairfold/ledger';
import { sanitizeBuyerNotes } from './buyer-note-policy.js';

const symbolPattern = /^[A-Z][A-Z0-9_]{0,127}$/;
const datePattern =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const moneyPattern = /^\d{1,10}(?:\.\d{1,2})?$/;
const contactClausePattern = /\b(?:e-?mail|address|ship\s+to|deliver\s+to)\s*:/iu;
const addressPattern =
  /\b\d{1,6}\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,5}\s+(?:street|st|road|rd|avenue|ave|lane|ln|boulevard|blvd|drive|dr|court|ct|way|place|pl)\b/iu;
const emailPattern = /\S+@\S+\.[^\s.]+/gu;
const linkPattern = /(?:https?:\/\/|mailto:|tel:)\S+/giu;

export type SanitizedDisputeMessage = {
  posted_by: 'BUYER' | 'SELLER' | 'ARBITER';
  time_posted: string;
  content: string;
  fingerprint: string;
};

export type SanitizedDispute = {
  dispute_id: string;
  create_time?: string;
  update_time?: string;
  reason: string;
  status: string;
  dispute_life_cycle_stage?: string;
  dispute_channel?: string;
  dispute_amount?: { currency_code: string; value: string };
  seller_response_due_date?: string;
  buyer_response_due_date?: string;
  dispute_outcome?: {
    outcome_code: string;
    amount_refunded?: { currency_code: string; value: string };
  };
  disputed_transactions: Array<{
    seller_transaction_id: string;
    items?: Array<Record<string, unknown>>;
  }>;
  extensions?: Record<string, unknown>;
  supporting_info?: Array<{ source: 'SUBMITTED_BY_BUYER'; notes: string }>;
  offer?: { history: Array<{ actor: 'BUYER'; notes: string }> };
  allowed_response_options?: {
    make_offer?: { offer_types: string[] };
    accept_claim?: { accept_claim_types: string[] };
  };
  evidences: Array<{
    evidence_type: string;
    source: string;
    date?: string;
    item_id?: string;
    notes?: string;
  }>;
  messages: SanitizedDisputeMessage[];
  message_fingerprints: string[];
};

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, maximum = 255): string {
  if (typeof value !== 'string' || value.length === 0 || [...value].length > maximum)
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return value;
}

function symbol(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!symbolPattern.test(text))
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return text;
}

function symbolArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return value.map((item) => symbol(item, field));
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = requiredText(value, field, 64);
  if (!datePattern.test(text) || !Number.isFinite(new Date(text).getTime()))
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return new Date(text).toISOString();
}

function money(value: unknown, field: string): { currency_code: string; value: string } {
  const input = record(value, field);
  const currency = requiredText(input.currency_code, `${field}.currency_code`, 3);
  const amount = requiredText(input.value, `${field}.value`, 13);
  if (!/^[A-Z]{3}$/.test(currency) || !moneyPattern.test(amount))
    throw new AppError('DISPUTE_DETAIL_INVALID', `Dispute ${field} is invalid`, 502);
  return { currency_code: currency, value: amount };
}

function optionalMoney(value: unknown, field: string) {
  return value === undefined || value === null ? undefined : money(value, field);
}

function normalizeContact(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    )
      return true;
  }
  return false;
}

export function redactDisputeText(
  value: unknown,
  context: { knownEmails?: string[]; knownStreetLines?: string[] } = {},
): string {
  if (typeof value !== 'string' || value.length > 2000 || hasControlCharacters(value))
    throw new AppError(
      'DISPUTE_TEXT_REVIEW_REQUIRED',
      'Dispute message requires privacy review',
      409,
    );
  let text = value.normalize('NFC').replace(/\r\n?/gu, '\n');
  const emails = (context.knownEmails ?? []).map(normalizeContact);
  const streets = (context.knownStreetLines ?? []).map(normalizeContact);
  // Remove whole URL tokens before matching emails inside their query strings.
  text = text.replace(linkPattern, '[LINK_REDACTED]');
  for (const email of emails) {
    if (email.length >= 4)
      text = text.replace(new RegExp(escaped(email), 'giu'), '[CONTACT_REDACTED]');
  }
  for (const street of streets) {
    if (street.length >= 4 && /[A-Za-z]/u.test(street))
      text = text.replace(
        new RegExp(
          `(?<![\\p{L}\\p{N}])${street.split(/\s+/u).map(escaped).join('\\s+')}(?![\\p{L}\\p{N}])`,
          'giu',
        ),
        '[CONTACT_REDACTED]',
      );
  }
  text = text.replace(emailPattern, '[CONTACT_REDACTED]').replace(linkPattern, '[LINK_REDACTED]');
  const withoutRedactedClauses = text.replace(
    /\b(?:e-?mail|address|ship\s+to|deliver\s+to)\s*:\s*(?:\[CONTACT_REDACTED\]|\[LINK_REDACTED\])(?=\s*(?:$|[.;,!?\n]))/gimu,
    '',
  );
  if (
    withoutRedactedClauses.includes('@') ||
    /%40/iu.test(withoutRedactedClauses) ||
    contactClausePattern.test(withoutRedactedClauses) ||
    addressPattern.test(withoutRedactedClauses)
  )
    throw new AppError(
      'DISPUTE_TEXT_REVIEW_REQUIRED',
      'Dispute message requires privacy review',
      409,
    );
  return text;
}

function fingerprint(message: Omit<SanitizedDisputeMessage, 'fingerprint'>): string {
  return createHash('sha256').update(canonicalJson(message)).digest('hex');
}

export function sanitizeDisputeDetail(
  input: unknown,
  context: { knownEmails?: string[]; knownStreetLines?: string[] } = {},
): SanitizedDispute {
  const source = record(input, 'body');
  const extra = sanitizeBuyerNotes(source, (text) => redactDisputeText(text, context));
  const disputeId = requiredText(source.dispute_id, 'dispute_id');
  if (!/^[A-Za-z0-9-]+$/.test(disputeId))
    throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute dispute_id is invalid', 502);
  const output: SanitizedDispute = {
    dispute_id: disputeId,
    create_time: optionalDate(source.create_time, 'create_time'),
    update_time: optionalDate(source.update_time, 'update_time'),
    reason: symbol(source.reason, 'reason'),
    status: symbol(source.status, 'status'),
    dispute_life_cycle_stage:
      source.dispute_life_cycle_stage === undefined
        ? undefined
        : symbol(source.dispute_life_cycle_stage, 'dispute_life_cycle_stage'),
    dispute_channel:
      source.dispute_channel === undefined
        ? undefined
        : symbol(source.dispute_channel, 'dispute_channel'),
    dispute_amount: optionalMoney(source.dispute_amount, 'dispute_amount'),
    seller_response_due_date: optionalDate(
      source.seller_response_due_date,
      'seller_response_due_date',
    ),
    buyer_response_due_date: optionalDate(
      source.buyer_response_due_date,
      'buyer_response_due_date',
    ),
    dispute_outcome:
      source.dispute_outcome === undefined || source.dispute_outcome === null
        ? undefined
        : (() => {
            const outcome = record(source.dispute_outcome, 'dispute_outcome');
            return {
              outcome_code: symbol(outcome.outcome_code, 'outcome_code'),
              amount_refunded: optionalMoney(outcome.amount_refunded, 'amount_refunded'),
            };
          })(),
    disputed_transactions: [],
    evidences: [],
    messages: [],
    message_fingerprints: [],
    extensions: extra.extensions,
    supporting_info: extra.supporting_info,
    offer: extra.offer,
  };
  const transactions = source.disputed_transactions;
  if (transactions !== undefined) {
    if (!Array.isArray(transactions) || transactions.length > 100)
      throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute transactions are invalid', 502);
    output.disputed_transactions = transactions.map((item, index) => {
      const row = record(item, 'disputed transaction');
      return {
        seller_transaction_id: requiredText(row.seller_transaction_id, 'seller_transaction_id'),
        ...(extra.transactionItems[index]?.length ? { items: extra.transactionItems[index] } : {}),
      };
    });
  }
  const options = source.allowed_response_options;
  if (options !== undefined) {
    const available = record(options, 'allowed_response_options');
    const makeOffer =
      available.make_offer === undefined ? undefined : record(available.make_offer, 'make_offer');
    const acceptClaim =
      available.accept_claim === undefined
        ? undefined
        : record(available.accept_claim, 'accept_claim');
    output.allowed_response_options = {
      make_offer:
        makeOffer === undefined
          ? undefined
          : { offer_types: symbolArray(makeOffer.offer_types, 'offer_type') },
      accept_claim:
        acceptClaim === undefined
          ? undefined
          : {
              accept_claim_types: symbolArray(acceptClaim.accept_claim_types, 'accept_claim_type'),
            },
    };
  }
  const evidences = source.evidences;
  if (evidences !== undefined) {
    if (!Array.isArray(evidences) || evidences.length > 1000)
      throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute evidences are invalid', 502);
    output.evidences = evidences.map((item, index) => {
      const row = record(item, 'evidence');
      return {
        evidence_type: symbol(row.evidence_type, 'evidence_type'),
        source: symbol(row.source, 'evidence_source'),
        ...(extra.evidenceNotes[index] === undefined ? {} : { notes: extra.evidenceNotes[index] }),
        date: optionalDate(row.date, 'evidence_date'),
        item_id:
          row.item_id === undefined ? undefined : requiredText(row.item_id, 'evidence_item_id'),
      };
    });
  }
  const messages = source.messages;
  if (messages !== undefined) {
    if (!Array.isArray(messages) || messages.length > 1000)
      throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute messages are invalid', 502);
    output.messages = messages.map((item) => {
      const row = record(item, 'message');
      const postedBy = symbol(row.posted_by, 'message posted_by');
      if (!['BUYER', 'SELLER', 'ARBITER'].includes(postedBy))
        throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute message role is invalid', 502);
      const timePosted = optionalDate(row.time_posted, 'message time_posted');
      if (!timePosted)
        throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute message time is invalid', 502);
      const message = {
        posted_by: postedBy as SanitizedDisputeMessage['posted_by'],
        time_posted: timePosted,
        content: redactDisputeText(row.content, context),
      };
      return { ...message, fingerprint: fingerprint(message) };
    });
  }
  const prior = source._fairfold;
  if (prior !== undefined) {
    const metadata = record(prior, '_fairfold');
    const fingerprints = metadata.message_fingerprints;
    if (
      !Array.isArray(fingerprints) ||
      fingerprints.length > 10_000 ||
      !fingerprints.every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    )
      throw new AppError('DISPUTE_DETAIL_INVALID', 'Dispute message fingerprints are invalid', 502);
    output.message_fingerprints = [...new Set(fingerprints)];
  }
  if (
    new Set([
      ...output.message_fingerprints,
      ...output.messages.map((message) => message.fingerprint),
    ]).size > 10_000
  )
    throw new AppError(
      'DISPUTE_DETAIL_INVALID',
      'Dispute message fingerprint budget exceeded',
      502,
    );
  return output;
}

export function newBuyerMessages(detail: SanitizedDispute): SanitizedDisputeMessage[] {
  const known = new Set(detail.message_fingerprints);
  return detail.messages.filter((message) => {
    if (known.has(message.fingerprint)) return false;
    known.add(message.fingerprint);
    return message.posted_by === 'BUYER';
  });
}

/** Contacts are read transiently; neither the dictionary nor its source is returned for storage. */
export function disputeContacts(...sources: unknown[]): {
  knownEmails: string[];
  knownStreetLines: string[];
} {
  const knownEmails: string[] = [];
  const knownStreetLines: string[] = [];
  function visit(value: unknown, depth: number) {
    if (depth > 12 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 1000)) visit(entry, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') {
        if (key === 'email' || key === 'email_address') knownEmails.push(entry);
        if (['address_line_1', 'address_line_2', 'line1', 'line2'].includes(key))
          knownStreetLines.push(entry);
      } else visit(entry, depth + 1);
    }
  }
  for (const source of sources) visit(source, 0);
  return { knownEmails, knownStreetLines };
}
