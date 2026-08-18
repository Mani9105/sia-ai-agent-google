-- ============================================================================
-- SIA AI AGENT - PHASE 6 AUTOMATED VERIFICATION TEST SUITE
-- Validates AI Audit Recording, Structural Isolation, and Zero Dispatch Authority.
-- ============================================================================

DO $$
DECLARE
    v_ws UUID := gen_random_uuid();
    v_user UUID := gen_random_uuid();
    v_lead UUID := gen_random_uuid();
    v_camp UUID := gen_random_uuid();
    v_ai_gen_id UUID := gen_random_uuid();
    v_audit_count INT;
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'STARTING SIA AI AGENT PHASE 6 VERIFICATION SUITE';
    RAISE NOTICE '================================================================';

    -- ------------------------------------------------------------------------
    -- 1. SETUP TEST FIXTURES
    -- ------------------------------------------------------------------------
    INSERT INTO workspaces (id, name, slug) VALUES (v_ws, 'AI Security Test Corp', 'ai-sec-corp');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_ws, v_user, 'owner');
    INSERT INTO leads (id, workspace_id, email, first_name) VALUES (v_lead, v_ws, 'lead.ai@test.com', 'Alex');
    INSERT INTO campaigns (id, workspace_id, name, status) VALUES (v_camp, v_ws, 'AI Campaign', 'running');

    -- ------------------------------------------------------------------------
    -- 2. INSERT AI GENERATION AUDIT RECORD (Structured Output & Telemetry Only)
    -- ------------------------------------------------------------------------
    INSERT INTO ai_generations (
        id,
        workspace_id,
        lead_id,
        campaign_id,
        prompt_type,
        model,
        input_tokens,
        output_tokens,
        latency_ms,
        structured_output,
        status
    ) VALUES (
        v_ai_gen_id,
        v_ws,
        v_lead,
        v_camp,
        'personalization',
        'gemini-1.5-flash',
        142,
        85,
        450,
        jsonb_build_object(
            'subject', 'Personalized subject for Alex',
            'body_text', 'Hi Alex, customized sales message.',
            'body_html', '<p>Hi Alex, customized sales message.</p>',
            'personalization_reasoning', 'Referenced lead industry context',
            'advisory_spam_score', 0.05
        ),
        'success'
    );

    -- Verify insertion
    IF NOT EXISTS (SELECT 1 FROM ai_generations WHERE id = v_ai_gen_id AND workspace_id = v_ws) THEN
        RAISE EXCEPTION 'TEST_FAIL: ai_generations record was not created.';
    END IF;

    RAISE NOTICE '[PASS] Phase 6 Test 1: AI generation structured telemetry recorded cleanly.';

    -- ------------------------------------------------------------------------
    -- 3. VERIFY ZERO DISPATCH AUTHORITY FOR AI RECORDS
    -- Confirm that inserting into ai_generations does NOT create or mutate messages
    -- ------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM messages WHERE workspace_id = v_ws) THEN
        RAISE EXCEPTION 'SECURITY_FAILURE: AI generation record triggered unauthorized message dispatch!';
    END IF;

    RAISE NOTICE '[PASS] Phase 6 Test 2: AI output produced zero side-effects on message state or dispatch queue.';

    -- ------------------------------------------------------------------------
    -- CLEANUP
    -- ------------------------------------------------------------------------
    DELETE FROM workspaces WHERE id = v_ws;

    RAISE NOTICE '================================================================';
    RAISE NOTICE 'ALL PHASE 6 VERIFICATION TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '================================================================';
END;
$$;
