import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256 } from '../src/canonical.js';

describe('ledger canonical JSON', () => {
  it('sorts nested and numeric-looking keys lexically without whitespace', () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }], '2': 'two', '10': 'ten', a: null })).toBe(
      '{"10":"ten","2":"two","a":null,"z":[{"a":1,"b":2}]}',
    );
    expect(sha256(canonicalJson({ b: 2, a: 1 }))).toBe(sha256(canonicalJson({ a: 1, b: 2 })));
  });
  it('rejects non-JSON and cyclic values instead of hashing a lossy projection', () => {
    for (const value of [
      undefined,
      NaN,
      Infinity,
      BigInt(1),
      new Date(),
      { a: undefined },
      Array(2),
    ])
      expect(() => canonicalJson(value)).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow('cyclic');
  });
});
