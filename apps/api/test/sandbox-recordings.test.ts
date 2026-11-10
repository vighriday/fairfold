import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '@fairfold/contracts';
import { sanitizeOrderRecord } from '@fairfold/paypal';
import {
  createFileRecording,
  readSandboxRecords,
} from '../../../scripts/support/sandbox-recordings.js';

const root = resolve('.work/h2-specs');
const directories: string[] = [];
function directory() {
  mkdirSync(root, { recursive: true });
  const path = mkdtempSync(join(root, 'synthetic-recording-test-'));
  directories.push(path);
  return path;
}
const id = 'SYNTHETICFILEORDER';
function record() {
  return sanitizeOrderRecord(
    'create',
    {
      id,
      status: 'CREATED',
      links: [
        {
          rel: 'approve',
          method: 'GET',
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
        },
      ],
    },
    fixedClock('2026-11-09T17:40:00.000Z'),
  );
}
afterEach(() => {
  for (const path of directories.splice(0)) {
    if (!resolve(path).startsWith(root + '\\') && !resolve(path).startsWith(root + '/'))
      throw new Error('Unsafe fixture cleanup');
    rmSync(path, { recursive: true, force: true });
  }
});
describe('synthetic-only recording file boundary', () => {
  it('writes distinct sanitized records, reads them, and does not overwrite an earlier observation', async () => {
    const path = directory();
    const writer = createFileRecording(path);
    await writer.write(record());
    await writer.write(record());
    expect(readSandboxRecords(path)).toEqual([record(), record()]);
  });
  it('ignores incomplete temporary files and unrelated folders', () => {
    const path = directory();
    mkdirSync(join(path, id));
    writeFileSync(join(path, id, 'incomplete.json.tmp'), 'not-json');
    mkdirSync(join(path, 'unrelated'));
    expect(readSandboxRecords(path)).toEqual([]);
  });
  it('rejects unsanitized fields before writing', async () => {
    const input = record();
    input.body.email = 'synthetic-private-value';
    await expect(createFileRecording(directory()).write(input)).rejects.toThrow();
  });
  it.each(['private-field', 'id', 'oversize'])('rejects an invalid stored record: %s', (reason) => {
    const path = directory();
    mkdirSync(join(path, id));
    const input = record();
    if (reason === 'private-field') input.body.email = 'synthetic-private-value';
    if (reason === 'id') input.body.id = 'DIFFERENTORDER';
    writeFileSync(
      join(path, id, 'invalid.json'),
      reason === 'oversize' ? 'x'.repeat(512 * 1024 + 1) : JSON.stringify(input),
    );
    expect(() => readSandboxRecords(path)).toThrow();
  });
});
