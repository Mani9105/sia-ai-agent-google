import { requirePermission } from '@/lib/auth/permissions';
import { evaluateInboxHealth } from '@/lib/gmail/health';
import { UserRole } from '@/types/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inboxId } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';

    if (!workspaceId || !inboxId) {
      return new Response(JSON.stringify({ error: 'workspaceId and inboxId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'inbox:read');

    // Demo evaluation schema
    const health = evaluateInboxHealth({
      id: inboxId,
      email_address: 'inbox@example.com',
      is_active: true,
      auth_revoked: false,
      daily_limit: 50,
      sent_today: 12,
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      error_message: null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        health,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
