export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          cost_cents: number | null
          created_at: string
          error: string | null
          finished_at: string | null
          goal_id: string | null
          id: string
          input: Json
          input_hash: string
          input_tokens: number | null
          kind: string
          model: string | null
          output: Json | null
          output_tokens: number | null
          status: string
          user_id: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          input: Json
          input_hash: string
          input_tokens?: number | null
          kind: string
          model?: string | null
          output?: Json | null
          output_tokens?: number | null
          status?: string
          user_id: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          input?: Json
          input_hash?: string
          input_tokens?: number | null
          kind?: string
          model?: string | null
          output?: Json | null
          output_tokens?: number | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_withdrawals: {
        Row: {
          approval_id: string
          approver_id: string
          completion_id: string
          created_at: string
          id: string
        }
        Insert: {
          approval_id: string
          approver_id: string
          completion_id: string
          created_at?: string
          id?: string
        }
        Update: {
          approval_id?: string
          approver_id?: string
          completion_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_withdrawals_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: true
            referencedRelation: "completion_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_withdrawals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_withdrawals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_withdrawals_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "completions"
            referencedColumns: ["id"]
          },
        ]
      }
      breathers: {
        Row: {
          announced_at: string
          ends_cycle: string
          goal_id: string
          id: string
          starts_cycle: string
          user_id: string
        }
        Insert: {
          announced_at?: string
          ends_cycle: string
          goal_id: string
          id?: string
          starts_cycle: string
          user_id: string
        }
        Update: {
          announced_at?: string
          ends_cycle?: string
          goal_id?: string
          id?: string
          starts_cycle?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "breathers_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breathers_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breathers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breathers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_links: {
        Row: {
          created_at: string
          earned_cycle_start: string | null
          group_id: string
          group_period_start: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          earned_cycle_start?: string | null
          group_id: string
          group_period_start: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          earned_cycle_start?: string | null
          group_id?: string
          group_period_start?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chain_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chain_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          actor_id: string | null
          attachment_url: string | null
          body: string | null
          created_at: string
          group_id: string
          id: string
          payload: Json | null
          sender_id: string | null
          subject_id: string | null
          system_event: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          group_id: string
          id?: string
          payload?: Json | null
          sender_id?: string | null
          subject_id?: string | null
          system_event?: string | null
          type?: string
        }
        Update: {
          actor_id?: string | null
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          group_id?: string
          id?: string
          payload?: Json | null
          sender_id?: string | null
          subject_id?: string | null
          system_event?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_events: {
        Row: {
          actor_id: string | null
          commitment_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          commitment_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          commitment_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "commitment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_events_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          beneficiary_group_id: string | null
          body: string
          confirmed_at: string
          created_at: string
          goal_id: string
          id: string
          image_url: string | null
          status: string
          type: string
        }
        Insert: {
          beneficiary_group_id?: string | null
          body: string
          confirmed_at: string
          created_at?: string
          goal_id: string
          id?: string
          image_url?: string | null
          status?: string
          type: string
        }
        Update: {
          beneficiary_group_id?: string | null
          body?: string
          confirmed_at?: string
          created_at?: string
          goal_id?: string
          id?: string
          image_url?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_beneficiary_group_id_fkey"
            columns: ["beneficiary_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      completion_approvals: {
        Row: {
          approver_id: string | null
          comment: string | null
          completion_id: string
          created_at: string
          group_id: string
          id: string
          status: string
          subject_id: string
        }
        Insert: {
          approver_id?: string | null
          comment?: string | null
          completion_id: string
          created_at?: string
          group_id: string
          id?: string
          status: string
          subject_id: string
        }
        Update: {
          approver_id?: string | null
          comment?: string | null
          completion_id?: string
          created_at?: string
          group_id?: string
          id?: string
          status?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completion_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_approvals_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_approvals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_approvals_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completion_approvals_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      completions: {
        Row: {
          achieved_level: string
          attachment_url: string | null
          cycle_start_date: string
          id: string
          note: string | null
          submitted_at: string
          superseded_by: string | null
          user_id: string
          weekly_goal_id: string
        }
        Insert: {
          achieved_level: string
          attachment_url?: string | null
          cycle_start_date: string
          id?: string
          note?: string | null
          submitted_at?: string
          superseded_by?: string | null
          user_id: string
          weekly_goal_id: string
        }
        Update: {
          achieved_level?: string
          attachment_url?: string | null
          cycle_start_date?: string
          id?: string
          note?: string | null
          submitted_at?: string
          superseded_by?: string | null
          user_id?: string
          weekly_goal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_weekly_goal_id_fkey"
            columns: ["weekly_goal_id"]
            isOneToOne: false
            referencedRelation: "weekly_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_moves: {
        Row: {
          body: string
          created_at: string
          id: string
          local_date: string
          user_id: string
          visibility: string
          weekly_goal_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          local_date: string
          user_id: string
          visibility?: string
          weekly_goal_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          local_date?: string
          user_id?: string
          visibility?: string
          weekly_goal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_moves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_moves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_moves_weekly_goal_id_fkey"
            columns: ["weekly_goal_id"]
            isOneToOne: false
            referencedRelation: "weekly_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      deadline_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          goal_id: string
          group_id: string
          id: string
          new_date: string
          old_date: string
          reason: string
          requester_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          goal_id: string
          group_id: string
          id?: string
          new_date: string
          old_date: string
          reason: string
          requester_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          goal_id?: string
          group_id?: string
          id?: string
          new_date?: string
          old_date?: string
          reason?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_requests_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_requests_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_events: {
        Row: {
          actor_id: string
          approved_by_id: string | null
          created_at: string
          event_type: string
          goal_id: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          actor_id: string
          approved_by_id?: string | null
          created_at?: string
          event_type: string
          goal_id: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          actor_id?: string
          approved_by_id?: string | null
          created_at?: string
          event_type?: string
          goal_id?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_approved_by_id_fkey"
            columns: ["approved_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_group_links: {
        Row: {
          goal_id: string
          group_id: string
          linked_at: string
        }
        Insert: {
          goal_id: string
          group_id: string
          linked_at?: string
        }
        Update: {
          goal_id?: string
          group_id?: string
          linked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_group_links_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_group_links_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_group_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_interviews: {
        Row: {
          answers: Json
          created_at: string
          goal_id: string
          id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          goal_id: string
          id?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          goal_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_interviews_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_interviews_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_risk: {
        Row: {
          computed_at: string
          goal_id: string
          reason: Json | null
          status: string
        }
        Insert: {
          computed_at?: string
          goal_id: string
          reason?: Json | null
          status?: string
        }
        Update: {
          computed_at?: string
          goal_id?: string
          reason?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_risk_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_risk_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          available_hours_per_week: number | null
          category: string
          created_at: string
          description: string | null
          id: string
          identity_statement: string | null
          max_points: number
          owner_id: string
          status: string
          target_date: string
          title: string
          updated_at: string
        }
        Insert: {
          available_hours_per_week?: number | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          identity_statement?: string | null
          max_points?: number
          owner_id: string
          status?: string
          target_date: string
          title: string
          updated_at?: string
        }
        Update: {
          available_hours_per_week?: number | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          identity_statement?: string | null
          max_points?: number
          owner_id?: string
          status?: string
          target_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          group_id: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          group_id: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          group_id?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "group_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          approval_rule: string
          created_at: string
          created_by: string | null
          evidence_policy: string
          huddle_day: number
          icon: string | null
          id: string
          invite_code: string
          invite_revoked: boolean
          last_activity_at: string
          name: string
          season_cadence: string
          status: string
          tz: string
          zichtbaarheid: string
        }
        Insert: {
          approval_rule?: string
          created_at?: string
          created_by?: string | null
          evidence_policy?: string
          huddle_day?: number
          icon?: string | null
          id?: string
          invite_code: string
          invite_revoked?: boolean
          last_activity_at?: string
          name: string
          season_cadence?: string
          status?: string
          tz?: string
          zichtbaarheid?: string
        }
        Update: {
          approval_rule?: string
          created_at?: string
          created_by?: string | null
          evidence_policy?: string
          huddle_day?: number
          icon?: string | null
          id?: string
          invite_code?: string
          invite_revoked?: boolean
          last_activity_at?: string
          name?: string
          season_cadence?: string
          status?: string
          tz?: string
          zichtbaarheid?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_events: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          ai_generated: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          goal_id: string
          id: string
          order_index: number
          status: string
          target_date: string | null
          title: string
        }
        Insert: {
          ai_generated?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          goal_id: string
          id?: string
          order_index: number
          status?: string
          target_date?: string | null
          title: string
        }
        Update: {
          ai_generated?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          goal_id?: string
          id?: string
          order_index?: number
          status?: string
          target_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_sent: {
        Row: {
          id: string
          kind: string
          local_date: string
          ref_id: string | null
          ref_type: string | null
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind: string
          local_date: string
          ref_id?: string | null
          ref_type?: string | null
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          local_date?: string
          ref_id?: string | null
          ref_type?: string | null
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sent_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          created_at: string
          delta: number
          goal_id: string | null
          group_id: string | null
          id: string
          reason: string
          ref_id: string | null
          ref_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          goal_id?: string | null
          group_id?: string | null
          id?: string
          reason: string
          ref_id?: string | null
          ref_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          goal_id?: string | null
          group_id?: string | null
          id?: string
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          locale: string | null
          onboarded_at: string | null
          reminder_enabled: boolean
          reminder_time: string | null
          reminder_tone: string
          share_moves_by_default: boolean
          tz: string
          updated_at: string
          wants_own_goal: boolean
          week_start_day: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          locale?: string | null
          onboarded_at?: string | null
          reminder_enabled?: boolean
          reminder_time?: string | null
          reminder_tone?: string
          share_moves_by_default?: boolean
          tz?: string
          updated_at?: string
          wants_own_goal?: boolean
          week_start_day?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string | null
          onboarded_at?: string | null
          reminder_enabled?: boolean
          reminder_time?: string | null
          reminder_tone?: string
          share_moves_by_default?: boolean
          tz?: string
          updated_at?: string
          wants_own_goal?: boolean
          week_start_day?: number
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          auth: string | null
          created_at: string
          id: string
          last_seen_at: string
          p256dh: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_streaks: {
        Row: {
          best_streak: number
          current_streak: number
          goal_id: string
          last_cycle_start: string | null
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          current_streak?: number
          goal_id: string
          last_cycle_start?: string | null
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          current_streak?: number
          goal_id?: string
          last_cycle_start?: string | null
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_streaks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_streaks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      week_pass_events: {
        Row: {
          created_at: string
          cycle_start_date: string
          event: string
          goal_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycle_start_date: string
          event: string
          goal_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycle_start_date?: string
          event?: string
          goal_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_pass_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_pass_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_pass_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_pass_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      week_review_replies: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          week_review_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          week_review_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          week_review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_review_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_review_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_review_replies_week_review_id_fkey"
            columns: ["week_review_id"]
            isOneToOne: false
            referencedRelation: "week_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      week_reviews: {
        Row: {
          blocked_text: string | null
          created_at: string
          did_text: string | null
          group_id: string
          group_period_start: string
          id: string
          next_text: string | null
          user_id: string | null
        }
        Insert: {
          blocked_text?: string | null
          created_at?: string
          did_text?: string | null
          group_id: string
          group_period_start: string
          id?: string
          next_text?: string | null
          user_id?: string | null
        }
        Update: {
          blocked_text?: string | null
          created_at?: string
          did_text?: string | null
          group_id?: string
          group_period_start?: string
          id?: string
          next_text?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "week_reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_goals: {
        Row: {
          ai_generated: boolean
          beoordeelbaar: boolean
          ceiling_text: string | null
          created_at: string
          cycle_index: number
          cycle_start_date: string
          floor_text: string | null
          goal_id: string
          id: string
          milestone_id: string | null
          points_ceiling: number
          points_floor: number
          points_miss: number
          status: string
          title: string
        }
        Insert: {
          ai_generated?: boolean
          beoordeelbaar?: boolean
          ceiling_text?: string | null
          created_at?: string
          cycle_index: number
          cycle_start_date: string
          floor_text?: string | null
          goal_id: string
          id?: string
          milestone_id?: string | null
          points_ceiling?: number
          points_floor?: number
          points_miss?: number
          status?: string
          title: string
        }
        Update: {
          ai_generated?: boolean
          beoordeelbaar?: boolean
          ceiling_text?: string | null
          created_at?: string
          cycle_index?: number
          cycle_start_date?: string
          floor_text?: string | null
          goal_id?: string
          id?: string
          milestone_id?: string | null
          points_ceiling?: number
          points_floor?: number
          points_miss?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_goals_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      goal_dashboard: {
        Row: {
          available_hours_per_week: number | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          identity_statement: string | null
          max_points: number | null
          milestones_done: number | null
          milestones_total: number | null
          owner_id: string | null
          status: string | null
          target_date: string | null
          title: string | null
          updated_at: string | null
          weekly_approved: number | null
          weekly_total: number | null
        }
        Insert: {
          available_hours_per_week?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          identity_statement?: string | null
          max_points?: number | null
          milestones_done?: never
          milestones_total?: never
          owner_id?: string | null
          status?: string | null
          target_date?: string | null
          title?: string | null
          updated_at?: string | null
          weekly_approved?: never
          weekly_total?: never
        }
        Update: {
          available_hours_per_week?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          identity_statement?: string | null
          max_points?: number | null
          milestones_done?: never
          milestones_total?: never
          owner_id?: string | null
          status?: string | null
          target_date?: string | null
          title?: string | null
          updated_at?: string | null
          weekly_approved?: never
          weekly_total?: never
        }
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_visible_streaks: {
        Row: {
          best_streak: number | null
          current_streak: number | null
          goal_id: string | null
          last_cycle_start: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_streaks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goal_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_streaks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mijn_profiel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mijn_profiel: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          locale: string | null
          onboarded_at: string | null
          reminder_enabled: boolean | null
          reminder_time: string | null
          reminder_tone: string | null
          share_moves_by_default: boolean | null
          tz: string | null
          updated_at: string | null
          wants_own_goal: boolean | null
          week_start_day: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          locale?: string | null
          onboarded_at?: string | null
          reminder_enabled?: boolean | null
          reminder_time?: string | null
          reminder_tone?: string | null
          share_moves_by_default?: boolean | null
          tz?: string | null
          updated_at?: string | null
          wants_own_goal?: boolean | null
          week_start_day?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          locale?: string | null
          onboarded_at?: string | null
          reminder_enabled?: boolean | null
          reminder_time?: string | null
          reminder_tone?: string | null
          share_moves_by_default?: boolean | null
          tz?: string | null
          updated_at?: string | null
          wants_own_goal?: boolean | null
          week_start_day?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ai_dag_limiet: { Args: never; Returns: number }
      ai_kosten_per_week: {
        Args: { p_weken?: number }
        Returns: {
          gebruikers: number
          invoertokens: number
          jobs: number
          kosten_cent: number
          uitvoertokens: number
          week_start: string
        }[]
      }
      ai_verbruik: { Args: never; Returns: Json }
      annuleer_adempauze: { Args: { p_id: string }; Returns: Json }
      bedenktijd: { Args: never; Returns: string }
      berichten_over: { Args: never; Returns: number }
      beslis_deadline_verzoek: {
        Args: { p_akkoord: boolean; p_note?: string; p_request_id: string }
        Returns: Json
      }
      check_waarden: {
        Args: { p_constraint: string; p_tabel: string }
        Returns: string[]
      }
      commitment_zichtbaar_voor_groep: { Args: never; Returns: string[] }
      create_group: {
        Args: {
          group_name: string
          huddle_day?: number
          tz?: string
          zichtbaarheid?: string
        }
        Returns: Json
      }
      ddl_rechten_in_de_api: {
        Args: never
        Returns: {
          eigenaar: string
          recht: string
          rol: string
          waar: string
        }[]
      }
      ddl_rechten_van_service_role: { Args: never; Returns: boolean }
      deelt_open_groep_met_doel: { Args: { g: string }; Returns: boolean }
      dien_opnieuw_in: {
        Args: {
          p_achieved_level: string
          p_note?: string
          p_weekly_goal_id: string
        }
        Returns: Json
      }
      generate_invite_code: { Args: never; Returns: string }
      groepschat: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_group_id: string
          p_limit?: number
        }
        Returns: {
          actor_id: string
          actor_name: string
          body: string
          created_at: string
          id: string
          payload: Json
          sender_avatar: string
          sender_id: string
          sender_name: string
          subject_id: string
          subject_name: string
          system_event: string
          type: string
        }[]
      }
      group_overview: {
        Args: {
          p_group_id: string
          p_limit?: number
          p_offset?: number
          p_period_start: string
        }
        Returns: {
          avatar_url: string
          best_streak: number
          closed_this_period: boolean
          current_streak: number
          display_name: string
          goal_id: string
          goal_target_date: string
          goal_title: string
          joined_at: string
          last_cycle_start: string
          member_status: string
          milestones_done: number
          milestones_total: number
          role: string
          total_members: number
          user_id: string
        }[]
      }
      herbereken_reeks: {
        Args: { p_goal_id: string; p_user_id: string }
        Returns: undefined
      }
      herbereken_risico: { Args: { p_goal_id: string }; Returns: string }
      herorden_mijlpalen: {
        Args: { p_goal_id: string; p_ids: string[] }
        Returns: Json
      }
      invite_preview: { Args: { code: string }; Returns: Json }
      is_group_admin: { Args: { gid: string }; Returns: boolean }
      is_group_member: { Args: { gid: string }; Returns: boolean }
      join_group_with_code: { Args: { code: string }; Returns: Json }
      kan_beoordeeld_worden: {
        Args: { p_goal_id: string; p_owner_id: string }
        Returns: boolean
      }
      ketting_drempels: { Args: never; Returns: number[] }
      ketting_schakel: {
        Args: {
          p_cycle_start: string
          p_group_id: string
          p_period_start: string
        }
        Returns: Json
      }
      ketting_stand: {
        Args: { p_group_id: string; p_period_start: string }
        Returns: Json
      }
      lid_van_open_groep: { Args: { gid: string }; Returns: boolean }
      lijn_migratieregister_uit: {
        Args: { p_paren: Json }
        Returns: {
          naam: string
          naar: string
          uitkomst: string
          van: string
        }[]
      }
      maak_straffen_verschuldigd: {
        Args: { p_owner_id: string; p_vandaag: string }
        Returns: number
      }
      migratieregister: {
        Args: never
        Returns: {
          naam: string
          versie: string
        }[]
      }
      onveranderlijkheid_bewaking: {
        Args: never
        Returns: {
          functie: string
          heeft_grendel: boolean
          kolom: string
          tabel: string
          trigger_naam: string
        }[]
      }
      openstaande_beoordelingen: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          achieved_level: string
          ceiling_text: string
          completion_id: string
          floor_text: string
          goal_title: string
          group_id: string
          note: string
          owner_avatar: string
          owner_id: string
          owner_name: string
          submitted_at: string
          total_open: number
          weekly_goal_id: string
          weekly_title: string
        }[]
      }
      plaats_systeembericht: {
        Args: {
          p_actor_id?: string
          p_body: string
          p_event: string
          p_group_id: string
          p_payload?: Json
          p_subject_id?: string
        }
        Returns: undefined
      }
      plaats_systeembericht_in_doelgroepen: {
        Args: {
          p_actor_id?: string
          p_body: string
          p_event: string
          p_goal_id: string
          p_payload?: Json
          p_subject_id?: string
        }
        Returns: undefined
      }
      plan_adempauze: {
        Args: {
          p_ends_cycle: string
          p_goal_id: string
          p_starts_cycle: string
        }
        Returns: Json
      }
      realtime_bewaking: {
        Args: never
        Returns: {
          in_publicatie: boolean
          replica_identity: string
          tabel: string
        }[]
      }
      registreer_push_token: {
        Args: {
          p_auth?: string
          p_p256dh?: string
          p_platform: string
          p_token: string
        }
        Returns: Json
      }
      rond_doel_af: { Args: { p_goal_id: string }; Returns: Json }
      rotate_invite_code: { Args: { p_group_id: string }; Returns: Json }
      schuif_weekdoel_door: {
        Args: { p_cycle_index: number; p_cycle_start_date: string; p_weekly_goal_id: string }
        Returns: Json
      }
      set_invite_revoked: {
        Args: { p_group_id: string; p_revoked: boolean }
        Returns: Json
      }
      shares_group_with_goal: { Args: { g: string }; Returns: boolean }
      shares_group_with_user: { Args: { other: string }; Returns: boolean }
      slaap_stille_groepen: { Args: { p_dagen?: number }; Returns: number }
      sluit_weekdoel_af: { Args: { p_weekly_goal_id: string }; Returns: Json }
      systeembericht_allowlist: { Args: never; Returns: string[] }
      te_beoordelen_voor: {
        Args: { p_user_id: string }
        Returns: {
          completion_id: string
          owner_id: string
          owner_name: string
        }[]
      }
      trek_deadline_verzoek_in: {
        Args: { p_request_id: string }
        Returns: Json
      }
      trek_goedkeuring_in: { Args: { p_approval_id: string }; Returns: Json }
      triggerfuncties_in_de_api: {
        Args: never
        Returns: {
          anon: boolean
          functie: string
          geauthenticeerd: boolean
        }[]
      }
      uitnodigingscode_bewaking: {
        Args: never
        Returns: {
          alfabet_lengte: number
          code_lengte: number
          drempel: number
          gebruikt_csprng: boolean
        }[]
      }
      verbruik_weekpas: {
        Args: {
          p_cycle_start_date: string
          p_goal_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      verdien_weekpassen: {
        Args: { p_goal_id: string; p_user_id: string }
        Returns: undefined
      }
      verwijder_doel: { Args: { p_goal_id: string }; Returns: Json }
      verwijder_mijn_account: { Args: never; Returns: Json }
      verwijder_weekdoel: { Args: { p_weekly_goal_id: string }; Returns: Json }
      vraag_ai_job: {
        Args: { p_goal_id: string; p_input: Json; p_kind: string }
        Returns: Json
      }
      vraag_deadline_verschuiving: {
        Args: {
          p_goal_id: string
          p_group_id: string
          p_new_date: string
          p_reason: string
        }
        Returns: Json
      }
      weekafsluiting: {
        Args: { p_group_id: string; p_period_start: string }
        Returns: {
          avatar_url: string
          blocked_text: string
          created_at: string
          did_text: string
          display_name: string
          next_text: string
          review_id: string
          user_id: string
        }[]
      }
      weekafsluiting_reacties: {
        Args: {
          p_group_id: string
          p_limit?: number
          p_offset?: number
          p_period_start: string
        }
        Returns: {
          author_avatar: string
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
          total_replies: number
          week_review_id: string
        }[]
      }
      weekdoelen_over: { Args: never; Returns: number }
      weekpas_maximum: { Args: never; Returns: number }
      weekpas_stand: { Args: { p_goal_id: string }; Returns: Json }
      weekpas_standen: {
        Args: { p_goal_ids?: string[] }
        Returns: {
          goal_id: string
          laatst_verbruikt: string
          maximum: number
          tot_volgende: number
          voltooide_cycli: number
          voorraad: number
        }[]
      }
      weekreacties_over: { Args: never; Returns: number }
      weergavenaam: { Args: { p_user_id: string }; Returns: string }
      wikkel_commitments_af: { Args: { p_goal_id: string }; Returns: Json }
      zet_doelstatus: {
        Args: { p_gearchiveerd: boolean; p_goal_id: string }
        Returns: Json
      }
      zet_groepszichtbaarheid: {
        Args: { p_bevestigd?: boolean; p_group_id: string; p_naar: string }
        Returns: Json
      }
      zet_streefdatum: {
        Args: { p_date: string; p_goal_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
