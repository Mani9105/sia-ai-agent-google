import { 
  SendState, 
  SuppressionScope, 
  SuppressionType, 
  SuppressionReason, 
  UserRole,
  CampaignStatus,
  CampaignLeadStatus,
  EmailProvider
} from './database';

// ============================================================================
// 1. 4-TIER SUPPRESSION DOMAIN CONTRACTS
// ============================================================================
export interface SuppressionRule {
  id: string;
  scope: SuppressionScope;
  workspaceId: string | null;
  type: SuppressionType;
  identifier: string; // email or domain
  reason: SuppressionReason;
  source: string;
  notes?: string | null;
  createdAt: string;
}

export interface SuppressionCheckResult {
  suppressed: boolean;
  matchedScope?: SuppressionScope;
  matchedType?: SuppressionType;
  reason?: SuppressionReason;
}

// ============================================================================
// 2. SEND STATE MACHINE & CRASH RECOVERY
// ============================================================================
export type ValidSendStateTransition = {
  [K in SendState]?: SendState[];
};

export const SEND_STATE_TRANSITIONS: ValidSendStateTransition = {
  draft: ['pending', 'aborted'],
  pending: ['reserved', 'aborted', 'failed'],
  reserved: ['dispatching', 'failed', 'aborted', 'reconciling'],
  dispatching: ['sent', 'failed', 'reconciling'],
  reconciling: ['sent', 'failed', 'pending'],
  sent: [],
  failed: ['pending'], // In case of manual re-queue
  aborted: [],
};

export interface QuotaReservationRequest {
  workspaceId: string;
  accountId: string;
  campaignId: string;
  leadId: string;
  campaignLeadId: string;
  stepNumber: number;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  leaseSeconds?: number;
}

export interface QuotaReservationResult {
  success: boolean;
  rejectionReason: string;
  messageId: string | null;
  reservationId: string | null;
  clientGeneratedMessageId: string | null;
}

export interface CrashReconciliationRequest {
  messageId: string;
  workspaceId: string;
  clientGeneratedMessageId: string;
  leaseLockedUntil: string;
}

export type CrashReconciliationResult = 'reconciled_as_sent' | 'reconciled_as_failed' | 'in_flight_valid';

// ============================================================================
// 3. PROVIDER CADENCE & RATE CONTROL
// ============================================================================
export interface CadencePolicy {
  minDelaySeconds: number; // e.g. 60s between sends per inbox
  maxDailySendsPerAccount: number; // e.g. 50-100 safe limit
  burstLimitPerMinute: number; // Max requests per minute to avoid Google 429
  sendWindow: {
    startHour: number; // 9
    endHour: number;   // 17
    timezone: string;  // e.g. "America/New_York"
    allowedDays: number[]; // [1, 2, 3, 4, 5]
  };
}

// ============================================================================
// 4. ADVISORY AI SCHEMAS (GEMINI) - ZERO DISPATCH AUTHORITY
// ============================================================================
export interface GeminiPersonalizationOutput {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  personalizationReasoning: string;
}

export interface GeminiAdvisorySpamCheck {
  spamRiskScore: number; // 0.0 (clean) to 1.0 (spam-heavy)
  flaggedKeywords: string[];
  readabilityScore: number;
  advisoryRecommendations: string[];
}

export type ReplyIntentCategory = 
  | 'interested'
  | 'not_interested'
  | 'out_of_office'
  | 'unsubscribe_request'
  | 'wrong_person'
  | 'more_information_needed'
  | 'follow_up_later'
  | 'unknown';

export type SuggestedReplyAction = 
  | 'auto_stop_and_notify'
  | 'auto_unsubscribe'
  | 'reschedule_followup'
  | 'ignore_ooo'
  | 'manual_review';

export interface GeminiReplyClassificationOutput {
  category: ReplyIntentCategory;
  confidence: number;
  summary: string;
  actionRequired: SuggestedReplyAction;
  extractedReferralEmail?: string | null;
  suggestedReplyDraft?: string | null;
}

// ============================================================================
// 5. GMAIL API & FAULT RECOVERY CONTRACTS
// ============================================================================
export interface GmailTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  emailAddress: string;
}

export type GmailErrorCode = 
  | 'RATE_LIMIT_429'
  | 'BACKEND_ERROR_503'
  | 'AUTH_REVOKED_400'
  | 'INVALID_CREDENTIALS_401'
  | 'MESSAGE_TOO_LARGE_413'
  | 'RECIPIENT_NOT_FOUND_404'
  | 'UNKNOWN_ERROR';

export interface GmailDispatchResult {
  success: boolean;
  googleMessageId?: string;
  threadId?: string;
  errorCode?: GmailErrorCode;
  errorMessage?: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}

// ============================================================================
// 6. CRYPTOGRAPHIC UNSUBSCRIBE TOKEN
// ============================================================================
export interface UnsubscribePayload {
  workspaceId: string;
  leadId: string;
  email: string;
  campaignId?: string;
  exp: number; // Unix timestamp
}
