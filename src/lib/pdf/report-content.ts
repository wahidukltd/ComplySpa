// Pure derivations + formatting for the compliance report documents.
// Client-safe (no server-only imports) and unit-tested. All date math uses UTC
// so date-only strings ("YYYY-MM-DD") never shift a day for US clinics.
//
// ReportData lives here (not in the renderer) so the pure layer never imports
// from the component tree — the renderer imports the type from this module,
// which makes a runtime circular import impossible.

const ATTENTION_WINDOW_DAYS = 30;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface ReportData {
  clinic: { name: string; address: string | null; state: string | null };
  medicalDirector: string | null;
  generatedBy: string;
  staffMembers: Array<{
    id: string;
    name: string;
    role: string | null;
    hireDate: string | null;
    credentials: Array<{
      type: string;
      licenseNumber: string | null;
      state: string | null;
      issueDate: string | null;
      expirationDate: string | null;
      status: string;
      lastVerified: string | null;
    }>;
  }>;
  summary: {
    total: number;
    valid: number;
    expiring: number;
    expired: number;
    noExpiration: number;
    byCategory: { license: number; training: number; insurance: number; agreement: number };
  };
  upcoming: Array<{
    staffName: string;
    credentialType: string;
    expirationDate: string;
    daysLeft: number;
    status: string;
    alertsSent: string[];
  }>;
  reportId: string;
  generatedAt: string;
}

export function formatReportDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return value;
    // Round-trip check: Date.UTC silently normalizes calendar-impossible
    // dates ("2026-02-30" → March 2). An inspector-facing document must never
    // silently mutate a date — leave the original visible instead.
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== mo - 1 ||
      date.getUTCDate() !== d
    ) {
      return value;
    }
    return formatUtcDate(date);
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return formatUtcDate(parsed);
}

export function formatReportDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = formatUtcDate(d);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date} at ${h}:${min} ${ampm} UTC`;
}

function formatUtcDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// Alert-window history for the Upcoming Renewals table. The vocabulary is the
// 90/60/30/7-day reminder windows plus the -7 escalation window.
export function formatAlertWindows(sent: string[]): string {
  if (sent.length === 0) return "";
  return sent
    .map((w) => (w === "-7" ? "Escalation" : `${w}d`))
    .join(", ");
}

export function summarizeStaffCredentials(
  creds: Array<{ status: string }>,
): { valid: number; expiring: number; expired: number } {
  const out = { valid: 0, expiring: 0, expired: 0 };
  for (const c of creds) {
    if (c.status === "valid") out.valid++;
    else if (c.status === "expiring") out.expiring++;
    else if (c.status === "expired") out.expired++;
  }
  return out;
}

export interface UpcomingItem {
  staffName: string;
  credentialType: string;
  expirationDate: string;
  daysLeft: number;
  status: string;
  alertsSent: string[];
}

// The 90-day alert window splits into the attention table (≤30 days) and the
// upcoming table (31–90 days) so no row is ever listed twice in one report.
export function splitUpcoming(
  upcoming: UpcomingItem[],
): { attention: UpcomingItem[]; upcoming: UpcomingItem[] } {
  const attention: UpcomingItem[] = [];
  const later: UpcomingItem[] = [];
  for (const item of upcoming) {
    (item.daysLeft <= ATTENTION_WINDOW_DAYS ? attention : later).push(item);
  }
  attention.sort((a, b) => a.daysLeft - b.daysLeft);
  later.sort((a, b) => a.daysLeft - b.daysLeft);
  return { attention, upcoming: later };
}

export interface AttentionCredentialItem {
  staffName: string;
  type: string;
  expirationDate: string | null;
  status: string;
}

export interface AttentionAdminItem {
  kind: "no_md" | "no_creds";
  message: string;
}

// Priority order: expired credentials first (by expiration date), then
// credentials expiring within 30 days (by days left, pre-sorted by
// splitUpcoming), then administrative flags (medical director, staff with
// nothing tracked). Credentials without an expiration date are excluded —
// they are covered by the no-expiration note. Pure and deterministic: no
// clock access, so the same data always produces the same section.
export function buildAttentionItems(data: ReportData): {
  credentialItems: AttentionCredentialItem[];
  adminItems: AttentionAdminItem[];
} {
  const expired: AttentionCredentialItem[] = [];
  const adminItems: AttentionAdminItem[] = [];

  for (const staff of data.staffMembers) {
    for (const cred of staff.credentials) {
      if (cred.status !== "expired" || !cred.expirationDate) continue;
      expired.push({
        staffName: staff.name,
        type: cred.type,
        expirationDate: cred.expirationDate,
        status: cred.status,
      });
    }
    if (staff.credentials.length === 0) {
      adminItems.push({
        kind: "no_creds",
        message: `${staff.name} has no tracked credentials`,
      });
    }
  }
  expired.sort((a, b) =>
    (a.expirationDate ?? "").localeCompare(b.expirationDate ?? ""),
  );

  const expiringSoon = splitUpcoming(data.upcoming).attention.map((item) => ({
    staffName: item.staffName,
    type: item.credentialType,
    expirationDate: item.expirationDate,
    status: item.status,
  }));

  if (!data.medicalDirector) {
    adminItems.unshift({ kind: "no_md", message: "Medical director not designated" });
  }

  return { credentialItems: [...expired, ...expiringSoon], adminItems };
}
