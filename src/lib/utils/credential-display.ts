// Single source of truth for credential status/category display. Keyed by
// string (status arrives from the DB column as string); the unit test asserts
// full coverage of the CredentialStatus union.
export const STATUS_LABELS: Record<string, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
};

export const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  valid: "default",
  expiring: "secondary",
  expired: "destructive",
};

export const CATEGORY_COLORS: Record<string, string> = {
  license: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  training: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  insurance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  agreement: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};
