export const CHECKLIST_ITEMS = [
  {
    id: "medical_director_agreement",
    label: "Medical Director Agreement",
    description: "Current, signed medical director agreement with valid expiration date",
    autoFill: true as const,
  },
  {
    id: "facility_license",
    label: "Facility License / State Registration",
    description: "Current facility license or state registration certificate",
    autoFill: "if_tracked" as const,
  },
  {
    id: "staff_license_verifications",
    label: "Staff License Verifications",
    description: "All staff have credentials verified within the last 365 days",
    autoFill: true as const,
  },
  {
    id: "signed_treatment_protocols",
    label: "Signed Treatment Protocols / SOPs",
    description: "Present, MD-signed within 90 days, accessible to all staff",
    autoFill: false as const,
  },
  {
    id: "patient_chart_sample",
    label: "Patient Chart Sample Readiness",
    description: "Random patient charts available for inspector pull",
    autoFill: false as const,
  },
  {
    id: "advertising_file",
    label: "Advertising File",
    description: "Current ads and before/after consent forms on file",
    autoFill: false as const,
  },
  {
    id: "dea_registration",
    label: "DEA Registration",
    description: "Current DEA registration with valid expiration",
    autoFill: "if_tracked" as const,
  },
] as const;

export type ChecklistItemId = (typeof CHECKLIST_ITEMS)[number]["id"];
export type FindingStatus = "pass" | "fail" | "stale" | "manual_attest";

export interface AutoFillResult {
  status: FindingStatus;
  notes: string;
}

export interface AuditFinding {
  id: string;
  checklistItem: ChecklistItemId;
  status: FindingStatus;
  autoFilled?: boolean;
  notes: string | null;
  remediationDueDate?: string | null;
  remediationStatus?: string | null;
}
