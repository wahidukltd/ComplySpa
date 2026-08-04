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
import { REPORT_DOC_TITLE } from "@/lib/report/copy";

interface ReportEmailParams {
  clinicName: string;
  reportId: string;
  generatedAt?: string;
}

export function buildReportEmailHtml(params: ReportEmailParams): string {
  const escapedClinic = htmlEscape(params.clinicName);
  const opening = `Your compliance report for ${escapedClinic} is attached to this email.`;
  const infoRows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Clinic", value: escapedClinic },
    { label: "Report ID", value: params.reportId, mono: true },
  ];
  if (params.generatedAt) {
    infoRows.push({ label: "Generated", value: htmlEscape(params.generatedAt) });
  }
  const note =
    "Reports are generated from your live compliance data and are not stored by ComplySpa. Generate a new report anytime from your dashboard.";
  const closing = "Review the report for accuracy before submitting it to any regulatory body or third party.";

  return emailLayout({
    previewText: `Your compliance report for ${params.clinicName} is attached.`,
    children: `
      ${emailHeader("REPORT")}
      ${emailCard({
        topBorder: BRAND_COLOR,
        children: `
          ${emailHeading(REPORT_DOC_TITLE)}
          ${emailText(opening)}
          ${emailInfoTable(infoRows)}
          ${emailText(note)}
          ${emailText(closing)}
        `,
      })}
      ${emailFooter()}
    `,
  });
}

export function buildReportSubject(clinicName: string): string {
  // Plain-text context — no HTML escaping (an entity would appear literally in
  // the inbox). Escaping for the HTML body happens in buildReportEmailHtml.
  return `${REPORT_DOC_TITLE} \u2014 ${clinicName}`;
}
