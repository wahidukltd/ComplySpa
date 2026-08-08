export interface SeatSummary {
  /** Active members + pending invites (active-only: deleted_at IS NULL) — the same count the enforce_plan_limits trigger and the billing page use. */
  used: number;
  /** Clamped to >= 0; 0 whenever atCapacity or overLimit. */
  available: number;
  /** Pending invitations (auth_user_id IS NULL) — each holds a seat. */
  pending: number;
  atCapacity: boolean;
  /** Reachable via a pending plan change (e.g. Practice -> Solo applies at the next billing period while members remain). */
  overLimit: boolean;
}

/**
 * Single source for the Users-tab seat summary (plan 2026-08-08). Derived
 * from the active-only user list and the plan's maxUsers so the UI can never
 * drift from the DB trigger or the billing page.
 */
export function deriveSeatSummary(
  users: { is_pending: boolean }[],
  maxUsers: number,
): SeatSummary {
  const used = users.length;
  const pending = users.filter((u) => u.is_pending).length;
  const available = Math.max(0, maxUsers - used);
  return {
    used,
    available,
    pending,
    atCapacity: available === 0,
    overLimit: used > maxUsers,
  };
}
