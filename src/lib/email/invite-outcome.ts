/**
 * Pure decision for the invitation email send (plan §4.3, review-team fix
 * 2026-08-08). Kept free of I/O so the production fail-closed matrix is
 * unit-testable:
 *   - production + missing RESEND_API_KEY  → error + ROLLBACK the pending row
 *   - production + send failure            → error + ROLLBACK the pending row
 *   - production + send accepted           → emailAccepted
 *   - dev/test + missing key / send failure→ row kept, emailAccepted: false
 *     (honest degrade — the UI states the email could not be sent)
 *   - dev/test + send accepted             → emailAccepted
 *
 * `rollback` is authoritative: when true, the caller MUST remove the pending
 * row (soft-delete) so an "invitation not created" error is never paired
 * with a silently-unmailed row that holds a seat.
 */

export const INVITE_CONFIG_ERROR = "Email service is misconfigured — invitation not created";

export type InviteEmailOutcome =
  | { ok: true; emailAccepted: true }
  | { ok: true; emailAccepted: false }
  | { ok: false; emailAccepted: false; error: string; rollback: true };

export function resolveInviteEmailOutcome(opts: {
  isProduction: boolean;
  hasResendKey: boolean;
  sendSuccess: boolean | null;
}): InviteEmailOutcome {
  const { isProduction, hasResendKey, sendSuccess } = opts;

  if (isProduction && !hasResendKey) {
    return { ok: false, emailAccepted: false, error: INVITE_CONFIG_ERROR, rollback: true };
  }

  if (sendSuccess === true) {
    return { ok: true, emailAccepted: true };
  }

  if (sendSuccess === null) {
    // Dev/test without a key: degrade honestly, keep the row.
    return { ok: true, emailAccepted: false };
  }

  if (isProduction) {
    return { ok: false, emailAccepted: false, error: INVITE_CONFIG_ERROR, rollback: true };
  }

  return { ok: true, emailAccepted: false };
}
