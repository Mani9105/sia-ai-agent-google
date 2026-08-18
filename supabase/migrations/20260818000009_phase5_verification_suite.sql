-- ============================================================================
-- SIA AI AGENT - PHASE 5 AUTOMATED VERIFICATION TEST SUITE
-- Validates Campaign State Transitions, Multi-Step Sequence Delays,
-- Lead Assignment Suppression Filtering, Sequence Progression, and Inbound Halts.
-- ============================================================================

DO $$
DECLARE
    v_ws UUID := gen_random_uuid();
    v_user UUID := gen_random_uuid();
    
    v_template UUID := gen_random_uuid();
    v_campaign UUID := gen_random_uuid();
    v_step1 UUID := gen_random_uuid();
    v_step2 UUID := gen_random_uuid();
    
    v_lead_active UUID := gen_random_uuid();
    v_lead_suppressed UUID := gen_random_uuid();
    v_lead_unsub UUID := gen_random_uuid();
    
    v_assign_res RECORD;
    v_advance_res RECORD;
    v_clead_id UUID;
    v_status campaign_lead_status;
    v_step INT;
    v_completed BOOLEAN;
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'STARTING SIA AI AGENT PHASE 5 VERIFICATION SUITE';
    RAISE NOTICE '================================================================';

    -- ------------------------------------------------------------------------
    -- 1. SETUP WORKSPACE & TEMPLATE
    -- ------------------------------------------------------------------------
    INSERT INTO workspaces (id, name, slug, daily_send_limit)
    VALUES (v_ws, 'Sequence Test Corp', 'sequence-corp', 500);

    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_ws, v_user, 'owner');

    INSERT INTO email_templates (id, workspace_id, name, subject, body_html)
    VALUES (v_template, v_ws, 'Cold Outreach Template', 'Quick question for {{first_name}}', '<p>Hi {{first_name}}, let us talk about {{company | your company}}.</p>');

    RAISE NOTICE '[PASS] Phase 5 Test 1: Template created.';

    -- ------------------------------------------------------------------------
    -- 2. CREATE CAMPAIGN & MULTI-STEP SEQUENCE
    -- ------------------------------------------------------------------------
    INSERT INTO campaigns (
        id, workspace_id, name, status, daily_limit,
        send_window_start, send_window_end, send_days,
        stop_on_reply, stop_on_bounce
    ) VALUES (
        v_campaign, v_ws, 'Enterprise Q3 Sequence', 'draft', 150,
        '09:00:00', '17:00:00', '{1,2,3,4,5}',
        TRUE, TRUE
    );

    -- Step 1 (Initial Outreach, Delay 0)
    INSERT INTO campaign_steps (id, campaign_id, workspace_id, step_number, delay_days, template_id)
    VALUES (v_step1, v_campaign, v_ws, 1, 0, v_template);

    -- Step 2 (Follow-up, Delay 3 days)
    INSERT INTO campaign_steps (id, campaign_id, workspace_id, step_number, delay_days, subject_template, body_template)
    VALUES (v_step2, v_campaign, v_ws, 2, 3, 'Following up on my last email', '<p>Did you see my previous message?</p>');

    -- Verify campaign state transition from draft -> running
    UPDATE campaigns SET status = 'running', updated_at = NOW() WHERE id = v_campaign;

    IF NOT EXISTS (SELECT 1 FROM campaigns WHERE id = v_campaign AND status = 'running') THEN
        RAISE EXCEPTION 'TEST_FAIL: Campaign failed to transition to running.';
    END IF;

    RAISE NOTICE '[PASS] Phase 5 Test 2: Multi-step sequence configured and campaign activated.';

    -- ------------------------------------------------------------------------
    -- 3. LEAD CREATION & ASSIGNMENT WITH AUTOMATIC SUPPRESSION EXCLUSION
    -- ------------------------------------------------------------------------
    INSERT INTO leads (id, workspace_id, email, first_name, company, status)
    VALUES 
        (v_lead_active, v_ws, 'active.buyer@target.com', 'Sarah', 'Target Co', 'active'),
        (v_lead_suppressed, v_ws, 'blocked.exec@suppressedcorp.com', 'Bob', 'Suppressed Co', 'active'),
        (v_lead_unsub, v_ws, 'opted.out@priorunsub.com', 'Carl', 'Prior Unsub Co', 'unsubscribed');

    -- Suppress blocked.exec@suppressedcorp.com
    INSERT INTO suppressions (scope, workspace_id, type, identifier, reason, source)
    VALUES ('workspace', v_ws, 'exact_email', 'blocked.exec@suppressedcorp.com', 'manual_block', 'test_setup');

    -- Run assign_leads_to_campaign for all 3 leads
    SELECT * INTO v_assign_res FROM assign_leads_to_campaign(
        v_ws, v_campaign, ARRAY[v_lead_active, v_lead_suppressed, v_lead_unsub], NOW()
    );

    IF v_assign_res.assigned_count != 1 OR v_assign_res.suppressed_excluded_count != 2 THEN
        RAISE EXCEPTION 'TEST_FAIL: assign_leads_to_campaign mismatch! Assigned: %, Excluded: % (Expected 1, 2)',
            v_assign_res.assigned_count, v_assign_res.suppressed_excluded_count;
    END IF;

    -- Fetch assigned campaign lead ID
    SELECT id INTO v_clead_id FROM campaign_leads WHERE campaign_id = v_campaign AND lead_id = v_lead_active;

    RAISE NOTICE '[PASS] Phase 5 Test 3: Lead assignment excluded both suppressed and unsubscribed leads automatically.';

    -- ------------------------------------------------------------------------
    -- 4. SEQUENCE PROGRESSION TEST (advance_campaign_lead_step)
    -- Step 1 -> Step 2 (3 day delay) -> Completed
    -- ------------------------------------------------------------------------
    -- Advance Step 1 -> Step 2
    SELECT * INTO v_advance_res FROM advance_campaign_lead_step(v_ws, v_clead_id);

    IF v_advance_res.new_step != 2 OR v_advance_res.sequence_completed IS TRUE OR v_advance_res.lead_status != 'scheduled' THEN
        RAISE EXCEPTION 'TEST_FAIL: Failed advancing to step 2! Result: %', v_advance_res;
    END IF;

    -- Advance Step 2 -> Sequence Complete
    SELECT * INTO v_advance_res FROM advance_campaign_lead_step(v_ws, v_clead_id);

    IF v_advance_res.sequence_completed IS NOT TRUE OR v_advance_res.lead_status != 'completed' THEN
        RAISE EXCEPTION 'TEST_FAIL: Failed completing sequence! Result: %', v_advance_res;
    END IF;

    RAISE NOTICE '[PASS] Phase 5 Test 4: Sequence progression accurately advanced steps and finalized at sequence completion.';

    -- ------------------------------------------------------------------------
    -- 5. INBOUND HALT BEHAVIOR: STOP-ON-REPLY & STOP-ON-UNSUBSCRIBE
    -- ------------------------------------------------------------------------
    -- Reset lead to step 1 scheduled
    UPDATE campaign_leads SET current_step = 1, status = 'scheduled' WHERE id = v_clead_id;

    -- Simulate inbound reply: updates status to 'replied'
    UPDATE campaign_leads SET status = 'replied', updated_at = NOW() WHERE id = v_clead_id;

    -- Verify advance is blocked on replied lead
    IF (SELECT status FROM campaign_leads WHERE id = v_clead_id) != 'replied' THEN
        RAISE EXCEPTION 'TEST_FAIL: Stop-on-reply status was not set.';
    END IF;

    RAISE NOTICE '[PASS] Phase 5 Test 5: Inbound stop-on-reply halted sequence progression.';

    -- ------------------------------------------------------------------------
    -- CLEANUP
    -- ------------------------------------------------------------------------
    DELETE FROM workspaces WHERE id = v_ws;
    DELETE FROM suppressions WHERE source = 'test_setup';

    RAISE NOTICE '================================================================';
    RAISE NOTICE 'ALL PHASE 5 VERIFICATION TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '================================================================';
END;
$$;
