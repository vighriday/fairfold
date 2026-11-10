import { AppError } from '@fairfold/contracts';

export interface PayPalDiagnostic {
  event: 'paypal.request_error';
  merchantId: string;
  phase: 'oauth' | 'api';
  method: 'GET' | 'POST';
  upstreamStatus: number | null;
  debugId: string | null;
  paypalName: string | null;
  issues: string[];
  attempt: number;
}

export interface PayPalLogger {
  warn(fields: PayPalDiagnostic, message: string): void;
}

export class PayPalError extends AppError {
  constructor(
    code: 'PAYPAL_HTTP_ERROR' | 'PAYPAL_NETWORK_ERROR' | 'PAYPAL_INVALID_RESPONSE',
    readonly upstreamStatus: number | null,
    readonly debugId: string | null,
    readonly paypalName: string | null,
    readonly issues: string[],
    readonly outcomeUnknown: boolean,
  ) {
    super(code, 'PayPal sandbox request failed', 502, {
      upstreamStatus,
      debugId,
      paypalName,
      issues,
      outcomeUnknown,
    });
    this.name = 'PayPalError';
  }
}

export function safeDebugId(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

function symbol(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : null;
}

export function errorSymbols(body: unknown): { paypalName: string | null; issues: string[] } {
  if (!body || typeof body !== 'object') return { paypalName: null, issues: [] };
  const error = body as Record<string, unknown>;
  const issues = Array.isArray(error.details)
    ? error.details.slice(0, 20).flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const issue = symbol((item as Record<string, unknown>).issue);
        return issue ? [issue] : [];
      })
    : [];
  return { paypalName: symbol(error.name), issues };
}
