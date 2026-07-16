import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  if (!serviceRoleKey.startsWith("sb_secret_") && !serviceRoleKey.startsWith("eyJ")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY does not look like a service role key");
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
