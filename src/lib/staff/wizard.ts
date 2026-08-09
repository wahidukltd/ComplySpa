/** Shared staff-wizard types (no server/client imports — safe everywhere). */

import { roleNameSchema, BUILT_IN_ROLES } from "@/lib/utils/roles";

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

export interface WizardCredentialRow {
  credentialTypeId: string;
  name: string;
  category: string;
  isRequired: boolean;
  fromTemplate: boolean;
  checked: boolean;
  licenseNumber: string;
  state: string;
  issueDate: string;
  expirationDate: string;
}

/** Map resolved-template suggestions into wizard rows: required first
 * (pre-checked), then optional (unchecked). The 041 global seed and clinic
 * overrides both order items via sort_order, so within each group the
 * template order is preserved. */
export function buildSuggestedRows(suggestions: WizardSuggestion[]): WizardCredentialRow[] {
  const toRow = (s: WizardSuggestion): WizardCredentialRow => ({
    credentialTypeId: s.credentialTypeId,
    name: s.name,
    category: s.category,
    isRequired: s.isRequired,
    fromTemplate: true,
    checked: s.isRequired,
    licenseNumber: "",
    state: "",
    issueDate: "",
    expirationDate: "",
  });
  return [
    ...suggestions.filter((s) => s.isRequired).map(toRow),
    ...suggestions.filter((s) => !s.isRequired).map(toRow),
  ];
}

/** Local date `days` from now as YYYY-MM-DD (the native date-input value).
 * `now` is injectable for deterministic tests. */
export function autoExpirationDate(days: number, now: Date = new Date()): string {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${month}-${day}`;
}

/** Client mirror of the wizardCredentialSchema date-order refine. */
export function rowDateError(issueDate: string, expirationDate: string): string | null {
  if (issueDate && expirationDate && expirationDate < issueDate) {
    return "Expiration must be on or after the issue date.";
  }
  return null;
}

/** Step-2 custom-role name guard. Mirrors the settings editor's
 * validateCreateName (roleNameSchema + own-clinic case-insensitive duplicate)
 * and adds the wizard-specific built-in guard: a custom role named like a
 * built-in would silently become an override (getStaffWizardData excludes
 * same-name-as-global clinic rows from customRoles) and never render as a
 * card — a dead end. Built-in customization belongs in Settings. */
export function wizardRoleNameError(
  name: string,
  existingCustomRoles: string[],
): string | null {
  const parsed = roleNameSchema.safeParse(name);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid role name.";
  }
  const trimmed = parsed.data;
  if (
    (BUILT_IN_ROLES as readonly string[]).some(
      (r) => r.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return "This name matches a built-in role. Customize it in Settings → Role Templates instead.";
  }
  if (
    existingCustomRoles.some(
      (r) => r.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return "A role with this name already exists in your clinic.";
  }
  return null;
}
