import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportGenerator } from "@/components/reports/report-generator";
import { getEntitlements } from "@/lib/utils/entitlements";
import { FileText, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const tierLabels: Record<string, { label: string; desc: string }> = {
  basic: {
    label: "Basic Compliance Report",
    desc: "Credential status summary and upcoming renewals. Preview, download, and email to yourself.",
  },
  audit: {
    label: "Audit-Ready Compliance Report",
    desc: "Full staff credential register, executive summary, status breakdown, upcoming renewals, and attestation. Preview, download, and email to yourself.",
  },
};

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id, role")
    .eq("auth_user_id", user.id)
    .single();

  let entitlements: ReturnType<typeof getEntitlements> | null = null;
  let userRole: string | null = null;
  if (userRecord) {
    userRole = userRecord.role;
    const { data: clinic } = await supabase
      .from("clinics")
      .select("plan, trial_plan")
      .eq("id", userRecord.clinic_id)
      .single();
    if (clinic) {
      entitlements = getEntitlements(clinic.plan, clinic.trial_plan);
    }
  }

  const isBlocked = entitlements?.reportTier === "none";
  const currentTier = entitlements?.reportTier ?? "none";
  const tierInfo = currentTier !== "none" ? tierLabels[currentTier] : null;

  // Viewers may generate and download (read-only assembly) but never email —
  // the button is hidden so no storage upload is ever triggered for them; the
  // API route also 403s viewers as defense-in-depth.
  const canEmail = userRole !== "viewer" && !isBlocked;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#000000" }}>
          Reports
        </h1>
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
          {tierInfo?.desc ?? "Generate compliance reports for your clinic."}
        </p>
      </div>

      <section className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium" style={{ color: "#000000" }}>
            Generate Report
          </h2>
          {tierInfo && (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: "#F0F4F5", color: "#6E97A7" }}
            >
              {tierInfo.label}
            </span>
          )}
        </div>

        {isBlocked ? (
          <div className="rounded-lg p-8 text-center" style={{ backgroundColor: "#F0F4F5" }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#FFFFFF" }}>
              <FileText className="h-6 w-6" style={{ color: "#6E97A7" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#000000" }}>
              Choose a Plan to Generate Reports
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "rgba(0,0,0,0.55)" }}>
              PDF compliance reports are available on both plans. Choose a plan that fits your clinic size and start generating professional reports.
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
                ? "Generates a summary report with credential status counts and upcoming renewals. Report data is live."
                : "Creates a comprehensive compliance report with staff credential register, executive summary, status breakdown, upcoming renewals, and attestation. Report data is live."}
            </p>
            <ReportGenerator
              clinicId={userRecord?.clinic_id ?? ""}
              canEmail={canEmail}
              reportTier={currentTier === "none" ? null : (currentTier as "basic" | "audit")}
            />
          </>
        )}
      </section>

      <p className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
        Reports are generated from your live compliance data and are not stored. Generate a new report anytime.
      </p>
    </div>
  );
}
