-- ============================================================================
-- SIA AI AGENT - MIGRATION 008: CAMPAIGN ASSIGNMENT & SEQUENCE PROGRESSION
-- ============================================================================

-- 1. STORED PROCEDURE: ASSIGN LEADS TO CAMPAIGN (WITH AUTOMATIC SUPPRESSION EXCLUSION)
CREATE OR REPLACE FUNCTION assign_leads_to_campaign(
    p_workspace_id UUID,
    p_campaign_id UUID,
    p_lead_ids UUID[],
    p_start_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    assigned_count INT,
    suppressed_excluded_count INT,
    already_assigned_count INT,
    total_requested INT
) LANGUAGE plpgsql AS $$
DECLARE
    v_lead_id UUID;
    v_lead_email VARCHAR(320);
    v_lead_status lead_status;
    v_suppressed RECORD;
    v_assigned INT := 0;
    v_suppressed_cnt INT := 0;
    v_already_assigned INT := 0;
    v_total INT := 0;
    v_camp_exists BOOLEAN;
BEGIN
    -- Verify campaign exists in workspace
    SELECT EXISTS (
        SELECT 1 FROM campaigns 
        WHERE id = p_campaign_id AND workspace_id = p_workspace_id
    ) INTO v_camp_exists;

    IF NOT v_camp_exists THEN
        RAISE EXCEPTION 'Campaign % does not exist in workspace %', p_campaign_id, p_workspace_id;
    END IF;

    FOREACH v_lead_id IN ARRAY p_lead_ids
    LOOP
        v_total := v_total + 1;

        -- Verify lead exists in workspace and fetch details
        SELECT normalized_email, status INTO v_lead_email, v_lead_status
        FROM leads
        WHERE id = v_lead_id AND workspace_id = p_workspace_id;

        IF v_lead_email IS NULL THEN
            CONTINUE;
        END IF;

        -- Exclude if lead is already in terminal state
        IF v_lead_status IN ('unsubscribed', 'bounced') THEN
            v_suppressed_cnt := v_suppressed_cnt + 1;
            CONTINUE;
        END IF;

        -- Exclude if lead matches 4-tier suppression matrix
        SELECT * INTO v_suppressed FROM is_suppressed(p_workspace_id, v_lead_email);
        IF v_suppressed.suppressed THEN
            v_suppressed_cnt := v_suppressed_cnt + 1;
            CONTINUE;
        END IF;

        -- Attempt assignment
        BEGIN
            INSERT INTO campaign_leads (
                campaign_id,
                lead_id,
                workspace_id,
                current_step,
                status,
                next_send_at
            ) VALUES (
                p_campaign_id,
                v_lead_id,
                p_workspace_id,
                1,
                'scheduled',
                p_start_at
            );
            v_assigned := v_assigned + 1;
        EXCEPTION WHEN unique_violation THEN
            v_already_assigned := v_already_assigned + 1;
        END;
    END LOOP;

    RETURN QUERY SELECT v_assigned, v_suppressed_cnt, v_already_assigned, v_total;
END;
$$;

-- ============================================================================
-- 2. STORED PROCEDURE: ADVANCE CAMPAIGN LEAD TO NEXT SEQUENCE STEP
-- ============================================================================
CREATE OR REPLACE FUNCTION advance_campaign_lead_step(
    p_workspace_id UUID,
    p_campaign_lead_id UUID
)
RETURNS TABLE (
    lead_status campaign_lead_status,
    new_step INT,
    next_send_at TIMESTAMPTZ,
    sequence_completed BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE
    v_camp_id UUID;
    v_curr_step INT;
    v_next_step INT;
    v_delay_days INT;
    v_next_send TIMESTAMPTZ;
BEGIN
    SELECT campaign_id, current_step INTO v_camp_id, v_curr_step
    FROM campaign_leads
    WHERE id = p_campaign_lead_id AND workspace_id = p_workspace_id;

    IF v_camp_id IS NULL THEN
        RAISE EXCEPTION 'Campaign lead % not found in workspace %', p_campaign_lead_id, p_workspace_id;
    END IF;

    v_next_step := v_curr_step + 1;

    -- Check if next sequence step exists
    SELECT delay_days INTO v_delay_days
    FROM campaign_steps
    WHERE campaign_id = v_camp_id AND workspace_id = p_workspace_id AND step_number = v_next_step;

    IF v_delay_days IS NOT NULL THEN
        -- Schedule next step
        v_next_send := NOW() + (v_delay_days || ' days')::INTERVAL;
        
        UPDATE campaign_leads
        SET current_step = v_next_step,
            status = 'scheduled',
            next_send_at = v_next_send,
            updated_at = NOW()
        WHERE id = p_campaign_lead_id AND workspace_id = p_workspace_id;

        RETURN QUERY SELECT 'scheduled'::campaign_lead_status, v_next_step, v_next_send, FALSE;
    ELSE
        -- Sequence fully completed
        UPDATE campaign_leads
        SET status = 'completed',
            next_send_at = NULL,
            updated_at = NOW()
        WHERE id = p_campaign_lead_id AND workspace_id = p_workspace_id;

        RETURN QUERY SELECT 'completed'::campaign_lead_status, v_curr_step, NULL::TIMESTAMPTZ, TRUE;
    END IF;
END;
$$;
