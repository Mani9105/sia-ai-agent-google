import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';

    if (!workspaceId || !leadId) {
      return new Response(JSON.stringify({ error: 'workspaceId and leadId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'lead:read');

    return new Response(
      JSON.stringify({
        success: true,
        leadId,
        workspaceId,
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;
    const body = await request.json();
    const { workspaceId, userRole } = body;

    if (!workspaceId || !leadId) {
      return new Response(JSON.stringify({ error: 'workspaceId and leadId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'lead:delete');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lead deletion authorized.',
        leadId,
        workspaceId,
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
