import { extractMergeVariables, sanitizeEmailHtml } from '@/lib/templates/compiler';
import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole } from '@/types/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'campaign:read');

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        message: 'Templates listing authorized.',
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workspaceId, userRole, userId, name, subject, bodyHtml, aiInstructions } = body;

    if (!workspaceId || !name || !subject || !bodyHtml) {
      return new Response(JSON.stringify({ error: 'workspaceId, name, subject, and bodyHtml are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'campaign:create');

    const sanitizedHtml = sanitizeEmailHtml(bodyHtml);
    const extractedVars = Array.from(
      new Set([...extractMergeVariables(subject), ...extractMergeVariables(sanitizedHtml)])
    );

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId: userId || 'system',
      action: 'template:created',
      entityType: 'email_template',
      newValues: {
        name,
        subject,
        variables: extractedVars,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        template: {
          workspaceId,
          name,
          subject,
          bodyHtml: sanitizedHtml,
          variables: extractedVars,
          aiInstructions: aiInstructions || null,
        },
        auditLog,
        message: 'Template sanitized and validated.',
      }),
      {
        status: 201,
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
