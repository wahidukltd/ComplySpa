"use client";

import { useState, useMemo, useCallback } from "react";
import { BlobProvider, PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { ComplianceReport, type ReportData } from "@/lib/pdf/report-template";
import { getReportData, createReport } from "@/lib/actions/reports";
import { uploadDocument } from "@/lib/utils/upload";
import { Button } from "@/components/ui/button";
import { FileText, Download, Mail, Eye, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  clinicId: string;
  isTrial?: boolean;
}

export function ReportGenerator({ clinicId, isTrial }: Props) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportTier, setReportTier] = useState<"basic" | "audit" | "white_label" | null>(null);
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
    setReportTier(result.reportTier ?? "audit");
    setLoading(false);
  }, []);

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

      const saveResult = await createReport(uploadResult.filePath, reportData);
      if (saveResult.error) {
        throw new Error(saveResult.error);
      }

      const response = await fetch("/api/reports/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportUrl: uploadResult.filePath,
          reportId: saveResult.id,
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
    () => (reportData && reportTier ? <ComplianceReport data={reportData} tier={reportTier} /> : null),
    [reportData, reportTier],
  );

  const canEmail = reportTier === "audit" || reportTier === "white_label";

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

  if (isTrial) {
    return null;
  }

  if (!reportData) {
    return (
      <Button onClick={handleGenerate} disabled={loading} className="gap-2">
        <FileText className="h-4 w-4" />
        Generate Report
      </Button>
    );
  }

  const safeName = reportData.clinic.name.replace(/\s+/g, "-").toLowerCase();
  const fileName = reportTier === "white_label"
    ? `${safeName}-report.pdf`
    : `compliance-report-${safeName}.pdf`;

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
          Generate New
        </Button>

        <Button variant="outline" onClick={() => setPreviewOpen(!previewOpen)} className="gap-2">
          <Eye className="h-4 w-4" />
          {previewOpen ? "Close Preview" : "Preview"}
        </Button>

        {canEmail && (
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
                  <><Mail className="h-4 w-4" /> Email Report</>
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
