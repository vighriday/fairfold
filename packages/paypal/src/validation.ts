import { AppError } from '@fairfold/contracts';

export function invalidInput(field: string): never {
  throw new AppError('INVALID_PAYPAL_REQUEST', 'Invalid PayPal ' + field);
}

export function inputText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > maximum)
    return invalidInput(field);
  return value;
}

export function resourceId(value: string, field: string, maximum = 50): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]+$/.test(value) || value.length > maximum)
    return invalidInput(field);
  return value;
}

export function orderId(value: string): string {
  resourceId(value, 'order ID', 36);
  if (!/^[A-Z0-9]+$/.test(value)) return invalidInput('order ID');
  return value;
}

export function invalidResponse(): never {
  throw new Error('Invalid PayPal response shape');
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}

export function optionalObject(value: unknown): Record<string, unknown> {
  return value === undefined || value === null ? {} : object(value);
}

export function responseText(value: unknown): string {
  if (typeof value !== 'string' || !value.length) return invalidResponse();
  return value;
}

export function optionalText(value: unknown): string | null {
  return value === undefined || value === null || value === '' ? null : responseText(value);
}

export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value;
}
