import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportGenerator } from "@/components/reports/report-generator";
import { getReportHistory } from "@/lib/actions/reports";
import { getEntitlements } from "@/lib/utils/entitlements";
import { formatDateTime } from "@/lib/utils/date";
import { FileText, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SIGNED_URL_EXPIRY = 3600;

const tierLabels: Record<string, { label: string; desc: string }> = {
  basic: { label: "Basic Compliance Report", desc: "Credential status summary and upcoming renewals. Download as PDF." },
  audit: { label: "Audit-Ready Report", desc: "Full staff credential register, executive summary, status breakdown, upcoming renewals, and attestation. Download as PDF or email directly." },
  white_label: { label: "Enterprise Report (White-Label)", desc: "Unbranded audit-ready report suitable for sharing with partners and regulatory bodies. Download as PDF or email directly." },
};

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: userRecord } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("auth_user_id", user.id)
    .single();

  let entitlements: ReturnType<typeof getEntitlements> | null = null;
  let planName = "";
  if (userRecord) {
    const { data: clinic } = await supabase
      .from("clinics")
      .select("plan")
      .eq("id", userRecord.clinic_id)
      .single();
    if (clinic) {
      entitlements = getEntitlements(clinic.plan);
      planName = clinic.plan;
    }
  }

  const history = await getReportHistory();
  const clinicId = history.clinicId ?? "";

  const reportsWithUrls = await Promise.all(
    (history.reports ?? []).map(async (r) => {
      if (r.reportUrl && !r.reportUrl.includes("://")) {
        const { data } = await supabase.storage
          .from("documents")
          .createSignedUrl(r.reportUrl, SIGNED_URL_EXPIRY);
        return { ...r, reportUrl: data?.signedUrl ?? null };
      }
      if (r.reportUrl?.includes("://")) {
        return { ...r, reportUrl: null };
      }
      return r;
    }),
  );

  const isTrial = entitlements?.reportTier === "none";
  const currentTier = entitlements?.reportTier ?? "none";
  const tierInfo = currentTier !== "none" ? tierLabels[currentTier] : null;

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

        {isTrial ? (
          <div className="rounded-lg p-8 text-center" style={{ backgroundColor: "#F0F4F5" }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#FFFFFF" }}>
              <FileText className="h-6 w-6" style={{ color: "#6E97A7" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "#000000" }}>
              Upgrade to Generate Reports
            </h3>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "rgba(0,0,0,0.55)" }}>
              PDF compliance reports are available on all paid plans. Choose a plan that fits your clinic size and start generating professional reports.
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
                ? "Generates a summary report with credential status counts and upcoming renewals."
                : "Creates a comprehensive compliance report with staff credential register, executive summary, status breakdown, upcoming renewals, and attestation. Report data is live."}
            </p>
            <ReportGenerator clinicId={clinicId} isTrial={isTrial} />
          </>
        )}
      </section>

      {!isTrial && (
      <section className="rounded-lg border p-6" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        <h2 className="text-lg font-medium mb-4" style={{ color: "#000000" }}>
          Report History
        </h2>

        {history.error ? (
          <p className="text-sm text-red-600">Failed to load report history.</p>
        ) : reportsWithUrls.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
            No reports generated yet. Generate your first report above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
                  <th className="py-2.5 text-left font-medium" style={{ color: "#000000" }}>Date</th>
                  <th className="py-2.5 text-left font-medium" style={{ color: "#000000" }}>Generated By</th>
                  <th className="py-2.5 text-right font-medium" style={{ color: "#000000" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reportsWithUrls.map((r) => (
                  <tr key={r.id} className="border-b" style={{ borderColor: "#F0F4F5" }}>
                    <td className="py-2.5" style={{ color: "#000000" }}>
                      {formatDateTime(r.generatedAt)}
                    </td>
                    <td className="py-2.5" style={{ color: "rgba(0,0,0,0.55)" }}>
                      {r.generatedBy}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.reportUrl ? (
                        <a
                          href={r.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                          style={{ color: "#6E97A7" }}
                        >
                          <FileText className="h-4 w-4" />
                          Download
                        </a>
                      ) : (
                        <span className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                          No file
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
