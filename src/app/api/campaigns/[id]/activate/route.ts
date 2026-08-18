import { validateCampaignForActivation } from '@/lib/campaigns/validator';
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
    const {
      workspaceId,
      userRole,
      userId,
      campaignName,
      dailyLimit,
      workspaceDailyLimit = 500,
      sendWindowStart,
      sendWindowEnd,
      sendDays,
      timezone = 'UTC',
      steps = [],
      activeAccountsCount = 1,
    } = body;

    if (!workspaceId || !campaignId) {
      return new Response(JSON.stringify({ error: 'workspaceId and campaignId are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:create');

    // 1. Run deterministic pre-activation validator
    const validation = validateCampaignForActivation({
      name: campaignName || 'Campaign',
      dailyLimit: dailyLimit || 100,
      workspaceDailyLimit,
      sendWindowStart: sendWindowStart || '09:00:00',
      sendWindowEnd: sendWindowEnd || '17:00:00',
      sendDays: sendDays || [1, 2, 3, 4, 5],
      timezone,
      steps,
      activeAccountsCount,
    });

    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          error: 'CAMPAIGN_ACTIVATION_REJECTED',
          details: validation.errors,
          warnings: validation.warnings,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'campaign:activated',
      entityType: 'campaign',
      entityId: campaignId,
      newValues: {
        status: 'running',
        stepCount: steps.length,
        dailyLimit,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
        newStatus: 'running',
        message: 'Campaign validated and transitioned to running status.',
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
