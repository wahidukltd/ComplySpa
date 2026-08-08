/** Shared staff-wizard types (no server/client imports — safe everywhere). */

export interface WizardCredentialType {
  id: string;
  name: string;
  category: string;
  defaultRenewalCycleDays: number | null;
}

export interface WizardSuggestion {
  credentialTypeId: string;
  name: string;
  category: string;
  isRequired: boolean;
  renewalDays: number | null;
}

export interface StaffWizardData {
  types: WizardCredentialType[];
  customRoles: string[];
  suggestions: WizardSuggestion[];
}
