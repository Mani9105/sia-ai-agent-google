import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole } from '@/types/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';

    if (!workspaceId || !campaignId) {
      return new Response(JSON.stringify({ error: 'workspaceId and campaignId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'campaign:read');

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { workspaceId, userRole, userId, ...updates } = body;

    if (!workspaceId || !campaignId) {
      return new Response(JSON.stringify({ error: 'workspaceId and campaignId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:update');

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'campaign:updated',
      entityType: 'campaign',
      entityId: campaignId,
      newValues: updates,
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
        updates,
        auditLog,
        message: 'Campaign update authorized.',
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
    const { id: campaignId } = await params;
    const body = await request.json();
    const { workspaceId, userRole, userId } = body;

    if (!workspaceId || !campaignId) {
      return new Response(JSON.stringify({ error: 'workspaceId and campaignId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:delete');

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'campaign:archived',
      entityType: 'campaign',
      entityId: campaignId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Campaign archived.',
        campaignId,
        auditLog,
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
