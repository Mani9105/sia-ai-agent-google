export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer'
export type LeadStatus = 'active' | 'contacted' | 'replied' | 'bounced' | 'unsubscribed' | 'qualified' | 'won' | 'lost'
export type LeadVerificationStatus = 'unverified' | 'valid' | 'risky' | 'invalid'
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'archived'
export type CampaignLeadStatus = 'pending' | 'scheduled' | 'sent' | 'replied' | 'bounced' | 'suppressed' | 'completed' | 'paused'
export type EmailProvider = 'gmail' | 'custom_smtp'
export type MessageDirection = 'outbound' | 'inbound'
export type SendState = 'draft' | 'pending' | 'reserved' | 'dispatching' | 'sent' | 'failed' | 'aborted' | 'reconciling'
export type EventType = 'queued' | 'sent' | 'delivered' | 'replied' | 'bounced' | 'complained' | 'unsubscribed'
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter'
export type SuppressionScope = 'workspace' | 'global'
export type SuppressionType = 'exact_email' | 'domain_wildcard'
export type SuppressionReason =
  | 'unsubscribe'
  | 'hard_bounce'
  | 'soft_bounce_threshold'
  | 'spam_complaint'
  | 'manual_block'
  | 'ai_detected_optout'
  | 'system_compliance'

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          slug: string
          is_paused: boolean
          daily_send_limit: number
          timezone: string
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          is_paused?: boolean
          daily_send_limit?: number
          timezone?: string
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          is_paused?: boolean
          daily_send_limit?: number
          timezone?: string
          settings?: Json
          created_at?: string
          updated_at?: string
        }
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: UserRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string
          role?: UserRole
          created_at?: string
          updated_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          workspace_id: string
          email: string
          normalized_email: string
          email_domain: string
          first_name: string | null
          last_name: string | null
          company: string | null
          title: string | null
          industry: string | null
          phone: string | null
          linkedin_url: string | null
          website: string | null
          status: LeadStatus
          verification_status: LeadVerificationStatus
          custom_fields: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          email: string
          first_name?: string | null
          last_name?: string | null
          company?: string | null
          title?: string | null
          industry?: string | null
          phone?: string | null
          linkedin_url?: string | null
          website?: string | null
          status?: LeadStatus
          verification_status?: LeadVerificationStatus
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          company?: string | null
          title?: string | null
          industry?: string | null
          phone?: string | null
          linkedin_url?: string | null
          website?: string | null
          status?: LeadStatus
          verification_status?: LeadVerificationStatus
          custom_fields?: Json
          created_at?: string
          updated_at?: string
        }
      }
      email_accounts: {
        Row: {
          id: string
          workspace_id: string
          provider: EmailProvider
          email_address: string
          normalized_email: string
          display_name: string | null
          access_token_enc: string
          refresh_token_enc: string
          token_expires_at: string
          history_id: string | null
          daily_limit: number
          sent_today: number
          last_reset_date: string
          min_cadence_delay_seconds: number
          is_active: boolean
          auth_revoked: boolean
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          provider?: EmailProvider
          email_address: string
          display_name?: string | null
          access_token_enc: string
          refresh_token_enc: string
          token_expires_at: string
          history_id?: string | null
          daily_limit?: number
          sent_today?: number
          last_reset_date?: string
          min_cadence_delay_seconds?: number
          is_active?: boolean
          auth_revoked?: boolean
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          provider?: EmailProvider
          email_address?: string
          display_name?: string | null
          access_token_enc?: string
          refresh_token_enc?: string
          token_expires_at?: string
          history_id?: string | null
          daily_limit?: number
          sent_today?: number
          last_reset_date?: string
          min_cadence_delay_seconds?: number
          is_active?: boolean
          auth_revoked?: boolean
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      email_templates: {
        Row: {
          id: string
          workspace_id: string
          name: string
          subject: string
          body_html: string
          body_text: string | null
          variables: Json
          ai_instructions: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          subject: string
          body_html: string
          body_text?: string | null
          variables?: Json
          ai_instructions?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          subject?: string
          body_html?: string
          body_text?: string | null
          variables?: Json
          ai_instructions?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      campaigns: {
        Row: {
          id: string
          workspace_id: string
          name: string
          status: CampaignStatus
          daily_limit: number
          timezone: string
          send_window_start: string
          send_window_end: string
          send_days: number[]
          min_delay_seconds: number
          max_delay_seconds: number
          stop_on_reply: boolean
          stop_on_bounce: boolean
          requires_approval: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          status?: CampaignStatus
          daily_limit?: number
          timezone?: string
          send_window_start?: string
          send_window_end?: string
          send_days?: number[]
          min_delay_seconds?: number
          max_delay_seconds?: number
          stop_on_reply?: boolean
          stop_on_bounce?: boolean
          requires_approval?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          status?: CampaignStatus
          daily_limit?: number
          timezone?: string
          send_window_start?: string
          send_window_end?: string
          send_days?: number[]
          min_delay_seconds?: number
          max_delay_seconds?: number
          stop_on_reply?: boolean
          stop_on_bounce?: boolean
          requires_approval?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      campaign_steps: {
        Row: {
          id: string
          campaign_id: string
          workspace_id: string
          step_number: number
          delay_days: number
          template_id: string | null
          subject_template: string | null
          body_template: string | null
          ai_prompt_override: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          workspace_id: string
          step_number: number
          delay_days?: number
          template_id?: string | null
          subject_template?: string | null
          body_template?: string | null
          ai_prompt_override?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          workspace_id?: string
          step_number?: number
          delay_days?: number
          template_id?: string | null
          subject_template?: string | null
          body_template?: string | null
          ai_prompt_override?: string | null
          created_at?: string
        }
      }
      campaign_leads: {
        Row: {
          id: string
          campaign_id: string
          lead_id: string
          workspace_id: string
          assigned_account_id: string | null
          current_step: number
          status: CampaignLeadStatus
          next_send_at: string | null
          last_sent_at: string | null
          error_count: number
          last_error: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          lead_id: string
          workspace_id: string
          assigned_account_id?: string | null
          current_step?: number
          status?: CampaignLeadStatus
          next_send_at?: string | null
          last_sent_at?: string | null
          error_count?: number
          last_error?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          lead_id?: string
          workspace_id?: string
          assigned_account_id?: string | null
          current_step?: number
          status?: CampaignLeadStatus
          next_send_at?: string | null
          last_sent_at?: string | null
          error_count?: number
          last_error?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          workspace_id: string
          campaign_id: string | null
          campaign_lead_id: string | null
          email_account_id: string
          lead_id: string
          direction: MessageDirection
          state: SendState
          thread_id: string | null
          google_message_id: string | null
          client_generated_message_id: string
          in_reply_to: string | null
          references_header: string | null
          idempotency_key: string | null
          subject: string
          body_html: string
          body_text: string | null
          snippet: string | null
          reservation_id: string | null
          lease_locked_until: string | null
          dispatch_started_at: string | null
          sent_at: string | null
          failed_at: string | null
          error_code: string | null
          error_message: string | null
          retry_count: number
          max_retries: number
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          campaign_id?: string | null
          campaign_lead_id?: string | null
          email_account_id: string
          lead_id: string
          direction: MessageDirection
          state?: SendState
          thread_id?: string | null
          google_message_id?: string | null
          client_generated_message_id: string
          in_reply_to?: string | null
          references_header?: string | null
          idempotency_key?: string | null
          subject: string
          body_html: string
          body_text?: string | null
          snippet?: string | null
          reservation_id?: string | null
          lease_locked_until?: string | null
          dispatch_started_at?: string | null
          sent_at?: string | null
          failed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          retry_count?: number
          max_retries?: number
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          campaign_id?: string | null
          campaign_lead_id?: string | null
          email_account_id?: string
          lead_id?: string
          direction?: MessageDirection
          state?: SendState
          thread_id?: string | null
          google_message_id?: string | null
          client_generated_message_id?: string
          in_reply_to?: string | null
          references_header?: string | null
          idempotency_key?: string | null
          subject?: string
          body_html?: string
          body_text?: string | null
          snippet?: string | null
          reservation_id?: string | null
          lease_locked_until?: string | null
          dispatch_started_at?: string | null
          sent_at?: string | null
          failed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          retry_count?: number
          max_retries?: number
          created_at?: string
        }
      }
      message_events: {
        Row: {
          id: string
          workspace_id: string
          message_id: string
          event_type: EventType
          metadata: Json
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          message_id: string
          event_type: EventType
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          message_id?: string
          event_type?: EventType
          metadata?: Json
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      suppressions: {
        Row: {
          id: string
          scope: SuppressionScope
          workspace_id: string | null
          type: SuppressionType
          identifier: string
          normalized_identifier: string
          reason: SuppressionReason
          source: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          scope?: SuppressionScope
          workspace_id?: string | null
          type: SuppressionType
          identifier: string
          reason: SuppressionReason
          source?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          scope?: SuppressionScope
          workspace_id?: string | null
          type?: SuppressionType
          identifier?: string
          reason?: SuppressionReason
          source?: string
          notes?: string | null
          created_at?: string
        }
      }
      ai_generations: {
        Row: {
          id: string
          workspace_id: string
          lead_id: string | null
          campaign_id: string | null
          message_id: string | null
          prompt_type: string
          model: string
          input_tokens: number | null
          output_tokens: number | null
          latency_ms: number | null
          structured_output: Json
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          lead_id?: string | null
          campaign_id?: string | null
          message_id?: string | null
          prompt_type: string
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          latency_ms?: number | null
          structured_output: Json
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          lead_id?: string | null
          campaign_id?: string | null
          message_id?: string | null
          prompt_type?: string
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          latency_ms?: number | null
          structured_output?: Json
          status?: string
          created_at?: string
        }
      }
      jobs: {
        Row: {
          id: string
          workspace_id: string
          job_type: string
          status: JobStatus
          payload: Json
          idempotency_key: string | null
          attempts: number
          max_attempts: number
          error_message: string | null
          next_run_at: string
          locked_at: string | null
          lease_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          job_type: string
          status?: JobStatus
          payload: Json
          idempotency_key?: string | null
          attempts?: number
          max_attempts?: number
          error_message?: string | null
          next_run_at?: string
          locked_at?: string | null
          lease_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          job_type?: string
          status?: JobStatus
          payload?: Json
          idempotency_key?: string | null
          attempts?: number
          max_attempts?: number
          error_message?: string | null
          next_run_at?: string
          locked_at?: string | null
          lease_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          workspace_id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          old_values: Json | null
          new_values: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          user_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          ip_address?: string | null
          created_at?: string
        }
      }
    }
    Functions: {
      reserve_send_quota: {
        Args: {
          p_workspace_id: string
          p_account_id: string
          p_campaign_id: string
          p_lead_id: string
          p_campaign_lead_id: string
          p_step_number: number
          p_subject: string
          p_body_html: string
          p_body_text: string
          p_thread_id?: string | null
          p_in_reply_to?: string | null
          p_references_header?: string | null
          p_lease_seconds?: number
        }
        Returns: {
          success: boolean
          rejection_reason: string
          message_id: string | null
          reservation_id: string | null
          client_msg_id: string | null
        }[]
      }
      release_send_quota: {
        Args: {
          p_message_id: string
          p_workspace_id: string
          p_error_code: string
          p_error_message: string
        }
        Returns: boolean
      }
      confirm_send_success: {
        Args: {
          p_message_id: string
          p_workspace_id: string
          p_google_message_id: string
          p_thread_id: string
        }
        Returns: boolean
      }
      reconcile_crashed_message: {
        Args: {
          p_message_id: string
          p_workspace_id: string
          p_found_in_provider: boolean
          p_google_msg_id?: string | null
          p_thread_id?: string | null
          p_error_details?: string | null
        }
        Returns: string
      }
      is_suppressed: {
        Args: {
          p_workspace_id: string
          p_email: string
        }
        Returns: {
          suppressed: boolean
          matched_scope: SuppressionScope
          matched_type: SuppressionType
          suppression_reason: SuppressionReason
        }[]
      }
    }
  }
}
