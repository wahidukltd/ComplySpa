// Change-history pill derivation. credential_audit stores only
// INSERT|UPDATE|DELETE actions (migration 042); the human action is derived
// from what changed. Soft-deletes are intentionally NOT logged by the trigger,
// so there is deliberately no "Deleted" pill — the record disappearing from
// lists is the deletion signal.
export type AuditAction = "added" | "updated" | "verified" | "renewed";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  added: "Added",
  updated: "Updated",
  verified: "Verified",
  renewed: "Renewed",
};

export const AUDIT_ACTION_VARIANTS: Record<AuditAction, "default" | "secondary" | "outline"> = {
  added: "default",
  updated: "secondary",
  verified: "outline",
  renewed: "outline",
};

type AuditValues = Record<string, unknown> | null;

export function deriveAuditAction(
  action: string,
  oldValues: AuditValues,
  newValues: AuditValues,
): AuditAction {
  if (action === "INSERT") return "added";
  if (action === "UPDATE" && oldValues && newValues) {
    // verifyCredentialNow writes only last_verified_date / verified_by_user_id /
    // status — the date is the discriminator.
    if (oldValues.last_verified_date !== newValues.last_verified_date) return "verified";
    // Renewal (and any manual date edit) is a dates update.
    if (
      oldValues.expiration_date !== newValues.expiration_date ||
      oldValues.issue_date !== newValues.issue_date
    ) {
      return "renewed";
    }
  }
  return "updated";
}
