import { classifyInboundReply } from '@/lib/gemini/classifier';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      workspaceId,
      userRole,
      originalSubject,
      originalBodyText,
      inboundReplyText,
      senderEmail,
    } = body;

    if (!workspaceId || !inboundReplyText || !senderEmail) {
      return new Response(
        JSON.stringify({ error: 'workspaceId, inboundReplyText, and senderEmail are required.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:read');

    const result = await classifyInboundReply({
      originalSubject: originalSubject || 'Sales Inquiry',
      originalBodyText: originalBodyText || '',
      inboundReplyText,
      senderEmail,
    });

    return new Response(
      JSON.stringify({
        success: true,
        classification: result.classification,
        latencyMs: result.latencyMs,
        modelUsed: result.modelUsed,
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
