"use client";

import { useState, useMemo } from "react";
import { BlobProvider, PDFDownloadLink } from "@react-pdf/renderer";
import { ComplianceReport, type ReportData } from "@/lib/pdf/report-template";
import { getReportData, createReport } from "@/lib/actions/reports";
import { uploadDocument } from "@/lib/utils/upload";
import { Button } from "@/components/ui/button";

interface Props {
  clinicId: string;
}

export function ReportGenerator({ clinicId }: Props) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    const result = await getReportData();
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setReportData(result.data);
    setLoading(false);
  };

  const handleEmail = async (blob: Blob | null) => {
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
  };

  const doc = useMemo(
    () => (reportData ? <ComplianceReport data={reportData} /> : null),
    [reportData],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Loading report data...
      </div>
    );
  }

  if (error && !reportData) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">{error}</p>
        <Button variant="outline" onClick={handleGenerate} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!reportData) {
    return (
      <Button onClick={handleGenerate} disabled={loading}>
        Generate Report
      </Button>
    );
  }

  const safeName = reportData.clinic.name.replace(/\s+/g, "-");

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <PDFDownloadLink
          document={doc!}
          fileName={`compliance-report-${safeName}.pdf`}
        >
          {({ loading: pdfLoading }) => (
            <Button disabled={pdfLoading}>
              {pdfLoading ? "Generating PDF..." : "Download PDF"}
            </Button>
          )}
        </PDFDownloadLink>

        <BlobProvider document={doc!}>
          {({ blob, loading: blobLoading }) => (
            <Button
              variant="outline"
              disabled={blobLoading || emailStatus === "sending"}
              onClick={() => handleEmail(blob)}
            >
              {blobLoading
                ? "Preparing..."
                : emailStatus === "sending"
                  ? "Sending..."
                  : emailStatus === "sent"
                    ? "Sent ✓"
                    : "Email Report"}
            </Button>
          )}
        </BlobProvider>
      </div>

      {emailStatus === "error" && error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {emailStatus === "sent" && (
        <p className="text-sm text-green-600">Report emailed successfully.</p>
      )}
    </div>
  );
}
