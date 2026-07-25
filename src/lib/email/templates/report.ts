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
  isWhiteLabel: boolean;
  subject: string;
}

export function buildReportEmailHtml(params: ReportEmailParams): string {
  const heading = params.isWhiteLabel ? "Compliance Report" : "Compliance Audit Report";
  const bodyBlurb = params.isWhiteLabel
    ? "Your compliance report has been generated and is attached to this email."
    : "Your compliance audit report has been generated and is attached to this email.";
  const footerNote = params.isWhiteLabel
    ? ""
    : "This report was generated from your credential tracking system at ComplySpa. Verify all information before submitting to a regulatory body.";

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
          ${emailText("The PDF is attached to this email. You can also access past reports from your dashboard.")}
          ${footerNote ? emailText(footerNote) : ""}
        `,
      })}
      ${emailFooter()}
    `,
  });
}

export function buildReportSubject(clinicName: string, isWhiteLabel: boolean): string {
  const name = htmlEscape(clinicName);
  return isWhiteLabel
    ? `Compliance Report \u2014 ${name}`
    : `Compliance Audit Report \u2014 ${name}`;
}
