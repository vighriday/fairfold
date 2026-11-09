import { createHash } from 'node:crypto';

/** A deterministic, valid v4-shaped uuid for test fixtures: uid(1) → 00000000-0000-4000-8000-000000000001. */
export const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
/** A valid 64-hex SHA-256 for a label. */
export const sha = (label: string) => createHash('sha256').update(label).digest('hex');
