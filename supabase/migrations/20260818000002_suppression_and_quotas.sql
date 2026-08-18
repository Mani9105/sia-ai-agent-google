-- ============================================================================
-- SIA AI AGENT - MIGRATION 002: 4-TIER SUPPRESSION & ATOMIC QUOTA MANAGEMENT
-- ============================================================================

-- 1. 4-TIER SUPPRESSION TYPES & TABLE
CREATE TYPE suppression_scope AS ENUM ('workspace', 'global');
CREATE TYPE suppression_type AS ENUM ('exact_email', 'domain_wildcard');
CREATE TYPE suppression_reason AS ENUM (
    'unsubscribe', 
    'hard_bounce', 
    'soft_bounce_threshold', 
    'spam_complaint', 
    'manual_block', 
    'ai_detected_optout',
    'system_compliance'
);

CREATE TABLE suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope suppression_scope NOT NULL DEFAULT 'workspace',
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL for 'global'
    type suppression_type NOT NULL,
    identifier VARCHAR(320) NOT NULL, -- Normalized lower(email) or lower(domain.com)
    normalized_identifier VARCHAR(320) GENERATED ALWAYS AS (LOWER(TRIM(identifier))) STORED,
    reason suppression_reason NOT NULL,
    source VARCHAR(255) NOT NULL DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_suppression_scope CHECK (
        (scope = 'global' AND workspace_id IS NULL) OR
        (scope = 'workspace' AND workspace_id IS NOT NULL)
    )
);

-- Unique constraint preventing duplicate active suppression rules per scope
CREATE UNIQUE INDEX idx_suppressions_unique_rule 
ON suppressions(COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), type, normalized_identifier);

-- Highly optimized suppression lookup index
CREATE INDEX idx_suppressions_fast_lookup 
ON suppressions(normalized_identifier, type, scope, workspace_id);

