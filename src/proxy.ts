import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing",
  "/api/polar/webhook",
  "/api/resend/webhook",
  "/api/twilio/webhook",
]);

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding",
]);

const soloForbidden = createRouteMatcher([
  "/dashboard/audit(.*)",
  "/dashboard/settings/users(.*)",
]);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function getPlan(
  userId: string,
  getToken: (opts?: { template?: string }) => Promise<string | null>,
): Promise<{ plan: string | null; hasClinic: boolean; error: boolean }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { plan: null, hasClinic: false, error: true };
  }

  const supabaseToken = await getToken({ template: "supabase" });
  if (!supabaseToken) {
    return { plan: null, hasClinic: false, error: true };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${supabaseToken}`,
    apikey: SUPABASE_ANON_KEY,
  };

  const userRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?clerk_user_id=eq.${encodeURIComponent(userId)}&select=clinic_id`,
    { headers },
  );

  if (!userRes.ok) {
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
    return { plan: null, hasClinic: true, error: true };
  }

  const clinics = (await clinicRes.json()) as Array<{ plan: string }>;
  return { plan: clinics?.[0]?.plan ?? null, hasClinic: true, error: false };
}

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn, getToken } = await auth();

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  if (isProtectedRoute(req) && !userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  if (!userId) {
    return NextResponse.next();
  }

  const { plan, hasClinic, error } = await getPlan(userId, getToken);

  if (error) {
    return NextResponse.next();
  }

  if (!hasClinic) {
    if (req.nextUrl.pathname === "/onboarding") {
      return NextResponse.next();
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
    return NextResponse.redirect(
      new URL("/dashboard?reason=plan_upgrade_required", req.url),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};