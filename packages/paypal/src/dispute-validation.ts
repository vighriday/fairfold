import { invalidInput, inputText } from './validation.js';

export function disputeId(value: string): string {
  inputText(value, 'dispute ID', 255);
  if (!/^[A-Za-z0-9-]+$/.test(value)) return invalidInput('dispute ID');
  return value;
}

export function inputObject(
  value: unknown,
  allowed: readonly string[],
  field: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    return invalidInput(field);
  return value as Record<string, unknown>;
}

export function dateTime(value: string): Date {
  inputText(value, 'dispute date', 64);
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!match) return invalidInput('dispute date');
  const calendar = new Date(match[1] + 'T00:00:00Z');
  const instant = new Date(value);
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== match[1] ||
    !Number.isFinite(instant.getTime())
  )
    return invalidInput('dispute date');
  return instant;
}
