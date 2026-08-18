import { evaluateDispatchPreflight } from '../engine/guardrails';
import { generatePersonalizedEmail } from '../gemini/client';
import { renderTemplate } from '../templates/compiler';
import { buildRfc2822MimeMessage, sendGmailMimeMessage } from '../gmail/sender';
import { refreshGoogleAccessToken } from '../gmail/oauth';
import { decryptSecret } from '../crypto/encryption';

export interface DispatchLeadCandidate {
  campaignLeadId: string;
  campaignId: string;
  leadId: string;
  workspaceId: string;
  assignedAccountId: string;
  currentStep: number;
  templateId?: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  aiPromptOverride?: string | null;
  leadEmail: string;
  leadFirstName?: string | null;
  leadLastName?: string | null;
  leadCompany?: string | null;
  leadTitle?: string | null;
  leadIndustry?: string | null;
  leadPhone?: string | null;
  leadWebsite?: string | null;
  leadCustomFields?: Record<string, any>;
  campaignName: string;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendDays: number[];
  campaignTimezone: string;
  campaignDailyLimit: number;
}

export interface DispatchExecutionResult {
  campaignLeadId: string;
  leadEmail: string;
  status: 'sent' | 'rejected_guardrail' | 'quota_rejected' | 'failed' | 'reconciling_needed' | 'auth_revoked';
  messageId?: string;
  clientGeneratedMessageId?: string;
  googleMessageId?: string;
  error?: string;
  latencyMs: number;
}

/**
 * Executes full deterministic preflight, atomic quota reservation, MIME preparation,
 * and crash-resilient dispatch for a single candidate lead.
 */
