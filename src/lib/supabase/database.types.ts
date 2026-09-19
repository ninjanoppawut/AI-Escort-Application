export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          class_id: string;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_boundaries: {
        Row: {
          activity_version_id: string;
          boundary: unknown;
          created_at: string;
        };
        Insert: {
          activity_version_id: string;
          boundary: unknown;
          created_at?: string;
        };
        Update: {
          activity_version_id?: string;
          boundary?: unknown;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_boundaries_activity_version_id_fkey";
            columns: ["activity_version_id"];
            isOneToOne: true;
            referencedRelation: "activity_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_checkpoints: {
        Row: {
          activity_version_id: string;
          created_at: string;
          id: string;
          instructions: string | null;
          location: unknown;
          radius_m: number;
          sequence_number: number;
          title: string;
        };
        Insert: {
          activity_version_id: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          location: unknown;
          radius_m?: number;
          sequence_number: number;
          title: string;
        };
        Update: {
          activity_version_id?: string;
          created_at?: string;
          id?: string;
          instructions?: string | null;
          location?: unknown;
          radius_m?: number;
          sequence_number?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_checkpoints_activity_version_id_fkey";
            columns: ["activity_version_id"];
            isOneToOne: false;
            referencedRelation: "activity_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_plugin_configs: {
        Row: {
          activity_version_id: string;
          config: Json;
          created_at: string;
          plugin_key: string;
          schema_version: number;
        };
        Insert: {
          activity_version_id: string;
          config?: Json;
          created_at?: string;
          plugin_key?: string;
          schema_version: number;
        };
        Update: {
          activity_version_id?: string;
          config?: Json;
          created_at?: string;
          plugin_key?: string;
          schema_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activity_plugin_configs_activity_version_id_fkey";
            columns: ["activity_version_id"];
            isOneToOne: true;
            referencedRelation: "activity_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_routes: {
        Row: {
          activity_version_id: string;
          created_at: string;
          route: unknown;
        };
        Insert: {
          activity_version_id: string;
          created_at?: string;
          route: unknown;
        };
        Update: {
          activity_version_id?: string;
          created_at?: string;
          route?: unknown;
        };
        Relationships: [
          {
            foreignKeyName: "activity_routes_activity_version_id_fkey";
            columns: ["activity_version_id"];
            isOneToOne: true;
            referencedRelation: "activity_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_versions: {
        Row: {
          activity_id: string;
          class_id: string;
          created_at: string;
          created_by: string;
          id: string;
          instructions: string | null;
          published_at: string | null;
          published_by: string | null;
          status: string;
          title: string;
          updated_at: string;
          version_number: number;
        };
        Insert: {
          activity_id: string;
          class_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          instructions?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          version_number: number;
        };
        Update: {
          activity_id?: string;
          class_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          instructions?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activity_versions_activity_class_fk";
            columns: ["activity_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "activity_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_versions_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_kind: string;
          class_id: string | null;
          created_at: string;
          id: string;
          outcome: string;
          payload: Json;
          request_id: string | null;
          resource_id: string | null;
          resource_type: string;
          school_id: string | null;
          trace_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_kind: string;
          class_id?: string | null;
          created_at?: string;
          id?: string;
          outcome: string;
          payload?: Json;
          request_id?: string | null;
          resource_id?: string | null;
          resource_type: string;
          school_id?: string | null;
          trace_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_kind?: string;
          class_id?: string | null;
          created_at?: string;
          id?: string;
          outcome?: string;
          payload?: Json;
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string;
          school_id?: string | null;
          trace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      class_invites: {
        Row: {
          class_id: string;
          code: string;
          created_at: string;
          created_by: string;
          disabled_at: string | null;
          disabled_by: string | null;
          expires_at: string | null;
          id: string;
          max_uses: number | null;
          status: string;
          token_hash: string;
          updated_at: string;
          used_count: number;
        };
        Insert: {
          class_id: string;
          code: string;
          created_at?: string;
          created_by: string;
          disabled_at?: string | null;
          disabled_by?: string | null;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          status?: string;
          token_hash: string;
          updated_at?: string;
          used_count?: number;
        };
        Update: {
          class_id?: string;
          code?: string;
          created_at?: string;
          created_by?: string;
          disabled_at?: string | null;
          disabled_by?: string | null;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          status?: string;
          token_hash?: string;
          updated_at?: string;
          used_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "class_invites_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_invites_disabled_by_fkey";
            columns: ["disabled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      class_members: {
        Row: {
          class_id: string;
          created_at: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          role: string;
          status: string;
          user_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          role: string;
          status?: string;
          user_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          role?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          academic_year: string | null;
          allow_student_groups: boolean;
          created_at: string;
          created_by: string;
          description: string | null;
          group_formation_status: string;
          id: string;
          max_group_size: number;
          maximum_groups: number;
          min_group_size: number;
          name: string;
          school_id: string;
          semester: string | null;
          status: string;
          subject: string | null;
          updated_at: string;
        };
        Insert: {
          academic_year?: string | null;
          allow_student_groups?: boolean;
          created_at?: string;
          created_by: string;
          description?: string | null;
          group_formation_status?: string;
          id?: string;
          max_group_size?: number;
          maximum_groups?: number;
          min_group_size?: number;
          name: string;
          school_id: string;
          semester?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Update: {
          academic_year?: string | null;
          allow_student_groups?: boolean;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          group_formation_status?: string;
          id?: string;
          max_group_size?: number;
          maximum_groups?: number;
          min_group_size?: number;
          name?: string;
          school_id?: string;
          semester?: string | null;
          status?: string;
          subject?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      exploration_session_groups: {
        Row: {
          activated_at: string | null;
          class_id: string;
          completed_at: string | null;
          created_at: string;
          group_id: string;
          id: string;
          queue_position: number;
          session_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          activated_at?: string | null;
          class_id: string;
          completed_at?: string | null;
          created_at?: string;
          group_id: string;
          id?: string;
          queue_position: number;
          session_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          activated_at?: string | null;
          class_id?: string;
          completed_at?: string | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          queue_position?: number;
          session_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exploration_session_groups_group_class_fk";
            columns: ["group_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "exploration_session_groups_session_class_fk";
            columns: ["session_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id", "class_id"];
          },
        ];
      };
      exploration_sessions: {
        Row: {
          activity_id: string;
          activity_version_id: string;
          class_id: string;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          opened_at: string | null;
          opened_by: string | null;
          paused_at: string | null;
          scheduled_at: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          activity_id: string;
          activity_version_id: string;
          class_id: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          opened_at?: string | null;
          opened_by?: string | null;
          paused_at?: string | null;
          scheduled_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          activity_id?: string;
          activity_version_id?: string;
          class_id?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          opened_at?: string | null;
          opened_by?: string | null;
          paused_at?: string | null;
          scheduled_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exploration_sessions_activity_class_fk";
            columns: ["activity_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "exploration_sessions_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exploration_sessions_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exploration_sessions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exploration_sessions_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exploration_sessions_version_activity_fk";
            columns: ["activity_version_id", "activity_id"];
            isOneToOne: false;
            referencedRelation: "activity_versions";
            referencedColumns: ["id", "activity_id"];
          },
        ];
      };
      exports: {
        Row: {
          byte_size: number | null;
          class_id: string;
          completed_at: string | null;
          created_at: string;
          expires_at: string;
          export_type: string;
          failure_code: string | null;
          id: string;
          idempotency_key: string;
          request_payload: Json;
          requested_by: string;
          row_count: number | null;
          schema_version: string;
          session_id: string;
          started_at: string | null;
          status: string;
          storage_path: string | null;
        };
        Insert: {
          byte_size?: number | null;
          class_id: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          export_type: string;
          failure_code?: string | null;
          id?: string;
          idempotency_key: string;
          request_payload: Json;
          requested_by: string;
          row_count?: number | null;
          schema_version?: string;
          session_id: string;
          started_at?: string | null;
          status?: string;
          storage_path?: string | null;
        };
        Update: {
          byte_size?: number | null;
          class_id?: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          export_type?: string;
          failure_code?: string | null;
          id?: string;
          idempotency_key?: string;
          request_payload?: Json;
          requested_by?: string;
          row_count?: number | null;
          schema_version?: string;
          session_id?: string;
          started_at?: string | null;
          status?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exports_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exports_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exports_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      group_invitations: {
        Row: {
          cancelled_by: string | null;
          class_id: string;
          created_at: string;
          expires_at: string;
          group_id: string;
          id: string;
          invited_by: string;
          invitee_id: string;
          responded_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          cancelled_by?: string | null;
          class_id: string;
          created_at?: string;
          expires_at?: string;
          group_id: string;
          id?: string;
          invited_by: string;
          invitee_id: string;
          responded_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          cancelled_by?: string | null;
          class_id?: string;
          created_at?: string;
          expires_at?: string;
          group_id?: string;
          id?: string;
          invited_by?: string;
          invitee_id?: string;
          responded_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_invitations_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_invitations_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_invitations_group_class_fk";
            columns: ["group_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "group_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_invitations_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_members: {
        Row: {
          class_id: string;
          created_at: string;
          group_id: string;
          id: string;
          invited_by: string | null;
          joined_at: string;
          left_at: string | null;
          role: string;
          status: string;
          user_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          group_id: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          left_at?: string | null;
          role: string;
          status?: string;
          user_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          group_id?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          left_at?: string | null;
          role?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_members_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_group_class_fk";
            columns: ["group_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "group_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_membership_history: {
        Row: {
          actor_id: string | null;
          class_id: string;
          created_at: string;
          event_type: string;
          group_id: string | null;
          id: string;
          payload: Json;
          related_group_id: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          class_id: string;
          created_at?: string;
          event_type: string;
          group_id?: string | null;
          id?: string;
          payload?: Json;
          related_group_id?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          class_id?: string;
          created_at?: string;
          event_type?: string;
          group_id?: string | null;
          id?: string;
          payload?: Json;
          related_group_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_membership_history_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_membership_history_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_membership_history_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_membership_history_related_group_id_fkey";
            columns: ["related_group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "group_membership_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          archived_at: string | null;
          class_id: string;
          created_at: string;
          created_by: string;
          creator_type: string;
          deleted_at: string | null;
          description: string | null;
          icon_key: string | null;
          id: string;
          locked_at: string | null;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          class_id: string;
          created_at?: string;
          created_by: string;
          creator_type: string;
          deleted_at?: string | null;
          description?: string | null;
          icon_key?: string | null;
          id?: string;
          locked_at?: string | null;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          archived_at?: string | null;
          class_id?: string;
          created_at?: string;
          created_by?: string;
          creator_type?: string;
          deleted_at?: string | null;
          description?: string | null;
          icon_key?: string | null;
          id?: string;
          locked_at?: string | null;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      location_events: {
        Row: {
          accuracy_m: number | null;
          class_id: string;
          client_sample_id: string;
          device_context: Json;
          event_type: string;
          id: string;
          location: unknown;
          received_at: string;
          recorded_at: string;
          session_id: string;
          session_participant_id: string;
        };
        Insert: {
          accuracy_m?: number | null;
          class_id: string;
          client_sample_id: string;
          device_context?: Json;
          event_type?: string;
          id?: string;
          location?: unknown;
          received_at?: string;
          recorded_at: string;
          session_id: string;
          session_participant_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          class_id?: string;
          client_sample_id?: string;
          device_context?: Json;
          event_type?: string;
          id?: string;
          location?: unknown;
          received_at?: string;
          recorded_at?: string;
          session_id?: string;
          session_participant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "location_events_participant_session_fk";
            columns: ["session_participant_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "session_participants";
            referencedColumns: ["id", "session_id"];
          },
          {
            foreignKeyName: "location_events_session_class_fk";
            columns: ["session_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id", "class_id"];
          },
        ];
      };
      notification_types: {
        Row: {
          copy_key: string;
          created_at: string;
          deep_link_template: string;
          icon: string;
          layout: string;
          schema_version: number;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          copy_key: string;
          created_at?: string;
          deep_link_template: string;
          icon: string;
          layout: string;
          schema_version?: number;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          copy_key?: string;
          created_at?: string;
          deep_link_template?: string;
          icon?: string;
          layout?: string;
          schema_version?: number;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          activity_id: string | null;
          actor_id: string | null;
          class_id: string | null;
          created_at: string;
          deep_link_path: string | null;
          entity_id: string | null;
          entity_type: string | null;
          expires_at: string | null;
          export_id: string | null;
          group_id: string | null;
          group_invitation_id: string | null;
          id: string;
          message: string;
          observation_id: string | null;
          payload: Json;
          read_at: string | null;
          recipient_id: string;
          report_id: string | null;
          request_id: string | null;
          schema_version: number;
          school_id: string | null;
          session_id: string | null;
          title: string;
          type: string;
        };
        Insert: {
          activity_id?: string | null;
          actor_id?: string | null;
          class_id?: string | null;
          created_at?: string;
          deep_link_path?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expires_at?: string | null;
          export_id?: string | null;
          group_id?: string | null;
          group_invitation_id?: string | null;
          id?: string;
          message: string;
          observation_id?: string | null;
          payload?: Json;
          read_at?: string | null;
          recipient_id: string;
          report_id?: string | null;
          request_id?: string | null;
          schema_version?: number;
          school_id?: string | null;
          session_id?: string | null;
          title: string;
          type: string;
        };
        Update: {
          activity_id?: string | null;
          actor_id?: string | null;
          class_id?: string | null;
          created_at?: string;
          deep_link_path?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expires_at?: string | null;
          export_id?: string | null;
          group_id?: string | null;
          group_invitation_id?: string | null;
          id?: string;
          message?: string;
          observation_id?: string | null;
          payload?: Json;
          read_at?: string | null;
          recipient_id?: string;
          report_id?: string | null;
          request_id?: string | null;
          schema_version?: number;
          school_id?: string | null;
          session_id?: string | null;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_type_fkey";
            columns: ["type"];
            isOneToOne: false;
            referencedRelation: "notification_types";
            referencedColumns: ["type"];
          },
        ];
      };
      observation_duplicate_candidates: {
        Row: {
          candidate_observation_id: string;
          class_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          location_distance_m: number | null;
          morphology_score: number | null;
          observation_id: string;
          pair_high: string | null;
          pair_low: string | null;
          relationship_type: string;
          rule_version: string;
          session_id: string;
          source_submission_id: string | null;
          student_acknowledged_at: string | null;
          system_recommendation: string | null;
          teacher_decision: string | null;
          temporal_distance_seconds: number | null;
          visual_similarity_score: number | null;
        };
        Insert: {
          candidate_observation_id: string;
          class_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          location_distance_m?: number | null;
          morphology_score?: number | null;
          observation_id: string;
          pair_high?: string | null;
          pair_low?: string | null;
          relationship_type: string;
          rule_version: string;
          session_id: string;
          source_submission_id?: string | null;
          student_acknowledged_at?: string | null;
          system_recommendation?: string | null;
          teacher_decision?: string | null;
          temporal_distance_seconds?: number | null;
          visual_similarity_score?: number | null;
        };
        Update: {
          candidate_observation_id?: string;
          class_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          location_distance_m?: number | null;
          morphology_score?: number | null;
          observation_id?: string;
          pair_high?: string | null;
          pair_low?: string | null;
          relationship_type?: string;
          rule_version?: string;
          session_id?: string;
          source_submission_id?: string | null;
          student_acknowledged_at?: string | null;
          system_recommendation?: string | null;
          teacher_decision?: string | null;
          temporal_distance_seconds?: number | null;
          visual_similarity_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "observation_duplicate_candidates_candidate_fk";
            columns: ["candidate_observation_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "session_id"];
          },
          {
            foreignKeyName: "observation_duplicate_candidates_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_duplicate_candidates_observation_fk";
            columns: ["observation_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "session_id"];
          },
          {
            foreignKeyName: "observation_duplicate_candidates_source_submission_id_fkey";
            columns: ["source_submission_id"];
            isOneToOne: false;
            referencedRelation: "observation_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_issue_reports: {
        Row: {
          class_id: string;
          created_at: string;
          id: string;
          observation_id: string;
          reason: string;
          report_type: string;
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          session_id: string;
          status: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          id?: string;
          observation_id: string;
          reason: string;
          report_type: string;
          reporter_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          session_id: string;
          status?: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          id?: string;
          observation_id?: string;
          reason?: string;
          report_type?: string;
          reporter_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          session_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "observation_issue_reports_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_issue_reports_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_issue_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_issue_reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_media: {
        Row: {
          byte_size: number;
          captured_at: string;
          category: string;
          class_id: string;
          client_media_id: string;
          created_at: string;
          height_px: number;
          id: string;
          image_hash: string;
          mime_type: string;
          observation_id: string;
          observer_id: string;
          position: number;
          preprocessing_version: string;
          session_id: string;
          status: string;
          storage_path: string | null;
          updated_at: string;
          upload_attempt_count: number | null;
          uploaded_at: string | null;
          width_px: number;
        };
        Insert: {
          byte_size: number;
          captured_at: string;
          category: string;
          class_id: string;
          client_media_id: string;
          created_at?: string;
          height_px: number;
          id?: string;
          image_hash: string;
          mime_type: string;
          observation_id: string;
          observer_id: string;
          position: number;
          preprocessing_version: string;
          session_id: string;
          status?: string;
          storage_path?: string | null;
          updated_at?: string;
          upload_attempt_count?: number | null;
          uploaded_at?: string | null;
          width_px: number;
        };
        Update: {
          byte_size?: number;
          captured_at?: string;
          category?: string;
          class_id?: string;
          client_media_id?: string;
          created_at?: string;
          height_px?: number;
          id?: string;
          image_hash?: string;
          mime_type?: string;
          observation_id?: string;
          observer_id?: string;
          position?: number;
          preprocessing_version?: string;
          session_id?: string;
          status?: string;
          storage_path?: string | null;
          updated_at?: string;
          upload_attempt_count?: number | null;
          uploaded_at?: string | null;
          width_px?: number;
        };
        Relationships: [
          {
            foreignKeyName: "observation_media_observation_fk";
            columns: [
              "observation_id",
              "observer_id",
              "class_id",
              "session_id",
            ];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "observer_id", "class_id", "session_id"];
          },
        ];
      };
      observation_relation_events: {
        Row: {
          actor_id: string | null;
          candidate_id: string;
          class_id: string;
          created_at: string;
          event_type: string;
          from_decision: string | null;
          id: string;
          session_id: string;
          to_decision: string | null;
        };
        Insert: {
          actor_id?: string | null;
          candidate_id: string;
          class_id: string;
          created_at?: string;
          event_type: string;
          from_decision?: string | null;
          id?: string;
          session_id: string;
          to_decision?: string | null;
        };
        Update: {
          actor_id?: string | null;
          candidate_id?: string;
          class_id?: string;
          created_at?: string;
          event_type?: string;
          from_decision?: string | null;
          id?: string;
          session_id?: string;
          to_decision?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "observation_relation_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_relation_events_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "observation_duplicate_candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_relation_events_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_relation_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_revision_topics: {
        Row: {
          class_id: string;
          field_key: string;
          id: string;
          observation_id: string;
          observer_id: string;
          opened_at: string;
          opened_by: string;
          review_id: string;
          source: string;
          unlock_request_id: string | null;
        };
        Insert: {
          class_id: string;
          field_key: string;
          id?: string;
          observation_id: string;
          observer_id: string;
          opened_at?: string;
          opened_by: string;
          review_id: string;
          source: string;
          unlock_request_id?: string | null;
        };
        Update: {
          class_id?: string;
          field_key?: string;
          id?: string;
          observation_id?: string;
          observer_id?: string;
          opened_at?: string;
          opened_by?: string;
          review_id?: string;
          source?: string;
          unlock_request_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "observation_revision_topics_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_revision_topics_review_fk";
            columns: ["review_id", "observation_id"];
            isOneToOne: false;
            referencedRelation: "teacher_reviews";
            referencedColumns: ["id", "observation_id"];
          },
          {
            foreignKeyName: "observation_revision_topics_unlock_request_id_fkey";
            columns: ["unlock_request_id"];
            isOneToOne: false;
            referencedRelation: "observation_unlock_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          from_status: string | null;
          id: string;
          observation_id: string;
          reason: string;
          to_status: string;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: string | null;
          id?: string;
          observation_id: string;
          reason: string;
          to_status: string;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          from_status?: string | null;
          id?: string;
          observation_id?: string;
          reason?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "observation_status_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_status_history_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_submission_media: {
        Row: {
          category: string;
          media_id: string;
          observation_id: string;
          position: number;
          submission_id: string;
        };
        Insert: {
          category: string;
          media_id: string;
          observation_id: string;
          position: number;
          submission_id: string;
        };
        Update: {
          category?: string;
          media_id?: string;
          observation_id?: string;
          position?: number;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "observation_submission_media_media_fk";
            columns: ["media_id", "observation_id"];
            isOneToOne: false;
            referencedRelation: "observation_media";
            referencedColumns: ["id", "observation_id"];
          },
          {
            foreignKeyName: "observation_submission_media_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "observation_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_submissions: {
        Row: {
          based_on_version: number;
          capture_snapshot: Json;
          class_id: string;
          client_submission_id: string;
          common_name: string;
          evidence_note: string;
          id: string;
          identity_source: string;
          media_snapshot: Json;
          observation_id: string;
          observation_version: number;
          observer_id: string;
          possible_same_specimen_count: number;
          reference_note: string | null;
          same_species_acknowledged: boolean;
          same_species_count: number;
          scientific_name: string;
          session_id: string;
          snapshot_schema_version: string;
          submission_kind: string;
          submission_number: number;
          submitted_at: string;
          submitted_by: string;
          taxon_key: string | null;
          taxon_key_version: string;
          verification_snapshot: Json;
        };
        Insert: {
          based_on_version: number;
          capture_snapshot: Json;
          class_id: string;
          client_submission_id: string;
          common_name: string;
          evidence_note: string;
          id?: string;
          identity_source: string;
          media_snapshot: Json;
          observation_id: string;
          observation_version: number;
          observer_id: string;
          possible_same_specimen_count?: number;
          reference_note?: string | null;
          same_species_acknowledged?: boolean;
          same_species_count?: number;
          scientific_name: string;
          session_id: string;
          snapshot_schema_version?: string;
          submission_kind: string;
          submission_number: number;
          submitted_at?: string;
          submitted_by: string;
          taxon_key?: string | null;
          taxon_key_version?: string;
          verification_snapshot: Json;
        };
        Update: {
          based_on_version?: number;
          capture_snapshot?: Json;
          class_id?: string;
          client_submission_id?: string;
          common_name?: string;
          evidence_note?: string;
          id?: string;
          identity_source?: string;
          media_snapshot?: Json;
          observation_id?: string;
          observation_version?: number;
          observer_id?: string;
          possible_same_specimen_count?: number;
          reference_note?: string | null;
          same_species_acknowledged?: boolean;
          same_species_count?: number;
          scientific_name?: string;
          session_id?: string;
          snapshot_schema_version?: string;
          submission_kind?: string;
          submission_number?: number;
          submitted_at?: string;
          submitted_by?: string;
          taxon_key?: string | null;
          taxon_key_version?: string;
          verification_snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "observation_submissions_observation_fk";
            columns: [
              "observation_id",
              "observer_id",
              "class_id",
              "session_id",
            ];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "observer_id", "class_id", "session_id"];
          },
          {
            foreignKeyName: "observation_submissions_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_unlock_requests: {
        Row: {
          class_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          granted_fields: string[] | null;
          id: string;
          observation_id: string;
          reason: string;
          requested_by: string;
          requested_fields: string[];
          review_id: string;
          session_id: string;
          status: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          granted_fields?: string[] | null;
          id?: string;
          observation_id: string;
          reason: string;
          requested_by: string;
          requested_fields: string[];
          review_id: string;
          session_id: string;
          status?: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          granted_fields?: string[] | null;
          id?: string;
          observation_id?: string;
          reason?: string;
          requested_by?: string;
          requested_fields?: string[];
          review_id?: string;
          session_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "observation_unlock_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_unlock_requests_observation_fk";
            columns: [
              "observation_id",
              "requested_by",
              "class_id",
              "session_id",
            ];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "observer_id", "class_id", "session_id"];
          },
          {
            foreignKeyName: "observation_unlock_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observation_unlock_requests_review_fk";
            columns: ["review_id", "observation_id"];
            isOneToOne: false;
            referencedRelation: "teacher_reviews";
            referencedColumns: ["id", "observation_id"];
          },
        ];
      };
      observations: {
        Row: {
          activity_id: string;
          capture_accuracy_m: number | null;
          capture_location: unknown;
          captured_at: string;
          class_id: string;
          client_generated_id: string;
          created_at: string;
          first_submitted_at: string | null;
          id: string;
          identity_source: string | null;
          latest_review_id: string | null;
          latest_reviewed_at: string | null;
          latest_submitted_at: string | null;
          location_status: string;
          location_unavailable_reason: string | null;
          normalized_taxon_key: string | null;
          observer_id: string;
          review_count: number;
          same_species_count: number;
          same_species_in_session: boolean;
          session_group_id: string;
          session_id: string;
          session_participant_id: string;
          status: string;
          student_common_name: string | null;
          student_evidence_note: string | null;
          student_reference_note: string | null;
          student_scientific_name: string | null;
          submission_count: number;
          updated_at: string;
          verified_common_name: string | null;
          verified_scientific_name: string | null;
          version: number;
        };
        Insert: {
          activity_id: string;
          capture_accuracy_m?: number | null;
          capture_location?: unknown;
          captured_at: string;
          class_id: string;
          client_generated_id: string;
          created_at?: string;
          first_submitted_at?: string | null;
          id?: string;
          identity_source?: string | null;
          latest_review_id?: string | null;
          latest_reviewed_at?: string | null;
          latest_submitted_at?: string | null;
          location_status: string;
          location_unavailable_reason?: string | null;
          normalized_taxon_key?: string | null;
          observer_id: string;
          review_count?: number;
          same_species_count?: number;
          same_species_in_session?: boolean;
          session_group_id: string;
          session_id: string;
          session_participant_id: string;
          status?: string;
          student_common_name?: string | null;
          student_evidence_note?: string | null;
          student_reference_note?: string | null;
          student_scientific_name?: string | null;
          submission_count?: number;
          updated_at?: string;
          verified_common_name?: string | null;
          verified_scientific_name?: string | null;
          version?: number;
        };
        Update: {
          activity_id?: string;
          capture_accuracy_m?: number | null;
          capture_location?: unknown;
          captured_at?: string;
          class_id?: string;
          client_generated_id?: string;
          created_at?: string;
          first_submitted_at?: string | null;
          id?: string;
          identity_source?: string | null;
          latest_review_id?: string | null;
          latest_reviewed_at?: string | null;
          latest_submitted_at?: string | null;
          location_status?: string;
          location_unavailable_reason?: string | null;
          normalized_taxon_key?: string | null;
          observer_id?: string;
          review_count?: number;
          same_species_count?: number;
          same_species_in_session?: boolean;
          session_group_id?: string;
          session_id?: string;
          session_participant_id?: string;
          status?: string;
          student_common_name?: string | null;
          student_evidence_note?: string | null;
          student_reference_note?: string | null;
          student_scientific_name?: string | null;
          submission_count?: number;
          updated_at?: string;
          verified_common_name?: string | null;
          verified_scientific_name?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "observations_latest_review_fk";
            columns: ["latest_review_id", "id"];
            isOneToOne: false;
            referencedRelation: "teacher_reviews";
            referencedColumns: ["id", "observation_id"];
          },
          {
            foreignKeyName: "observations_observer_id_fkey";
            columns: ["observer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_participant_fk";
            columns: [
              "session_participant_id",
              "session_id",
              "session_group_id",
              "observer_id",
            ];
            isOneToOne: false;
            referencedRelation: "session_participants";
            referencedColumns: [
              "id",
              "session_id",
              "session_group_id",
              "user_id",
            ];
          },
          {
            foreignKeyName: "observations_session_fk";
            columns: ["session_id", "class_id", "activity_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id", "class_id", "activity_id"];
          },
          {
            foreignKeyName: "observations_session_group_fk";
            columns: ["session_group_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "exploration_session_groups";
            referencedColumns: ["id", "session_id"];
          },
        ];
      };
      operational_error_events: {
        Row: {
          actor_id: string | null;
          environment: string;
          error_code: string;
          fingerprint: string;
          flow: string;
          id: string;
          occurred_at: string;
          received_at: string;
          redacted_context: Json;
          release_version: string | null;
          request_id: string | null;
          severity: string;
          source: string;
          stage: string;
          trace_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          environment: string;
          error_code: string;
          fingerprint: string;
          flow: string;
          id?: string;
          occurred_at: string;
          received_at?: string;
          redacted_context?: Json;
          release_version?: string | null;
          request_id?: string | null;
          severity: string;
          source: string;
          stage: string;
          trace_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          environment?: string;
          error_code?: string;
          fingerprint?: string;
          flow?: string;
          id?: string;
          occurred_at?: string;
          received_at?: string;
          redacted_context?: Json;
          release_version?: string | null;
          request_id?: string | null;
          severity?: string;
          source?: string;
          stage?: string;
          trace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "operational_error_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      operational_incident_notes: {
        Row: {
          author_id: string;
          client_note_id: string;
          created_at: string;
          id: string;
          incident_id: string;
          note: string;
        };
        Insert: {
          author_id: string;
          client_note_id: string;
          created_at?: string;
          id?: string;
          incident_id: string;
          note: string;
        };
        Update: {
          author_id?: string;
          client_note_id?: string;
          created_at?: string;
          id?: string;
          incident_id?: string;
          note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operational_incident_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_incident_notes_incident_id_fkey";
            columns: ["incident_id"];
            isOneToOne: false;
            referencedRelation: "operational_incidents";
            referencedColumns: ["id"];
          },
        ];
      };
      operational_incidents: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_at: string;
          flow: string | null;
          id: string;
          opened_by: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          flow?: string | null;
          id?: string;
          opened_by: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          flow?: string | null;
          id?: string;
          opened_by?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operational_incidents_acknowledged_by_fkey";
            columns: ["acknowledged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_incidents_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "operational_incidents_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          reason: string;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          reason: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          reason?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_admins_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          account_type: string;
          avatar_path: string | null;
          created_at: string;
          display_name: string;
          email: string;
          email_verified_at: string | null;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          account_type?: string;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          email: string;
          email_verified_at?: string | null;
          id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          account_type?: string;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string;
          email_verified_at?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      research_events: {
        Row: {
          activity_id: string | null;
          actor_id: string | null;
          class_id: string | null;
          event_name: string;
          group_id: string | null;
          id: string;
          observation_id: string | null;
          occurred_at: string;
          payload: Json;
          received_at: string;
          request_id: string | null;
          schema_version: number;
          school_id: string | null;
          session_id: string | null;
          trace_id: string | null;
        };
        Insert: {
          activity_id?: string | null;
          actor_id?: string | null;
          class_id?: string | null;
          event_name: string;
          group_id?: string | null;
          id?: string;
          observation_id?: string | null;
          occurred_at: string;
          payload?: Json;
          received_at?: string;
          request_id?: string | null;
          schema_version: number;
          school_id?: string | null;
          session_id?: string | null;
          trace_id?: string | null;
        };
        Update: {
          activity_id?: string | null;
          actor_id?: string | null;
          class_id?: string | null;
          event_name?: string;
          group_id?: string | null;
          id?: string;
          observation_id?: string | null;
          occurred_at?: string;
          payload?: Json;
          received_at?: string;
          request_id?: string | null;
          schema_version?: number;
          school_id?: string | null;
          session_id?: string | null;
          trace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "research_events_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_events_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_events_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_events_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "research_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      school_memberships: {
        Row: {
          created_at: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          role: string;
          school_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          role: string;
          school_id: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          role?: string;
          school_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_memberships_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schools_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      session_events: {
        Row: {
          actor_id: string | null;
          class_id: string;
          created_at: string;
          event_type: string;
          from_status: string | null;
          id: string;
          payload: Json;
          session_group_id: string | null;
          session_id: string;
          to_status: string | null;
        };
        Insert: {
          actor_id?: string | null;
          class_id: string;
          created_at?: string;
          event_type: string;
          from_status?: string | null;
          id?: string;
          payload?: Json;
          session_group_id?: string | null;
          session_id: string;
          to_status?: string | null;
        };
        Update: {
          actor_id?: string | null;
          class_id?: string;
          created_at?: string;
          event_type?: string;
          from_status?: string | null;
          id?: string;
          payload?: Json;
          session_group_id?: string | null;
          session_id?: string;
          to_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "session_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_events_session_class_fk";
            columns: ["session_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "session_events_session_group_id_fkey";
            columns: ["session_group_id"];
            isOneToOne: false;
            referencedRelation: "exploration_session_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      session_participants: {
        Row: {
          class_id: string;
          created_at: string;
          id: string;
          joined_at: string;
          left_at: string | null;
          participation_status: string;
          role_at_start: string;
          session_group_id: string;
          session_id: string;
          user_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          participation_status?: string;
          role_at_start: string;
          session_group_id: string;
          session_id: string;
          user_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          id?: string;
          joined_at?: string;
          left_at?: string | null;
          participation_status?: string;
          role_at_start?: string;
          session_group_id?: string;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_participants_group_session_fk";
            columns: ["session_group_id", "session_id"];
            isOneToOne: false;
            referencedRelation: "exploration_session_groups";
            referencedColumns: ["id", "session_id"];
          },
          {
            foreignKeyName: "session_participants_session_class_fk";
            columns: ["session_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "exploration_sessions";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "session_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      student_group_creation_claims: {
        Row: {
          class_id: string;
          created_at: string;
          group_id: string | null;
          id: string;
          reset_at: string | null;
          reset_by: string | null;
          reset_reason: string | null;
          status: string;
          student_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          reset_at?: string | null;
          reset_by?: string | null;
          reset_reason?: string | null;
          status?: string;
          student_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          reset_at?: string | null;
          reset_by?: string | null;
          reset_reason?: string | null;
          status?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_group_creation_claims_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_group_creation_claims_group_class_fk";
            columns: ["group_id", "class_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id", "class_id"];
          },
          {
            foreignKeyName: "student_group_creation_claims_reset_by_fkey";
            columns: ["reset_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_group_creation_claims_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      student_trait_verifications: {
        Row: {
          ai_value: Json | null;
          analysis_run_id: string | null;
          class_id: string;
          corrected_value: Json | null;
          created_at: string;
          id: string;
          note: string | null;
          observation_id: string;
          observer_id: string;
          position: number;
          session_id: string;
          student_status: string | null;
          student_value: Json | null;
          trait_key: string;
          trait_source: string;
          updated_at: string;
        };
        Insert: {
          ai_value?: Json | null;
          analysis_run_id?: string | null;
          class_id: string;
          corrected_value?: Json | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          observation_id: string;
          observer_id: string;
          position: number;
          session_id: string;
          student_status?: string | null;
          student_value?: Json | null;
          trait_key: string;
          trait_source: string;
          updated_at?: string;
        };
        Update: {
          ai_value?: Json | null;
          analysis_run_id?: string | null;
          class_id?: string;
          corrected_value?: Json | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          observation_id?: string;
          observer_id?: string;
          position?: number;
          session_id?: string;
          student_status?: string | null;
          student_value?: Json | null;
          trait_key?: string;
          trait_source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_trait_verifications_observation_fk";
            columns: [
              "observation_id",
              "observer_id",
              "class_id",
              "session_id",
            ];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "observer_id", "class_id", "session_id"];
          },
        ];
      };
      teacher_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          created_by: string;
          email: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          revoked_by: string | null;
          school_id: string;
          status: string;
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by: string;
          email: string;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          school_id: string;
          status?: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          school_id?: string;
          status?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_invitations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_invitations_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_invitations_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_reviews: {
        Row: {
          class_id: string;
          corrected_traits: Json;
          decision: string;
          feedback: string | null;
          id: string;
          observation_id: string;
          observer_id: string;
          review_started_at: string | null;
          reviewed_at: string;
          reviewer_id: string;
          session_id: string;
          submission_id: string;
          verified_common_name: string | null;
          verified_scientific_name: string | null;
        };
        Insert: {
          class_id: string;
          corrected_traits?: Json;
          decision: string;
          feedback?: string | null;
          id?: string;
          observation_id: string;
          observer_id: string;
          review_started_at?: string | null;
          reviewed_at?: string;
          reviewer_id: string;
          session_id: string;
          submission_id: string;
          verified_common_name?: string | null;
          verified_scientific_name?: string | null;
        };
        Update: {
          class_id?: string;
          corrected_traits?: Json;
          decision?: string;
          feedback?: string | null;
          id?: string;
          observation_id?: string;
          observer_id?: string;
          review_started_at?: string | null;
          reviewed_at?: string;
          reviewer_id?: string;
          session_id?: string;
          submission_id?: string;
          verified_common_name?: string | null;
          verified_scientific_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_reviews_observation_fk";
            columns: [
              "observation_id",
              "observer_id",
              "class_id",
              "session_id",
            ];
            isOneToOne: false;
            referencedRelation: "observations";
            referencedColumns: ["id", "observer_id", "class_id", "session_id"];
          },
          {
            foreignKeyName: "teacher_reviews_observer_id_fkey";
            columns: ["observer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_reviews_submission_fk";
            columns: ["submission_id", "observation_id"];
            isOneToOne: false;
            referencedRelation: "observation_submissions";
            referencedColumns: ["id", "observation_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_group_invitation: {
        Args: { target_invitation_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          invitation_id: string;
          maximum_size: number;
          member_count: number;
          membership_id: string;
          outcome: string;
        }[];
      };
      acknowledge_operational_incident: {
        Args: { target_incident_id: string };
        Returns: Json;
      };
      activate_session_group: {
        Args: { target_group_id: string; target_session_id: string };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          queue_position: number;
          session_group_id: string;
          status: string;
        }[];
      };
      admin_archive_school: {
        Args: { reason: string; target_school_id: string };
        Returns: {
          changed: boolean;
          school_id: string;
          status: string;
        }[];
      };
      admin_create_school: {
        Args: { school_name: string };
        Returns: {
          created_at: string;
          name: string;
          school_id: string;
          status: string;
        }[];
      };
      admin_flow_health: { Args: { window_hours?: number }; Returns: Json };
      admin_get_incident: {
        Args: { target_incident_id: string };
        Returns: Json;
      };
      admin_get_school: {
        Args: { target_school_id: string };
        Returns: {
          class_count: number;
          created_at: string;
          name: string;
          pending_invitation_count: number;
          school_id: string;
          status: string;
          student_count: number;
          teacher_count: number;
        }[];
      };
      admin_list_audit_events: {
        Args: {
          action_filter?: string;
          actor_filter?: string;
          cursor_created_at?: string;
          cursor_id?: string;
          outcome_filter?: string;
          page_size?: number;
          range_from?: string;
          range_to?: string;
          request_filter?: string;
          resource_type_filter?: string;
        };
        Returns: {
          action: string;
          actor_id: string;
          actor_kind: string;
          class_id: string;
          created_at: string;
          event_id: string;
          outcome: string;
          payload: Json;
          request_id: string;
          resource_id: string;
          resource_type: string;
          school_id: string;
          trace_id: string;
        }[];
      };
      admin_list_error_events: {
        Args: {
          code_filter?: string;
          cursor_created_at?: string;
          cursor_id?: string;
          environment_filter?: string;
          flow_filter?: string;
          page_size?: number;
          range_from?: string;
          range_to?: string;
          release_filter?: string;
          request_filter?: string;
          stage_filter?: string;
          trace_filter?: string;
        };
        Returns: {
          environment: string;
          error_code: string;
          event_id: string;
          fingerprint: string;
          flow: string;
          occurred_at: string;
          received_at: string;
          redacted_context: Json;
          release_version: string;
          request_id: string;
          severity: string;
          source: string;
          stage: string;
          trace_id: string;
        }[];
      };
      admin_list_incidents: {
        Args: {
          cursor_created_at?: string;
          cursor_id?: string;
          page_size?: number;
          status_filter?: string;
        };
        Returns: {
          created_at: string;
          flow: string;
          incident_id: string;
          note_count: number;
          severity: string;
          status: string;
          title: string;
        }[];
      };
      admin_list_schools: {
        Args: {
          cursor_created_at?: string;
          cursor_id?: string;
          page_size?: number;
          status_filter?: string;
        };
        Returns: {
          class_count: number;
          created_at: string;
          name: string;
          pending_invitation_count: number;
          school_id: string;
          status: string;
          student_count: number;
          teacher_count: number;
        }[];
      };
      admin_list_teacher_invitations: {
        Args: {
          cursor_created_at?: string;
          cursor_id?: string;
          page_size?: number;
          target_school_id: string;
        };
        Returns: {
          accepted_at: string;
          created_at: string;
          email: string;
          expires_at: string;
          invitation_id: string;
          revoked_at: string;
          status: string;
        }[];
      };
      admin_list_users: {
        Args: {
          account_filter?: string;
          cursor_created_at?: string;
          cursor_id?: string;
          page_size?: number;
          search?: string;
        };
        Returns: {
          account_type: string;
          class_count: number;
          created_at: string;
          display_name: string;
          email: string;
          is_admin: boolean;
          school_names: string[];
          status: string;
          user_id: string;
        }[];
      };
      admin_open_incident: {
        Args: {
          incident_flow?: string;
          incident_severity: string;
          incident_title: string;
        };
        Returns: Json;
      };
      admin_resolve_incident: {
        Args: { resolution_text: string; target_incident_id: string };
        Returns: Json;
      };
      append_operational_incident_note: {
        Args: {
          client_note_id: string;
          note_text: string;
          target_incident_id: string;
        };
        Returns: Json;
      };
      approve_group: {
        Args: { target_group_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          outcome: string;
          status: string;
        }[];
      };
      begin_observation_review: {
        Args: { target_observation_id: string };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_status: string;
          observation_version: number;
          outcome: string;
        }[];
      };
      cancel_group_invitation: {
        Args: { target_invitation_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          invitation_id: string;
          outcome: string;
          status: string;
        }[];
      };
      claim_export: {
        Args: { target_export_id: string };
        Returns: {
          class_id: string;
          export_type: string;
          outcome: string;
          session_id: string;
          storage_path: string;
        }[];
      };
      complete_exploration_session: {
        Args: { target_session_id: string };
        Returns: {
          completed_groups: number;
          error_code: string;
          outcome: string;
          status: string;
        }[];
      };
      complete_observation_media_upload: {
        Args: {
          attempt_count: number;
          target_media_id: string;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          media: Json;
          outcome: string;
        }[];
      };
      complete_session_group: {
        Args: { target_group_id: string; target_session_id: string };
        Returns: {
          error_code: string;
          next_ready_group_id: string;
          outcome: string;
          session_group_id: string;
          status: string;
        }[];
      };
      consume_teacher_invitation: {
        Args: { invitation_token: string };
        Returns: {
          account_type: string;
          invitation_id: string;
          membership_role: string;
          school_id: string;
          user_id: string;
        }[];
      };
      create_class: {
        Args: {
          allow_student_group_creation: boolean;
          class_academic_year: string;
          class_description: string;
          class_name: string;
          class_semester: string;
          class_subject: string;
          initial_formation_status: string;
          maximum_group_count: number;
          maximum_group_size: number;
          minimum_group_size: number;
          target_school_id: string;
        };
        Returns: {
          academic_year: string;
          allow_student_groups: boolean;
          class_id: string;
          created_at: string;
          created_by: string;
          description: string;
          group_formation_status: string;
          max_group_size: number;
          maximum_groups: number;
          min_group_size: number;
          name: string;
          school_id: string;
          semester: string;
          status: string;
          subject: string;
        }[];
      };
      create_exploration_session: {
        Args: {
          scheduled_start?: string;
          session_title: string;
          target_activity_id: string;
        };
        Returns: {
          activity_version_id: string;
          class_id: string;
          error_code: string;
          outcome: string;
          session_id: string;
        }[];
      };
      create_student_group: {
        Args: {
          group_description?: string;
          group_name: string;
          target_class_id: string;
        };
        Returns: {
          class_id: string;
          created_at: string;
          current_group_count: number;
          description: string;
          error_code: string;
          group_id: string;
          leader_id: string;
          maximum_groups: number;
          name: string;
          outcome: string;
          remaining_group_slots: number;
          status: string;
        }[];
      };
      create_teacher_group: {
        Args: {
          group_description?: string;
          group_name: string;
          leader_student_id?: string;
          member_student_ids?: string[];
          target_class_id: string;
        };
        Returns: {
          class_id: string;
          current_group_count: number;
          error_code: string;
          group_id: string;
          maximum_groups: number;
          member_count: number;
          outcome: string;
          remaining_group_slots: number;
        }[];
      };
      decide_observation_relation: {
        Args: {
          expected_decision: string;
          relation_decision: string;
          target_relation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          relation: Json;
        }[];
      };
      decide_revision_unlock_request: {
        Args: {
          decision_note: string;
          granted_field_keys: string[];
          request_decision: string;
          target_request_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          request_status: string;
        }[];
      };
      decline_group_invitation: {
        Args: { target_invitation_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          invitation_id: string;
          outcome: string;
          status: string;
        }[];
      };
      delete_observation_media: {
        Args: { target_media_id: string; target_observation_id: string };
        Returns: {
          error_code: string;
          error_details: Json;
          media: Json;
          outcome: string;
        }[];
      };
      delete_or_archive_group: {
        Args: { target_group_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          outcome: string;
          released_members: number;
          remaining_group_slots: number;
        }[];
      };
      disable_class_invite: {
        Args: { target_invite_id: string };
        Returns: {
          disabled_at: string;
          invite_id: string;
          status: string;
        }[];
      };
      export_rows: { Args: { target_export_id: string }; Returns: Json };
      finish_export: {
        Args: {
          export_succeeded: boolean;
          result_byte_size: number;
          result_failure_code: string;
          result_row_count: number;
          target_export_id: string;
        };
        Returns: {
          export_status: string;
          outcome: string;
        }[];
      };
      get_activity_detail: {
        Args: { target_activity_id: string };
        Returns: Json;
      };
      get_class_group_board: {
        Args: { target_class_id: string };
        Returns: Json;
      };
      get_export: { Args: { target_export_id: string }; Returns: Json };
      get_group_detail: { Args: { target_group_id: string }; Returns: Json };
      get_group_invitation: {
        Args: { target_invitation_id: string };
        Returns: Json;
      };
      get_observation_draft: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      get_observation_map_detail: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      get_observation_related: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      get_observation_review_state: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      get_observation_revision_state: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      get_session_completed_map: {
        Args: { target_session_id: string };
        Returns: Json;
      };
      get_session_live: { Args: { target_session_id: string }; Returns: Json };
      get_session_live_locations: {
        Args: { target_session_id: string };
        Returns: Json;
      };
      get_session_participant_view: {
        Args: { target_session_id: string };
        Returns: Json;
      };
      get_session_setup: { Args: { target_session_id: string }; Returns: Json };
      get_teacher_issue_report: {
        Args: { target_report_id: string };
        Returns: Json;
      };
      get_teacher_observation_review: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      get_teacher_review_queue: {
        Args: {
          cursor_observation_id: string;
          cursor_submitted_at: string;
          page_limit: number;
          queue_filter: string;
          target_class_id: string;
          target_session_id: string;
        };
        Returns: Json;
      };
      grant_platform_admin: {
        Args: { reason: string; target_user_id: string };
        Returns: {
          granted_at: string;
          status: string;
          user_id: string;
        }[];
      };
      issue_class_invite: {
        Args: {
          invitation_expires_at?: string;
          maximum_uses?: number;
          target_class_id: string;
        };
        Returns: {
          code: string;
          created_at: string;
          expires_at: string;
          invite_id: string;
          max_uses: number;
          status: string;
          token: string;
          used_count: number;
        }[];
      };
      issue_teacher_invitation: {
        Args: {
          invitation_expires_at: string;
          target_email: string;
          target_school_id: string;
        };
        Returns: {
          expires_at: string;
          invitation_id: string;
          token: string;
        }[];
      };
      join_class_with_invite: {
        Args: { invitation_token?: string; invite_code?: string };
        Returns: {
          already_joined: boolean;
          class_id: string;
          class_name: string;
          membership_id: string;
          role: string;
          school_id: string;
          school_membership_id: string;
          school_name: string;
          used_count: number;
        }[];
      };
      list_authorized_classes: {
        Args: never;
        Returns: {
          academic_year: string;
          active_member_count: number;
          allow_student_groups: boolean;
          caller_role: string;
          class_id: string;
          created_at: string;
          description: string;
          group_formation_status: string;
          max_group_size: number;
          maximum_groups: number;
          min_group_size: number;
          name: string;
          school_id: string;
          school_name: string;
          semester: string;
          status: string;
          subject: string;
        }[];
      };
      list_class_activities: {
        Args: { target_class_id: string };
        Returns: Json;
      };
      list_class_creation_claims: {
        Args: { target_class_id: string };
        Returns: Json;
      };
      list_class_members: {
        Args: {
          cursor_display_name?: string;
          cursor_member_id?: string;
          page_limit?: number;
          role_filter?: string;
          status_filter?: string;
          target_class_id: string;
        };
        Returns: {
          class_id: string;
          current_group_id: string;
          current_group_name: string;
          display_name: string;
          email: string;
          joined_at: string;
          left_at: string;
          member_id: string;
          role: string;
          status: string;
          user_id: string;
        }[];
      };
      list_class_sessions: { Args: { target_class_id: string }; Returns: Json };
      list_group_eligible_classmates: {
        Args: { target_group_id: string };
        Returns: Json;
      };
      list_my_session_observations: {
        Args: { target_session_id: string };
        Returns: Json;
      };
      list_observation_media: {
        Args: { target_observation_id: string };
        Returns: Json;
      };
      lock_group: {
        Args: { target_group_id: string };
        Returns: {
          cancelled_invitations: number;
          class_id: string;
          error_code: string;
          group_id: string;
          outcome: string;
          status: string;
        }[];
      };
      mark_group_ready: {
        Args: { target_group_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          member_count: number;
          minimum_size: number;
          outcome: string;
          status: string;
        }[];
      };
      move_student_between_groups: {
        Args: {
          target_class_id: string;
          target_destination_group_id?: string;
          target_student_id: string;
          target_successor_leader_id?: string;
        };
        Returns: {
          destination_group_id: string;
          error_code: string;
          leader_changed: boolean;
          outcome: string;
          source_group_id: string;
          student_id: string;
        }[];
      };
      open_admin_console: {
        Args: { view_key: string };
        Returns: {
          admin_user_id: string;
          error_code: string;
          outcome: string;
        }[];
      };
      open_exploration_session: {
        Args: { group_order: string[]; target_session_id: string };
        Returns: {
          error_code: string;
          error_details: Json;
          group_count: number;
          outcome: string;
          participant_count: number;
          session_id: string;
        }[];
      };
      pause_exploration_session: {
        Args: { target_session_id: string };
        Returns: {
          error_code: string;
          outcome: string;
          status: string;
        }[];
      };
      preview_teacher_invitation: {
        Args: { invitation_token: string };
        Returns: {
          email: string;
          expires_at: string;
          invitation_id: string;
          school_id: string;
          school_name: string;
        }[];
      };
      publish_activity: {
        Args: { expected_version_number: number; target_activity_id: string };
        Returns: {
          activity_id: string;
          activity_version_id: string;
          error_code: string;
          error_details: Json;
          outcome: string;
          version_number: number;
        }[];
      };
      record_live_location_sample: {
        Args: {
          sample_accuracy_m: number;
          sample_lat: number;
          sample_lng: number;
          sample_recorded_at: string;
          target_client_sample_id: string;
          target_session_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          retry_after_s: number;
          sample_id: string;
        }[];
      };
      record_operational_error: {
        Args: {
          code: string;
          context?: Json;
          correlation_request_id?: string;
          correlation_trace_id?: string;
          error_environment: string;
          error_flow: string;
          error_severity: string;
          error_source: string;
          error_stage: string;
          occurred?: string;
          release?: string;
        };
        Returns: boolean;
      };
      register_observation_media: {
        Args: {
          media_byte_size: number;
          media_captured_at: string;
          media_category: string;
          media_hash: string;
          media_height: number;
          media_mime_type: string;
          media_preprocessing_version: string;
          media_width: number;
          target_client_media_id: string;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          media: Json;
          outcome: string;
        }[];
      };
      remove_group_member: {
        Args: { target_group_id: string; target_student_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          member_count: number;
          outcome: string;
          status: string;
        }[];
      };
      report_observation_issue: {
        Args: {
          report_reason: string;
          target_observation_id: string;
          target_report_type: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          report_id: string;
        }[];
      };
      request_additional_revision_fields: {
        Args: {
          request_reason: string;
          requested_field_keys: string[];
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          request_id: string;
        }[];
      };
      request_export: {
        Args: {
          request_idempotency_key: string;
          requested_filters: Json;
          requested_type: string;
          target_class_id: string;
          target_session_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          export_id: string;
          export_status: string;
          outcome: string;
          row_estimate: number;
        }[];
      };
      reset_group_creation_claim: {
        Args: {
          reset_reason_text: string;
          target_class_id: string;
          target_student_id: string;
        };
        Returns: {
          audit_log_id: string;
          claim_id: string;
          error_code: string;
          outcome: string;
        }[];
      };
      resolve_observation_issue_report: {
        Args: { next_status: string; note: string; target_report_id: string };
        Returns: {
          error_code: string;
          error_details: Json;
          outcome: string;
          report_status: string;
        }[];
      };
      resubmit_observation: {
        Args: {
          acknowledge_same_species: boolean;
          expected_version: number;
          target_client_submission_id: string;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_version: number;
          outcome: string;
          submission_id: string;
          submission_number: number;
        }[];
      };
      resume_exploration_session: {
        Args: { target_session_id: string };
        Returns: {
          error_code: string;
          outcome: string;
          status: string;
        }[];
      };
      review_observation: {
        Args: {
          expected_submission_id: string;
          review_corrected_traits: Json;
          review_decision: string;
          review_feedback: string;
          review_topic_keys: string[];
          review_verified_common_name: string;
          review_verified_scientific_name: string;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_status: string;
          observation_version: number;
          outcome: string;
          review_id: string;
        }[];
      };
      revoke_platform_admin: {
        Args: { reason: string; target_user_id: string };
        Returns: {
          revoked_at: string;
          status: string;
          user_id: string;
        }[];
      };
      revoke_teacher_invitation: {
        Args: { invitation_id: string; reason: string };
        Returns: {
          id: string;
          revoked_at: string;
          status: string;
        }[];
      };
      rotate_class_invite: {
        Args: {
          invitation_expires_at?: string;
          maximum_uses?: number;
          target_invite_id: string;
        };
        Returns: {
          code: string;
          created_at: string;
          expires_at: string;
          invite_id: string;
          max_uses: number;
          status: string;
          superseded_invite_id: string;
          token: string;
          used_count: number;
        }[];
      };
      save_activity_draft: {
        Args: {
          draft: Json;
          expected_version_number?: number;
          target_activity_id?: string;
          target_class_id?: string;
        };
        Returns: {
          activity_id: string;
          activity_version_id: string;
          error_code: string;
          error_details: Json;
          outcome: string;
          version_number: number;
        }[];
      };
      save_observation_revision: {
        Args: {
          expected_version: number;
          revision_common_name: string;
          revision_evidence_note: string;
          revision_reference_note: string;
          revision_scientific_name: string;
          revision_traits: Json;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_status: string;
          observation_version: number;
          outcome: string;
        }[];
      };
      save_student_review: {
        Args: {
          expected_version: number;
          review_common_name: string;
          review_evidence_note: string;
          review_identity_source: string;
          review_reference_note: string;
          review_scientific_name: string;
          review_traits: Json;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_status: string;
          observation_version: number;
          outcome: string;
        }[];
      };
      send_group_invitation: {
        Args: { target_group_id: string; target_invitee_id: string };
        Returns: {
          available_seats: number;
          class_id: string;
          error_code: string;
          expires_at: string;
          group_id: string;
          invitation_id: string;
          invitee_id: string;
          outcome: string;
        }[];
      };
      start_observation: {
        Args: {
          capture_accuracy_m: number;
          capture_captured_at: string;
          capture_lat: number;
          capture_lng: number;
          capture_location_status: string;
          capture_unavailable_reason: string;
          target_client_generated_id: string;
          target_session_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_id: string;
          observation_version: number;
          outcome: string;
        }[];
      };
      submit_observation: {
        Args: {
          acknowledge_same_species: boolean;
          expected_version: number;
          target_client_submission_id: string;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_version: number;
          outcome: string;
          submission_id: string;
          submission_number: number;
        }[];
      };
      transfer_group_leadership: {
        Args: { target_group_id: string; target_new_leader_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          leader_id: string;
          outcome: string;
          previous_leader_id: string;
        }[];
      };
      unlock_group: {
        Args: { target_group_id: string };
        Returns: {
          class_id: string;
          error_code: string;
          group_id: string;
          outcome: string;
          status: string;
        }[];
      };
      update_class_group_settings: {
        Args: {
          allow_student_group_creation: boolean;
          formation_status: string;
          maximum_group_count: number;
          maximum_group_size: number;
          minimum_group_size: number;
          target_class_id: string;
        };
        Returns: {
          allow_student_groups: boolean;
          class_id: string;
          group_formation_status: string;
          max_group_size: number;
          maximum_groups: number;
          min_group_size: number;
          updated_at: string;
        }[];
      };
      update_observation_draft: {
        Args: {
          draft_common_name: string;
          draft_evidence_note: string;
          draft_scientific_name: string;
          expected_version: number;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          observation_version: number;
          outcome: string;
        }[];
      };
      update_observation_media_category: {
        Args: {
          media_category: string;
          target_media_id: string;
          target_observation_id: string;
        };
        Returns: {
          error_code: string;
          error_details: Json;
          media: Json;
          outcome: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
