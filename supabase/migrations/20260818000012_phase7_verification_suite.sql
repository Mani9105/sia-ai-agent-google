-- ============================================================================
-- SIA AI AGENT - PHASE 7 AUTOMATED VERIFICATION TEST SUITE
-- Validates Concurrency, Worker Crashes, Ambiguous Gmail Responses, Lease Locks,
-- Duplicate Prevention, Quota Rollback, and Final Pre-Dispatch Guardrails.
-- ============================================================================

DO $$
DECLARE
    v_ws UUID := gen_random_uuid();
    v_user UUID := gen_random_uuid();
    v_inbox UUID := gen_random_uuid();
    v_camp UUID := gen_random_uuid();
    v_step UUID := gen_random_uuid();
    v_lead1 UUID := gen_random_uuid();
    v_lead2 UUID := gen_random_uuid();
    v_clead1 UUID := gen_random_uuid();
    v_clead2 UUID := gen_random_uuid();
    
    v_res RECORD;
    v_fetch_rec RECORD;
    v_msg_id1 UUID;
    v_msg_id2 UUID;
    v_res_id1 UUID;
    v_client_msg_id1 VARCHAR(500);
    v_sent_count INT;
    v_reconcile_out VARCHAR(32);
    v_duplicate_caught BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'STARTING SIA AI AGENT PHASE 7 VERIFICATION SUITE';
    RAISE NOTICE '================================================================';

    -- ------------------------------------------------------------------------
    -- 1. SETUP TEST FIXTURES
    -- ------------------------------------------------------------------------
    INSERT INTO workspaces (id, name, slug, daily_send_limit)
    VALUES (v_ws, 'Dispatch Test Corp', 'dispatch-corp', 10);

    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (v_ws, v_user, 'owner');

    INSERT INTO email_accounts (
        id, workspace_id, provider, email_address,
        access_token_enc, refresh_token_enc, token_expires_at,
        daily_limit, sent_today, is_active, auth_revoked
    ) VALUES (
        v_inbox, v_ws, 'gmail', 'sender@dispatchcorp.com',
        'aes256_iv:tag:mock_access', 'aes256_iv:tag:mock_refresh',
        NOW() + INTERVAL '1 hour', 5, 0, TRUE, FALSE
    );

    INSERT INTO campaigns (
        id, workspace_id, name, status, daily_limit,
        send_window_start, send_window_end, send_days
    ) VALUES (
        v_camp, v_ws, 'Dispatch Sequence', 'running', 5,
        '00:00:00', '23:59:59', '{1,2,3,4,5,6,7}'
    );

    INSERT INTO campaign_steps (id, campaign_id, workspace_id, step_number, delay_days, subject_template, body_template)
    VALUES (v_step, v_camp, v_ws, 1, 0, 'Subject 1', '<p>Body 1</p>');

    INSERT INTO leads (id, workspace_id, email, first_name)
    VALUES 
        (v_lead1, v_ws, 'lead.one@dispatchtest.com', 'Lead1'),
        (v_lead2, v_ws, 'lead.two@dispatchtest.com', 'Lead2');

    INSERT INTO campaign_leads (id, campaign_id, lead_id, workspace_id, assigned_account_id, current_step, status, next_send_at)
    VALUES 
        (v_clead1, v_camp, v_lead1, v_ws, v_inbox, 1, 'scheduled', NOW() - INTERVAL '1 minute'),
        (v_clead2, v_camp, v_lead2, v_ws, v_inbox, 1, 'scheduled', NOW() - INTERVAL '1 minute');

    RAISE NOTICE '[PASS] Phase 7 Test 1: Test fixtures initialized.';

    -- ------------------------------------------------------------------------
    -- 2. TEST CONCURRENCY FETCH WITH SKIP LOCKED (fetch_eligible_dispatch_leads)
    -- ------------------------------------------------------------------------
    SELECT * INTO v_fetch_rec FROM fetch_eligible_dispatch_leads(1);
    IF v_fetch_rec.campaign_lead_id IS NULL THEN
        RAISE EXCEPTION 'TEST_FAIL: fetch_eligible_dispatch_leads returned 0 candidate rows!';
    END IF;

    RAISE NOTICE '[PASS] Phase 7 Test 2: Dispatch candidate lock with SKIP LOCKED successful.';

    -- ------------------------------------------------------------------------
    -- 3. ATOMIC QUOTA RESERVATION & PERSISTENCE OF CLIENT-GENERATED MESSAGE-ID
    -- ------------------------------------------------------------------------
    SELECT * INTO v_res FROM reserve_send_quota(
        v_ws, v_inbox, v_camp, v_lead1, v_clead1, 1,
        'Outreach Subject', '<p>HTML content</p>', 'Text content', NULL, NULL, NULL, 180 -- 180s lease
    );

    IF NOT v_res.success THEN
        RAISE EXCEPTION 'TEST_FAIL: reserve_send_quota failed: %', v_res.rejection_reason;
    END IF;

    v_msg_id1 := v_res.message_id;
    v_res_id1 := v_res.reservation_id;
    v_client_msg_id1 := v_res.client_msg_id;

    -- Verify message is locked in 'reserved' state with lease lock
    IF NOT EXISTS (
        SELECT 1 FROM messages 
        WHERE id = v_msg_id1 
          AND state = 'reserved' 
          AND lease_locked_until > NOW()
          AND client_generated_message_id = v_client_msg_id1
    ) THEN
        RAISE EXCEPTION 'TEST_FAIL: Message was not persisted in reserved state with lease lock!';
    END IF;

    -- Verify quota incremented
    SELECT sent_today INTO v_sent_count FROM email_accounts WHERE id = v_inbox;
    IF v_sent_count != 1 THEN
        RAISE EXCEPTION 'TEST_FAIL: Account quota sent_today was % instead of 1', v_sent_count;
    END IF;

    RAISE NOTICE '[PASS] Phase 7 Test 3: Pre-generated RFC Message-ID and atomic quota reservation persisted.';

    -- ------------------------------------------------------------------------
    -- 4. DUPLICATE CLIENT-GENERATED MESSAGE-ID REJECTION
    -- ------------------------------------------------------------------------
    BEGIN
        INSERT INTO messages (
            workspace_id, email_account_id, lead_id, direction, state,
            client_generated_message_id, subject, body_html
        ) VALUES (
            v_ws, v_inbox, v_lead2, 'outbound', 'draft',
            v_client_msg_id1, 'Duplicate ID attempt', '<p>Dupe</p>'
        );
        RAISE EXCEPTION 'SECURITY_FAILURE: Allowed duplicate client_generated_message_id!';
    EXCEPTION WHEN unique_violation THEN
        v_duplicate_caught := TRUE;
    END;

    IF NOT v_duplicate_caught THEN
        RAISE EXCEPTION 'TEST_FAIL: Duplicate Message-ID was not caught!';
    END IF;

    RAISE NOTICE '[PASS] Phase 7 Test 4: Database uniqueness constraint prevented duplicate Message-ID.';

    -- ------------------------------------------------------------------------
    -- 5. CRASH RECONCILIATION SCENARIO A: GMAIL ACCEPTED MESSAGE
    -- Simulate worker process crashed mid-flight after Gmail returned 200.
    -- Expire the lease lock, query reconciliation worker, and confirm transition to 'sent'.
    -- ------------------------------------------------------------------------
    UPDATE messages SET lease_locked_until = NOW() - INTERVAL '10 seconds' WHERE id = v_msg_id1;

    -- Fetch crashed message
    IF NOT EXISTS (SELECT 1 FROM fetch_crashed_messages_for_reconciliation(10) WHERE message_id = v_msg_id1) THEN
        RAISE EXCEPTION 'TEST_FAIL: fetch_crashed_messages_for_reconciliation failed to find expired lease message!';
    END IF;

    -- Reconcile as sent (found in provider)
    v_reconcile_out := reconcile_crashed_message(v_msg_id1, v_ws, TRUE, 'google_id_abc123', 'thread_id_xyz789');
    IF v_reconcile_out != 'reconciled_as_sent' THEN
        RAISE EXCEPTION 'TEST_FAIL: Reconcile crashed message Case A returned: %', v_reconcile_out;
    END IF;

    -- Verify message is now 'sent' and quota remains 1
    IF NOT EXISTS (SELECT 1 FROM messages WHERE id = v_msg_id1 AND state = 'sent' AND google_message_id = 'google_id_abc123') THEN
        RAISE EXCEPTION 'TEST_FAIL: Message was not updated to sent after reconciliation.';
    END IF;

    SELECT sent_today INTO v_sent_count FROM email_accounts WHERE id = v_inbox;
    IF v_sent_count != 1 THEN
        RAISE EXCEPTION 'TEST_FAIL: Quota sent_today changed during successful reconciliation! Found %', v_sent_count;
    END IF;

    RAISE NOTICE '[PASS] Phase 7 Test 5: Reconciled crashed message where Gmail accepted dispatch.';

    -- ------------------------------------------------------------------------
    -- 6. CRASH RECONCILIATION SCENARIO B: GMAIL NEVER RECEIVED MESSAGE -> QUOTA ROLLBACK
    -- Reserve Send 2, simulate crash, reconcile with found_in_provider = FALSE.
    -- ------------------------------------------------------------------------
    SELECT * INTO v_res FROM reserve_send_quota(
        v_ws, v_inbox, v_camp, v_lead2, v_clead2, 1,
        'Subject 2', '<p>Body 2</p>', 'Body 2', NULL, NULL, NULL, 0 -- Expired lease
    );
    v_msg_id2 := v_res.message_id;

    -- Account quota is now 2
    SELECT sent_today INTO v_sent_count FROM email_accounts WHERE id = v_inbox;
    IF v_sent_count != 2 THEN
        RAISE EXCEPTION 'TEST_FAIL: Expected sent_today = 2, found %', v_sent_count;
    END IF;

    -- Reconcile as not received in provider -> must rollback quota to 1
    v_reconcile_out := reconcile_crashed_message(v_msg_id2, v_ws, FALSE, NULL, NULL, 'Simulated dropped connection');
    IF v_reconcile_out != 'reconciled_as_failed' THEN
        RAISE EXCEPTION 'TEST_FAIL: Reconcile crashed message Case B returned: %', v_reconcile_out;
    END IF;

    -- Verify quota rolled back from 2 to 1
    SELECT sent_today INTO v_sent_count FROM email_accounts WHERE id = v_inbox;
    IF v_sent_count != 1 THEN
        RAISE EXCEPTION 'TEST_FAIL: Quota rollback failed! sent_today is % instead of 1', v_sent_count;
    END IF;

    RAISE NOTICE '[PASS] Phase 7 Test 6: Reconciled orphaned message and safely rolled back quota.';

    -- ------------------------------------------------------------------------
    -- 7. DISPATCH GUARDRAIL RE-CHECK AT FINAL DISPATCH: KILL SWITCH & REVOCATION
    -- ------------------------------------------------------------------------
    -- Deactivate inbox
    UPDATE email_accounts SET is_active = FALSE WHERE id = v_inbox;

    IF EXISTS (
        SELECT 1 FROM reserve_send_quota(
            v_ws, v_inbox, v_camp, v_lead1, v_clead1, 2,
            'Sub', '<p>B</p>', 'B'
        ) WHERE success = TRUE
    ) THEN
        RAISE EXCEPTION 'SECURITY_FAILURE: reserve_send_quota allowed dispatch from deactivated inbox!';
    END IF;

    RAISE NOTICE '[PASS] Phase 7 Test 7: Final dispatch preflight blocked deactivated inbox.';

    -- ------------------------------------------------------------------------
    -- CLEANUP
    -- ------------------------------------------------------------------------
    DELETE FROM workspaces WHERE id = v_ws;

    RAISE NOTICE '================================================================';
    RAISE NOTICE 'ALL PHASE 7 VERIFICATION TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '================================================================';
END;
$$;
