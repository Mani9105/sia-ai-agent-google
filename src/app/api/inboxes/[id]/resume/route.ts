import { createKillSwitchPlan } from '@/lib/engine/killswitch';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inboxId } = await params;
    const body = await request.json();
    const { workspaceId, userRole, userId } = body;

    if (!workspaceId || !inboxId) {
      return new Response(JSON.stringify({ error: 'workspaceId and inboxId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'inbox:toggle_pause');

    const plan = createKillSwitchPlan({
      entityType: 'email_account',
      entityId: inboxId,
      workspaceId,
      action: 'resume',
      actorId: userId || 'system',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Inbox resumed.',
        plan,
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
