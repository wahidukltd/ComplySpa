"use client";

import { createBrowserClient } from "@supabase/ssr";
import * as Sentry from "@sentry/nextjs";
import type { Database } from "@/types/database";

// ponytail: minimal Window.Clerk type for the accessToken callback.
// Full type is in @clerk/clerk-js but skipLibCheck prevents augmentation.
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (opts?: { template?: string }) => Promise<string | null>;
      };
    };
  }
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createBrowserClient<Database>(url, anonKey, {
    async accessToken() {
      if (typeof window === "undefined" || !window.Clerk?.session) {
        return null;
      }
      try {
        const token = await window.Clerk.session.getToken({
          template: "supabase",
        });
        return token ?? null;
      } catch (err) {
        Sentry.captureException(err);
        return null;
      }
    },
  });
}
