"use client";

import Link from "next/link";

interface Props {
  staffCount: number;
  credentialCount: number;
  plan: "expired_trial" | "inactive";
  checkoutUrl: string | null;
  userEmail: string;
}

export function ResumeScreen({ staffCount, credentialCount, plan, checkoutUrl, userEmail }: Props) {
  const isExpired = plan === "expired_trial";
  const heading = isExpired ? "Your trial has ended" : "Account paused";
  const subtitle = isExpired
    ? "Everything you built during your trial is preserved and ready. Reactivate to continue where you left off."
    : "Your account has been inactive. All your data is securely preserved and ready for you to resume.";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
        {/* Decorative accent */}
        <div style={{ width: "48px", height: "3px", backgroundColor: "#6E97A7", margin: "0 auto 32px auto", borderRadius: "2px" }} />

        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600, color: "#000000", lineHeight: 1.3 }}>
          {heading}
        </h1>

        <p style={{ margin: "12px 0 0 0", fontSize: "14px", color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}>
          {subtitle}
        </p>

        {/* Preserved data summary */}
        <div style={{ marginTop: "32px", display: "flex", gap: "16px", justifyContent: "center" }}>
          <div style={{ flex: 1, backgroundColor: "#F8FAFB", borderRadius: "8px", padding: "16px" }}>
            <p style={{ margin: 0, fontSize: "28px", fontWeight: 700, color: "#000000" }}>{staffCount}</p>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "rgba(0,0,0,0.55)" }}>Staff{staffCount !== 1 ? "" : ""} preserved</p>
          </div>
          <div style={{ flex: 1, backgroundColor: "#F8FAFB", borderRadius: "8px", padding: "16px" }}>
            <p style={{ margin: 0, fontSize: "28px", fontWeight: 700, color: "#000000" }}>{credentialCount}</p>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "rgba(0,0,0,0.55)" }}>Credentials preserved</p>
          </div>
        </div>

        <p style={{ margin: "16px 0 0 0", fontSize: "13px", color: "rgba(0,0,0,0.45)", lineHeight: 1.5 }}>
          All data — including staff profiles, credential records, documents, and account settings — remains intact and secure. Nothing has been deleted or modified.
        </p>

        {/* CTA */}
        <div style={{ marginTop: "32px" }}>
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 28px", backgroundColor: "#6E97A7", color: "#FFFFFF", fontSize: "14px", fontWeight: 500, borderRadius: "6px", textDecoration: "none" }}
            >
              Reactivate subscription
            </a>
          ) : (
            <Link
              href="/pricing"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 28px", backgroundColor: "#6E97A7", color: "#FFFFFF", fontSize: "14px", fontWeight: 500, borderRadius: "6px", textDecoration: "none" }}
            >
              View plans
            </Link>
          )}
        </div>

        {/* Account info */}
        <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "rgba(0,0,0,0.45)" }}>
            Signed in as {userEmail}
          </p>
        </div>
      </div>
    </div>
  );
}
