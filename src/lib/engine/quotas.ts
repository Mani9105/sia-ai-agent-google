export interface QuotaCheckInput {
  accountDailyLimit: number;
  accountSentToday: number;
  workspaceDailyLimit: number;
  workspaceSentToday: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'ACCOUNT_LIMIT_EXCEEDED' | 'WORKSPACE_LIMIT_EXCEEDED';
  accountRemaining: number;
  workspaceRemaining: number;
}

/**
 * Deterministically checks whether quota is available at account and workspace levels.
 */
export function checkQuotaAvailability(input: QuotaCheckInput): QuotaCheckResult {
  const accountRemaining = Math.max(0, input.accountDailyLimit - input.accountSentToday);
  const workspaceRemaining = Math.max(0, input.workspaceDailyLimit - input.workspaceSentToday);

  if (input.accountSentToday >= input.accountDailyLimit) {
    return {
      allowed: false,
      reason: 'ACCOUNT_LIMIT_EXCEEDED',
      accountRemaining,
      workspaceRemaining,
    };
  }

  if (input.workspaceSentToday >= input.workspaceDailyLimit) {
    return {
      allowed: false,
      reason: 'WORKSPACE_LIMIT_EXCEEDED',
      accountRemaining,
      workspaceRemaining,
    };
  }

  return {
    allowed: true,
    accountRemaining,
    workspaceRemaining,
  };
}
