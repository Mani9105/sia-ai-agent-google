-- ============================================================================
-- SIA AI AGENT - MIGRATION 001: INITIAL SCHEMA & INTEGRITY CONSTRAINTS
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE lead_status AS ENUM ('active', 'contacted', 'replied', 'bounced', 'unsubscribed', 'qualified', 'won', 'lost');
CREATE TYPE lead_verification_status AS ENUM ('unverified', 'valid', 'risky', 'invalid');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'archived');
CREATE TYPE campaign_lead_status AS ENUM ('pending', 'scheduled', 'sent', 'replied', 'bounced', 'suppressed', 'completed', 'paused');
CREATE TYPE email_provider AS ENUM ('gmail', 'custom_smtp');
CREATE TYPE message_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE send_state AS ENUM (
    'draft',
    'pending',
    'reserved',
    'dispatching',
    'sent',
    'failed',
    'aborted',
    'reconciling'
);
CREATE TYPE event_type AS ENUM (
    'queued',
    'sent',
    'delivered',
    'replied',
    'bounced',
    'complained',
    'unsubscribed'
);
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'dead_letter');

-- ============================================================================
-- 3. CORE TENANT TABLES
-- ============================================================================

-- WORKSPACES
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    daily_send_limit INT NOT NULL DEFAULT 500 CHECK (daily_send_limit >= 0),
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- WORKSPACE MEMBERS (Tied to Supabase auth.users)
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- references auth.users(id)
    role user_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- LEADS
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    normalized_email VARCHAR(320) GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED,
    email_domain VARCHAR(255) GENERATED ALWAYS AS (LOWER(SUBSTRING(TRIM(email) FROM '@(.*)$'))) STORED,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    title VARCHAR(255),
    industry VARCHAR(100),
    phone VARCHAR(50),
    linkedin_url VARCHAR(500),
    website VARCHAR(500),
    status lead_status NOT NULL DEFAULT 'active',
    verification_status lead_verification_status NOT NULL DEFAULT 'unverified',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, normalized_email),
    UNIQUE(id, workspace_id) -- Enables composite foreign key enforcement
);

-- EMAIL ACCOUNTS (Connected inboxes)
CREATE TABLE email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider email_provider NOT NULL DEFAULT 'gmail',
    email_address VARCHAR(320) NOT NULL,
    normalized_email VARCHAR(320) GENERATED ALWAYS AS (LOWER(TRIM(email_address))) STORED,
    display_name VARCHAR(255),
    access_token_enc TEXT NOT NULL,      -- AES-256-GCM encrypted
    refresh_token_enc TEXT NOT NULL,     -- AES-256-GCM encrypted
    token_expires_at TIMESTAMPTZ NOT NULL,
    history_id VARCHAR(128),
    daily_limit INT NOT NULL DEFAULT 50 CHECK (daily_limit >= 0),
    sent_today INT NOT NULL DEFAULT 0 CHECK (sent_today >= 0),
    last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
    min_cadence_delay_seconds INT NOT NULL DEFAULT 60 CHECK (min_cadence_delay_seconds >= 10),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auth_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, normalized_email),
    UNIQUE(id, workspace_id) -- Enables composite foreign key enforcement
);

-- EMAIL TEMPLATES
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(id, workspace_id)
);

-- CAMPAIGNS
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status campaign_status NOT NULL DEFAULT 'draft',
    daily_limit INT NOT NULL DEFAULT 200 CHECK (daily_limit >= 0),
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    send_window_start TIME NOT NULL DEFAULT '09:00:00',
    send_window_end TIME NOT NULL DEFAULT '17:00:00',
    send_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 1=Monday ... 7=Sunday
    min_delay_seconds INT NOT NULL DEFAULT 45 CHECK (min_delay_seconds >= 15),
    max_delay_seconds INT NOT NULL DEFAULT 180 CHECK (max_delay_seconds >= min_delay_seconds),
    stop_on_reply BOOLEAN NOT NULL DEFAULT TRUE,
    stop_on_bounce BOOLEAN NOT NULL DEFAULT TRUE,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(id, workspace_id)
);

-- CAMPAIGN SEQUENCE STEPS
CREATE TABLE campaign_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    step_number INT NOT NULL CHECK (step_number > 0),
    delay_days INT NOT NULL DEFAULT 3 CHECK (delay_days >= 0),
    template_id UUID,
    subject_template VARCHAR(500),
    body_template TEXT,
    ai_prompt_override TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (campaign_id, workspace_id) REFERENCES campaigns(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (template_id, workspace_id) REFERENCES email_templates(id, workspace_id) ON DELETE SET NULL,
    UNIQUE(campaign_id, step_number),
    UNIQUE(id, workspace_id)
);

