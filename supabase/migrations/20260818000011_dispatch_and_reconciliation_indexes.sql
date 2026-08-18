-- ============================================================================
-- SIA AI AGENT - MIGRATION 011: DISPATCH & RECONCILIATION QUERY OPTIMIZATION
-- ============================================================================

-- 1. DISPATCH CANDIDATE FETCH FUNCTION (LOCKING WITH SKIP LOCKED)
CREATE OR REPLACE FUNCTION fetch_eligible_dispatch_leads(
    p_batch_size INT DEFAULT 50
)
RETURNS TABLE (
    campaign_lead_id UUID,
    campaign_id UUID,
    lead_id UUID,
    workspace_id UUID,
    assigned_account_id UUID,
    current_step INT,
    template_id UUID,
    subject_template VARCHAR(500),
    body_template TEXT,
    ai_prompt_override TEXT,
    lead_email VARCHAR(320),
    lead_first_name VARCHAR(100),
    lead_last_name VARCHAR(100),
    lead_company VARCHAR(255),
    lead_title VARCHAR(255),
    lead_industry VARCHAR(100),
    lead_phone VARCHAR(50),
    lead_website VARCHAR(500),
    lead_custom_fields JSONB,
    campaign_name VARCHAR(255),
    send_window_start TIME,
    send_window_end TIME,
    send_days INT[],
    campaign_timezone VARCHAR(64),
    campaign_daily_limit INT,
    min_delay_seconds INT,
    max_delay_seconds INT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cl.id AS campaign_lead_id,
        cl.campaign_id,
        cl.lead_id,
        cl.workspace_id,
        COALESCE(cl.assigned_account_id, (
            SELECT ea.id 
            FROM email_accounts ea 
            WHERE ea.workspace_id = cl.workspace_id 
              AND ea.is_active = TRUE 
              AND ea.auth_revoked = FALSE
              AND ea.sent_today < ea.daily_limit
            ORDER BY ea.sent_today ASC, ea.updated_at ASC
            LIMIT 1
        )) AS assigned_account_id,
        cl.current_step,
        cs.template_id,
        COALESCE(cs.subject_template, et.subject) AS subject_template,
        COALESCE(cs.body_template, et.body_html) AS body_template,
        cs.ai_prompt_override,
        l.normalized_email AS lead_email,
        l.first_name AS lead_first_name,
        l.last_name AS lead_last_name,
        l.company AS lead_company,
        l.title AS lead_title,
        l.industry AS lead_industry,
        l.phone AS lead_phone,
        l.website AS lead_website,
        l.custom_fields AS lead_custom_fields,
        c.name AS campaign_name,
        c.send_window_start,
        c.send_window_end,
        c.send_days,
        c.timezone AS campaign_timezone,
        c.daily_limit AS campaign_daily_limit,
        c.min_delay_seconds,
        c.max_delay_seconds
    FROM campaign_leads cl
    JOIN campaigns c ON cl.campaign_id = c.id AND cl.workspace_id = c.workspace_id
    JOIN workspaces w ON cl.workspace_id = w.id
    JOIN leads l ON cl.lead_id = l.id AND cl.workspace_id = l.workspace_id
    LEFT JOIN campaign_steps cs ON cl.campaign_id = cs.campaign_id AND cl.workspace_id = cs.workspace_id AND cl.current_step = cs.step_number
    LEFT JOIN email_templates et ON cs.template_id = et.id AND cs.workspace_id = et.workspace_id
    WHERE cl.status = 'scheduled'
      AND (cl.next_send_at IS NULL OR cl.next_send_at <= NOW())
      AND c.status = 'running'
      AND w.is_paused = FALSE
      AND l.status NOT IN ('unsubscribed', 'bounced')
    ORDER BY cl.next_send_at ASC NULLS FIRST, cl.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE OF cl SKIP LOCKED;
END;
$$;

-- 2. FETCH ORPHANED / CRASHED MESSAGES FOR RECONCILIATION
CREATE OR REPLACE FUNCTION fetch_crashed_messages_for_reconciliation(
    p_batch_size INT DEFAULT 25
)
RETURNS TABLE (
    message_id UUID,
    workspace_id UUID,
    email_account_id UUID,
    campaign_lead_id UUID,
    client_generated_message_id VARCHAR(500),
    state send_state,
    retry_count INT,
    max_retries INT,
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMPTZ,
    inbox_email VARCHAR(320)
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id AS message_id,
        m.workspace_id,
        m.email_account_id,
        m.campaign_lead_id,
        m.client_generated_message_id,
        m.state,
        m.retry_count,
        m.max_retries,
        ea.access_token_enc,
        ea.refresh_token_enc,
        ea.token_expires_at,
        ea.email_address AS inbox_email
    FROM messages m
    JOIN email_accounts ea ON m.email_account_id = ea.id AND m.workspace_id = ea.workspace_id
    WHERE m.state IN ('reserved', 'dispatching', 'reconciling')
      AND (m.lease_locked_until IS NULL OR m.lease_locked_until < NOW())
    ORDER BY m.lease_locked_until ASC NULLS FIRST
    LIMIT p_batch_size
    FOR UPDATE OF m SKIP LOCKED;
END;
$$;
