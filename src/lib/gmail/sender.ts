import { generateUnsubscribeToken } from '../crypto/tokens';
import { GmailDispatchResult, GmailErrorCode } from '../../types/domain';

export interface MimeEmailOptions {
  fromEmail: string;
  fromName?: string | null;
  toEmail: string;
  toName?: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  clientGeneratedMessageId: string; // Pre-generated RFC 2822 Message-ID
  workspaceId: string;
  leadId: string;
  campaignId?: string;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
}

/**
 * Builds an RFC 2822 compliant MIME message string formatted for the Gmail REST API.
 * Includes RFC 8058 One-Click List-Unsubscribe headers and threading headers.
 */
export function buildRfc2822MimeMessage(options: MimeEmailOptions): string {
  const fromFormatted = options.fromName 
    ? `"${options.fromName.replace(/"/g, '')}" <${options.fromEmail}>` 
    : options.fromEmail;

  const toFormatted = options.toName 
    ? `"${options.toName.replace(/"/g, '')}" <${options.toEmail}>` 
    : options.toEmail;

  // Generate cryptographically signed unsubscribe token and URLs
  const unsubToken = generateUnsubscribeToken(
    options.workspaceId,
    options.leadId,
    options.toEmail,
    options.campaignId
  );
  const unsubUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.sia.ai'}/api/webhooks/unsubscribe?token=${unsubToken}`;

  const headers: string[] = [
    `From: ${fromFormatted}`,
    `To: ${toFormatted}`,
    `Subject: ${options.subject}`,
    `Message-ID: ${options.clientGeneratedMessageId}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: <${unsubUrl}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
  ];

  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
  }

  if (options.referencesHeader) {
    headers.push(`References: ${options.referencesHeader}`);
  }

  const boundary = `====_sia_boundary_${Date.now()}_====`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const mimeBody = [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    options.bodyText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    options.bodyHtml,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(mimeBody, 'utf8').toString('base64url');
}

/**
 * Dispatches an email via the Google Gmail REST API.
 * Encapsulates full error classification and retryability detection.
 */
export async function sendGmailMimeMessage(
  accessToken: string,
  rawMimeBase64Url: string,
  threadId?: string | null,
  timeoutMs: number = 10000
): Promise<GmailDispatchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload: { raw: string; threadId?: string } = { raw: rawMimeBase64Url };
    if (threadId) {
      payload.threadId = threadId;
    }

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        googleMessageId: data.id,
        threadId: data.threadId,
        retryable: false,
      };
    }

    const statusCode = response.status;
    const errorBody = await response.json().catch(() => ({}));
    const errorMessage = errorBody?.error?.message || `Gmail API HTTP Error ${statusCode}`;

    // Classify Error
    if (statusCode === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
      return {
        success: false,
        errorCode: 'RATE_LIMIT_429',
        errorMessage,
        retryable: true,
        retryAfterSeconds: retryAfter,
      };
    }

    if (statusCode >= 500) {
      return {
        success: false,
        errorCode: 'BACKEND_ERROR_503',
        errorMessage,
        retryable: true,
        retryAfterSeconds: 30,
      };
    }

    if (statusCode === 401 || (statusCode === 400 && errorBody?.error === 'invalid_grant')) {
      return {
        success: false,
        errorCode: 'AUTH_REVOKED_400',
        errorMessage: 'OAuth token has been revoked or expired.',
        retryable: false,
      };
    }

    if (statusCode === 404) {
      return {
        success: false,
        errorCode: 'RECIPIENT_NOT_FOUND_404',
        errorMessage,
        retryable: false,
      };
    }

    return {
      success: false,
      errorCode: 'UNKNOWN_ERROR',
      errorMessage,
      retryable: false,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';

    return {
      success: false,
      errorCode: isTimeout ? 'BACKEND_ERROR_503' : 'UNKNOWN_ERROR',
      errorMessage: isTimeout ? 'Network timeout communicating with Gmail API.' : error.message,
      retryable: true, // Ambiguous network drop -> must be reconciled before retry!
    };
  }
}

/**
 * Queries Gmail using the pre-generated RFC 2822 Message-ID to verify if an ambiguous send succeeded.
 */
export async function checkMessageInGmailByClientMsgId(
  accessToken: string,
  clientGeneratedMessageId: string
): Promise<{
  found: boolean;
  googleMessageId?: string;
  threadId?: string;
  error?: string;
}> {
  try {
    // Strip leading/trailing angle brackets for query
    const cleanMsgId = clientGeneratedMessageId.replace(/^<|>$/g, '');
    const query = `rfc822msgid:${cleanMsgId}`;
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { found: false, error: `Gmail search query returned status ${response.status}` };
    }

    const data = await response.json();
    if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
      const match = data.messages[0];
      return {
        found: true,
        googleMessageId: match.id,
        threadId: match.threadId,
      };
    }

    return { found: false };
  } catch (error: any) {
    return { found: false, error: error.message };
  }
}
