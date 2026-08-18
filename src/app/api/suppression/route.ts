import { normalizeSuppressionIdentifier, validateSuppressionInput } from '@/lib/engine/suppression';
import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole, SuppressionScope, SuppressionType, SuppressionReason } from '@/types/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';
    const scope = searchParams.get('scope') as SuppressionScope | null;
    const type = searchParams.get('type') as SuppressionType | null;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'suppression:read');

    return new Response(
      JSON.stringify({
        success: true,
        filters: { workspaceId, scope, type },
        message: 'Suppression query authorized.',
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
      scope = 'workspace',
      type,
      identifier,
      reason,
      source = 'manual',
      notes,
    } = body;

    if (!workspaceId && scope === 'workspace') {
      return new Response(JSON.stringify({ error: 'workspaceId is required for workspace-scoped suppression.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'suppression:manage');

    const validation = validateSuppressionInput({
      scope: scope as SuppressionScope,
      workspaceId: scope === 'global' ? null : workspaceId,
      type: type as SuppressionType,
      identifier,
      reason: reason as SuppressionReason,
      source,
      notes,
    });

    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalizedIdentifier = normalizeSuppressionIdentifier(type, identifier);

    const auditLog = buildAuditLogInsert({
      workspaceId: workspaceId || '00000000-0000-0000-0000-000000000000',
      userId: userId || 'system',
      action: 'suppression:rule_added',
      entityType: 'suppression',
      newValues: {
        scope,
        type,
        identifier: normalizedIdentifier,
        reason,
        source,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        record: {
          scope,
          workspaceId: scope === 'global' ? null : workspaceId,
          type,
          identifier: normalizedIdentifier,
          reason,
          source,
          notes,
        },
        auditLog,
        message: 'Suppression rule validated. Database insertion will auto-propagate to active campaign leads via trigger.',
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
