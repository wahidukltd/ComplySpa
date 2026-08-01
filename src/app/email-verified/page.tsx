import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmailVerifiedPage(props: { searchParams: Promise<{ plan?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const { plan } = await props.searchParams;
  const planLabel = plan === "solo" ? "Solo" : plan === "practice" ? "Practice" : null;
  const emailHtml = user.email ? user.email.replace(/(.{3}).+(@.+)/, "$1***$2") : "your email";

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", backgroundColor: "#FFFFFF" }}>
      <div style={{ maxWidth: "440px", width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "4px", height: "28px", backgroundColor: "#6E97A7", borderRadius: "2px" }} />
            <h1 style={{ margin: 0, fontSize: "13px", color: "rgba(0,0,0,0.55)", letterSpacing: "0.5px", fontWeight: 500 }}>EMAIL VERIFIED</h1>
          </div>
          <div style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(0,0,0,0.12)", borderRadius: "8px", padding: "32px 28px" }}>
            <div style={{ width: "48px", height: "48px", backgroundColor: "#E8F5E9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", fontSize: "24px", color: "#4A8C5C" }}>✓</div>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 600, color: "#000000" }}>Email verified</h2>
            <p style={{ margin: "0 0 4px", fontSize: "14px", lineHeight: "1.6", color: "rgba(0,0,0,0.55)" }}>
              {emailHtml} has been confirmed.
            </p>
            {planLabel ? (
              <>
                <p style={{ margin: "0 0 20px", fontSize: "14px", lineHeight: "1.6", color: "rgba(0,0,0,0.55)" }}>
                  Your <strong>{planLabel}</strong> plan is ready. Set up your clinic to activate your subscription.
                </p>
                <Link
                  href={`/onboarding?plan=${plan}`}
                  style={{ display: "inline-block", padding: "12px 24px", fontSize: "14px", fontWeight: 500, color: "#FFFFFF", textDecoration: "none", borderRadius: "6px", backgroundColor: "#6E97A7" }}
                >
                  Set up your clinic
                </Link>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 20px", fontSize: "14px", lineHeight: "1.6", color: "rgba(0,0,0,0.55)" }}>
                  Your account is active. Choose a plan to get started, or explore on a free trial first.
                </p>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <Link
                    href="/onboarding"
                    style={{ display: "inline-block", padding: "12px 24px", fontSize: "14px", fontWeight: 500, color: "#FFFFFF", textDecoration: "none", borderRadius: "6px", backgroundColor: "#6E97A7" }}
                  >
                    Start free trial
                  </Link>
                  <Link
                    href="/pricing"
                    style={{ display: "inline-block", padding: "12px 24px", fontSize: "14px", fontWeight: 500, color: "#000000", textDecoration: "none", borderRadius: "6px", border: "1px solid rgba(0,0,0,0.12)" }}
                  >
                    View plans
                  </Link>
                </div>
              </>
            )}
          </div>
          <p style={{ margin: 0, fontSize: "11px", lineHeight: "1.5", color: "rgba(0,0,0,0.45)" }}>
            ComplySpa — Med Spa Compliance
          </p>
        </div>
      </div>
    </main>
  );
}
