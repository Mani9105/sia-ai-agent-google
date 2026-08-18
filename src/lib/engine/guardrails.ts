import { isWithinSendWindow, SendWindowConfig } from './cadence';
import { checkQuotaAvailability, QuotaCheckInput } from './quotas';
import { CampaignStatus } from '../../types/database';

export interface DispatchPreflightContext {
  workspace: {
    id: string;
    isPaused: boolean;
    dailyLimit: number;
    sentToday: number;
    timezone: string;
  };
  campaign: {
    id: string;
    status: CampaignStatus;
    sendWindowStart: string;
    sendWindowEnd: string;
    sendDays: number[];
    timezone?: string;
  };
  account: {
    id: string;
    isActive: boolean;
    authRevoked: boolean;
    dailyLimit: number;
    sentToday: number;
  };
  lead: {
    id: string;
    email: string;
    status: string;
  };
  suppressed: boolean;
}

export type DispatchRejectionCode =
  | 'WORKSPACE_PAUSED'
  | 'CAMPAIGN_NOT_RUNNING'
  | 'ACCOUNT_INACTIVE_OR_REVOKED'
  | 'RECIPIENT_SUPPRESSED'
  | 'LEAD_INACTIVE_OR_UNSUBSCRIBED'
  | 'ACCOUNT_QUOTA_EXCEEDED'
  | 'WORKSPACE_QUOTA_EXCEEDED'
  | 'OUTSIDE_SENDING_WINDOW';

export interface DispatchPreflightResult {
  canDispatch: boolean;
  rejectionCode?: DispatchRejectionCode;
  rejectionReason?: string;
}

/**
 * Deterministic preflight gatekeeper. Evaluates all business, safety, and provider constraints
 * prior to reserving database quota or initiating API communication.
 */
export function evaluateDispatchPreflight(ctx: DispatchPreflightContext, currentDate: Date = new Date()): DispatchPreflightResult {
  // 1. Workspace Killswitch
  if (ctx.workspace.isPaused) {
    return {
      canDispatch: false,
      rejectionCode: 'WORKSPACE_PAUSED',
      rejectionReason: 'The workspace is currently paused by the emergency kill switch.',
    };
  }

  // 2. Campaign Status
  if (ctx.campaign.status !== 'running') {
    return {
      canDispatch: false,
      rejectionCode: 'CAMPAIGN_NOT_RUNNING',
      rejectionReason: `Campaign is currently in '${ctx.campaign.status}' state instead of 'running'.`,
    };
  }

  // 3. Email Account Status
  if (!ctx.account.isActive || ctx.account.authRevoked) {
    return {
      canDispatch: false,
      rejectionCode: 'ACCOUNT_INACTIVE_OR_REVOKED',
      rejectionReason: 'Sending account is either deactivated or has revoked OAuth permissions.',
    };
  }

  // 4. Suppression Matrix
  if (ctx.suppressed) {
    return {
      canDispatch: false,
      rejectionCode: 'RECIPIENT_SUPPRESSED',
      rejectionReason: 'Recipient email address or root domain is on the suppression list.',
    };
  }

  // 5. Lead Status
  if (['bounced', 'unsubscribed', 'won', 'lost'].includes(ctx.lead.status)) {
    return {
      canDispatch: false,
      rejectionCode: 'LEAD_INACTIVE_OR_UNSUBSCRIBED',
      rejectionReason: `Lead status '${ctx.lead.status}' prevents sequence dispatch.`,
    };
  }

  // 6. Quota Limits
  const quotaCheck = checkQuotaAvailability({
    accountDailyLimit: ctx.account.dailyLimit,
    accountSentToday: ctx.account.sentToday,
    workspaceDailyLimit: ctx.workspace.dailyLimit,
    workspaceSentToday: ctx.workspace.sentToday,
  });

  if (!quotaCheck.allowed) {
    return {
      canDispatch: false,
      rejectionCode: quotaCheck.reason === 'ACCOUNT_LIMIT_EXCEEDED' ? 'ACCOUNT_QUOTA_EXCEEDED' : 'WORKSPACE_QUOTA_EXCEEDED',
      rejectionReason: `Daily sending limit reached (${quotaCheck.reason}).`,
    };
  }

  // 7. Send Window & Working Hours
  const windowConfig: SendWindowConfig = {
    sendWindowStart: ctx.campaign.sendWindowStart,
    sendWindowEnd: ctx.campaign.sendWindowEnd,
    sendDays: ctx.campaign.sendDays,
    timezone: ctx.campaign.timezone || ctx.workspace.timezone || 'UTC',
  };

  const windowCheck = isWithinSendWindow(windowConfig, currentDate);
  if (!windowCheck.allowed) {
    return {
      canDispatch: false,
      rejectionCode: 'OUTSIDE_SENDING_WINDOW',
      rejectionReason: windowCheck.reason || 'Current time is outside the campaign send window.',
    };
  }

  return {
    canDispatch: true,
  };
}
