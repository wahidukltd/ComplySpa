// Twilio SMS delivery webhook — validates signature, logs delivery status (Phase 5).
import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
