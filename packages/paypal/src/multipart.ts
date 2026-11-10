import { randomUUID } from 'node:crypto';
import { inputText, invalidInput } from './validation.js';

export interface PayPalMultipart {
  input: unknown;
  files: Array<{ filename: string; mime: string; bytes: Buffer }>;
}
const fileLimit = 10_000_000; // Conservative decimal MB, strictly less than the published 10 MB.
const requestLimit = 50_000_000;

function jsonPart(input: unknown): string {
  const seen = new Set<object>();
  function check(value: unknown, depth: number) {
    if (depth > 20) return invalidInput('evidence JSON depth');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (
      !value ||
      typeof value !== 'object' ||
      seen.has(value) ||
      (!Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    )
      return invalidInput('evidence JSON');
    seen.add(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) check(item, depth + 1);
    seen.delete(value);
  }
  check(input, 0);
  const result = JSON.stringify(input);
  if (Buffer.byteLength(result) > requestLimit) return invalidInput('evidence JSON size');
  return result;
}

function validateFile(file: PayPalMultipart['files'][number]) {
  if (!file || !Buffer.isBuffer(file.bytes) || !file.bytes.length || file.bytes.length >= fileLimit)
    return invalidInput('evidence file size');
  const filename = inputText(file.filename, 'evidence filename', 2000);
  if (!/^[A-Za-z0-9_, -]+\.(pdf|png|jpe?g|gif)$/i.test(filename))
    return invalidInput('evidence filename');
  const extension = filename.split('.').at(-1)!.toLowerCase();
  const bytes = file.bytes;
  const valid =
    (extension === 'pdf' &&
      file.mime === 'application/pdf' &&
      bytes.subarray(0, 5).toString('ascii') === '%PDF-') ||
    (extension === 'png' &&
      file.mime === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (['jpg', 'jpeg'].includes(extension) &&
      file.mime === 'image/jpeg' &&
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
    (extension === 'gif' &&
      file.mime === 'image/gif' &&
      ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')));
  if (!valid) return invalidInput('evidence file type');
}

/** Stable bytes/boundary for all transport retries; never transforms evidence documents. */
export function encodeMultipart(input: PayPalMultipart): {
  body: ArrayBuffer;
  contentType: string;
} {
  if (!input || !Array.isArray(input.files)) return invalidInput('evidence files');
  const json = jsonPart(input.input);
  const names = new Set<string>();
  let size = Buffer.byteLength(json);
  for (const file of input.files) {
    validateFile(file);
    if (names.has(file.filename)) return invalidInput('duplicate evidence filename');
    names.add(file.filename);
    size += file.bytes.length;
    if (size > requestLimit) return invalidInput('evidence request size');
  }
  let boundary: string;
  do {
    boundary = 'fairfold-' + randomUUID();
  } while (json.includes(boundary) || input.files.some((file) => file.bytes.includes(boundary)));
  const parts = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="input"\r\nContent-Type: application/json\r\n\r\n${json}\r\n`,
    ),
  ];
  input.files.forEach((file, index) => {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file${index + 1}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
      ),
      Buffer.from(file.bytes),
      Buffer.from('\r\n'),
    );
  });
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const encoded = Buffer.concat(parts);
  if (encoded.length > requestLimit) return invalidInput('evidence request size');
  return {
    body: Uint8Array.from(encoded).buffer,
    contentType: 'multipart/form-data; boundary=' + boundary,
  };
}
