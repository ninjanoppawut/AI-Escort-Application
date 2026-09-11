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
          actor_id: string | null;
          class_id: string | null;
          event_name: string;
          group_id: string | null;
          id: string;
          occurred_at: string;
          payload: Json;
          received_at: string;
          request_id: string | null;
          schema_version: number;
          school_id: string | null;
          trace_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          class_id?: string | null;
          event_name: string;
          group_id?: string | null;
          id?: string;
          occurred_at: string;
          payload?: Json;
          received_at?: string;
          request_id?: string | null;
          schema_version: number;
          school_id?: string | null;
          trace_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          class_id?: string | null;
          event_name?: string;
          group_id?: string | null;
          id?: string;
          occurred_at?: string;
          payload?: Json;
          received_at?: string;
          request_id?: string | null;
          schema_version?: number;
          school_id?: string | null;
          trace_id?: string | null;
        };
        Relationships: [
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
            foreignKeyName: "research_events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
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
      get_class_group_board: {
        Args: { target_class_id: string };
        Returns: Json;
      };
      get_group_detail: { Args: { target_group_id: string }; Returns: Json };
      get_group_invitation: {
        Args: { target_invitation_id: string };
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
      list_group_eligible_classmates: {
        Args: { target_group_id: string };
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
