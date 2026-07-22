import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing",
  "/api/polar/webhook",
  "/api/resend/webhook",
]);

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding",
]);

const soloForbidden = createRouteMatcher([
  "/dashboard/settings/users(.*)",
]);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in environment",
  );
}

async function getPlan(
  userId: string,
  getToken: (opts?: { template?: string }) => Promise<string | null>,
): Promise<{ plan: string | null; hasClinic: boolean; error: boolean }> {
  const supabaseToken = await getToken({ template: "supabase" });
  if (!supabaseToken) {
    Sentry.captureMessage("Middleware: Clerk JWT template 'supabase' returned null", "warning");
    return { plan: null, hasClinic: false, error: true };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${supabaseToken}`,
    apikey: SUPABASE_ANON_KEY!,
  };

  const userRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?clerk_user_id=eq.${encodeURIComponent(userId)}&select=clinic_id`,
    { headers },
  );

  if (!userRes.ok) {
    Sentry.captureMessage("Middleware: users fetch failed", { extra: { userId, status: userRes.status } });
    return { plan: null, hasClinic: false, error: true };
  }

  const users = (await userRes.json()) as Array<{ clinic_id: string }>;
  const firstUser = users?.[0];
  if (!firstUser) {
    return { plan: null, hasClinic: false, error: false };
  }

  const clinicRes = await fetch(
    `${SUPABASE_URL}/rest/v1/clinics?id=eq.${encodeURIComponent(firstUser.clinic_id)}&select=plan`,
    { headers },
  );

  if (!clinicRes.ok) {
    Sentry.captureMessage("Middleware: clinics fetch failed", { extra: { userId, clinicId: firstUser.clinic_id, status: clinicRes.status } });
    return { plan: null, hasClinic: true, error: true };
  }

  const clinics = (await clinicRes.json()) as Array<{ plan: string }>;
  return { plan: clinics?.[0]?.plan ?? null, hasClinic: true, error: false };
}

function nextWithPathname(pathname: string): NextResponse {
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);
  return res;
}

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn, getToken } = await auth();

  if (isPublicRoute(req)) {
    return nextWithPathname(req.nextUrl.pathname);
  }

  if (isProtectedRoute(req) && !userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  if (!userId) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return nextWithPathname(req.nextUrl.pathname);
  }

  const { plan, hasClinic, error } = await getPlan(userId, getToken);

  if (error) {
    if (req.nextUrl.pathname === "/onboarding" || isPublicRoute(req)) {
      return nextWithPathname(req.nextUrl.pathname);
    }
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  if (!hasClinic) {
    if (req.nextUrl.pathname === "/onboarding") {
      return nextWithPathname(req.nextUrl.pathname);
    }
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (hasClinic && req.nextUrl.pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (plan === "expired_trial" || plan === "inactive") {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  if (plan === "solo" && soloForbidden(req)) {
    return NextResponse.redirect(new URL("/pricing?reason=plan_upgrade_required", req.url));
  }

  return nextWithPathname(req.nextUrl.pathname);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};