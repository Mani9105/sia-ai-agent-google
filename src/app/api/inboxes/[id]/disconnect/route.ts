import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole } from '@/types/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inboxId } = await params;
    const body = await request.json();
    const { workspaceId, userRole, userId, reason } = body;

    if (!workspaceId || !inboxId) {
      return new Response(JSON.stringify({ error: 'workspaceId and inboxId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'inbox:manage');

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'inbox:disconnected',
      entityType: 'email_account',
      entityId: inboxId,
      newValues: {
        reason: reason || 'User initiated inbox disconnection',
        isActive: false,
        authRevoked: true,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Inbox disconnected and credentials deactivated.',
        inboxId,
        workspaceId,
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
