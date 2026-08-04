import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import * as Sentry from "@sentry/nextjs";
import { ComplianceReport, type ReportData } from "@/lib/pdf/report-template";

// The single PDF render entry point for every delivery surface (download,
// preview, email). Server-side, in-memory, stateless: the buffer is returned
// to the caller and discarded when the request ends — nothing is ever written
// to disk or storage.
export async function renderReportBuffer(
  data: ReportData,
  tier: "basic" | "audit",
): Promise<Buffer> {
  return Sentry.startSpan({ name: "report.render", op: "pdf.render" }, () =>
    renderToBuffer(<ComplianceReport data={data} tier={tier} />),
  );
}
