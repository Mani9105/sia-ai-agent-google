import crypto from 'crypto';
import { UnsubscribePayload } from '../../types/domain';

function getUnsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET_KEY || process.env.ENCRYPTION_MASTER_KEY;
  if (!secret) {
    throw new Error('CRITICAL_SECURITY_ERROR: UNSUBSCRIBE_SECRET_KEY environment variable is not configured.');
  }
  return secret;
}

/**
 * Encodes an unsubscribe payload into a tamper-evident HMAC-SHA256 signed token.
 */
export function generateUnsubscribeToken(
  workspaceId: string,
  leadId: string,
  email: string,
  campaignId?: string,
  validityDays: number = 90
): string {
  const payload: UnsubscribePayload = {
    workspaceId,
    leadId,
    email: email.toLowerCase().trim(),
    campaignId,
    exp: Math.floor(Date.now() / 1000) + validityDays * 86400,
  };

  const payloadString = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = getUnsubscribeSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('base64url');

  return `${payloadString}.${signature}`;
}

/**
 * Validates an unsubscribe token and returns the verified payload if valid.
 */
export function verifyUnsubscribeToken(token: string): { valid: boolean; payload?: UnsubscribePayload; reason?: string } {
  if (!token || !token.includes('.')) {
    return { valid: false, reason: 'malformed_token' };
  }

  const [payloadBase64Url, signature] = token.split('.');
  const secret = getUnsubscribeSecret();

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64Url)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    return { valid: false, reason: 'invalid_signature' };
  }

  try {
    const jsonString = Buffer.from(payloadBase64Url, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonString) as UnsubscribePayload;

    const currentUnix = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentUnix) {
      return { valid: false, reason: 'token_expired' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'payload_corrupted' };
  }
}
