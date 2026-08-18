import { SuppressionScope, SuppressionType, SuppressionReason } from '../../types/database';
import { SuppressionCheckResult } from '../../types/domain';

export interface SuppressionRuleInput {
  scope: SuppressionScope;
  workspaceId: string | null;
  type: SuppressionType;
  identifier: string;
  reason: SuppressionReason;
  source?: string;
  notes?: string | null;
}

/**
 * Normalizes email address or domain for suppression storage and lookup.
 */
export function normalizeSuppressionIdentifier(type: SuppressionType, identifier: string): string {
  const trimmed = identifier.toLowerCase().trim();
  if (type === 'domain_wildcard') {
    // Strip leading @ or http/https if accidentally provided
    return trimmed.replace(/^@/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
  return trimmed;
}

/**
 * Validates a suppression rule input before database insertion.
 */
export function validateSuppressionInput(input: SuppressionRuleInput): { valid: boolean; error?: string } {
  if (input.scope === 'global' && input.workspaceId !== null) {
    return { valid: false, error: 'Global suppression rules must have a null workspaceId.' };
  }
  if (input.scope === 'workspace' && !input.workspaceId) {
    return { valid: false, error: 'Workspace suppression rules must have a valid workspaceId.' };
  }
  if (!input.identifier || input.identifier.trim().length === 0) {
    return { valid: false, error: 'Suppression identifier cannot be empty.' };
  }
  if (input.type === 'exact_email' && !input.identifier.includes('@')) {
    return { valid: false, error: 'Exact email suppression requires a valid email address with an @ symbol.' };
  }

  return { valid: true };
}
