import crypto from 'crypto';
import { encryptSecret, decryptSecret } from '../crypto/encryption';
import { GmailTokenPair, GmailErrorCode } from '../../types/domain';

// Least-Privilege Minimal Gmail OAuth Scopes
export const GMAIL_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface OAuthStatePayload {
  workspaceId: string;
  userId: string;
  csrfToken: string;
  timestamp: number;
}

/**
 * Generates PKCE code_verifier and code_challenge (S256).
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Generates a signed, tamper-evident OAuth state parameter.
 */
export function generateSignedOAuthState(workspaceId: string, userId: string): {
  state: string;
  csrfToken: string;
} {
  const csrfToken = crypto.randomBytes(16).toString('hex');
  const payload: OAuthStatePayload = {
    workspaceId,
    userId,
    csrfToken,
    timestamp: Date.now(),
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || 'default-secret-key';
  const signature = crypto
    .createHmac('sha256', masterKey)
    .update(payloadBase64)
    .digest('base64url');

  return {
    state: `${payloadBase64}.${signature}`,
    csrfToken,
  };
}

/**
 * Validates a signed OAuth state and ensures it is under 10 minutes old.
 */
export function verifyOAuthState(state: string): { valid: boolean; payload?: OAuthStatePayload; error?: string } {
  if (!state || !state.includes('.')) {
    return { valid: false, error: 'Malformed state parameter.' };
  }

  const [payloadBase64, signature] = state.split('.');
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || 'default-secret-key';
  const expectedSignature = crypto
    .createHmac('sha256', masterKey)
    .update(payloadBase64)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSignature, 'utf8');

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: 'Invalid state signature (potential CSRF attack).' };
  }

  try {
    const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr) as OAuthStatePayload;

    // 10-minute expiration window
    if (Date.now() - payload.timestamp > 10 * 60 * 1000) {
      return { valid: false, error: 'OAuth state has expired. Please try connecting again.' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Corrupted state payload.' };
  }
}

/**
 * Builds the Google OAuth 2.0 Authorization URL with PKCE parameters.
 */
export function buildGoogleAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_OAUTH_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent'); // Guarantees return of refresh_token
  url.searchParams.set('state', options.state);
  url.searchParams.set('code_challenge', options.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

/**
 * Exchanges authorization code for access and refresh tokens.
 */
export async function exchangeCodeForTokens(options: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}> {
  const body = new URLSearchParams({
    code: options.code,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: options.codeVerifier,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google OAuth code exchange failed (${response.status}): ${errText}`);
  }

  const tokenData = await response.json();

  if (!tokenData.refresh_token) {
    throw new Error('Google did not return a refresh token. Ensure prompt=consent and access_type=offline.');
  }

  // Fetch user email using minimal userinfo.email scope
  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userinfoRes.ok) {
    throw new Error('Failed to fetch user email address from Google.');
  }

  const userData = await userinfoRes.json();

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in || 3600,
    email: userData.email,
  };
}

/**
 * Refreshes an expired access token using the stored encrypted refresh token.
 * Handles invalid_grant / revocation gracefully.
 */
export async function refreshGoogleAccessToken(options: {
  encryptedRefreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  newAccessToken: string;
  expiresIn: number;
  revoked?: boolean;
}> {
  const refreshToken = decryptSecret(options.encryptedRefreshToken);

  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    if (response.status === 400 && (errorBody.error === 'invalid_grant' || errorBody.error === 'unauthorized_client')) {
      return { newAccessToken: '', expiresIn: 0, revoked: true };
    }
    throw new Error(`Token refresh failed (${response.status}): ${JSON.stringify(errorBody)}`);
  }

  const tokenData = await response.json();
  return {
    newAccessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in || 3600,
    revoked: false,
  };
}
