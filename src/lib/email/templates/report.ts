import {
  emailLayout,
  emailHeader,
  emailHeading,
  emailText,
  emailCard,
  emailInfoTable,
  emailFooter,
  htmlEscape,
  BRAND_COLOR,
} from "../components";

interface ReportEmailParams {
  clinicName: string;
  reportId: string;
  subject: string;
  tier: "basic" | "audit";
}

export function buildReportEmailHtml(params: ReportEmailParams): string {
  const heading = params.tier === "audit" ? "Compliance Audit Report" : "Compliance Report";
  const bodyBlurb =
    params.tier === "audit"
      ? "Your compliance audit report has been generated and is attached to this email."
      : "Your compliance report has been generated and is attached to this email.";
  const footerNote =
    "This report was generated from your credential tracking system at ComplySpa. Verify all information before submitting to a regulatory body.";

  return emailLayout({
    previewText: `${heading} for ${params.clinicName} is ready for download.`,
    children: `
      ${emailHeader("REPORT")}
      ${emailCard({
        topBorder: BRAND_COLOR,
        children: `
          ${emailHeading(heading)}
          <p style="margin:0 0 16px;font-size:14px;color:#000000;line-height:1.6;">Hello,</p>
          ${emailText(bodyBlurb)}
          ${emailInfoTable([
            { label: "Clinic", value: htmlEscape(params.clinicName) },
            { label: "Report ID", value: params.reportId, mono: true },
          ])}
          ${emailText("Reports are generated from your live compliance data and are not stored. Generate a new report anytime from your dashboard.")}
          ${footerNote ? emailText(footerNote) : ""}
        `,
      })}
      ${emailFooter()}
    `,
  });
}

export function buildReportSubject(clinicName: string, tier: "basic" | "audit"): string {
  const name = htmlEscape(clinicName);
  const prefix = tier === "audit" ? "Compliance Audit Report" : "Compliance Report";
  return `${prefix} \u2014 ${name}`;
}
