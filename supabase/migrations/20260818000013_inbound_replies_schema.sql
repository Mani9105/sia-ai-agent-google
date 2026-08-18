-- ============================================================================
-- SIA AI AGENT - MIGRATION 013: INBOUND REPLIES SCHEMA & IDEMPOTENT INGESTION
-- ============================================================================

-- 1. UNIQUE CONSTRAINT ON INBOUND MESSAGES PER WORKSPACE & GOOGLE MESSAGE ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_inbound_dedup 
ON messages(workspace_id, google_message_id) 
WHERE direction = 'inbound' AND google_message_id IS NOT NULL;

-- 2. STORED PROCEDURE: IDEMPOTENT INBOUND REPLY INGESTION & THREAD MATCHING
CREATE OR REPLACE FUNCTION ingest_inbound_reply(
    p_workspace_id UUID,
    p_account_id UUID,
    p_google_message_id VARCHAR(255),
    p_thread_id VARCHAR(255),
    p_internet_message_id VARCHAR(500),
    p_in_reply_to VARCHAR(500),
    p_references_header TEXT,
    p_from_email VARCHAR(320),
    p_subject VARCHAR(500),
    p_body_html TEXT,
    p_body_text TEXT,
    p_snippet VARCHAR(500),
    p_received_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    message_id UUID,
    lead_id UUID,
    campaign_id UUID,
    campaign_lead_id UUID,
    is_duplicate BOOLEAN,
    halted_campaign BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE
    v_norm_from VARCHAR(320) := LOWER(TRIM(p_from_email));
    v_lead_id UUID;
    v_campaign_id UUID;
    v_campaign_lead_id UUID;
    v_message_id UUID;
    v_outbound_msg RECORD;
    v_stop_on_reply BOOLEAN := TRUE;
    v_halted BOOLEAN := FALSE;
    v_client_msg_id VARCHAR(500);
BEGIN
    -- 1. Check for duplicate inbound message
    SELECT id INTO v_message_id
    FROM messages
    WHERE workspace_id = p_workspace_id
      AND google_message_id = p_google_message_id
      AND direction = 'inbound';

    IF v_message_id IS NOT NULL THEN
        -- Already ingested: return cleanly without duplicate state mutation
        SELECT m.lead_id, m.campaign_id, m.campaign_lead_id INTO v_lead_id, v_campaign_id, v_campaign_lead_id
        FROM messages m WHERE m.id = v_message_id;
        
        RETURN QUERY SELECT v_message_id, v_lead_id, v_campaign_id, v_campaign_lead_id, TRUE, FALSE;
        RETURN;
    END IF;

    -- 2. Attempt Thread Matching: Find matching outbound message by thread_id or in_reply_to
    IF p_thread_id IS NOT NULL THEN
        SELECT m.id, m.lead_id, m.campaign_id, m.campaign_lead_id INTO v_outbound_msg
        FROM messages m
        WHERE m.workspace_id = p_workspace_id
          AND m.thread_id = p_thread_id
          AND m.direction = 'outbound'
        ORDER BY m.created_at DESC
        LIMIT 1;
    END IF;

    -- If not found by thread_id, attempt match by In-Reply-To Message-ID
    IF v_outbound_msg.id IS NULL AND p_in_reply_to IS NOT NULL THEN
        SELECT m.id, m.lead_id, m.campaign_id, m.campaign_lead_id INTO v_outbound_msg
        FROM messages m
        WHERE m.workspace_id = p_workspace_id
          AND (m.client_generated_message_id = p_in_reply_to OR m.internet_message_id = p_in_reply_to)
          AND m.direction = 'outbound'
        LIMIT 1;
    END IF;

    IF v_outbound_msg.id IS NOT NULL THEN
        v_lead_id := v_outbound_msg.lead_id;
        v_campaign_id := v_outbound_msg.campaign_id;
        v_campaign_lead_id := v_outbound_msg.campaign_lead_id;
    ELSE
        -- Fallback match: Look up lead by sender email in workspace
        SELECT l.id INTO v_lead_id
        FROM leads l
        WHERE l.workspace_id = p_workspace_id
          AND l.normalized_email = v_norm_from
        LIMIT 1;

        -- If lead exists, find active campaign lead
        IF v_lead_id IS NOT NULL THEN
            SELECT cl.id, cl.campaign_id INTO v_campaign_lead_id, v_campaign_id
            FROM campaign_leads cl
            WHERE cl.workspace_id = p_workspace_id
              AND cl.lead_id = v_lead_id
              AND cl.status IN ('scheduled', 'sent')
            ORDER BY cl.updated_at DESC
            LIMIT 1;
        END IF;
    END IF;

    -- If lead still unknown, create an active lead record
    IF v_lead_id IS NULL THEN
        INSERT INTO leads (
            workspace_id,
            email,
            first_name,
            status
        ) VALUES (
            p_workspace_id,
            v_norm_from,
            'Inbound Contact',
            'replied'
        ) RETURNING id INTO v_lead_id;
    END IF;

    -- 3. Insert Inbound Message
    v_client_msg_id := '<inbound_' || gen_random_uuid()::text || '@sia.ai>';

    INSERT INTO messages (
        workspace_id,
        campaign_id,
        campaign_lead_id,
        email_account_id,
        lead_id,
        direction,
        state,
        thread_id,
        google_message_id,
        client_generated_message_id,
        internet_message_id,
        in_reply_to,
        references_header,
        subject,
        body_html,
        body_text,
        snippet,
        received_at,
        sent_at
    ) VALUES (
        p_workspace_id,
        v_campaign_id,
        v_campaign_lead_id,
        p_account_id,
        v_lead_id,
        'inbound',
        'sent',
        p_thread_id,
        p_google_message_id,
        v_client_msg_id,
        p_internet_message_id,
        p_in_reply_to,
        p_references_header,
        p_subject,
        p_body_html,
        p_body_text,
        p_snippet,
        p_received_at,
        p_received_at
    ) RETURNING id INTO v_message_id;

    -- 4. Record Message Event
    INSERT INTO message_events (
        workspace_id,
        message_id,
        event_type,
        metadata
    ) VALUES (
        p_workspace_id,
        v_message_id,
        'replied',
        jsonb_build_object(
            'from', v_norm_from,
            'google_message_id', p_google_message_id,
            'thread_id', p_thread_id
        )
    );

    -- 5. Deterministic Campaign Sequence Halt (Stop-on-Reply)
    IF v_campaign_lead_id IS NOT NULL THEN
        -- Check campaign stop_on_reply setting
        IF v_campaign_id IS NOT NULL THEN
            SELECT stop_on_reply INTO v_stop_on_reply
            FROM campaigns
            WHERE id = v_campaign_id AND workspace_id = p_workspace_id;
        END IF;

        IF v_stop_on_reply IS TRUE THEN
            UPDATE campaign_leads
            SET status = 'replied',
                next_send_at = NULL, -- Halts any pending future sequence dispatches
                updated_at = NOW()
            WHERE id = v_campaign_lead_id AND workspace_id = p_workspace_id;

            v_halted := TRUE;
        END IF;
    END IF;

    -- Update lead status to replied
    UPDATE leads
    SET status = 'replied',
        updated_at = NOW()
    WHERE id = v_lead_id AND workspace_id = p_workspace_id AND status != 'unsubscribed';

    -- Emit audit log
    INSERT INTO audit_logs (
        workspace_id,
        action,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_workspace_id,
        'reply:ingested',
        'message',
        v_message_id,
        jsonb_build_object(
            'from', v_norm_from,
            'google_message_id', p_google_message_id,
            'thread_id', p_thread_id,
            'lead_id', v_lead_id,
            'campaign_id', v_campaign_id,
            'sequence_halted', v_halted
        )
    );

    RETURN QUERY SELECT v_message_id, v_lead_id, v_campaign_id, v_campaign_lead_id, FALSE, v_halted;
END;
$$;
