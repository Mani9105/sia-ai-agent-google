import { generatePKCE, generateSignedOAuthState, buildGoogleAuthUrl } from '@/lib/gmail/oauth';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userId = searchParams.get('userId') || 'system';
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required to authorize Gmail inbox.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'inbox:connect');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`;

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'GOOGLE_CLIENT_ID environment variable is missing.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const { state, csrfToken } = generateSignedOAuthState(workspaceId, userId);

    const authorizationUrl = buildGoogleAuthUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    });

    // In a full SSR setup, codeVerifier and csrfToken are stored in an HttpOnly SameSite=Lax cookie
    return new Response(
      JSON.stringify({
        success: true,
        authorizationUrl,
        state,
        codeVerifier,
        expiresInSeconds: 600, // 10 minutes
        message: 'OAuth authorization URL and PKCE challenge generated.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `sia_oauth_pkce=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`,
        },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
