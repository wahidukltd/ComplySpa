import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import type { Database } from "@/types/database";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const cookieStore = await cookies();

  const { getToken } = await auth();
  const supabaseToken = await getToken({ template: "supabase" });
  if (!supabaseToken) {
    Sentry.captureMessage("Server client: Clerk JWT template 'supabase' returned null", "warning");
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        Sentry.captureMessage("Server client: setAll called but not implemented", "info");
      },
    },
    ...(supabaseToken
      ? { global: { headers: { Authorization: `Bearer ${supabaseToken}` } } }
      : {}),
  });
}
