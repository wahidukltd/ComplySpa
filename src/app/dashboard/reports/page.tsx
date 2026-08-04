import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportGenerator } from "@/components/reports/report-generator";
import { getEntitlements } from "@/lib/utils/entitlements";
import { FileText, ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Page-only copy (the generator displays no tier name — single call site, so
// this stays inline rather than in a shared module).
const REPORT_TIER_COPY: Record<
  "basic" | "audit",
  { name: string; description: string; includes: string[] }
> = {
  basic: {
    name: "Basic Compliance Report",
    description:
      "A concise compliance snapshot for everyday operations — status summary, items requiring attention, and upcoming renewals.",
    includes: [
      "Credential status summary",
      "Items requiring attention",
      "Upcoming renewals (31–90 days)",
      "Email a copy to yourself",
    ],
  },
  audit: {
    name: "Audit-Ready Compliance Report",
    description:
      "An executive-grade compliance document for inspections — executive summary, status breakdown, attention items, full staff register, and attestation.",
    includes: [
      "Executive summary with credential validity",
      "Credential status summary",
      "Items requiring attention",
      "Upcoming renewals (31–90 days)",
      "Staff credential register",
      "Attestation with report ID",
      "Email a copy to yourself",
    ],
  },
};

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id, role, email")
    .eq("auth_user_id", user.id)
    .single();

  let entitlements: ReturnType<typeof getEntitlements> | null = null;
  let userRole: string | null = null;
  let isTrial = false;
  if (userRecord) {
    userRole = userRecord.role;
    const { data: clinic } = await supabase
      .from("clinics")
      .select("plan, trial_plan")
      .eq("id", userRecord.clinic_id)
      .single();
    if (clinic) {
      entitlements = getEntitlements(clinic.plan, clinic.trial_plan);
      isTrial = clinic.plan === "trial";
    }
  }

  const isBlocked = entitlements?.reportTier === "none";
  const currentTier = entitlements?.reportTier ?? "none";
  const tierInfo = currentTier !== "none" ? REPORT_TIER_COPY[currentTier] : null;

  // Viewers may generate and download (read-only assembly) but never email —
  // the button is hidden for them; the API route also 403s viewers as
  // defense-in-depth. Reports are rendered server-side on demand; nothing is
  // stored or uploaded.
  const canEmail = userRole !== "viewer" && !isBlocked;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#000000" }}>
          Reports
        </h1>
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
          Generate an inspection-ready compliance report from your live credential data.
        </p>
      </div>

      <section className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium" style={{ color: "#000000" }}>
            Generate Report
          </h2>
          {tierInfo && (
            <div className="flex items-center gap-2">
              {isTrial && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: "#F0F4F5", color: "rgba(0,0,0,0.45)" }}
                >
                  Trial
                </span>
              )}
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: "#F0F4F5", color: "#6E97A7" }}
              >
                {tierInfo.name}
              </span>
            </div>
          )}
        </div>

        {isBlocked ? (
          <div className="rounded-lg p-8 text-center" style={{ backgroundColor: "#F0F4F5" }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#FFFFFF" }}>
              <FileText className="h-6 w-6" style={{ color: "#6E97A7" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#000000" }}>
              Reports require an active plan
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "rgba(0,0,0,0.55)" }}>
              Generate and email compliance reports on Solo or Practice. Choose a plan to get started.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#6E97A7", color: "#FFFFFF" }}
            >
              View Plans <ArrowUpRight className="size-4" />
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: "rgba(0,0,0,0.55)" }}>
              {currentTier === "basic"
                ? "Builds a fresh summary of your credential posture from live data. Preview, download, or email a copy to yourself."
                : "Builds a fresh, inspection-ready report from live data — full staff register, status breakdown, attention items, and attestation. Preview, download, or email a copy to yourself."}
            </p>
            <ReportGenerator
              canEmail={canEmail}
              reportTier={currentTier === "none" ? null : (currentTier as "basic" | "audit")}
              userEmail={userRecord?.email}
            />
            {!canEmail && !isBlocked && (
              <p className="text-xs mt-4" style={{ color: "rgba(0,0,0,0.45)" }}>
                Preview and download are available with your role. Emailing reports is limited to clinic administrators.
              </p>
            )}
          </>
        )}
      </section>

      {tierInfo && !isBlocked && (
        <section className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium" style={{ color: "#000000" }}>
              What your report includes
            </h2>
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: "#F0F4F5", color: "#6E97A7" }}
            >
              {tierInfo.name}
            </span>
          </div>
          <p className="text-sm mb-4" style={{ color: "rgba(0,0,0,0.55)" }}>
            {tierInfo.description}
          </p>
          <ul className="space-y-2">
            {tierInfo.includes.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm" style={{ color: "#000000" }}>
                <Check className="h-4 w-4 shrink-0" style={{ color: "#4A8C5C" }} />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
        Reports are generated on demand from your live data and are never stored by ComplySpa.
      </p>
    </div>
  );
}
