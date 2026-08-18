import { UserRole } from '../types/database';

export interface UserSessionContext {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: UserRole;
  isWorkspacePaused: boolean;
}

export type PermissionAction = 
  | 'workspace:read'
  | 'workspace:update_settings'
  | 'workspace:manage_members'
  | 'workspace:toggle_killswitch'
  | 'campaign:read'
  | 'campaign:create'
  | 'campaign:update'
  | 'campaign:delete'
  | 'campaign:toggle_pause'
  | 'lead:read'
  | 'lead:create'
  | 'lead:import'
  | 'lead:delete'
  | 'inbox:read'
  | 'inbox:connect'
  | 'inbox:manage'
  | 'inbox:toggle_pause'
  | 'suppression:read'
  | 'suppression:manage'
  | 'audit:read';

const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  owner: [
    'workspace:read',
    'workspace:update_settings',
    'workspace:manage_members',
    'workspace:toggle_killswitch',
    'campaign:read',
    'campaign:create',
    'campaign:update',
    'campaign:delete',
    'campaign:toggle_pause',
    'lead:read',
    'lead:create',
    'lead:import',
    'lead:delete',
    'inbox:read',
    'inbox:connect',
    'inbox:manage',
    'inbox:toggle_pause',
    'suppression:read',
    'suppression:manage',
    'audit:read',
  ],
  admin: [
    'workspace:read',
    'workspace:update_settings',
    'workspace:manage_members',
    'workspace:toggle_killswitch',
    'campaign:read',
    'campaign:create',
    'campaign:update',
    'campaign:toggle_pause',
    'lead:read',
    'lead:create',
    'lead:import',
    'lead:delete',
    'inbox:read',
    'inbox:connect',
    'inbox:manage',
    'inbox:toggle_pause',
    'suppression:read',
    'suppression:manage',
    'audit:read',
  ],
  member: [
    'workspace:read',
    'campaign:read',
    'campaign:create',
    'campaign:update',
    'campaign:toggle_pause',
    'lead:read',
    'lead:create',
    'lead:import',
    'inbox:read',
    'suppression:read',
    'suppression:manage',
    'audit:read',
  ],
  viewer: [
    'workspace:read',
    'campaign:read',
    'lead:read',
    'inbox:read',
    'suppression:read',
    'audit:read',
  ],
};

/**
 * Checks if a given role has permission to execute an action.
 */
export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed ? allowed.includes(action) : false;
}

/**
 * Asserts that the role has the required permission, throwing an explicit error otherwise.
 */
export function requirePermission(role: UserRole, action: PermissionAction): void {
  if (!hasPermission(role, action)) {
    throw new Error(`FORBIDDEN: Role '${role}' lacks permission for action '${action}'.`);
  }
}
