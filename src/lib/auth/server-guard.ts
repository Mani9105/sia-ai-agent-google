import { UserSessionContext, PermissionAction, requirePermission } from './permissions';

/**
 * Server-side guard to guarantee tenant boundary enforcement.
 * Every server-side operation must supply an authenticated UserSessionContext.
 */
export class TenantServerGuard {
  private readonly context: UserSessionContext;

  constructor(context: UserSessionContext) {
    if (!context || !context.workspaceId || !context.userId) {
      throw new Error('UNAUTHORIZED: Valid authenticated workspace context is required.');
    }
    this.context = context;
  }

  get workspaceId(): string {
    return this.context.workspaceId;
  }

  get userId(): string {
    return this.context.userId;
  }

  get role(): string {
    return this.context.role;
  }

  get isWorkspacePaused(): boolean {
    return this.context.isWorkspacePaused;
  }

  /**
   * Asserts permission for the current tenant context.
   */
  assertPermission(action: PermissionAction): void {
    requirePermission(this.context.role, action);
  }

  /**
   * Asserts that the workspace is currently active (not paused).
   */
  assertWorkspaceActive(): void {
    if (this.context.isWorkspacePaused) {
      throw new Error('WORKSPACE_PAUSED: All operations are currently halted by the workspace kill switch.');
    }
  }

  /**
   * Generates a SQL WHERE condition fragment or parameter object guaranteeing tenant scoping.
   */
  scopeQuery<T extends Record<string, any>>(queryParams: T): T & { workspace_id: string } {
    return {
      ...queryParams,
      workspace_id: this.context.workspaceId,
    };
  }
}
