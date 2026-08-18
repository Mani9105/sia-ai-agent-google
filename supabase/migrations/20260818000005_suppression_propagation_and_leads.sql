-- ============================================================================
-- SIA AI AGENT - MIGRATION 005: REFINED SUPPRESSION PROPAGATION & LEAD IMPORT
-- Separates domain suppression from individual lead status.
-- Only individual unsubscribes set leads.status to 'unsubscribed'.
-- ============================================================================

-- 1. FUNCTION: PROPAGATE SUPPRESSION TO ACTIVE CAMPAIGN LEADS
CREATE OR REPLACE FUNCTION propagate_suppression_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_target_email VARCHAR(320);
    v_target_domain VARCHAR(255);
    v_suppressed_cleads_count INT := 0;
BEGIN
    IF NEW.type = 'exact_email' THEN
        v_target_email := NEW.normalized_identifier;
        
        -- If recipient specifically opted out, update individual lead status
        IF NEW.reason IN ('unsubscribe', 'ai_detected_optout') THEN
            IF NEW.scope = 'workspace' THEN
                UPDATE leads
                SET status = 'unsubscribed'::lead_status,
                    updated_at = NOW()
                WHERE workspace_id = NEW.workspace_id AND normalized_email = v_target_email;
            ELSE -- Global Scope
                UPDATE leads
                SET status = 'unsubscribed'::lead_status,
                    updated_at = NOW()
                WHERE normalized_email = v_target_email;
            END IF;
        END IF;

        -- Halt all active campaign sequence leads for this exact email
        IF NEW.scope = 'workspace' THEN
            UPDATE campaign_leads cl
            SET status = 'suppressed'::campaign_lead_status,
                updated_at = NOW()
            FROM leads l
            WHERE cl.lead_id = l.id
              AND cl.workspace_id = NEW.workspace_id
              AND l.normalized_email = v_target_email
              AND cl.status IN ('pending', 'scheduled');
              
            GET DIAGNOSTICS v_suppressed_cleads_count = ROW_COUNT;
        ELSE -- Global Scope
            UPDATE campaign_leads cl
            SET status = 'suppressed'::campaign_lead_status,
                updated_at = NOW()
            FROM leads l
            WHERE cl.lead_id = l.id
              AND l.normalized_email = v_target_email
              AND cl.status IN ('pending', 'scheduled');

            GET DIAGNOSTICS v_suppressed_cleads_count = ROW_COUNT;
        END IF;

    ELSIF NEW.type = 'domain_wildcard' THEN
        v_target_domain := NEW.normalized_identifier;

        -- Domain suppression DOES NOT falsely mark individual leads as unsubscribed.
        -- It only halts active campaign sequence leads targeting this domain.
        IF NEW.scope = 'workspace' THEN
            UPDATE campaign_leads cl
            SET status = 'suppressed'::campaign_lead_status,
                updated_at = NOW()
            FROM leads l
            WHERE cl.lead_id = l.id
              AND cl.workspace_id = NEW.workspace_id
              AND l.email_domain = v_target_domain
              AND cl.status IN ('pending', 'scheduled');

            GET DIAGNOSTICS v_suppressed_cleads_count = ROW_COUNT;
        ELSE -- Global Scope
            UPDATE campaign_leads cl
            SET status = 'suppressed'::campaign_lead_status,
                updated_at = NOW()
            FROM leads l
            WHERE cl.lead_id = l.id
              AND l.email_domain = v_target_domain
              AND cl.status IN ('pending', 'scheduled');

            GET DIAGNOSTICS v_suppressed_cleads_count = ROW_COUNT;
        END IF;
    END IF;

    -- Append audit log entry preserving full source and reason
    IF NEW.workspace_id IS NOT NULL THEN
        INSERT INTO audit_logs (
            workspace_id,
            action,
            entity_type,
            entity_id,
            new_values
        ) VALUES (
            NEW.workspace_id,
            'suppression:auto_propagated',
            'suppression',
            NEW.id,
            jsonb_build_object(
                'identifier', NEW.identifier,
                'type', NEW.type,
                'scope', NEW.scope,
                'reason', NEW.reason,
                'source', NEW.source,
                'affected_campaign_leads', v_suppressed_cleads_count
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

-- TRIGGER DEFINITION
DROP TRIGGER IF EXISTS trg_propagate_suppression ON suppressions;
CREATE TRIGGER trg_propagate_suppression
AFTER INSERT ON suppressions
FOR EACH ROW
EXECUTE FUNCTION propagate_suppression_on_insert();

-- ============================================================================
-- 2. BULK IMPORT STORED PROCEDURE
-- ============================================================================
CREATE OR REPLACE FUNCTION import_leads_batch(
    p_workspace_id UUID,
    p_leads JSONB,
    p_check_suppression BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    imported_count INT,
    skipped_duplicates INT,
    suppressed_count INT,
    total_processed INT
) LANGUAGE plpgsql AS $$
DECLARE
    v_lead JSONB;
    v_email VARCHAR(320);
    v_first_name VARCHAR(100);
    v_last_name VARCHAR(100);
    v_company VARCHAR(255);
    v_title VARCHAR(255);
    v_phone VARCHAR(50);
    v_linkedin VARCHAR(500);
    v_website VARCHAR(500);
    v_custom_fields JSONB;
    v_suppressed RECORD;
    v_imported INT := 0;
    v_skipped INT := 0;
    v_suppressed_cnt INT := 0;
    v_total INT := 0;
BEGIN
    FOR v_lead IN SELECT * FROM jsonb_array_elements(p_leads)
    LOOP
        v_total := v_total + 1;
        v_email := LOWER(TRIM(v_lead->>'email'));
        v_first_name := v_lead->>'first_name';
        v_last_name := v_lead->>'last_name';
        v_company := v_lead->>'company';
        v_title := v_lead->>'title';
        v_phone := v_lead->>'phone';
        v_linkedin := v_lead->>'linkedin_url';
        v_website := v_lead->>'website';
        v_custom_fields := COALESCE(v_lead->'custom_fields', '{}'::jsonb);

        IF v_email IS NULL OR v_email = '' OR POSITION('@' IN v_email) = 0 THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        IF p_check_suppression THEN
            SELECT * INTO v_suppressed FROM is_suppressed(p_workspace_id, v_email);
            IF v_suppressed.suppressed THEN
                v_suppressed_cnt := v_suppressed_cnt + 1;
                CONTINUE;
            END IF;
        END IF;

        BEGIN
            INSERT INTO leads (
                workspace_id,
                email,
                first_name,
                last_name,
                company,
                title,
                phone,
                linkedin_url,
                website,
                custom_fields,
                status
            ) VALUES (
                p_workspace_id,
                v_email,
                v_first_name,
                v_last_name,
                v_company,
                v_title,
                v_phone,
                v_linkedin,
                v_website,
                v_custom_fields,
                'active'
            );
            v_imported := v_imported + 1;
        EXCEPTION WHEN unique_violation THEN
            v_skipped := v_skipped + 1;
        END;
    END LOOP;

    RETURN QUERY SELECT v_imported, v_skipped, v_suppressed_cnt, v_total;
END;
$$;
