export type ClinicPlan =
  | "trial"
  | "expired_trial"
  | "inactive"
  | "solo"
  | "practice"
  | "multi_location";

export type UserRole = "owner" | "manager" | "viewer";

export type CredentialStatus = "valid" | "expiring" | "expired";

export type AlertDeliveryStatus = "delivered" | "failed" | "pending";

export type AuditRunType = "quarterly" | "on_demand";

export type AuditFindingStatus = "pass" | "fail" | "stale" | "manual_attest";

export type RemediationStatus = "open" | "in_progress" | "closed";
