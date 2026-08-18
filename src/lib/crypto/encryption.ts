import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

function getMasterKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyHex) {
    throw new Error('CRITICAL_SECURITY_ERROR: ENCRYPTION_MASTER_KEY environment variable is not configured.');
  }

  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error('CRITICAL_SECURITY_ERROR: ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes).');
  }

  return keyBuffer;
}

/**
 * Encrypts sensitive credentials (such as OAuth refresh tokens) using AES-256-GCM.
 * Output format: `<base64_iv>:<base64_auth_tag>:<base64_ciphertext>`
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) {
    throw new Error('Encryption error: plainText cannot be empty.');
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted tokens. Verifies authentication tag to prevent tampering.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) {
    throw new Error('Decryption error: encryptedPayload cannot be empty.');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Decryption error: Invalid encrypted payload format.');
  }

  const [ivBase64, authTagBase64, cipherTextBase64] = parts;
  const key = getMasterKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Decryption error: Malformed IV or authentication tag.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherTextBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
