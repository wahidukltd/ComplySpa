export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      alert_logs: {
        Row: {
          alert_type: string
          clinic_id: string
          created_at: string
          credential_id: string
          days_before_expiration: number
          delivery_status: string
          id: string
          recipient: string
          resend_webhook_id: string | null
          sent_at: string
          twilio_message_id: string | null
        }
        Insert: {
          alert_type: string
          clinic_id: string
          created_at?: string
          credential_id: string
          days_before_expiration: number
          delivery_status?: string
          id?: string
          recipient: string
          resend_webhook_id?: string | null
          sent_at?: string
          twilio_message_id?: string | null
        }
        Update: {
          alert_type?: string
          clinic_id?: string
          created_at?: string
          credential_id?: string
          days_before_expiration?: number
          delivery_status?: string
          id?: string
          recipient?: string
          resend_webhook_id?: string | null
          sent_at?: string
          twilio_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_logs_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_recipients: {
        Row: {
          clinic_id: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_recipients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_reports: {
        Row: {
          clinic_id: string
          created_at: string
          generated_at: string
          generated_by_user_id: string | null
          id: string
          report_data_snapshot: Json | null
          report_url: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          generated_at?: string
          generated_by_user_id?: string | null
          id?: string
          report_data_snapshot?: Json | null
          report_url?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          generated_at?: string
          generated_by_user_id?: string | null
          id?: string
          report_data_snapshot?: Json | null
          report_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_reports_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_reports_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          plan: string
          polar_customer_id: string | null
          state: string | null
          trial_end_date: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          plan?: string
          polar_customer_id?: string | null
          state?: string | null
          trial_end_date?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          plan?: string
          polar_customer_id?: string | null
          state?: string | null
          trial_end_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      credential_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string
          clinic_id: string
          credential_id: string
          id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by: string
          clinic_id: string
          credential_id: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string
          clinic_id?: string
          credential_id?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: []
      }
      credential_types: {
        Row: {
          category: string
          clinic_id: string | null
          created_at: string
          default_renewal_cycle_days: number | null
          id: string
          is_custom: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category: string
          clinic_id?: string | null
          created_at?: string
          default_renewal_cycle_days?: number | null
          id?: string
          is_custom?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          clinic_id?: string | null
          created_at?: string
          default_renewal_cycle_days?: number | null
          id?: string
          is_custom?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_types_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          clinic_id: string
          created_at: string
          credential_type_id: string
          deleted_at: string | null
          document_url: string | null
          expiration_date: string | null
          id: string
          issue_date: string | null
          last_verified_date: string | null
          license_number: string | null
          notes: string | null
          staff_member_id: string
          state: string | null
          status: string
          updated_at: string
          verification_url: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          credential_type_id: string
          deleted_at?: string | null
          document_url?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          last_verified_date?: string | null
          license_number?: string | null
          notes?: string | null
          staff_member_id: string
          state?: string | null
          status?: string
          updated_at?: string
          verification_url?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          credential_type_id?: string
          deleted_at?: string | null
          document_url?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          last_verified_date?: string | null
          license_number?: string | null
          notes?: string | null
          staff_member_id?: string
          state?: string | null
          status?: string
          updated_at?: string
          verification_url?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credentials_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_credential_type_id_fkey"
            columns: ["credential_type_id"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_verified_by_user_id_fkey"
            columns: ["verified_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          clinic_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          hire_date: string | null
          id: string
          name: string
          phone: string | null
          procedures_performed: string[]
          role: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name: string
          phone?: string | null
          procedures_performed?: string[]
          role?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name?: string
          phone?: string | null
          procedures_performed?: string[]
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          clerk_user_id: string
          clinic_id: string
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          clerk_user_id: string
          clinic_id: string
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          role?: string
          updated_at?: string
        }
        Update: {
          clerk_user_id?: string
          clinic_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_clinic_id: { Args: never; Returns: string }
      auth_user_role: { Args: never; Returns: string }
      check_trial_expiry: { Args: never; Returns: undefined }
      cleanup_inactive_clinics: { Args: never; Returns: undefined }
      create_clinic_for_user: {
        Args: {
          p_address?: string
          p_clerk_sub: string
          p_email: string
          p_name: string
          p_state?: string
        }
        Returns: string
      }
      scan_audit_overdue: { Args: never; Returns: undefined }
      scan_escalation_alerts: { Args: never; Returns: undefined }
      scan_expiring_credentials: { Args: never; Returns: undefined }
      update_credential_statuses: { Args: never; Returns: undefined }
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