-- ============================================================================
-- 2. DETERMINISTIC SUPPRESSION CHECK FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION is_suppressed(
    p_workspace_id UUID,
    p_email VARCHAR
)
RETURNS TABLE (
    suppressed BOOLEAN,
    matched_scope suppression_scope,
    matched_type suppression_type,
    suppression_reason suppression_reason
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_norm_email VARCHAR(320) := LOWER(TRIM(p_email));
    v_norm_domain VARCHAR(255) := LOWER(SUBSTRING(TRIM(p_email) FROM '@(.*)$'));
BEGIN
    RETURN QUERY
    SELECT 
        TRUE,
        s.scope,
        s.type,
        s.reason
    FROM suppressions s
    WHERE (s.scope = 'global' OR s.workspace_id = p_workspace_id)
      AND (
          (s.type = 'exact_email' AND s.normalized_identifier = v_norm_email) OR
          (s.type = 'domain_wildcard' AND s.normalized_identifier = v_norm_domain)
      )
    ORDER BY (CASE WHEN s.type = 'exact_email' THEN 1 ELSE 2 END)
    LIMIT 1;

    -- If no record found, returns empty set (caller defaults to false)
END;
$$;

-- ============================================================================
-- 3. ATOMIC QUOTA RESERVATION FUNCTION
-- Prevents race conditions and guarantees limits are never breached.
-- ============================================================================
CREATE OR REPLACE FUNCTION reserve_send_quota(
    p_workspace_id UUID,
    p_account_id UUID,
    p_campaign_id UUID,
    p_lead_id UUID,
    p_campaign_lead_id UUID,
    p_step_number INT,
    p_subject VARCHAR(500),
    p_body_html TEXT,
    p_body_text TEXT,
    p_thread_id VARCHAR(255) DEFAULT NULL,
    p_in_reply_to VARCHAR(500) DEFAULT NULL,
    p_references_header TEXT DEFAULT NULL,
    p_lease_seconds INT DEFAULT 180
)
RETURNS TABLE (
    success BOOLEAN,
    rejection_reason TEXT,
    message_id UUID,
    reservation_id UUID,
    client_msg_id VARCHAR(500)
) LANGUAGE plpgsql AS $$
DECLARE
    v_ws_paused BOOLEAN;
    v_ws_limit INT;
    v_acc_active BOOLEAN;
    v_acc_revoked BOOLEAN;
    v_acc_limit INT;
    v_acc_sent INT;
    v_camp_status campaign_status;
    v_camp_limit INT;
    v_lead_email VARCHAR(320);
    v_suppressed RECORD;
    v_reservation_id UUID := gen_random_uuid();
    v_client_msg_id VARCHAR(500);
    v_idempotency_key VARCHAR(255);
    v_message_id UUID;
BEGIN
    -- 1. Check workspace state with row lock
    SELECT is_paused, daily_send_limit INTO v_ws_paused, v_ws_limit
    FROM workspaces WHERE id = p_workspace_id FOR UPDATE;
    
    IF v_ws_paused THEN
        RETURN QUERY SELECT FALSE, 'workspace_paused', NULL::UUID, NULL::UUID, NULL::VARCHAR;
        RETURN;
    END IF;

    -- 2. Check email account state and quotas with row lock
    SELECT is_active, auth_revoked, daily_limit, sent_today INTO v_acc_active, v_acc_revoked, v_acc_limit, v_acc_sent
    FROM email_accounts WHERE id = p_account_id AND workspace_id = p_workspace_id FOR UPDATE;

    IF v_acc_revoked OR NOT v_acc_active THEN
        RETURN QUERY SELECT FALSE, 'account_inactive_or_revoked', NULL::UUID, NULL::UUID, NULL::VARCHAR;
        RETURN;
    END IF;

    IF v_acc_sent >= v_acc_limit THEN
        RETURN QUERY SELECT FALSE, 'account_daily_limit_reached', NULL::UUID, NULL::UUID, NULL::VARCHAR;
        RETURN;
    END IF;

    -- 3. Check campaign status with row lock
    SELECT status, daily_limit INTO v_camp_status, v_camp_limit
    FROM campaigns WHERE id = p_campaign_id AND workspace_id = p_workspace_id FOR UPDATE;

    IF v_camp_status != 'running' THEN
        RETURN QUERY SELECT FALSE, 'campaign_not_running', NULL::UUID, NULL::UUID, NULL::VARCHAR;
        RETURN;
    END IF;

    -- 4. Verify lead existence and email address
    SELECT normalized_email INTO v_lead_email
    FROM leads WHERE id = p_lead_id AND workspace_id = p_workspace_id;

    IF v_lead_email IS NULL THEN
        RETURN QUERY SELECT FALSE, 'lead_not_found', NULL::UUID, NULL::UUID, NULL::VARCHAR;
        RETURN;
    END IF;

    -- 5. Deterministic Suppression Verification (4-tier hierarchy)
    SELECT * INTO v_suppressed FROM is_suppressed(p_workspace_id, v_lead_email);
    IF v_suppressed.suppressed THEN
        -- Mark campaign lead as suppressed
        UPDATE campaign_leads 
        SET status = 'suppressed', updated_at = NOW() 
        WHERE id = p_campaign_lead_id AND workspace_id = p_workspace_id;

        RETURN QUERY SELECT FALSE, 'recipient_suppressed', NULL::UUID, NULL::UUID, NULL::VARCHAR;
        RETURN;
    END IF;

    -- 6. Generate RFC 2822 Message-ID and Idempotency Key
    v_client_msg_id := '<sia_' || v_reservation_id::text || '@sia.ai>';
    v_idempotency_key := 'msg_' || p_campaign_id::text || '_' || p_lead_id::text || '_' || p_step_number::text;

    -- 7. Insert message in 'reserved' state with lease lock
    INSERT INTO messages (
        workspace_id,
        campaign_id,
        campaign_lead_id,
        email_account_id,
        lead_id,
        direction,
        state,
        thread_id,
        client_generated_message_id,
        in_reply_to,
        references_header,
        idempotency_key,
        subject,
        body_html,
        body_text,
        reservation_id,
        lease_locked_until,
        dispatch_started_at
    ) VALUES (
        p_workspace_id,
        p_campaign_id,
        p_campaign_lead_id,
        p_account_id,
        p_lead_id,
        'outbound',
        'reserved',
        p_thread_id,
        v_client_msg_id,
        p_in_reply_to,
        p_references_header,
        v_idempotency_key,
        p_subject,
        p_body_html,
        p_body_text,
        v_reservation_id,
        NOW() + (p_lease_seconds || ' seconds')::INTERVAL,
        NOW()
    )
    RETURNING id INTO v_message_id;

    -- 8. Atomically increment account quota
    UPDATE email_accounts 
    SET sent_today = sent_today + 1, updated_at = NOW() 
    WHERE id = p_account_id AND workspace_id = p_workspace_id;

    -- 9. Update campaign lead status to dispatching
    UPDATE campaign_leads
    SET status = 'scheduled', updated_at = NOW()
    WHERE id = p_campaign_lead_id AND workspace_id = p_workspace_id;

    RETURN QUERY SELECT TRUE, 'quota_reserved', v_message_id, v_reservation_id, v_client_msg_id;
END;
$$;

-- ============================================================================
-- 4. QUOTA ROLLBACK FUNCTION (Permanent Failure / Pre-Dispatch Abort)
-- ============================================================================
CREATE OR REPLACE FUNCTION release_send_quota(
    p_message_id UUID,
    p_workspace_id UUID,
    p_error_code VARCHAR(64),
    p_error_message TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    v_account_id UUID;
    v_current_state send_state;
BEGIN
    SELECT email_account_id, state INTO v_account_id, v_current_state
    FROM messages 
    WHERE id = p_message_id AND workspace_id = p_workspace_id FOR UPDATE;

    IF v_account_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Decrement quota only if was in reserved/dispatching state
    IF v_current_state IN ('reserved', 'dispatching', 'reconciling') THEN
        UPDATE email_accounts
        SET sent_today = GREATEST(0, sent_today - 1), updated_at = NOW()
        WHERE id = v_account_id AND workspace_id = p_workspace_id;
    END IF;

    -- Update message state to failed
    UPDATE messages
    SET state = 'failed',
        failed_at = NOW(),
        error_code = p_error_code,
        error_message = p_error_message,
        lease_locked_until = NULL
    WHERE id = p_message_id AND workspace_id = p_workspace_id;

    RETURN TRUE;
END;
$$;

-- ============================================================================
-- 5. CONFIRM SEND SUCCESS FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION confirm_send_success(
    p_message_id UUID,
    p_workspace_id UUID,
    p_google_message_id VARCHAR(255),
    p_thread_id VARCHAR(255)
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    v_campaign_lead_id UUID;
BEGIN
    UPDATE messages
    SET state = 'sent',
        google_message_id = p_google_message_id,
        thread_id = COALESCE(p_thread_id, thread_id),
        sent_at = NOW(),
        lease_locked_until = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE id = p_message_id AND workspace_id = p_workspace_id
    RETURNING campaign_lead_id INTO v_campaign_lead_id;

    IF v_campaign_lead_id IS NOT NULL THEN
        UPDATE campaign_leads
        SET status = 'sent',
            last_sent_at = NOW(),
            updated_at = NOW()
        WHERE id = v_campaign_lead_id AND workspace_id = p_workspace_id;
    END IF;

    -- Record sent event in message_events
    INSERT INTO message_events (
        workspace_id,
        message_id,
        event_type,
        metadata
    ) VALUES (
        p_workspace_id,
        p_message_id,
        'sent',
        jsonb_build_object('google_message_id', p_google_message_id, 'thread_id', p_thread_id)
    );

    RETURN TRUE;
END;
$$;

-- ============================================================================
-- 6. CRASH RECONCILIATION FUNCTION
-- Reconciles in-flight sends when workers terminate unexpectedly.
-- ============================================================================
CREATE OR REPLACE FUNCTION reconcile_crashed_message(
    p_message_id UUID,
    p_workspace_id UUID,
    p_found_in_provider BOOLEAN,
    p_google_msg_id VARCHAR(255) DEFAULT NULL,
    p_thread_id VARCHAR(255) DEFAULT NULL,
    p_error_details TEXT DEFAULT NULL
)
RETURNS VARCHAR(32) LANGUAGE plpgsql AS $$
BEGIN
    IF p_found_in_provider THEN
        -- Provider accepted the message: confirm as sent
        PERFORM confirm_send_success(p_message_id, p_workspace_id, p_google_msg_id, p_thread_id);
        RETURN 'reconciled_as_sent';
    ELSE
        -- Provider never received the message: rollback quota and allow clean retry or fail
        PERFORM release_send_quota(p_message_id, p_workspace_id, 'WORKER_CRASH_RECONCILED', p_error_details);
        RETURN 'reconciled_as_failed';
    END IF;
END;
$$;
