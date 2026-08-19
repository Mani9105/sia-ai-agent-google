-- ============================================================================
-- SIA AI AGENT - PHASE 3 AUTOMATED VERIFICATION TEST SUITE
-- Validates Lead CRUD, Normalization, Bulk Import, Suppression Propagation,
-- and Final Dispatch Invariants.
-- ============================================================================

DO $$
DECLARE
    v_ws_1 UUID := gen_random_uuid();
    v_ws_2 UUID := gen_random_uuid();
    v_user_1 UUID := gen_random_uuid();
    
    v_camp_1 UUID := gen_random_uuid();
    v_step_1 UUID := gen_random_uuid();
    v_inbox_1 UUID := gen_random_uuid();
    v_lead_1 UUID := gen_random_uuid();
    v_clead_1 UUID := gen_random_uuid();
    
    v_import_res RECORD;
    v_leads_batch JSONB;
    v_clead_status campaign_lead_status;
    v_lead_status lead_status;
    v_audit_count INT;
    v_duplicate_caught BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'STARTING SIA AI AGENT PHASE 3 VERIFICATION SUITE';
    RAISE NOTICE '================================================================';

    -- ------------------------------------------------------------------------
    -- 1. SETUP TEST FIXTURES
    -- ------------------------------------------------------------------------
    INSERT INTO workspaces (id, name, slug) VALUES 
        (v_ws_1, 'Primary Corp', 'primary-corp'),
        (v_ws_2, 'Secondary Corp', 'secondary-corp');

    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES 
        (v_ws_1, v_user_1, 'owner');

    INSERT INTO email_accounts (id, workspace_id, provider, email_address, access_token_enc, refresh_token_enc, token_expires_at, daily_limit, is_active)
    VALUES (v_inbox_1, v_ws_1, 'gmail', 'sender@primarycorp.com', 'iv:tag:enc', 'iv:tag:enc', NOW() + INTERVAL '1 hour', 50, TRUE);

    INSERT INTO campaigns (id, workspace_id, name, status)
    VALUES (v_camp_1, v_ws_1, 'Outreach Alpha', 'running');

    INSERT INTO campaign_steps (id, campaign_id, workspace_id, step_number, subject_template, body_template)
    VALUES (v_step_1, v_camp_1, v_ws_1, 1, 'Hello', 'Hi there');

    RAISE NOTICE '[PASS] Phase 3 Test 1: Test fixtures initialized.';

    -- ------------------------------------------------------------------------
    -- 2. LEAD NORMALIZATION & MULTI-TENANT DUPLICATE CONSTRAINTS
    -- ------------------------------------------------------------------------
    -- Insert lead with mixed case and whitespace
    INSERT INTO leads (id, workspace_id, email, first_name, last_name, company)
    VALUES (v_lead_1, v_ws_1, '  John.Doe@ACME.COM  ', 'John', 'Doe', 'Acme Corp');

    -- Verify generated columns
    IF NOT EXISTS (
        SELECT 1 FROM leads 
        WHERE id = v_lead_1 
          AND normalized_email = 'john.doe@acme.com' 
          AND email_domain = 'acme.com'
    ) THEN
        RAISE EXCEPTION 'TEST_FAIL: Lead email normalization or domain generation failed!';
    END IF;

    -- Attempt inserting duplicate in same workspace -> MUST FAIL
    BEGIN
        INSERT INTO leads (workspace_id, email, first_name)
        VALUES (v_ws_1, 'john.doe@acme.com', 'Duplicate John');
    EXCEPTION WHEN unique_violation THEN
        v_duplicate_caught := TRUE;
    END;

    IF NOT v_duplicate_caught THEN
        RAISE EXCEPTION 'TEST_FAIL: Workspace failed to reject duplicate normalized email!';
    END IF;

    -- Inserting same email in different workspace -> MUST SUCCEED (Tenant isolation)
    INSERT INTO leads (workspace_id, email, first_name)
    VALUES (v_ws_2, 'john.doe@acme.com', 'Isolated John in WS2');

    RAISE NOTICE '[PASS] Phase 3 Test 2: Normalization verified and duplicate constraint enforced per workspace.';

    -- ------------------------------------------------------------------------
    -- 3. BULK IMPORT STORED PROCEDURE (import_leads_batch)
    -- ------------------------------------------------------------------------
    v_leads_batch := jsonb_build_array(
        jsonb_build_object('email', 'lead1@batchtest.com', 'first_name', 'Lead', 'last_name', 'One', 'company', 'Co 1'),
        jsonb_build_object('email', 'lead2@batchtest.com', 'first_name', 'Lead', 'last_name', 'Two', 'company', 'Co 2'),
        jsonb_build_object('email', 'john.doe@acme.com', 'first_name', 'Duplicate John'), -- Existing duplicate
        jsonb_build_object('email', 'invalid-email-no-at-sign', 'first_name', 'Invalid'),   -- Invalid syntax
        jsonb_build_object('email', 'lead3@suppresseddomain.com', 'first_name', 'Suppressed')
    );

    -- Setup suppression rule for domain
    INSERT INTO suppressions (scope, workspace_id, type, identifier, reason, source)
    VALUES ('workspace', v_ws_1, 'domain_wildcard', 'suppresseddomain.com', 'unsubscribe', 'test_setup');

    -- Execute bulk import batch
    SELECT * INTO v_import_res FROM import_leads_batch(v_ws_1, v_leads_batch, TRUE);

    IF v_import_res.imported_count != 2 OR v_import_res.skipped_duplicates != 2 OR v_import_res.suppressed_count != 1 THEN
        RAISE EXCEPTION 'TEST_FAIL: Bulk import counts mismatch! Imported: %, Skipped: %, Suppressed: % (Expected 2, 2, 1)',
            v_import_res.imported_count, v_import_res.skipped_duplicates, v_import_res.suppressed_count;
    END IF;

    RAISE NOTICE '[PASS] Phase 3 Test 3: Bulk import procedure processed batch, filtered suppressions, and skipped duplicates.';

    -- ------------------------------------------------------------------------
    -- 4. AUTOMATIC SUPPRESSION PROPAGATION TRIGGER TEST
    -- Setup an active campaign lead. Then add a suppression rule for that lead.
    -- The trigger MUST automatically transition the campaign lead to 'suppressed'
    -- and update the lead status to 'unsubscribed'.
    -- ------------------------------------------------------------------------
    INSERT INTO campaign_leads (id, campaign_id, lead_id, workspace_id, assigned_account_id, current_step, status)
    VALUES (v_clead_1, v_camp_1, v_lead_1, v_ws_1, v_inbox_1, 1, 'scheduled');

    -- Insert exact email suppression for John Doe
    INSERT INTO suppressions (scope, workspace_id, type, identifier, reason, source)
    VALUES ('workspace', v_ws_1, 'exact_email', 'john.doe@acme.com', 'unsubscribe', 'rfc8058_test');

    -- Verify campaign_leads was automatically updated to 'suppressed'
    SELECT status INTO v_clead_status FROM campaign_leads WHERE id = v_clead_1;
    IF v_clead_status != 'suppressed' THEN
        RAISE EXCEPTION 'TEST_FAIL: Automatic suppression propagation trigger failed! campaign_lead status is %', v_clead_status;
    END IF;

    -- Verify lead status was updated to 'unsubscribed'
    SELECT status INTO v_lead_status FROM leads WHERE id = v_lead_1;
    IF v_lead_status != 'unsubscribed' THEN
        RAISE EXCEPTION 'TEST_FAIL: Lead status was not updated to unsubscribed! Found: %', v_lead_status;
    END IF;

    -- Verify audit log was emitted
    SELECT COUNT(*) INTO v_audit_count 
    FROM audit_logs 
    WHERE workspace_id = v_ws_1 AND action = 'suppression:auto_propagated';

    IF v_audit_count < 1 THEN
        RAISE EXCEPTION 'TEST_FAIL: Audit log entry was not created by suppression propagation trigger.';
    END IF;

    RAISE NOTICE '[PASS] Phase 3 Test 4: Suppression insertion instantly propagated to active campaign leads and updated lead status.';

    -- ------------------------------------------------------------------------
    -- 5. FINAL DISPATCH-TIME GATING INVARIANT VERIFICATION
    -- Ensure reserve_send_quota() rejects this lead even if an external caller attempts dispatch.
    -- ------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM reserve_send_quota(
            v_ws_1, v_inbox_1, v_camp_1, v_lead_1, v_clead_1, 1,
            'Attempted Send', '<p>Test</p>', 'Test'
        ) WHERE success = TRUE
    ) THEN
        RAISE EXCEPTION 'SECURITY_FAILURE: Final dispatch gate allowed send for suppressed lead!';
    END IF;

    RAISE NOTICE '[PASS] Phase 3 Test 5: Final dispatch gatekeeper rejected suppressed lead.';

    -- ------------------------------------------------------------------------
    -- CLEANUP
    -- ------------------------------------------------------------------------
    DELETE FROM workspaces WHERE id IN (v_ws_1, v_ws_2);
    DELETE FROM suppressions WHERE source IN ('test_setup', 'rfc8058_test');

    RAISE NOTICE '================================================================';
    RAISE NOTICE 'ALL PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '================================================================';
END;
$$;
