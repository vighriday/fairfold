import { createHash } from 'node:crypto';

/** sha256 over the parts joined by newlines; identifies a model input without logging its content. */
export function hashInput(parts: Array<string>): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** One structured JSON line on stdout per model call, for the README's cost note (section 10). */
export function logAi(entry: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}
