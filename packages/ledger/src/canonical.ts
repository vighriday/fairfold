import { createHash } from 'node:crypto';

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(input: unknown): string {
    if (input === null || typeof input === 'string' || typeof input === 'boolean')
      return JSON.stringify(input);
    if (typeof input === 'number' && Number.isFinite(input)) return JSON.stringify(input);
    if (typeof input !== 'object' || input === null) throw new Error('Ledger payload must be JSON');
    if (ancestors.has(input)) throw new Error('Ledger payload cannot be cyclic');
    ancestors.add(input);
    try {
      if (Array.isArray(input))
        return '[' + Array.from(input, (item) => encode(item)).join(',') + ']';
      if (
        Object.getPrototypeOf(input) !== Object.prototype &&
        Object.getPrototypeOf(input) !== null
      )
        throw new Error('Ledger payload must contain plain JSON objects');
      const record = input as Record<string, unknown>;
      return (
        '{' +
        Object.keys(record)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + encode(record[key]))
          .join(',') +
        '}'
      );
    } finally {
      ancestors.delete(input);
    }
  }
  return encode(value);
}
