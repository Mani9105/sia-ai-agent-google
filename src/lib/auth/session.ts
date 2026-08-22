import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

export interface AuthenticatedSession {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: UserRole;
  isWorkspacePaused: boolean;
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('UNAUTHORIZED: Authentication required.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select(`
      role,
      workspace_id,
      workspaces (
        id,
        name,
        slug,
        is_paused
      )
    `)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`WORKSPACE_LOOKUP_FAILED: ${membershipError.message}`);
  }

  if (!membership || !membership.workspaces) {
    throw new Error('FORBIDDEN: User is not a member of any workspace.');
  }

  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces;

  if (!workspace) {
    throw new Error('FORBIDDEN: Workspace could not be resolved.');
  }

  return {
    userId: user.id,
    email: user.email || '',
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    role: membership.role as UserRole,
    isWorkspacePaused: workspace.is_paused,
  };
}
