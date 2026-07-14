// Types will be generated from Supabase schema using `supabase gen types` after Phase 1.
// Minimal types below match the data model in AGENTS.md until generated types replace them.

export interface Clinic {
  id: string;
  name: string;
  plan: import("./index").ClinicPlan;
  trial_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  clinic_id: string;
  clerk_user_id: string;
  role: import("./index").UserRole;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffMember {
  id: string;
  clinic_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Credential {
  id: string;
  staff_id: string;
  clinic_id: string;
  credential_type: string;
  license_number: string;
  issuing_state: string | null;
  expiration_date: string | null;
  document_url: string | null;
  status: import("./index").CredentialStatus;
  created_at: string;
  updated_at: string;
}

export interface AlertLog {
  id: string;
  clinic_id: string;
  staff_id: string;
  credential_id: string;
  alert_type: string;
  channel: "email" | "sms";
  recipient: string;
  delivery_status: import("./index").AlertDeliveryStatus;
  sent_at: string;
  delivered_at: string | null;
  error_message: string | null;
}

export interface AuditRun {
  id: string;
  clinic_id: string;
  run_type: import("./index").AuditRunType;
  status: "in_progress" | "completed";
  readiness_score: number | null;
  started_at: string;
  completed_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface AuditFinding {
  id: string;
  audit_run_id: string;
  checklist_item: string;
  status: import("./index").AuditFindingStatus;
  auto_filled: boolean;
  notes: string | null;
  remediation_due_date: string | null;
  remediation_status: import("./index").RemediationStatus | null;
  remediation_closed_at: string | null;
  created_at: string;
  updated_at: string;
}
