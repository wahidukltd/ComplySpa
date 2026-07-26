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
  const next = validateNext(searchParams.get("next"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/sign-in?error=misconfiguration`);
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          req.cookies.set(name, value);
        }
      },
    },
  });

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const plan = searchParams.get("plan");

  // PKCE password-reset flow: token_hash + type=recovery
  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}/reset-password`);
    }
    return NextResponse.redirect(`${origin}/sign-in?error=recovery_failed`);
  }

  // OAuth code exchange (sign-in callback + email confirmation callback)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_error`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/sign-in?error=session_failed`);
    }

    // If this was a sign-in (user already has a session), go to the requested page
    // If this was an email confirmation, show the verified page
    // Determine by checking if user has email_confirmed_at that was just set
    if (next === "/email-verified") {
      return NextResponse.redirect(`${origin}/email-verified${plan ? `?plan=${plan}` : ""}`);
    }

    return NextResponse.redirect(`${origin}${next}${plan ? `?plan=${plan}` : ""}`);
  }

  // Fallback: password recovery implicit flow (hash fragment — handled client-side)
  return NextResponse.redirect(`${origin}/reset-password`);
}
