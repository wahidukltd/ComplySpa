const MS_PER_DAY = 1000 * 60 * 60 * 24;
const EXPIRING_THRESHOLD_MS = 90 * MS_PER_DAY;

export type CredentialStatus = "valid" | "expiring" | "expired";

export function getCredentialStatus(
  expirationDate: Date | string | null,
): CredentialStatus {
  if (!expirationDate) return "valid";
  const d = typeof expirationDate === "string" ? new Date(expirationDate) : expirationDate;
  if (isNaN(d.getTime())) return "valid";
  const now = Date.now();
  if (d.getTime() < now) return "expired";
  if (d.getTime() < now + EXPIRING_THRESHOLD_MS) return "expiring";
  return "valid";
}
