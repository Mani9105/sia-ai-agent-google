import { verifyOAuthState, exchangeCodeForTokens } from '@/lib/gmail/oauth';
import { encryptSecret } from '@/lib/crypto/encryption';
import { buildAuditLogInsert } from '@/lib/engine/audit';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return new Response(JSON.stringify({ error: `Google OAuth consent denied: ${error}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!code || !state) {
      return new Response(JSON.stringify({ error: 'Missing code or state parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Verify signed state and 10-minute expiry
    const stateVerification = verifyOAuthState(state);
    if (!stateVerification.valid || !stateVerification.payload) {
      return new Response(JSON.stringify({ error: `CSRF_SECURITY_VIOLATION: ${stateVerification.error}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { workspaceId, userId } = stateVerification.payload;

    // 2. Extract codeVerifier from cookie or query
    const cookieHeader = request.headers.get('cookie') || '';
    const pkceCookie = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('sia_oauth_pkce='));
    
    const codeVerifier = pkceCookie ? pkceCookie.split('=')[1] : searchParams.get('codeVerifier');

    if (!codeVerifier) {
      return new Response(JSON.stringify({ error: 'PKCE code verifier missing or expired.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`;

    // 3. Exchange authorization code for tokens
    const tokenResult = await exchangeCodeForTokens({
      code,
      codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    // 4. Encrypt tokens with AES-256-GCM before writing to database
    const accessTokenEnc = encryptSecret(tokenResult.accessToken);
    const refreshTokenEnc = encryptSecret(tokenResult.refreshToken);
    const tokenExpiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000).toISOString();

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId,
      action: 'inbox:connected_gmail_oauth',
      entityType: 'email_account',
      newValues: {
        email: tokenResult.email,
        provider: 'gmail',
        scopes: 'send,readonly,userinfo.email',
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Gmail account connected successfully.',
        account: {
          workspaceId,
          emailAddress: tokenResult.email,
          provider: 'gmail',
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiresAt,
          isActive: true,
          authRevoked: false,
        },
        auditLog,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'OAuth callback failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
