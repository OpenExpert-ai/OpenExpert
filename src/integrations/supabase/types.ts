// SPDX-License-Identifier: MIT
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          churn_risk: number;
          id: number;
          mrr: number;
          name: string;
          open_tickets: number;
          usage_trend: number;
        };
        Insert: {
          churn_risk: number;
          id?: number;
          mrr: number;
          name: string;
          open_tickets: number;
          usage_trend: number;
        };
        Update: {
          churn_risk?: number;
          id?: number;
          mrr?: number;
          name?: string;
          open_tickets?: number;
          usage_trend?: number;
        };
        Relationships: [];
      };
      activity: {
        Row: {
          actor: string;
          actor_name: string;
          duration_ms: number;
          expert_id: string;
          id: string;
          snapshot: Json | null;
          sources: string[];
          status: string;
          summary: string;
          ts: string;
          type: string;
        };
        Insert: {
          actor: string;
          actor_name: string;
          duration_ms?: number;
          expert_id?: string;
          id: string;
          snapshot?: Json | null;
          sources?: string[];
          status: string;
          summary: string;
          ts?: string;
          type: string;
        };
        Update: {
          actor?: string;
          actor_name?: string;
          duration_ms?: number;
          expert_id?: string;
          id?: string;
          snapshot?: Json | null;
          sources?: string[];
          status?: string;
          summary?: string;
          ts?: string;
          type?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          channel: string;
          conversions_7d: number;
          cpa_target: number;
          daily_budget: number;
          id: string;
          name: string;
          spend_7d: number;
          status: string;
        };
        Insert: {
          channel: string;
          conversions_7d: number;
          cpa_target: number;
          daily_budget: number;
          id: string;
          name: string;
          spend_7d: number;
          status: string;
        };
        Update: {
          channel?: string;
          conversions_7d?: number;
          cpa_target?: number;
          daily_budget?: number;
          id?: string;
          name?: string;
          spend_7d?: number;
          status?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          conversation_id: string;
          created_at: string;
          expert_id: string;
          id: string;
          message: Json;
          user_id: string;
        };
        Insert: {
          conversation_id?: string;
          created_at?: string;
          expert_id?: string;
          id?: string;
          message: Json;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          expert_id?: string;
          id?: string;
          message?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      deals: {
        Row: {
          close_date: string;
          company: string;
          days_in_stage: number;
          id: number;
          owner: string;
          stage: string;
          status: string;
          value: number;
        };
        Insert: {
          close_date: string;
          company: string;
          days_in_stage: number;
          id?: number;
          owner: string;
          stage: string;
          status?: string;
          value: number;
        };
        Update: {
          close_date?: string;
          company?: string;
          days_in_stage?: number;
          id?: number;
          owner?: string;
          stage?: string;
          status?: string;
          value?: number;
        };
        Relationships: [];
      };
      expert_access: {
        Row: {
          access: string;
          expert_id: string;
          user_id: string;
        };
        Insert: {
          access?: string;
          expert_id: string;
          user_id: string;
        };
        Update: {
          access?: string;
          expert_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expert_access_expert_id_fkey";
            columns: ["expert_id"];
            isOneToOne: false;
            referencedRelation: "experts";
            referencedColumns: ["id"];
          },
        ];
      };
      experts: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          sources: string[];
        };
        Insert: {
          created_at?: string;
          description?: string;
          id: string;
          name: string;
          sources?: string[];
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          sources?: string[];
        };
        Relationships: [];
      };
      google_tokens: {
        Row: {
          access_token: string;
          expires_at: string;
          refresh_token: string | null;
          scopes: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_token: string;
          expires_at: string;
          refresh_token?: string | null;
          scopes?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_token?: string;
          expires_at?: string;
          refresh_token?: string | null;
          scopes?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      integrations: {
        Row: {
          category: string;
          connected: boolean;
          entities: Json;
          id: string;
          last_sync: string;
          name: string;
        };
        Insert: {
          category: string;
          connected?: boolean;
          entities?: Json;
          id: string;
          last_sync?: string;
          name: string;
        };
        Update: {
          category?: string;
          connected?: boolean;
          entities?: Json;
          id?: string;
          last_sync?: string;
          name?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          created_at: string;
          email: string;
          expert_id: string;
          name: string;
          role: Database["public"]["Enums"]["app_role"];
          title: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          expert_id?: string;
          name?: string;
          role: Database["public"]["Enums"]["app_role"];
          title?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          expert_id?: string;
          name?: string;
          role?: Database["public"]["Enums"]["app_role"];
          title?: string;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          amount: number;
          client: string;
          due_date: string;
          id: string;
          reminders: number;
          status: string;
        };
        Insert: {
          amount: number;
          client: string;
          due_date: string;
          id: string;
          reminders?: number;
          status: string;
        };
        Update: {
          amount?: number;
          client?: string;
          due_date?: string;
          id?: string;
          reminders?: number;
          status?: string;
        };
        Relationships: [];
      };
      processes: {
        Row: {
          active: boolean;
          approval: string;
          description: string;
          expert_id: string;
          id: string;
          last_run: string | null;
          limits: string[];
          name: string;
          runs: number;
          stages: string[];
          trigger: string;
        };
        Insert: {
          active?: boolean;
          approval: string;
          description: string;
          expert_id?: string;
          id: string;
          last_run?: string | null;
          limits: string[];
          name: string;
          runs?: number;
          stages: string[];
          trigger: string;
        };
        Update: {
          active?: boolean;
          approval?: string;
          description?: string;
          expert_id?: string;
          id?: string;
          last_run?: string | null;
          limits?: string[];
          name?: string;
          runs?: number;
          stages?: string[];
          trigger?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          name: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          email?: string;
          id: string;
          name?: string;
          title?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          title?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "ADMIN" | "INTERMEDIO" | "LECTOR";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {
      app_role: ["ADMIN", "INTERMEDIO", "LECTOR"],
    },
  },
} as const;
