import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  throw new Error("This is a test API error for Sentry");
}
