import { parseCsvLeads } from '@/lib/leads/csv-parser';
import { validateAndNormalizeLead } from '@/lib/leads/validation';
import { requirePermission } from '@/lib/auth/permissions';
import { buildAuditLogInsert } from '@/lib/engine/audit';
import { UserRole } from '@/types/database';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let leadsToImport: any[] = [];
    let workspaceId: string = '';
    let userRole: UserRole = 'viewer';
    let userId: string = 'system';
    let checkSuppression: boolean = true;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      workspaceId = body.workspaceId;
      userRole = body.userRole || 'viewer';
      userId = body.userId || 'system';
      checkSuppression = body.checkSuppression !== false;

      if (body.csvText) {
        const parsed = parseCsvLeads(body.csvText);
        if (parsed.errors.length > 0) {
          return new Response(JSON.stringify({ error: parsed.errors.join('; ') }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        leadsToImport = parsed.leads;
      } else if (Array.isArray(body.leads)) {
        leadsToImport = body.leads;
      }
    }

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'lead:import');

    if (leadsToImport.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid leads provided for import.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate and normalize all leads in batch
    const validatedBatch: any[] = [];
    let invalidCount = 0;

    for (const raw of leadsToImport) {
      const val = validateAndNormalizeLead(raw);
      if (val.valid && val.lead) {
        validatedBatch.push(val.lead);
      } else {
        invalidCount++;
      }
    }

    const auditLog = buildAuditLogInsert({
      workspaceId,
      userId,
      action: 'leads:batch_imported',
      entityType: 'leads',
      newValues: {
        totalReceived: leadsToImport.length,
        validCount: validatedBatch.length,
        invalidCount,
        checkSuppression,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalSubmitted: leadsToImport.length,
          validForImport: validatedBatch.length,
          invalidSyntaxCount: invalidCount,
          checkSuppression,
        },
        payloadForProcedure: validatedBatch,
        auditLog,
        message: 'Batch prepared and validated for database execution via import_leads_batch.',
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
