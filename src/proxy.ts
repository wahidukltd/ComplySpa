import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { Database } from "@/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
}

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);

  const supabase = createServerClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          req.cookies.set(name, value);
          res.cookies.set(name, value, { ...options, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
        }
      },
    },
  });

  const pathname = req.nextUrl.pathname;

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname === "/pricing" ||
    pathname.startsWith("/sentry-example-page") ||
    pathname.startsWith("/api/polar/webhook") ||
    pathname.startsWith("/api/resend/webhook") ||
    pathname.startsWith("/api/sentry-example-api") ||
    pathname.startsWith("/api/health");

  if (isPublic) return res;

  const { data: { user } } = await supabase.auth.getUser();

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding")) {
    if (!user) return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return res;
  }

  const { data: users, error: userError } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", user.id);

  if (userError) {
    Sentry.captureMessage("Middleware: users query failed", { extra: { userId: user.id, error: userError } });
    if (pathname === "/onboarding") return res;
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  if (!users?.[0]) {
    if (pathname === "/onboarding") return res;
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const { data: clinics, error: clinicError } = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", users[0].clinic_id);

  if (clinicError) {
    Sentry.captureMessage("Middleware: clinics query failed", { extra: { userId: user.id, clinicId: users[0].clinic_id, error: clinicError } });
    return res;
  }

  const plan = clinics?.[0]?.plan;

  if (plan === "expired_trial" || plan === "inactive") {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  if (plan === "solo" && pathname.startsWith("/dashboard/settings/users")) {
    return NextResponse.redirect(new URL("/pricing?reason=plan_upgrade_required", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};


