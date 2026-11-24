export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BillingCycle = "monthly" | "annual" | "quarterly" | "weekly";

export interface PlaybookTip {
  title: string;
  step_number?: number;
  description: string;
  dark_pattern_alert?: string;
  recommended_action?: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          is_pro: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          is_pro?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          is_pro?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string;
          cost: number;
          billing_cycle: BillingCycle;
          renewal_date: string;
          cancel_url: string | null;
          link_status?: "active" | "broken" | "unreachable" | string | null;
          last_link_check?: string | null;
          playbook_tips: PlaybookTip[] | Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category: string;
          cost: number;
          billing_cycle: BillingCycle;
          renewal_date: string;
          cancel_url?: string | null;
          link_status?: "active" | "broken" | "unreachable" | string | null;
          last_link_check?: string | null;
          playbook_tips?: PlaybookTip[] | Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: string;
          cost?: number;
          billing_cycle?: BillingCycle;
          renewal_date?: string;
          cancel_url?: string | null;
          link_status?: "active" | "broken" | "unreachable" | string | null;
          last_link_check?: string | null;
          playbook_tips?: PlaybookTip[] | Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: "android" | "web" | string;
          device_name: string | null;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          platform?: string;
          device_name?: string | null;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          expo_push_token?: string;
          platform?: string;
          device_name?: string | null;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_own_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      has_recovery_key: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_recovery_key_info: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      set_recovery_key: {
        Args: {
          raw_key: string;
        };
        Returns: undefined;
      };
      confirm_recovery_key_copied: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      recover_password_with_key: {
        Args: {
          target_email: string;
          raw_key: string;
          new_password: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      billing_cycle: BillingCycle;
    };
  };
}

export type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type UserProfileRow = Database["public"]["Tables"]["users"]["Row"];