export async function executeSingleLeadDispatch(
  candidate: DispatchLeadCandidate,
  accountTokens: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    tokenExpiresAt: string;
    accountEmail: string;
    isActive: boolean;
    authRevoked: boolean;
    dailyLimit: number;
    sentToday: number;
  },
  workspaceState: {
    isPaused: boolean;
    dailyLimit: number;
    sentToday: number;
    timezone: string;
  },
  isSuppressed: boolean
): Promise<DispatchExecutionResult> {
  const startTime = Date.now();

  // 1. Full deterministic preflight evaluation
  const preflight = evaluateDispatchPreflight({
    workspace: {
      id: candidate.workspaceId,
      isPaused: workspaceState.isPaused,
      dailyLimit: workspaceState.dailyLimit,
      sentToday: workspaceState.sentToday,
      timezone: workspaceState.timezone,
    },
    campaign: {
      id: candidate.campaignId,
      status: 'running',
      sendWindowStart: candidate.sendWindowStart,
      sendWindowEnd: candidate.sendWindowEnd,
      sendDays: candidate.sendDays,
      timezone: candidate.campaignTimezone,
    },
    account: {
      id: candidate.assignedAccountId,
      isActive: accountTokens.isActive,
      authRevoked: accountTokens.authRevoked,
      dailyLimit: accountTokens.dailyLimit,
      sentToday: accountTokens.sentToday,
    },
    lead: {
      id: candidate.leadId,
      email: candidate.leadEmail,
      status: 'active',
    },
    suppressed: isSuppressed,
  });

  if (!preflight.canDispatch) {
    return {
      campaignLeadId: candidate.campaignLeadId,
      leadEmail: candidate.leadEmail,
      status: 'rejected_guardrail',
      error: `${preflight.rejectionCode}: ${preflight.rejectionReason}`,
      latencyMs: Date.now() - startTime,
    };
  }

  // 2. Prepare message content (AI personalization or compiled fallback)
  let subject: string;
  let bodyText: string;
  let bodyHtml: string;

  const leadMergeContext = {
    email: candidate.leadEmail,
    first_name: candidate.leadFirstName,
    last_name: candidate.leadLastName,
    company: candidate.leadCompany,
    title: candidate.leadTitle,
    industry: candidate.leadIndustry,
    phone: candidate.leadPhone,
    website: candidate.leadWebsite,
    custom_fields: candidate.leadCustomFields,
  };

  if (candidate.aiPromptOverride || process.env.GEMINI_API_KEY) {
    const aiResult = await generatePersonalizedEmail({
      workspaceId: candidate.workspaceId,
      lead: leadMergeContext,
      subjectTemplate: candidate.subjectTemplate,
      bodyTemplate: candidate.bodyTemplate,
      aiInstructions: candidate.aiPromptOverride,
    });
    subject = aiResult.subject;
    bodyText = aiResult.bodyText;
    bodyHtml = aiResult.bodyHtml;
  } else {
    const compiled = renderTemplate(candidate.subjectTemplate, candidate.bodyTemplate, leadMergeContext);
    subject = compiled.subject;
    bodyText = compiled.bodyText;
    bodyHtml = compiled.bodyHtml;
  }

  // 3. Pre-generate RFC 2822 client Message-ID for tracking & crash reconciliation
  const clientMsgId = `<sia_${candidate.campaignId}_${candidate.leadId}_${candidate.currentStep}_${Date.now()}@sia.ai>`;

  // 4. Token validation & auto-refresh
  let accessToken: string;
  try {
    const tokenExpiry = new Date(accountTokens.tokenExpiresAt).getTime();
    if (tokenExpiry - Date.now() < 5 * 60 * 1000) {
      // Refresh token
      const refreshRes = await refreshGoogleAccessToken({
        encryptedRefreshToken: accountTokens.refreshTokenEnc,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      });

      if (refreshRes.revoked) {
        return {
          campaignLeadId: candidate.campaignLeadId,
          leadEmail: candidate.leadEmail,
          status: 'auth_revoked',
          error: 'Google OAuth token revoked by user (invalid_grant).',
          latencyMs: Date.now() - startTime,
        };
      }
      accessToken = refreshRes.newAccessToken;
    } else {
      accessToken = decryptSecret(accountTokens.accessTokenEnc);
    }
  } catch (error: any) {
    return {
      campaignLeadId: candidate.campaignLeadId,
      leadEmail: candidate.leadEmail,
      status: 'failed',
      error: `Token preparation error: ${error.message}`,
      latencyMs: Date.now() - startTime,
    };
  }

  // 5. Build RFC 2822 MIME message
  const rawMimeBase64Url = buildRfc2822MimeMessage({
    fromEmail: accountTokens.accountEmail,
    toEmail: candidate.leadEmail,
    toName: candidate.leadFirstName ? `${candidate.leadFirstName} ${candidate.leadLastName || ''}`.trim() : null,
    subject,
    bodyHtml,
    bodyText,
    clientGeneratedMessageId: clientMsgId,
    workspaceId: candidate.workspaceId,
    leadId: candidate.leadId,
    campaignId: candidate.campaignId,
  });

  // 6. Dispatch via Gmail REST API
  const dispatchRes = await sendGmailMimeMessage(accessToken, rawMimeBase64Url);

  if (dispatchRes.success && dispatchRes.googleMessageId) {
    return {
      campaignLeadId: candidate.campaignLeadId,
      leadEmail: candidate.leadEmail,
      status: 'sent',
      clientGeneratedMessageId: clientMsgId,
      googleMessageId: dispatchRes.googleMessageId,
      latencyMs: Date.now() - startTime,
    };
  }

  if (dispatchRes.errorCode === 'AUTH_REVOKED_400') {
    return {
      campaignLeadId: candidate.campaignLeadId,
      leadEmail: candidate.leadEmail,
      status: 'auth_revoked',
      clientGeneratedMessageId: clientMsgId,
      error: dispatchRes.errorMessage,
      latencyMs: Date.now() - startTime,
    };
  }

  if (dispatchRes.retryable) {
    // Ambiguous network drop / timeout -> Requires reconciliation
    return {
      campaignLeadId: candidate.campaignLeadId,
      leadEmail: candidate.leadEmail,
      status: 'reconciling_needed',
      clientGeneratedMessageId: clientMsgId,
      error: `Ambiguous dispatch state: ${dispatchRes.errorMessage}`,
      latencyMs: Date.now() - startTime,
    };
  }

  return {
    campaignLeadId: candidate.campaignLeadId,
    leadEmail: candidate.leadEmail,
    status: 'failed',
    clientGeneratedMessageId: clientMsgId,
    error: dispatchRes.errorMessage,
    latencyMs: Date.now() - startTime,
  };
}
