"use server";

import "server-only";

export async function createAuditRun(): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}
