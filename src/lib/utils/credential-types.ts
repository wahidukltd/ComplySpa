export interface CredentialTypeLike {
  id: string;
  name: string;
}

/**
 * Non-blocking duplicate detection for custom credential types (plan §4.7).
 * Matches the typed name case-insensitively against every visible type
 * (global + the clinic's own customs). Returns the existing type's name when
 * a similar name already exists, else null. This is a warning only — custom
 * types are a permanent, intentional part of the compliance model and can
 * legitimately share a name with a global type (different jurisdiction,
 * issuing body, or requirement). It never blocks, merges, renames, or
 * redirects.
 */
export function findSimilarCredentialTypeName(
  name: string,
  types: CredentialTypeLike[],
): string | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const match = types.find((t) => t.name.trim().toLowerCase() === normalized);
  return match?.name ?? null;
}
