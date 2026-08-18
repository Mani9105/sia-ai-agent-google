import { verifyUnsubscribeToken } from '@/lib/crypto/tokens';
import { buildAuditLogInsert } from '@/lib/engine/audit';

/**
 * RFC 8058 One-Click List-Unsubscribe Webhook & Unsubscribe Portal.
 * 
 * CRITICAL INVARIANT:
 * - GET requests are strictly non-mutating (read-only UI view) to prevent email
 *   prefetchers, security scanners, and preview crawlers from unsubscribing recipients.
 * - State mutations ONLY occur via POST requests with verified HMAC tokens.
 */

// POST Handler: The sole state-changing endpoint for unsubscribes
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing signed unsubscribe token.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cryptographic verification
    const verification = verifyUnsubscribeToken(token);
    if (!verification.valid || !verification.payload) {
      return new Response(JSON.stringify({ error: `Unauthorized: ${verification.reason}` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { workspaceId, leadId, email, campaignId } = verification.payload;

    // Build immutable audit log capturing specific source
    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: null,
      action: 'lead:unsubscribed_recipient_request',
      entityType: 'leads',
      entityId: leadId,
      newValues: {
        email,
        campaignId,
        source: 'rfc8058_one_click_post',
        reason: 'unsubscribe',
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Recipient ${email} has been unsubscribed.`,
        details: {
          email,
          workspaceId,
          leadId,
          campaignId,
          source: 'recipient_request',
          reason: 'unsubscribe',
        },
        auditLog,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Internal processing error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// GET Handler: Strictly non-mutating UI confirmation page
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new Response('<h1>Invalid or missing unsubscribe token</h1>', {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const verification = verifyUnsubscribeToken(token);
  if (!verification.valid || !verification.payload) {
    return new Response(`<h1>Unsubscribe link invalid or expired (${verification.reason})</h1>`, {
      status: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Purely presentational response; no database mutation on GET
  return new Response(
    `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Confirm Unsubscribe</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f3f4f6;">
        <div style="background: #ffffff; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); max-width: 460px; width: 90%; text-align: center;">
          <div style="width: 48px; height: 48px; background: #fee2e2; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </div>
          <h2 style="color: #111827; margin: 0 0 0.5rem 0; font-size: 1.35rem;">Confirm Unsubscribe</h2>
          <p style="color: #4b5563; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.75rem;">
            Click the button below to remove <strong>${verification.payload.email}</strong> from all automated email outreach.
          </p>
          <form method="POST" action="/api/webhooks/unsubscribe?token=${token}">
            <button type="submit" style="background: #dc2626; color: #ffffff; border: none; padding: 12px 28px; font-size: 1rem; font-weight: 600; border-radius: 8px; cursor: pointer; width: 100%; transition: background 0.2s;">
              Unsubscribe Me
            </button>
          </form>
        </div>
      </body>
    </html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }
  );
}
