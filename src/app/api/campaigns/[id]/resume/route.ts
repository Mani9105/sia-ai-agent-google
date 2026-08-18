import { createKillSwitchPlan } from '@/lib/engine/killswitch';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function POST(
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

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:toggle_pause');

    const plan = createKillSwitchPlan({
      entityType: 'campaign',
      entityId: campaignId,
      workspaceId,
      action: 'resume',
      actorId: userId || 'system',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Campaign resumed.',
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
