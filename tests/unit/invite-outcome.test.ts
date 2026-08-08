import { describe, it, expect } from "vitest";
import { resolveInviteEmailOutcome, INVITE_CONFIG_ERROR } from "@/lib/email/invite-outcome";

describe("resolveInviteEmailOutcome — production fail-closed matrix (plan §4.3, review-team fix)", () => {
  it("production + missing RESEND_API_KEY → error with rollback (no silently-unmailed row)", () => {
    const outcome = resolveInviteEmailOutcome({ isProduction: true, hasResendKey: false, sendSuccess: null });
    expect(outcome).toEqual({ ok: false, emailAccepted: false, error: INVITE_CONFIG_ERROR, rollback: true });
  });

  it("production + send failure → error with rollback", () => {
    const outcome = resolveInviteEmailOutcome({ isProduction: true, hasResendKey: true, sendSuccess: false });
    expect(outcome).toEqual({ ok: false, emailAccepted: false, error: INVITE_CONFIG_ERROR, rollback: true });
  });

  it("production + send accepted → emailAccepted, no rollback", () => {
    const outcome = resolveInviteEmailOutcome({ isProduction: true, hasResendKey: true, sendSuccess: true });
    expect(outcome).toEqual({ ok: true, emailAccepted: true });
  });

  it("dev/test + missing key → honest degrade, row kept, emailAccepted false", () => {
    const outcome = resolveInviteEmailOutcome({ isProduction: false, hasResendKey: false, sendSuccess: null });
    expect(outcome).toEqual({ ok: true, emailAccepted: false });
  });

  it("dev/test + send failure → honest degrade, row kept, emailAccepted false", () => {
    const outcome = resolveInviteEmailOutcome({ isProduction: false, hasResendKey: true, sendSuccess: false });
    expect(outcome).toEqual({ ok: true, emailAccepted: false });
  });

  it("dev/test + send accepted → emailAccepted", () => {
    const outcome = resolveInviteEmailOutcome({ isProduction: false, hasResendKey: true, sendSuccess: true });
    expect(outcome).toEqual({ ok: true, emailAccepted: true });
  });

  it("every failure outcome that claims 'not created' carries rollback: true", () => {
    const failures = [
      { isProduction: true, hasResendKey: false, sendSuccess: null },
      { isProduction: true, hasResendKey: true, sendSuccess: false },
    ];
    for (const opts of failures) {
      const outcome = resolveInviteEmailOutcome(opts);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.rollback).toBe(true);
    }
  });
});
