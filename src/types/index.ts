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


