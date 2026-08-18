-- ============================================================================
-- SIA AI AGENT - PHASE 4 AUTOMATED VERIFICATION TEST SUITE
-- Validates Gmail Account Storage, Token Encryption Metadata, Auth Revocation,
-- Inbox Kill Switch, and Dispatch Invariants.
-- ============================================================================

DO $$
DECLARE
    v_ws UUID := gen_random_uuid();
    v_user UUID := gen_random_uuid();
    v_inbox_active UUID := gen_random_uuid();
    v_inbox_revoked UUID := gen_random_uuid();
    v_inbox_paused UUID := gen_random_uuid();
    v_campaign UUID := gen_random_uuid();
    v_lead UUID := gen_random_uuid();
    v_clead UUID := gen_random_uuid();
    v_res RECORD;
    v_audit_count INT;
BEGIN
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'STARTING SIA AI AGENT PHASE 4 VERIFICATION SUITE';
    RAISE NOTICE '================================================================';

    -- ------------------------------------------------------------------------
    -- 1. SETUP TEST FIXTURES
    -- ------------------------------------------------------------------------
    INSERT INTO workspaces (id, name, slug) VALUES (v_ws, 'OAuth Test Corp', 'oauth-corp');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (v_ws, v_user, 'owner');
    
    INSERT INTO leads (id, workspace_id, email, first_name) VALUES (v_lead, v_ws, 'lead@testcorp.com', 'Alex');
    INSERT INTO campaigns (id, workspace_id, name, status) VALUES (v_campaign, v_ws, 'Campaign 1', 'running');

    -- ------------------------------------------------------------------------
    -- 2. CREATE EMAIL ACCOUNTS (Active, Revoked, Paused)
    -- ------------------------------------------------------------------------
    -- Active Healthy Inbox
    INSERT INTO email_accounts (
        id, workspace_id, provider, email_address,
        access_token_enc, refresh_token_enc, token_expires_at,
        daily_limit, sent_today, is_active, auth_revoked
    ) VALUES (
        v_inbox_active, v_ws, 'gmail', 'sender.healthy@oauthcorp.com',
        'aes256_iv:tag:mock_cipher_access', 'aes256_iv:tag:mock_cipher_refresh',
        NOW() + INTERVAL '1 hour', 50, 0, TRUE, FALSE
    );

    -- Revoked Inbox (Simulating invalid_grant / OAuth user revocation)
    INSERT INTO email_accounts (
        id, workspace_id, provider, email_address,
        access_token_enc, refresh_token_enc, token_expires_at,
        daily_limit, sent_today, is_active, auth_revoked
    ) VALUES (
        v_inbox_revoked, v_ws, 'gmail', 'sender.revoked@oauthcorp.com',
        'aes256_iv:tag:mock_cipher_access', 'aes256_iv:tag:mock_cipher_refresh',
        NOW() - INTERVAL '1 hour', 50, 0, TRUE, TRUE
    );

    -- Paused Inbox (Simulating inbox kill switch)
    INSERT INTO email_accounts (
        id, workspace_id, provider, email_address,
        access_token_enc, refresh_token_enc, token_expires_at,
        daily_limit, sent_today, is_active, auth_revoked
    ) VALUES (
        v_inbox_paused, v_ws, 'gmail', 'sender.paused@oauthcorp.com',
        'aes256_iv:tag:mock_cipher_access', 'aes256_iv:tag:mock_cipher_refresh',
        NOW() + INTERVAL '1 hour', 50, 0, FALSE, FALSE
    );

    INSERT INTO campaign_leads (id, campaign_id, lead_id, workspace_id, current_step, status)
    VALUES (v_clead, v_campaign, v_lead, v_ws, 1, 'scheduled');

    RAISE NOTICE '[PASS] Phase 4 Test 1: Email account fixtures created.';

    -- ------------------------------------------------------------------------
    -- 3. TEST DISPATCH GATING: HEALTHY INBOX -> MUST SUCCEED
    -- ------------------------------------------------------------------------
    SELECT * INTO v_res FROM reserve_send_quota(
        v_ws, v_inbox_active, v_campaign, v_lead, v_clead, 1,
        'Subject Test', '<p>Body</p>', 'Body'
    );

    IF NOT v_res.success THEN
        RAISE EXCEPTION 'TEST_FAIL: Healthy inbox was unexpectedly rejected: %', v_res.rejection_reason;
    END IF;

    RAISE NOTICE '[PASS] Phase 4 Test 2: Healthy active inbox passed quota reservation.';

    -- ------------------------------------------------------------------------
    -- 4. TEST DISPATCH GATING: REVOKED INBOX -> MUST BE BLOCKED
    -- ------------------------------------------------------------------------
    SELECT * INTO v_res FROM reserve_send_quota(
        v_ws, v_inbox_revoked, v_campaign, v_lead, v_clead, 1,
        'Subject Test', '<p>Body</p>', 'Body'
    );

    IF v_res.success OR v_res.rejection_reason != 'account_inactive_or_revoked' THEN
        RAISE EXCEPTION 'TEST_FAIL: Revoked inbox was not blocked! Result: %', v_res.rejection_reason;
    END IF;

    RAISE NOTICE '[PASS] Phase 4 Test 3: Revoked OAuth inbox blocked at final dispatch gate.';

    -- ------------------------------------------------------------------------
    -- 5. TEST DISPATCH GATING: PAUSED INBOX (KILL SWITCH) -> MUST BE BLOCKED
    -- ------------------------------------------------------------------------
    SELECT * INTO v_res FROM reserve_send_quota(
        v_ws, v_inbox_paused, v_campaign, v_lead, v_clead, 1,
        'Subject Test', '<p>Body</p>', 'Body'
    );

    IF v_res.success OR v_res.rejection_reason != 'account_inactive_or_revoked' THEN
        RAISE EXCEPTION 'TEST_FAIL: Paused inbox was not blocked! Result: %', v_res.rejection_reason;
    END IF;

    RAISE NOTICE '[PASS] Phase 4 Test 4: Inbox kill switch enforced at final dispatch gate.';

    -- ------------------------------------------------------------------------
    -- CLEANUP
    -- ------------------------------------------------------------------------
    DELETE FROM workspaces WHERE id = v_ws;

    RAISE NOTICE '================================================================';
    RAISE NOTICE 'ALL PHASE 4 VERIFICATION TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '================================================================';
END;
$$;
