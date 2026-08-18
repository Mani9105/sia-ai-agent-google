import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
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

    requirePermission(userRole, 'campaign:read');

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        message: 'Campaigns listing query authorized.',
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      workspaceId,
      userRole,
      userId,
      name,
      dailyLimit = 200,
      timezone = 'UTC',
      sendWindowStart = '09:00:00',
      sendWindowEnd = '17:00:00',
      sendDays = [1, 2, 3, 4, 5],
      stopOnReply = true,
      stopOnBounce = true,
      steps = [],
    } = body;

    if (!workspaceId || !name) {
      return new Response(JSON.stringify({ error: 'workspaceId and name are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:create');

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'campaign:created',
      entityType: 'campaign',
      newValues: {
        name,
        dailyLimit,
        timezone,
        stepCount: steps.length,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaign: {
          workspaceId,
          name,
          status: 'draft',
          dailyLimit,
          timezone,
          sendWindowStart,
          sendWindowEnd,
          sendDays,
          stopOnReply,
          stopOnBounce,
        },
        steps,
        auditLog,
        message: 'Campaign initialized in draft state.',
      }),
      {
        status: 201,
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
