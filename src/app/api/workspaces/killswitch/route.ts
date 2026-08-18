import { createKillSwitchPlan } from '@/lib/engine/killswitch';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workspaceId, action, reason, userRole, userId } = body;

    if (!workspaceId || !action || !['pause', 'resume'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid payload. workspaceId and action (pause/resume) are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // RBAC Check: Only owner or admin can toggle workspace kill switch
    requirePermission((userRole as UserRole) || 'viewer', 'workspace:toggle_killswitch');

    const plan = createKillSwitchPlan({
      entityType: 'workspace',
      entityId: workspaceId,
      workspaceId,
      action: action as 'pause' | 'resume',
      reason,
      actorId: userId || 'system',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Workspace kill switch successfully executed (${action}).`,
        plan,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal error processing killswitch.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
