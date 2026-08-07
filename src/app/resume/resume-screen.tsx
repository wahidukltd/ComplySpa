"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCheckoutUrl } from "@/lib/actions/billing";

interface PlanOption {
  id: string;
  name: string;
  monthly: number;
}

interface Props {
  clinicName: string;
  staffCount: number;
  credentialCount: number;
  plan: "expired_trial" | "inactive";
  plans: PlanOption[];
  polarEnabled: boolean;
  userEmail: string;
}

export function ResumeScreen({ clinicName, staffCount, credentialCount, plan, plans, polarEnabled, userEmail }: Props) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const router = useRouter();

  // ponytail: poll for plan change after user opens checkout — webhook may be delayed
  useEffect(() => {
    if (!subscribed) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/health/plan-check");
        const data = await res.json();
        if (data.blocked === false) {
          router.refresh();
        }
      } catch {
        // retry on next interval
      }
    }, 3000);
    const timeout = setTimeout(() => clearInterval(interval), 60000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [subscribed, router]);

  const isExpired = plan === "expired_trial";
  const hasData = staffCount > 0 || credentialCount > 0;

  async function handleSubscribe(planId: string) {
    setLoadingPlan(planId);
    setError(null);
    try {
      // Reactivation default: monthly (matches the displayed "$29/$49 /mo"
      // plan options). Interval choice for the full subscription lives on the
      // pricing page toggle and the Billing change dialog.
      const res = await getCheckoutUrl(planId as "solo" | "practice", "monthly");
      if (res.error) {
        setError(res.error);
      } else if (res.url) {
        window.open(res.url, "_blank", "noopener");
        setSubscribed(true);
      } else {
        window.open("/pricing", "_self");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoadingPlan(null);
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ maxWidth: "520px", width: "100%", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ marginBottom: "24px" }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ margin: "0 auto" }}>
            <rect width="32" height="32" rx="6" fill="#6E97A7" />
            <path d="M8 24V12L16 8L24 12V24H18V18H14V24H8Z" fill="white" />
          </svg>
        </div>

        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#000000", lineHeight: 1.3, letterSpacing: "-0.3px" }}>
          {isExpired ? "Your trial has ended" : "Account paused"}
        </h1>

        {clinicName && (
          <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#6E97A7", fontWeight: 500 }}>{clinicName}</p>
        )}

        <p style={{ margin: "16px 0 0 0", fontSize: "14px", color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}>
          {isExpired
            ? hasData
              ? "Your 14-day compliance trial has ended. Everything you built is securely preserved — ready to resume the moment you reactivate."
              : "Your 14-day free trial has ended. All your account information is preserved and will be available when you choose a plan."
            : "Your account is currently inactive. All data remains intact and can be restored immediately by reactivating."}
        </p>

        {hasData && (
          <div style={{ marginTop: "28px", display: "flex", gap: "12px", justifyContent: "center" }}>
            <div style={{ flex: 1, backgroundColor: "#F8FAFB", borderRadius: "8px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#000000" }}>{staffCount}</p>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "rgba(0,0,0,0.55)" }}>Staff member{staffCount !== 1 ? "s" : ""}</p>
            </div>
            <div style={{ flex: 1, backgroundColor: "#F8FAFB", borderRadius: "8px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#000000" }}>{credentialCount}</p>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "rgba(0,0,0,0.55)" }}>Credential{credentialCount !== 1 ? "s" : ""}</p>
            </div>
          </div>
        )}

        {hasData && (
          <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "rgba(0,0,0,0.45)", lineHeight: 1.5 }}>
            Staff profiles, credentials, documents, and settings have not been modified. Your data is secure and waiting.
          </p>
        )}

        {/* Plan options */}
        <div style={{ marginTop: "36px", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "28px" }}>
          <h2 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 500, color: "#000000" }}>
            Choose a plan to continue
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "rgba(0,0,0,0.45)", marginBottom: "20px" }}>
            All plans include a 14-day free trial for new users. Reactivate your existing account instantly.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSubscribe(p.id)}
                disabled={loadingPlan === p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "14px 18px",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: "8px",
                  backgroundColor: p.id === "practice" ? "#F0F4F5" : "#FFFFFF",
                  cursor: loadingPlan ? "wait" : "pointer",
                  textAlign: "left",
                  fontSize: "14px",
                  fontFamily: "inherit",
                }}
              >
                <div>
                  <span style={{ fontWeight: 500, color: "#000000" }}>{p.name}</span>
                  <span style={{ fontSize: "12px", color: "rgba(0,0,0,0.45)", marginLeft: "8px" }}>
                    {p.id === "practice" && "(recommended)"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontWeight: 500, color: "#000000" }}>${p.monthly}</span>
                  <span style={{ fontSize: "12px", color: "rgba(0,0,0,0.45)" }}>/mo</span>
                  {loadingPlan === p.id && <span style={{ fontSize: "12px", color: "#6E97A7" }}>Loading...</span>}
                  {!loadingPlan && <span style={{ color: "#6E97A7", fontSize: "16px" }}>&rarr;</span>}
                </div>
              </button>
            ))}
          </div>

          {!polarEnabled && (
            <Link
              href="/pricing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: "12px",
                width: "100%",
                height: "44px",
                padding: "0 28px",
                backgroundColor: "#6E97A7",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 500,
                borderRadius: "6px",
                textDecoration: "none",
              }}
            >
              View plans
            </Link>
          )}

          {error && (
            <p style={{ margin: "12px 0 0 0", fontSize: "13px", color: "#B8443A" }}>
              {error}
            </p>
          )}
        </div>

        <div style={{ marginTop: "36px", paddingTop: "24px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "rgba(0,0,0,0.45)" }}>
            Signed in as {userEmail}
          </p>
        </div>
      </div>
    </div>
  );
}
