import { Database } from '../../types/database';

export interface AuditLogEntry {
  workspaceId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  ipAddress?: string | null;
}

/**
 * Creates an immutable audit log payload conforming to the audit_logs table schema.
 */
export function buildAuditLogInsert(entry: AuditLogEntry): Database['public']['Tables']['audit_logs']['Insert'] {
  return {
    workspace_id: entry.workspaceId,
    user_id: entry.userId || null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId || null,
    old_values: entry.oldValues || null,
    new_values: entry.newValues || null,
    ip_address: entry.ipAddress || null,
  };
}
