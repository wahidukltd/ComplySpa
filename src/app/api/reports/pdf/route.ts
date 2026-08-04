import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { getReportSession } from "@/lib/report/session";
import { assembleReportData } from "@/lib/report/data";
import { renderReportBuffer } from "@/lib/report/render";
import { reportFileName } from "@/lib/report/copy";

export const dynamic = "force-dynamic";

const modeSchema = z.enum(["preview", "download"]).default("download");

// Server-rendered PDF delivery: renders a fresh snapshot of live compliance
// data in memory and streams it to the session user. No storage, no signed
// URLs, nothing persisted — the buffer dies with the request. `mode=preview`
// serves Content-Disposition: inline (new-tab browser PDF viewer);
// `mode=download` (default) serves it as an attachment.
export async function GET(req: NextRequest) {
  try {
    const parsed = modeSchema.safeParse(req.nextUrl.searchParams.get("mode") ?? "download");
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    const mode = parsed.data;

    const session = await getReportSession();
    if (session.status !== 200) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    const { data, error } = await assembleReportData(session.clinicId, session.email);
    if (error || !data) {
      Sentry.captureException(error ?? new Error("Report data assembly failed"));
      return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }

    let buffer: Buffer;
    try {
      buffer = await renderReportBuffer(data, session.tier);
    } catch (err) {
      Sentry.captureException(err);
      return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${mode === "preview" ? "inline" : "attachment"}; filename="${reportFileName(data.clinic.name)}"`,
        // Live data snapshot — never cache.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Uniform JSON error surface (the preview tab renders whatever the route
    // returns — never Next's HTML error page).
    Sentry.captureException(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
