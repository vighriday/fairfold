import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseOrderRecord,
  type OrderRecording,
  type SanitizedOrderRecord,
} from '../../packages/paypal/src/index.js';

export const sandboxRecordingDirectory = fileURLToPath(
  new URL('../../.work/h2-sandbox/', import.meta.url),
);

export function createFileRecording(
  directory = sandboxRecordingDirectory,
  failed = () => {
    console.error(
      'SANDBOX_RECORDING_FAILED: payment outcome is unchanged; preserve the order IDs and verify before buying again.',
    );
  },
): OrderRecording {
  return {
    failed,
    async write(input) {
      const record = parseOrderRecord(input);
      const id = String(record.body.id);
      const folder = join(directory, id);
      await mkdir(folder, { recursive: true });
      const target = join(folder, `${record.operation}-${randomUUID()}.json`);
      const temporary = target + '.tmp';
      await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporary, target);
    },
  };
}

/** Only small, strictly sanitized records are accepted; .tmp files are never replayed. */
export function readSandboxRecords(directory = sandboxRecordingDirectory): SanitizedOrderRecord[] {
  if (!existsSync(directory)) return [];
  const records: SanitizedOrderRecord[] = [];
  for (const folder of readdirSync(directory, { withFileTypes: true })) {
    if (!folder.isDirectory() || !/^[A-Z0-9]{1,36}$/.test(folder.name)) continue;
    for (const file of readdirSync(join(directory, folder.name), { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue;
      if (records.length >= 1000) throw new Error('Sandbox recording budget exceeded');
      const path = join(directory, folder.name, file.name);
      if (statSync(path).size > 512 * 1024) throw new Error('Sandbox recording is too large');
      const record = parseOrderRecord(JSON.parse(readFileSync(path, 'utf8')));
      if (record.body.id !== folder.name) throw new Error('Sandbox recording ID mismatch');
      records.push(record);
    }
  }
  return records.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}