-- CAMPAIGN LEADS (Bridge with sequence progression tracking)
CREATE TABLE campaign_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    assigned_account_id UUID,
    current_step INT NOT NULL DEFAULT 1 CHECK (current_step > 0),
    status campaign_lead_status NOT NULL DEFAULT 'pending',
    next_send_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ,
    error_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (campaign_id, workspace_id) REFERENCES campaigns(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id, workspace_id) REFERENCES leads(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_account_id, workspace_id) REFERENCES email_accounts(id, workspace_id) ON DELETE SET NULL,
    UNIQUE(campaign_id, lead_id),
    UNIQUE(id, workspace_id)
);

-- MESSAGES & SEND STATE MACHINE
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id UUID,
    campaign_lead_id UUID,
    email_account_id UUID NOT NULL,
    lead_id UUID NOT NULL,
    direction message_direction NOT NULL,
    state send_state NOT NULL DEFAULT 'draft',
    
    -- Identifiers for Gmail Threading & Crash Recovery
    thread_id VARCHAR(255),
    google_message_id VARCHAR(255),
    client_generated_message_id VARCHAR(500) NOT NULL UNIQUE, -- RFC 2822 Message-ID
    in_reply_to VARCHAR(500),
    references_header TEXT,
    idempotency_key VARCHAR(255) UNIQUE,
    
    -- Content
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    snippet VARCHAR(500),
    
    -- State Machine & Distributed Lock Timing
    reservation_id UUID,
    lease_locked_until TIMESTAMPTZ,
    dispatch_started_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_code VARCHAR(64),
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (campaign_id, workspace_id) REFERENCES campaigns(id, workspace_id) ON DELETE SET NULL,
    FOREIGN KEY (campaign_lead_id, workspace_id) REFERENCES campaign_leads(id, workspace_id) ON DELETE SET NULL,
    FOREIGN KEY (email_account_id, workspace_id) REFERENCES email_accounts(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (lead_id, workspace_id) REFERENCES leads(id, workspace_id) ON DELETE CASCADE,
    UNIQUE(id, workspace_id)
);

-- MESSAGE EVENTS (MVP Delivery & Ingestion Events Only - No Pixels/Redirects)
CREATE TABLE message_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    event_type event_type NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (message_id, workspace_id) REFERENCES messages(id, workspace_id) ON DELETE CASCADE
);

-- AI GENERATIONS AUDIT (Advisory outputs only, no dispatch rights)
CREATE TABLE ai_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lead_id UUID,
    campaign_id UUID,
    message_id UUID,
    prompt_type VARCHAR(64) NOT NULL, -- 'personalization', 'reply_classification', 'advisory_spam_check'
    model VARCHAR(64) NOT NULL DEFAULT 'gemini-1.5-flash',
    input_tokens INT,
    output_tokens INT,
    latency_ms INT,
    structured_output JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (lead_id, workspace_id) REFERENCES leads(id, workspace_id) ON DELETE SET NULL,
    FOREIGN KEY (campaign_id, workspace_id) REFERENCES campaigns(id, workspace_id) ON DELETE SET NULL,
    FOREIGN KEY (message_id, workspace_id) REFERENCES messages(id, workspace_id) ON DELETE SET NULL
);

-- BACKGROUND JOBS & DISPATCH QUEUE
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    job_type VARCHAR(64) NOT NULL,
    status job_status NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_message TEXT,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IMMUTABLE AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. PERFORMANCE & OPERATIONAL INDEXES
-- ============================================================================

-- Leads
CREATE INDEX idx_leads_ws_status ON leads(workspace_id, status);
CREATE INDEX idx_leads_ws_norm_email ON leads(workspace_id, normalized_email);
CREATE INDEX idx_leads_ws_domain ON leads(workspace_id, email_domain);

-- Campaign Leads Dispatch Pipeline
CREATE INDEX idx_campaign_leads_dispatch ON campaign_leads(status, next_send_at) WHERE status = 'scheduled';
CREATE INDEX idx_campaign_leads_campaign_status ON campaign_leads(campaign_id, status);

-- Message State Machine & Reconciliation
CREATE INDEX idx_messages_state_lease ON messages(state, lease_locked_until) WHERE state IN ('reserved', 'dispatching', 'reconciling');
CREATE INDEX idx_messages_thread ON messages(workspace_id, thread_id);
CREATE INDEX idx_messages_lead ON messages(workspace_id, lead_id);
CREATE INDEX idx_messages_google_msg_id ON messages(google_message_id);

-- Email Accounts & Quotas
CREATE INDEX idx_email_accounts_ws_active ON email_accounts(workspace_id, is_active);

-- Jobs Queue
CREATE INDEX idx_jobs_pending ON jobs(status, next_run_at) WHERE status = 'pending';

-- Audit Logs
CREATE INDEX idx_audit_logs_ws_created ON audit_logs(workspace_id, created_at DESC);
