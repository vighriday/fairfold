import { z } from 'zod';
import {
  AppError,
  CaptureResultSchema,
  MoneySchema,
  type CaptureResult,
} from '@fairfold/contracts';
import { canonicalJson, sha256 } from '@fairfold/ledger';

const text = z.string().nullable().optional();
const RawCaptureSchema = z.object({
  id: z.string().min(1),
  purchase_units: z
    .array(
      z.object({
        reference_id: text,
        custom_id: text,
        invoice_id: text,
        shipping: z
          .object({
            address: z
              .object({
                address_line_1: text,
                address_line_2: text,
                admin_area_2: text,
                admin_area_1: text,
                postal_code: text,
                country_code: text,
              })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
        payments: z.object({
          captures: z
            .array(
              z.object({
                id: z.string().min(1),
                status: z.string().min(1),
                amount: MoneySchema,
              }),
            )
            .length(1),
        }),
      }),
    )
    .length(1),
});

function invalidCapture(): never {
  throw new AppError('CAPTURE_RESPONSE_INVALID', 'Capture response could not be validated', 502);
}

function normalizeAddress(value: string | null | undefined): string | null {
  return value?.normalize('NFC').trim().replace(/\s+/gu, ' ') || null;
}

/** The approved Q3 allowlist. Raw/contact/address values never leave this function. */
export function minimizeCapture(input: CaptureResult) {
  const dto = CaptureResultSchema.safeParse(input);
  const raw = RawCaptureSchema.safeParse(input?.raw);
  if (!dto.success || !raw.success) return invalidCapture();
  const result = dto.data;
  const unit = raw.data.purchase_units[0]!;
  const capture = unit.payments.captures[0]!;
  if (
    raw.data.id !== result.orderId ||
    capture.id !== result.captureId ||
    capture.status !== result.status
  )
    return invalidCapture();
  const source = unit.shipping?.address;
  const address = {
    address_line_1: normalizeAddress(source?.address_line_1),
    address_line_2: normalizeAddress(source?.address_line_2),
    admin_area_2: normalizeAddress(source?.admin_area_2),
    admin_area_1: normalizeAddress(source?.admin_area_1),
    postal_code: normalizeAddress(source?.postal_code),
    country_code: normalizeAddress(source?.country_code)?.toUpperCase() ?? null,
  };
  const email = result.payerEmail?.normalize('NFC').trim().toLowerCase() || null;
  return {
    orderId: result.orderId,
    captureId: result.captureId,
    status: result.status,
    amount: { currency_code: capture.amount.currency_code, value: capture.amount.value },
    referenceId: unit.reference_id ?? null,
    customId: unit.custom_id ?? null,
    invoiceId: unit.invoice_id ?? null,
    payerId: result.payerId?.trim() || null,
    emailHash: email ? sha256(email) : null,
    displayName: result.payerName?.trim() || null,
    shipToCountry: address.country_code,
    shipToPostal: address.postal_code,
    shipToHash:
      address.address_line_1 || address.address_line_2 ? sha256(canonicalJson(address)) : null,
    payerAccountStatus: result.payerAccountStatus,
    sellerProtection: {
      status: result.sellerProtection.status,
      disputeCategories: [...result.sellerProtection.disputeCategories],
    },
  };
}
