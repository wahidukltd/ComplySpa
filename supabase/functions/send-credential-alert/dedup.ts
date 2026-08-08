/**
 * Pure recipient-list canonicalization for the alert delivery pipeline
 * (plan §4.6). Same address in different casings must never produce
 * duplicate emails, regardless of when/how the rows entered the table.
 * This module is Deno-free by design so the unit test suite can import it
 * directly (vitest) while the edge function bundles it (Supabase CLI).
 */
export function canonicalRecipientList(
  ownerEmail: string,
  recipients: Array<{ email: string }> | null | undefined,
): string[] {
  return [
    ...new Set([
      ownerEmail.toLowerCase(),
      ...(recipients?.map((r) => r.email.toLowerCase()) ?? []),
    ]),
  ].filter(Boolean);
}
