import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'inbox:read');

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        message: 'Inbox listing query validated.',
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
