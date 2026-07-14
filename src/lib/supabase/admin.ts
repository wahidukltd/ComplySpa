import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ONLY use in Edge Functions and server-only admin operations. NEVER import in Client Components.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
