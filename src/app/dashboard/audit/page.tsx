import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { getAuditHistory, getAuditRun, createAuditRun } from "@/lib/actions/audit";
import { ReadinessScore } from "@/components/audit/readiness-score";
import { AuditChecklist } from "@/components/audit/audit-checklist";
import { GapTracker } from "@/components/audit/gap-tracker";
import { CompleteAuditButton } from "@/components/audit/complete-audit-button";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ReadinessReportDocument } from "@/components/audit/readiness-report";
import { formatDateTime } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = await createClient();
  const { data: user } = await supabase
    .from("users")
    .select("clinic_id")
    .eq("clerk_user_id", userId)
    .single();

  const clinicId = user?.clinic_id ?? "";

  const { data: recentRun } = await supabase
    .from("audit_runs")
    .select("id, status, readiness_score, started_at, completed_at")
    .eq("clinic_id", clinicId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let runData = null;
  let findingsData = null;
  let fetchError: string | null = null;
  if (recentRun) {
    const result = await getAuditRun(recentRun.id);
    if (!result.error) {
      runData = result.run;
      findingsData = result.findings;
    } else {
      fetchError = result.error;
    }
  }

  const { audits: history } = await getAuditHistory();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", clinicId)
    .single();

  const clinicName = clinic?.name ?? "Your Clinic";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "#3D2A25" }}>
          Inspection Readiness
        </h1>
        <p className="text-sm" style={{ color: "#8B7D78" }}>
          Mirror what state board inspectors ask for. Auto-fills from your credential data.
        </p>
      </div>

      <section className="rounded-lg border p-6" style={{ borderColor: "#D9B7A7" }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-medium" style={{ color: "#3D2A25" }}>
              {runData ? "Current Audit" : "New Audit"}
            </h2>
            <p className="text-sm" style={{ color: "#8B7D78" }}>
              {runData
                ? `Started ${formatDateTime(runData.startedAt)} — Status: ${runData.status}`
                : "Run a mock audit to check your inspection readiness."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {runData && runData.status === "completed" && runData.readinessScore !== null && (
              <ReadinessScore score={runData.readinessScore} size="sm" />
            )}
            <form action={async () => { "use server"; void createAuditRun(); }}>
              <Button type="submit" variant={runData ? "outline" : "default"}>
                {runData ? "Run New Audit" : "Start Audit"}
              </Button>
            </form>
          </div>
        </div>

        {findingsData && findingsData.length > 0 ? (
          <>
            <h3 className="text-sm font-medium mb-3" style={{ color: "#3D2A25" }}>
              7-Point Checklist
            </h3>
            <AuditChecklist
              findings={findingsData}
              auditStatus={runData?.status ?? "in_progress"}
            />

            {runData?.status === "in_progress" && (
              <div className="mt-6 flex gap-3">
                <CompleteAuditButton runId={runData.id} />
              </div>
            )}

            {runData?.status === "completed" && runData.readinessScore !== null && (
              <div className="mt-4">
                <PDFDownloadLink
                  document={
                    <ReadinessReportDocument
                      clinicName={clinicName}
                      score={runData.readinessScore}
                      findings={findingsData}
                      completedAt={runData.completedAt ?? new Date().toISOString()}
                    />
                  }
                  fileName={`readiness-report-${clinicName.replace(/\s+/g, "-").toLowerCase()}.pdf`}
                >
                  {({ loading }) => (
                    <Button variant="outline" disabled={loading} className="gap-2">
                      <FileText className="h-4 w-4" />
                      {loading ? "Generating..." : "Download Readiness Report"}
                    </Button>
                  )}
                </PDFDownloadLink>
              </div>
            )}

            <div className="mt-8">
              <h3 className="text-sm font-medium mb-3" style={{ color: "#3D2A25" }}>
                Gap Remediation Tracker
              </h3>
              <GapTracker findings={findingsData} auditStatus={runData?.status ?? "in_progress"} />
            </div>
          </>
        ) : (
          <div className="text-center py-12 rounded-lg" style={{ backgroundColor: "#FFF8F2" }}>
            {fetchError ? (
              <div>
                <p className="text-sm font-medium" style={{ color: "#B8443A" }}>
                  Failed to load audit data
                </p>
                <p className="text-xs mt-1" style={{ color: "#8B7D78" }}>
                  {fetchError}
                </p>
                <p className="text-xs mt-2" style={{ color: "#8B7D78" }}>
                  Try refreshing the page. If the problem persists, a recent audit may have been deleted.
                </p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "#8B7D78" }}>
                No audit runs yet. Click &quot;Start Audit&quot; to begin your first inspection-readiness check.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border p-6" style={{ borderColor: "#D9B7A7" }}>
        <h2 className="text-lg font-medium mb-4" style={{ color: "#3D2A25" }}>
          Audit History
        </h2>

        {history.length === 0 ? (
          <p className="text-sm" style={{ color: "#8B7D78" }}>
            No audit history yet. Your completed audits will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "#D9B7A7" }}>
                  <th className="py-2 text-left font-medium" style={{ color: "#3D2A25" }}>Date</th>
                  <th className="py-2 text-left font-medium" style={{ color: "#3D2A25" }}>Type</th>
                  <th className="py-2 text-left font-medium" style={{ color: "#3D2A25" }}>Status</th>
                  <th className="py-2 text-right font-medium" style={{ color: "#3D2A25" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id} className="border-b" style={{ borderColor: "#F6E3D6" }}>
                    <td className="py-2" style={{ color: "#3D2A25" }}>
                      {formatDateTime(a.startedAt)}
                    </td>
                    <td className="py-2 capitalize" style={{ color: "#8B7D78" }}>
                      {a.runType.replace("_", " ")}
                    </td>
                    <td className="py-2 capitalize" style={{ color: "#8B7D78" }}>
                      {a.status.replace("_", " ")}
                    </td>
                    <td className="py-2 text-right">
                      {a.readinessScore !== null ? (
                        <span
                          className="font-medium"
                          style={{
                            color:
                              a.readinessScore >= 80
                                ? "#4A8C5C"
                                : a.readinessScore >= 60
                                  ? "#C2853A"
                                  : "#B8443A",
                          }}
                        >
                          {a.readinessScore}%
                        </span>
                      ) : (
                        <span style={{ color: "#8B7D78" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
