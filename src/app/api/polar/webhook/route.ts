// Polar billing webhook — validates signature, handles subscription lifecycle events (Phase 7).
import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
