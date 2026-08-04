"use client";

import { useState, useCallback } from "react";
import { getReportData } from "@/lib/actions/reports";
import { formatReportDateTime } from "@/lib/pdf/report-content";
import type { ReportData } from "@/lib/pdf/report-content";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/index";
import { FileText, Download, Mail, Eye, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  canEmail?: boolean;
  userEmail?: string;
  // Page-resolved tier (from entitlements) — UI gating only. The PDF itself is
  // rendered server-side by the delivery routes, which resolve the tier from
  // the session — the client can never request a higher tier than entitled.
  reportTier?: "basic" | "audit" | null;
}

export function ReportGenerator({ canEmail = false, userEmail, reportTier = null }: Props) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEmailStatus("idle");
    setEmailError(null);
    const result = await getReportData();
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setReportData(result.data);
    setLoading(false);
  }, []);

  const handleEmail = useCallback(async () => {
    // Re-entrancy guard: the button's disabled state only takes effect after a
    // re-render, so two clicks in the same tick would otherwise send twice.
    if (emailStatus === "sending") return;
    setEmailStatus("sending");
    setEmailError(null);

    try {
      const response = await fetch("/api/reports/email", {
        method: "POST",
        // Bodyless; a hung request must not leave the button disabled forever.
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to send email");
      }
      setEmailStatus("sent");
    } catch (err) {
      setEmailStatus("error");
      setEmailError(err instanceof Error ? err.message : "Email failed");
    }
  }, [emailStatus]);

  const emailEnabled = canEmail && reportTier !== null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing your report…
      </div>
    );
  }

  if (error && !reportData) {
    return (
      <div className="rounded-md p-4" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FEE2E2" }}>
        <p className="text-sm font-medium" style={{ color: "#B8443A" }}>We couldn&apos;t generate your report.</p>
        <p className="text-sm mt-1" style={{ color: "#B8443A" }}>{error}</p>
        <Button variant="outline" onClick={handleGenerate} className="mt-3">
          Try Again
        </Button>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button onClick={handleGenerate} disabled={loading} className="gap-2">
          <FileText className="h-4 w-4" />
          Generate Report
        </Button>
        <p className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
          Builds a fresh report from your current compliance data.
        </p>
      </div>
    );
  }

  // Defense-in-depth: the page normally hides this behind the blocked state,
  // and the delivery routes 403 a tier-none session themselves.
  if (!reportTier) {
    return (
      <div className="rounded-md p-4" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FEE2E2" }}>
        <p className="text-sm" style={{ color: "#B8443A" }}>
          Reports are not available on your current plan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
        Prepared {formatReportDateTime(reportData.generatedAt)} · {reportData.staffMembers.length} staff · {reportData.summary.total} credentials
      </p>

      {error && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "#B8443A" }}>
          <XCircle className="h-4 w-4 shrink-0" />
          We couldn&apos;t refresh your report data. {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href="/api/reports/pdf?mode=download"
          className={cn(buttonVariants({ variant: "default" }), "gap-2")}
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>

        <a
          href="/api/reports/pdf?mode=preview"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
        >
          <Eye className="h-4 w-4" />
          Preview Report
        </a>

        {emailEnabled && (
          <Button
            variant="outline"
            disabled={emailStatus === "sending"}
            onClick={handleEmail}
            className="gap-2"
          >
            {emailStatus === "sending" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
            ) : emailStatus === "sent" ? (
              <><CheckCircle2 className="h-4 w-4" style={{ color: "#4A8C5C" }} /> Sent</>
            ) : (
              <><Mail className="h-4 w-4" /> Email Me a Copy</>
            )}
          </Button>
        )}

        <Button variant="outline" onClick={handleGenerate} className="gap-2">
          <FileText className="h-4 w-4" />
          Generate New Report
        </Button>
      </div>

      {emailStatus === "error" && emailError && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "#B8443A" }}>
          <XCircle className="h-4 w-4 shrink-0" />
          We couldn&apos;t send your report. {emailError}
        </div>
      )}
      {emailStatus === "sent" && (
        <div className="flex items-center gap-2 text-sm" style={{ color: "#4A8C5C" }}>
          <CheckCircle2 className="h-4 w-4" />
          Report sent to {userEmail || "your email"}.
        </div>
      )}
    </div>
  );
}
