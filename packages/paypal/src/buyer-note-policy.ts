import { AppError } from '@fairfold/contracts';

/** Exact extra leaves approved in docs/hriday/ishaan-integration-review.md. */
export function sanitizeBuyerNotes(
  source: Record<string, unknown>,
  redact: (text: unknown) => string,
) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const list = (value: unknown): unknown[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100)
      throw new AppError(
        'DISPUTE_TEXT_REVIEW_REQUIRED',
        'Buyer-note list requires privacy review',
        409,
      );
    return value;
  };
  let characters = 0;
  const text = (value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    const safe = redact(value);
    characters += Math.max(typeof value === 'string' ? value.length : 0, safe.length);
    if (characters > 20_000)
      throw new AppError('DISPUTE_TEXT_REVIEW_REQUIRED', 'Buyer-note text budget exceeded', 409);
    return safe;
  };
  const details = (input: unknown) => {
    const row = object(input),
      product = object(row.product_details),
      service = object(row.service_details);
    const description = text(product.description);
    const serviceDescription = text(service.description),
      note = text(service.note);
    return {
      ...(description === undefined ? {} : { product_details: { description } }),
      ...(serviceDescription === undefined && note === undefined
        ? {}
        : {
            service_details: {
              ...(serviceDescription === undefined ? {} : { description: serviceDescription }),
              ...(note === undefined ? {} : { note }),
            },
          }),
    };
  };
  const ext = object(source.extensions);
  const merchandise = details(ext.merchandize_dispute_properties);
  const credit = details(object(ext.billing_dispute_properties).credit_not_processed);
  const extensions = {
    ...(Object.keys(merchandise).length ? { merchandize_dispute_properties: merchandise } : {}),
    ...(Object.keys(credit).length
      ? { billing_dispute_properties: { credit_not_processed: credit } }
      : {}),
  };
  const transactionItems = list(source.disputed_transactions).map((transaction) =>
    list(object(transaction).items).map((item) => {
      const notes = text(object(item).notes);
      return { ...details(item), ...(notes === undefined ? {} : { notes }) };
    }),
  );
  const supporting = list(source.supporting_info).flatMap((entry) => {
    const row = object(entry);
    if (row.source !== 'SUBMITTED_BY_BUYER') return [];
    const notes = text(row.notes);
    return notes === undefined ? [] : [{ source: 'SUBMITTED_BY_BUYER' as const, notes }];
  });
  // Existing evidence metadata permits 1,000 rows; the extension permits notes only in a <=100-row list.
  const evidenceRows = Array.isArray(source.evidences) ? source.evidences : [];
  if (
    evidenceRows.some(
      (entry) => object(entry).source === 'SUBMITTED_BY_BUYER' && object(entry).notes !== undefined,
    )
  )
    list(evidenceRows);
  const evidenceNotes = evidenceRows.map((entry) => {
    const row = object(entry);
    return row.source === 'SUBMITTED_BY_BUYER' ? text(row.notes) : undefined;
  });
  const history = list(object(source.offer).history).flatMap((entry) => {
    const row = object(entry);
    if (row.actor !== 'BUYER') return [];
    const notes = text(row.notes);
    return notes === undefined ? [] : [{ actor: 'BUYER' as const, notes }];
  });
  return {
    extensions: Object.keys(extensions).length ? extensions : undefined,
    transactionItems,
    evidenceNotes,
    supporting_info: supporting.length ? supporting : undefined,
    offer: history.length ? { history } : undefined,
  };
}
