// Copy strings that span report surfaces. The PDF document title is used by
// the template and the email; the file name by both delivery routes.
export const REPORT_DOC_TITLE = "Credential Compliance Report";

export function reportFileName(clinicName: string): string {
  const slug = clinicName
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `compliance-report-${slug}.pdf`;
}
