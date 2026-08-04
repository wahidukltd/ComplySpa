"use client";

import { useState, useMemo, useCallback } from "react";
import { BlobProvider, PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { ComplianceReport, type ReportData } from "@/lib/pdf/report-template";
import { getReportData } from "@/lib/actions/reports";
import { uploadDocument } from "@/lib/utils/upload";
import { Button } from "@/components/ui/button";
import { FileText, Download, Mail, Eye, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  clinicId: string;
  canEmail?: boolean;
  // Page-resolved tier (from entitlements) — used as the fallback when the
  // action returns no tier. Never default to the highest tier: a missing tier
  // means "none" (blocked plan), and rendering the audit layout for a solo or
  // expired user would be a lie.
  reportTier?: "basic" | "audit" | null;
}

export function ReportGenerator({ clinicId, canEmail = false, reportTier = null }: Props) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportTierState, setReportTierState] = useState<"basic" | "audit" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmailStatus("idle");
    const result = await getReportData();
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setReportData(result.data);
    // Server tier wins; fall back to the page-resolved tier; null = blocked.
    setReportTierState(result.reportTier ?? reportTier);
    setLoading(false);
  }, [reportTier]);

  const handleEmail = useCallback(async (blob: Blob | null) => {
    if (!blob || !reportData) return;
    setEmailStatus("sending");
    setError(null);

    try {
      const file = new File([blob], `report-${crypto.randomUUID().slice(0, 8)}.pdf`, {
        type: "application/pdf",
      });
      const uploadResult = await uploadDocument(file, clinicId);
      if (uploadResult.error || !uploadResult.filePath) {
        throw new Error(uploadResult.error ?? "Upload failed");
      }

      const response = await fetch("/api/reports/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: uploadResult.filePath,
          reportId: reportData.reportId,
          clinicName: reportData.clinic.name,
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to send email");
      }

      setEmailStatus("sent");
    } catch (err) {
      setEmailStatus("error");
      setError(err instanceof Error ? err.message : "Email failed");
    }
  }, [reportData, clinicId]);

  const doc = useMemo(
    () => (reportData && reportTierState ? <ComplianceReport data={reportData} tier={reportTierState} /> : null),
    [reportData, reportTierState],
  );

  // Email is available on every active plan (role-gated by the page for
  // viewers); the report content itself is the plan differentiator.
  const emailEnabled = canEmail && reportTierState !== null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading report data...
      </div>
    );
  }

  if (error && !reportData) {
    return (
      <div className="rounded-md p-4" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FEE2E2" }}>
        <p className="text-sm" style={{ color: "#B8443A" }}>{error}</p>
        <Button variant="outline" onClick={handleGenerate} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!reportData) {
    return (
      <Button onClick={handleGenerate} disabled={loading} className="gap-2">
        <FileText className="h-4 w-4" />
        Generate Report
      </Button>
    );
  }

  // Defense-in-depth: data loaded but no tier (plan flipped to a blocked state
  // between the page render and this action). Never render a PDF for a plan
  // that cannot generate reports.
  if (!reportTierState) {
    return (
      <div className="rounded-md p-4" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FEE2E2" }}>
        <p className="text-sm" style={{ color: "#B8443A" }}>
          Reports are not available on your current plan.
        </p>
      </div>
    );
  }

  const safeName = reportData.clinic.name.replace(/\s+/g, "-").toLowerCase();
  const fileName = `compliance-report-${safeName}.pdf`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <PDFDownloadLink document={doc!} fileName={fileName}>
          {({ loading: pdfLoading }) => (
            <Button disabled={pdfLoading} className="gap-2">
              {pdfLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF...</>
              ) : (
                <><Download className="h-4 w-4" /> Download PDF</>
              )}
            </Button>
          )}
        </PDFDownloadLink>

        <Button variant="outline" onClick={handleGenerate} className="gap-2">
          <FileText className="h-4 w-4" />
          Refresh Data
        </Button>

        <Button variant="outline" onClick={() => setPreviewOpen(!previewOpen)} className="gap-2">
          <Eye className="h-4 w-4" />
          {previewOpen ? "Close Preview" : "Preview"}
        </Button>

        {emailEnabled && (
          <BlobProvider document={doc!}>
            {({ blob, loading: blobLoading }) => (
              <Button
                variant="outline"
                disabled={blobLoading || emailStatus === "sending"}
                onClick={() => handleEmail(blob)}
                className="gap-2"
              >
                {blobLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Preparing...</>
                ) : emailStatus === "sending" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                ) : emailStatus === "sent" ? (
                  <><CheckCircle2 className="h-4 w-4" style={{ color: "#4A8C5C" }} /> Sent</>
                ) : (
                  <><Mail className="h-4 w-4" /> Email to Yourself</>
                )}
              </Button>
            )}
          </BlobProvider>
        )}
      </div>

      {emailStatus === "error" && error && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "#B8443A" }}>
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {emailStatus === "sent" && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "#4A8C5C" }}>
          <CheckCircle2 className="h-4 w-4" />
          Report emailed successfully.
        </div>
      )}

      {previewOpen && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.12)", height: 500 }}>
          <PDFViewer style={{ width: "100%", height: "100%" }} showToolbar>
            {doc!}
          </PDFViewer>
        </div>
      )}
    </div>
  );
}
