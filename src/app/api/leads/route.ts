import { validateAndNormalizeLead } from '@/lib/leads/validation';
import { requirePermission } from '@/lib/auth/permissions';
import { UserRole } from '@/types/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const userRole = (searchParams.get('userRole') as UserRole) || 'viewer';
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission(userRole, 'lead:read');

    return new Response(
      JSON.stringify({
        success: true,
        page,
        limit,
        filters: { workspaceId, search, status },
        message: 'Lead query validated.',
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
    const { workspaceId, userRole, lead: rawLead, checkSuppression = true } = body;

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    requirePermission((userRole as UserRole) || 'viewer', 'lead:create');

    const validation = validateAndNormalizeLead(rawLead);
    if (!validation.valid || !validation.lead) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        validatedLead: validation.lead,
        workspaceId,
        checkSuppression,
        message: 'Lead validated and ready for atomic insertion.',
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
