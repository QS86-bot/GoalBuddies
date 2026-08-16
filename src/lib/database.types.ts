/**
 * Gegenereerd uit het Supabase-schema. NIET met de hand aanpassen.
 *
 * Bijwerken na elke migratie:
 *   npm run types:db
 *
 * (vereist een ingelogde Supabase CLI: `npx supabase login`)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
        Relationships: []
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
        Relationships: []
      }
      chain_links: {
        Row: {
          created_at: string
          group_id: string
          group_period_start: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          group_period_start: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          group_period_start?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachment_url: string | null
          body: string | null
          created_at: string
          group_id: string
          id: string
          sender_id: string | null
          system_event: string | null
          type: string
        }
        Insert: {
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          group_id: string
          id?: string
          sender_id?: string | null
          system_event?: string | null
          type?: string
        }
        Update: {
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          group_id?: string
          id?: string
          sender_id?: string | null
          system_event?: string | null
          type?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      completion_approvals: {
        Row: {
          approver_id: string
          comment: string | null
          completion_id: string
          created_at: string
          group_id: string
          id: string
          status: string
          subject_id: string
        }
        Insert: {
          approver_id: string
          comment?: string | null
          completion_id: string
          created_at?: string
          group_id: string
          id?: string
          status: string
          subject_id: string
        }
        Update: {
          approver_id?: string
          comment?: string | null
          completion_id?: string
          created_at?: string
          group_id?: string
          id?: string
          status?: string
          subject_id?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      goal_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          goal_id: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          goal_id: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          goal_id?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
          risk_computed_at: string | null
          risk_reason: Json | null
          risk_status: string
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
          risk_computed_at?: string | null
          risk_reason?: Json | null
          risk_status?: string
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
          risk_computed_at?: string | null
          risk_reason?: Json | null
          risk_status?: string
          status?: string
          target_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      groups: {
        Row: {
          approval_rule: string
          created_at: string
          created_by: string
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
        }
        Insert: {
          approval_rule?: string
          created_at?: string
          created_by: string
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
        }
        Update: {
          approval_rule?: string
          created_at?: string
          created_by?: string
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
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
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
        Relationships: []
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
        Relationships: []
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
          user_id: string
        }
        Insert: {
          blocked_text?: string | null
          created_at?: string
          did_text?: string | null
          group_id: string
          group_period_start: string
          id?: string
          next_text?: string | null
          user_id: string
        }
        Update: {
          blocked_text?: string | null
          created_at?: string
          did_text?: string | null
          group_id?: string
          group_period_start?: string
          id?: string
          next_text?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_goals: {
        Row: {
          ai_generated: boolean
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
        Relationships: []
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
          risk_computed_at: string | null
          risk_reason: Json | null
          risk_status: string | null
          status: string | null
          target_date: string | null
          title: string | null
          updated_at: string | null
          weekly_approved: number | null
          weekly_total: number | null
        }
        Relationships: [
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
          current_streak: number | null
          goal_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_group: {
        Args: { group_name: string; huddle_day?: number; tz?: string }
        Returns: Json
      }
      generate_invite_code: { Args: never; Returns: string }
      group_overview: {
        Args: {
          p_group_id: string
          p_limit?: number
          p_offset?: number
          p_period_start: string
        }
        Returns: {
          avatar_url: string
          closed_this_period: boolean
          current_streak: number
          display_name: string
          goal_id: string
          goal_target_date: string
          goal_title: string
          joined_at: string
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
      invite_preview: { Args: { code: string }; Returns: Json }
      is_group_admin: { Args: { gid: string }; Returns: boolean }
      is_group_member: { Args: { gid: string }; Returns: boolean }
      join_group_with_code: { Args: { code: string }; Returns: Json }
      rotate_invite_code: { Args: { p_group_id: string }; Returns: Json }
      set_invite_revoked: {
        Args: { p_group_id: string; p_revoked: boolean }
        Returns: Json
      }
      shares_group_with_goal: { Args: { g: string }; Returns: boolean }
      shares_group_with_user: { Args: { other: string }; Returns: boolean }
      slaap_stille_groepen: { Args: { p_dagen?: number }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> =
  (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never
