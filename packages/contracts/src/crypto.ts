import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function decodeEncryptionKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== base64) {
    throw new Error('APP_ENCRYPTION_KEY must be 32 bytes in canonical base64');
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer, context = 'fairfold'): string {
  if (key.length !== 32) throw new Error('AES-256 requires a 32-byte key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decryptSecret(encoded: string, key: Buffer, context = 'fairfold'): string {
  try {
    const parts = encoded.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1' || key.length !== 32) throw new Error();
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3]!, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt merchant secret');
  }
}
