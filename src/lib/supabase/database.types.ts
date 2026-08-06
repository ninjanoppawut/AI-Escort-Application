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
      grant_platform_admin: {
        Args: { reason: string; target_user_id: string };
        Returns: {
          granted_at: string;
          status: string;
          user_id: string;
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
