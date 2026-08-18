import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole } from '@/types/database';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: suppressionId } = await params;
    const body = await request.json();
    const { workspaceId, userRole, userId } = body;

    if (!workspaceId || !suppressionId) {
      return new Response(JSON.stringify({ error: 'workspaceId and suppressionId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'suppression:manage');

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'suppression:rule_deleted',
      entityType: 'suppression',
      entityId: suppressionId,
      oldValues: { suppressionId },
    });

    return new Response(
      JSON.stringify({
        success: true,
        suppressionId,
        workspaceId,
        auditLog,
        message: 'Suppression deletion authorized.',
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
