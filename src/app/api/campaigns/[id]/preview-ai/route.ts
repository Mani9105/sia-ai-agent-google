import { generatePersonalizedEmail } from '@/lib/gemini/client';
import { auditEmailSpamRisk } from '@/lib/gemini/spam-checker';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const {
      workspaceId,
      userRole,
      lead,
      subjectTemplate,
      bodyTemplate,
      aiInstructions,
    } = body;

    if (!workspaceId || !campaignId || !lead || !subjectTemplate || !bodyTemplate) {
      return new Response(
        JSON.stringify({ error: 'workspaceId, campaignId, lead, subjectTemplate, and bodyTemplate are required.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:read');

    // 1. Generate personalization (fail-closed to compiled template)
    const personalResult = await generatePersonalizedEmail({
      workspaceId,
      lead,
      subjectTemplate,
      bodyTemplate,
      aiInstructions,
    });

    // 2. Perform advisory deliverability & spam audit (non-blocking)
    const spamAuditResult = await auditEmailSpamRisk({
      subject: personalResult.subject,
      bodyText: personalResult.bodyText,
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaignId,
        preview: {
          source: personalResult.source,
          subject: personalResult.subject,
          bodyText: personalResult.bodyText,
          bodyHtml: personalResult.bodyHtml,
          reasoning: personalResult.reasoning,
          latencyMs: personalResult.latencyMs,
          modelUsed: personalResult.modelUsed,
        },
        advisorySpamAudit: spamAuditResult.audit,
        message: 'Personalization preview and advisory audit generated.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
