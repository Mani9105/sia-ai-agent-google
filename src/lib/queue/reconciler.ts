import { checkMessageInGmailByClientMsgId } from '../gmail/sender';
import { refreshGoogleAccessToken } from '../gmail/oauth';
import { decryptSecret } from '../crypto/encryption';

export interface OrphanedMessageRecord {
  messageId: string;
  workspaceId: string;
  emailAccountId: string;
  campaignLeadId: string;
  clientGeneratedMessageId: string;
  state: string;
  retryCount: number;
  maxRetries: number;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  tokenExpiresAt: string;
  inboxEmail: string;
}

export interface ReconciliationOutcome {
  messageId: string;
  action: 'confirmed_sent' | 'rolled_back_and_failed' | 'rolled_back_for_retry' | 'auth_revoked_failure';
  googleMessageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Reconciles an orphaned in-flight or crashed send against Gmail.
 */
export async function reconcileOrphanedMessage(
  record: OrphanedMessageRecord
): Promise<ReconciliationOutcome> {
  // 1. Refresh or decrypt token
  let accessToken: string;
  try {
    const tokenExpiry = new Date(record.tokenExpiresAt).getTime();
    if (tokenExpiry - Date.now() < 5 * 60 * 1000) {
      const refreshRes = await refreshGoogleAccessToken({
        encryptedRefreshToken: record.refreshTokenEnc,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      });

      if (refreshRes.revoked) {
        return {
          messageId: record.messageId,
          action: 'auth_revoked_failure',
          error: 'OAuth access revoked during crash reconciliation.',
        };
      }
      accessToken = refreshRes.newAccessToken;
    } else {
      accessToken = decryptSecret(record.accessTokenEnc);
    }
  } catch (error: any) {
    return {
      messageId: record.messageId,
      action: 'rolled_back_and_failed',
      error: `Token error during reconciliation: ${error.message}`,
    };
  }

  // 2. Query Gmail by RFC 2822 Message-ID
  const checkResult = await checkMessageInGmailByClientMsgId(
    accessToken,
    record.clientGeneratedMessageId
  );

  if (checkResult.found && checkResult.googleMessageId) {
    // Gmail accepted the message: confirm as sent
    return {
      messageId: record.messageId,
      action: 'confirmed_sent',
      googleMessageId: checkResult.googleMessageId,
      threadId: checkResult.threadId,
    };
  }

  // Gmail never received the message
  if (record.retryCount < record.maxRetries) {
    return {
      messageId: record.messageId,
      action: 'rolled_back_for_retry',
      error: 'Message not found in Gmail. Safe to retry.',
    };
  }

  return {
    messageId: record.messageId,
    action: 'rolled_back_and_failed',
    error: 'Message not found in Gmail and max retries exceeded.',
  };
}
