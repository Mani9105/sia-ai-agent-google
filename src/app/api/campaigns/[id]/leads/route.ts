import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole } from '@/types/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { workspaceId, userRole, userId, leadIds, startAt } = body;

    if (!workspaceId || !campaignId || !Array.isArray(leadIds) || leadIds.length === 0) {
      return new Response(JSON.stringify({ error: 'workspaceId, campaignId, and non-empty leadIds array are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:create');

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'campaign:leads_assigned',
      entityType: 'campaign',
      entityId: campaignId,
      newValues: {
        requestedCount: leadIds.length,
        startAt: startAt || new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
        leadCount: leadIds.length,
        startAt: startAt || new Date().toISOString(),
        auditLog,
        message: 'Lead assignment payload prepared for database execution via assign_leads_to_campaign.',
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
