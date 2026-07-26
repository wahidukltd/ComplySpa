import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database";

const ALLOWED_REDIRECTS = ["/onboarding", "/dashboard", "/reset-password", "/email-verified"];

function validateNext(next: string | null): string {
  if (!next) return "/onboarding";
  if (!next.startsWith("/")) return "/onboarding";
  if (next.includes("@") || next.includes("//") || next.includes("\\") || next.includes("..")) return "/onboarding";
  if (!ALLOWED_REDIRECTS.includes(next)) return "/onboarding";
  return next;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = validateNext(searchParams.get("next"));
  const plan = searchParams.get("plan");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/sign-in?error=misconfiguration`);
  }

  // PKCE password-reset flow: token_hash + type=recovery
  if (tokenHash && type === "recovery") {
    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    });
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    return NextResponse.redirect(`${origin}${error ? "/sign-in?error=recovery_failed" : "/reset-password"}`);
  }

  // OAuth code exchange (sign-in callback + email confirmation callback)
  if (code) {
    const dest = next === "/email-verified"
      ? `${origin}/email-verified${plan ? `?plan=${plan}` : ""}`
      : `${origin}${next}${plan ? `?plan=${plan}` : ""}`;

    const res = NextResponse.redirect(dest);

    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            res.cookies.set(name, value, { ...options, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_error`);
    }

    return res;
  }

  // Fallback: password recovery implicit flow (hash fragment — handled client-side)
  return NextResponse.redirect(`${origin}/reset-password`);
}
