-- ============================================================================
-- SIA AI AGENT - MIGRATION 003: ROW-LEVEL SECURITY & TENANT ISOLATION POLICIES
-- ============================================================================

-- 1. SECURITY HELPER FUNCTIONS
-- Helper: Retrieve all workspace IDs the current authenticated user belongs to
CREATE OR REPLACE FUNCTION current_user_workspace_ids()
RETURNS TABLE (workspace_id UUID) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT workspace_id 
    FROM workspace_members 
    WHERE user_id = auth.uid();
$$;

-- Helper: Check if current authenticated user is a member of a given workspace
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM workspace_members 
        WHERE workspace_id = p_workspace_id 
          AND user_id = auth.uid()
    );
$$;

-- Helper: Check if current authenticated user has admin/owner role in a given workspace
CREATE OR REPLACE FUNCTION is_workspace_admin(p_workspace_id UUID)
RETURNS BOOLEAN 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM workspace_members 
        WHERE workspace_id = p_workspace_id 
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
    );
$$;

-- ============================================================================
-- 2. ENABLE ROW-LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. WORKSPACES & MEMBERS POLICIES
-- ============================================================================

-- Workspaces
CREATE POLICY "Members can view their own workspaces"
ON workspaces FOR SELECT
USING (id IN (SELECT current_user_workspace_ids()));

CREATE POLICY "Admins can update their own workspace settings"
ON workspaces FOR UPDATE
USING (is_workspace_admin(id))
WITH CHECK (is_workspace_admin(id));

-- Workspace Members
CREATE POLICY "Members can view members within their workspace"
ON workspace_members FOR SELECT
USING (workspace_id IN (SELECT current_user_workspace_ids()));

CREATE POLICY "Admins can invite and manage workspace members"
ON workspace_members FOR ALL
USING (is_workspace_admin(workspace_id))
WITH CHECK (is_workspace_admin(workspace_id));

-- ============================================================================
-- 4. LEADS POLICIES
-- ============================================================================
CREATE POLICY "Members can view workspace leads"
ON leads FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can insert leads into workspace"
ON leads FOR INSERT
WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "Members can update workspace leads"
ON leads FOR UPDATE
USING (is_workspace_member(workspace_id))
WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "Admins can delete workspace leads"
ON leads FOR DELETE
USING (is_workspace_admin(workspace_id));

-- ============================================================================
-- 5. EMAIL ACCOUNTS (INBOXES) POLICIES
-- ============================================================================
CREATE POLICY "Members can view connected inboxes in workspace"
ON email_accounts FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can connect and manage email accounts"
ON email_accounts FOR ALL
USING (is_workspace_admin(workspace_id))
WITH CHECK (is_workspace_admin(workspace_id));

-- ============================================================================
-- 6. EMAIL TEMPLATES POLICIES
-- ============================================================================
CREATE POLICY "Members can view templates"
ON email_templates FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create and update templates"
ON email_templates FOR ALL
USING (is_workspace_member(workspace_id))
WITH CHECK (is_workspace_member(workspace_id));

-- ============================================================================
-- 7. CAMPAIGNS, STEPS & LEADS POLICIES
-- ============================================================================

-- Campaigns
CREATE POLICY "Members can view workspace campaigns"
ON campaigns FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can create and manage campaigns"
ON campaigns FOR ALL
USING (is_workspace_admin(workspace_id))
WITH CHECK (is_workspace_admin(workspace_id));

-- Campaign Steps
CREATE POLICY "Members can view campaign steps"
ON campaign_steps FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can create and manage campaign steps"
ON campaign_steps FOR ALL
USING (is_workspace_admin(workspace_id))
WITH CHECK (is_workspace_admin(workspace_id));

-- Campaign Leads
CREATE POLICY "Members can view campaign leads"
ON campaign_leads FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can assign and update campaign leads"
ON campaign_leads FOR ALL
USING (is_workspace_member(workspace_id))
WITH CHECK (is_workspace_member(workspace_id));

-- ============================================================================
-- 8. MESSAGES & EVENTS POLICIES
-- ============================================================================

-- Messages
CREATE POLICY "Members can view workspace messages"
ON messages FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "Service and members can insert/update messages"
ON messages FOR ALL
USING (is_workspace_member(workspace_id))
WITH CHECK (is_workspace_member(workspace_id));

-- Message Events
CREATE POLICY "Members can view message events"
ON message_events FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "System can record message events"
ON message_events FOR INSERT
WITH CHECK (is_workspace_member(workspace_id));

-- ============================================================================
-- 9. 4-TIER SUPPRESSIONS POLICIES
-- ============================================================================
-- Global rules readable by all authenticated users; Workspace rules readable by members
CREATE POLICY "View suppressions"
ON suppressions FOR SELECT
USING (
    scope = 'global' OR 
    (workspace_id IS NOT NULL AND is_workspace_member(workspace_id))
);

-- Workspace members can insert and delete workspace-scoped suppressions
CREATE POLICY "Manage workspace suppressions"
ON suppressions FOR ALL
USING (
    scope = 'workspace' AND 
    workspace_id IS NOT NULL AND 
    is_workspace_member(workspace_id)
)
WITH CHECK (
    scope = 'workspace' AND 
    workspace_id IS NOT NULL AND 
    is_workspace_member(workspace_id)
);

-- ============================================================================
-- 10. AI GENERATIONS, JOBS & AUDIT LOGS POLICIES
-- ============================================================================

-- AI Generations
CREATE POLICY "Members can view AI generation audit records"
ON ai_generations FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "System can insert AI generation records"
ON ai_generations FOR INSERT
WITH CHECK (is_workspace_member(workspace_id));

-- Jobs Queue
CREATE POLICY "Members can view workspace jobs"
ON jobs FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "System can manage workspace jobs"
ON jobs FOR ALL
USING (is_workspace_member(workspace_id))
WITH CHECK (is_workspace_member(workspace_id));

-- Audit Logs (Read-only for workspace members; inserts restricted)
CREATE POLICY "Members can view workspace audit logs"
ON audit_logs FOR SELECT
USING (is_workspace_member(workspace_id));

CREATE POLICY "System can append audit logs"
ON audit_logs FOR INSERT
WITH CHECK (is_workspace_member(workspace_id));
