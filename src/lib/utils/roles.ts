import { z } from "zod";
import { ROLE_DISPLAY_LABELS } from "@/lib/staff/role-credential-defaults";

/** Role-name format constants. The DB CHECK constraints in migration 057 are
 * the single authoritative source; this zod schema is the UX mirror that
 * produces friendly errors before the constraint fires. Semantics must stay
 * identical: Unicode letters + ASCII digits, spaces and basic punctuation,
 * starting with a letter or digit. (PostgreSQL's ARE has no \p{...} escapes —
 * the DB uses the equivalent [[:alpha:][:digit:]] POSIX class.) */
export const ROLE_NAME_MAX = 80;

export const ROLE_NAME_PATTERN = /^[\p{L}0-9][\p{L}0-9 _\-'().&/+]*$/u;

export const roleNameSchema = z
  .string()
  .trim()
  .min(1, "Role name is required.")
  .max(ROLE_NAME_MAX, `Role name must be ${ROLE_NAME_MAX} characters or fewer.`)
  .regex(
    ROLE_NAME_PATTERN,
    "Role name can only contain letters, numbers, spaces, and basic punctuation ( - ' ( ) . & / + ).",
  );

/** The 9 ComplySpa-seeded roles (migration 041). */
export const BUILT_IN_ROLES = [
  "MD",
  "DO",
  "NP",
  "PA",
  "RN",
  "esthetician",
  "MA",
  "front_desk",
  "other",
] as const;

export type BuiltInRole = (typeof BUILT_IN_ROLES)[number];

export function isBuiltInRole(role: string): boolean {
  return (BUILT_IN_ROLES as readonly string[]).includes(role);
}

/** Display label for a role value. The built-ins use the friendly labels,
 * with MD/DO disambiguated (the pre-existing "Physician" duplicate-label
 * inconsistency — both are distinct template rows and stay distinct); custom
 * roles return their raw name — the name IS the label. */
export function formatRoleLabel(role: string): string {
  if (role === "MD") return "Physician (MD)";
  if (role === "DO") return "Physician (DO)";
  if (isBuiltInRole(role)) return ROLE_DISPLAY_LABELS[role] ?? role;
  return role;
}
