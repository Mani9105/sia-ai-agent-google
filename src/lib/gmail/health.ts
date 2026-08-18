export type InboxHealthStatus =
  | 'HEALTHY'
  | 'QUOTA_EXHAUSTED'
  | 'AUTH_REVOKED'
  | 'INACTIVE'
  | 'TOKEN_EXPIRING_SOON';

export interface InboxHealthSummary {
  inboxId: string;
  emailAddress: string;
  status: InboxHealthStatus;
  isActive: boolean;
  authRevoked: boolean;
  dailyLimit: number;
  sentToday: number;
  remainingQuota: number;
  quotaUtilizationPercent: number;
  tokenExpiresAt: string;
  isTokenExpired: boolean;
  diagnosticNotes: string[];
}

export function evaluateInboxHealth(account: {
  id: string;
  email_address: string;
  is_active: boolean;
  auth_revoked: boolean;
  daily_limit: number;
  sent_today: number;
  token_expires_at: string;
  error_message?: string | null;
}): InboxHealthSummary {
  const now = Date.now();
  const tokenExpiry = new Date(account.token_expires_at).getTime();
  const isTokenExpired = tokenExpiry <= now;
  const isTokenExpiringSoon = tokenExpiry - now < 5 * 60 * 1000; // < 5 minutes
  const remainingQuota = Math.max(0, account.daily_limit - account.sent_today);
  const quotaUtilizationPercent = account.daily_limit > 0 ? Math.round((account.sent_today / account.daily_limit) * 100) : 100;
  
  const diagnosticNotes: string[] = [];
  let status: InboxHealthStatus = 'HEALTHY';

  if (account.auth_revoked) {
    status = 'AUTH_REVOKED';
    diagnosticNotes.push('Google OAuth access was revoked or invalid. Re-authorization required.');
  } else if (!account.is_active) {
    status = 'INACTIVE';
    diagnosticNotes.push('Inbox has been paused via inbox kill switch or deactivated by administrator.');
  } else if (remainingQuota === 0) {
    status = 'QUOTA_EXHAUSTED';
    diagnosticNotes.push(`Daily sending quota of ${account.daily_limit} emails has been reached.`);
  } else if (isTokenExpired || isTokenExpiringSoon) {
    status = 'TOKEN_EXPIRING_SOON';
    diagnosticNotes.push('Access token is scheduled for automatic refresh upon next dispatch.');
  }

  if (account.error_message) {
    diagnosticNotes.push(`Last error: ${account.error_message}`);
  }

  return {
    inboxId: account.id,
    emailAddress: account.email_address,
    status,
    isActive: account.is_active,
    authRevoked: account.auth_revoked,
    dailyLimit: account.daily_limit,
    sentToday: account.sent_today,
    remainingQuota,
    quotaUtilizationPercent,
    tokenExpiresAt: account.token_expires_at,
    isTokenExpired,
    diagnosticNotes,
  };
}
