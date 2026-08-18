import { buildAuditLogInsert } from './audit';

export interface KillSwitchTarget {
  entityType: 'workspace' | 'campaign' | 'email_account';
  entityId: string;
  workspaceId: string;
  action: 'pause' | 'resume';
  reason?: string;
  actorId: string;
  ipAddress?: string;
}

export interface KillSwitchExecutionPlan {
  tableName: 'workspaces' | 'campaigns' | 'email_accounts';
  entityId: string;
  workspaceId: string;
  updatePayload: Record<string, any>;
  auditLog: ReturnType<typeof buildAuditLogInsert>;
}

/**
 * Prepares an atomic kill switch execution plan and immutable audit record.
 */
export function createKillSwitchPlan(target: KillSwitchTarget): KillSwitchExecutionPlan {
  const isPause = target.action === 'pause';
  let tableName: 'workspaces' | 'campaigns' | 'email_accounts';
  let updatePayload: Record<string, any>;

  switch (target.entityType) {
    case 'workspace':
      tableName = 'workspaces';
      updatePayload = { is_paused: isPause, updated_at: new Date().toISOString() };
      break;
    case 'campaign':
      tableName = 'campaigns';
      updatePayload = { status: isPause ? 'paused' : 'running', updated_at: new Date().toISOString() };
      break;
    case 'email_account':
      tableName = 'email_accounts';
      updatePayload = { is_active: !isPause, updated_at: new Date().toISOString() };
      break;
    default:
      throw new Error(`Unsupported killswitch entity type: ${(target as any).entityType}`);
  }

  const auditLog = buildAuditLogInsert({
    workspaceId: target.workspaceId,
    userId: target.actorId,
    action: `killswitch:${target.entityType}:${target.action}`,
    entityType: target.entityType,
    entityId: target.entityId,
    newValues: { ...updatePayload, reason: target.reason || 'Emergency Kill Switch Triggered' },
    ipAddress: target.ipAddress,
  });

  return {
    tableName,
    entityId: target.entityId,
    workspaceId: target.workspaceId,
    updatePayload,
    auditLog,
  };
}
