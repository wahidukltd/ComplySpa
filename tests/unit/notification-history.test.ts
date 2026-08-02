import { describe, it, expect } from "vitest";
import {
  deriveNotificationType,
  deriveFailureDetail,
  computeSystemHealth,
  DELIVERY_FAILURE_THRESHOLD,
  PENDING_DETAIL_LABEL,
} from "@/lib/utils/notification-history";

describe("deriveNotificationType", () => {
  it("maps positive days-before to an expiration reminder", () => {
    expect(deriveNotificationType(7)).toEqual({
      kind: "expiration",
      label: "Expiration reminder — 7d before",
    });
    expect(deriveNotificationType(90).kind).toBe("expiration");
  });

  it("maps negative days-before to an escalation", () => {
    expect(deriveNotificationType(-7)).toEqual({
      kind: "escalation",
      label: "Escalation — expired 7d ago",
    });
    expect(deriveNotificationType(-12).kind).toBe("escalation");
  });

  it("treats zero defensively as expiration (cannot occur via current scans)", () => {
    expect(deriveNotificationType(0).kind).toBe("expiration");
  });
});

describe("deriveFailureDetail", () => {
  it("returns null for non-failed statuses", () => {
    expect(deriveFailureDetail("delivered", null, true)).toBeNull();
    expect(deriveFailureDetail("pending", null, false)).toBeNull();
  });

  it("maps stored failure reasons to human labels", () => {
    expect(deriveFailureDetail("failed", "send_failed", false)).toBe("Failed at send");
    expect(deriveFailureDetail("failed", "bounced", true)).toBe("Bounced by the recipient's server");
    expect(deriveFailureDetail("failed", "complained", true)).toBe("Marked as spam");
    expect(deriveFailureDetail("failed", "rejected", true)).toBe("Rejected after delivery attempt");
    expect(deriveFailureDetail("failed", "suppressed", true)).toBe("Recipient is suppressed (do-not-send list)");
    expect(deriveFailureDetail("failed", "no_delivery_confirmation", true)).toBe("No delivery confirmation received");
  });

  it("falls back to the webhook-id heuristic for legacy rows without a reason", () => {
    expect(deriveFailureDetail("failed", null, false)).toBe("Failed at send");
    expect(deriveFailureDetail("failed", null, true)).toBe(
      "Bounced or complained after delivery attempt",
    );
  });
});

describe("PENDING_DETAIL_LABEL", () => {
  it("is the single source for the in-flight label", () => {
    expect(PENDING_DETAIL_LABEL).toBe("Awaiting delivery confirmation");
  });
});

describe("computeSystemHealth", () => {
  const healthyCrons = [
    { jobname: "daily-credential-scan", ok: true },
    { jobname: "daily-escalation-scan", ok: true },
  ];

  it("reports no issues when crons are healthy and failures are below threshold", () => {
    expect(computeSystemHealth(healthyCrons, 4)).toEqual([]);
  });

  it("reports a cron issue when a job is stale", () => {
    const issues = computeSystemHealth(
      [{ jobname: "daily-credential-scan", ok: false }, { jobname: "daily-escalation-scan", ok: true }],
      0,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "cron",
      label: "Reminder processing hasn't run on schedule (daily-credential-scan)",
    });
  });

  it("reports a delivery issue at or above the threshold", () => {
    expect(computeSystemHealth(healthyCrons, DELIVERY_FAILURE_THRESHOLD)).toHaveLength(1);
    expect(computeSystemHealth(healthyCrons, DELIVERY_FAILURE_THRESHOLD)[0]).toMatchObject({
      kind: "delivery",
    });
    expect(computeSystemHealth(healthyCrons, 6)[0].kind).toBe("delivery");
  });

  it("reports both issues together when both signals fire", () => {
    const issues = computeSystemHealth(
      [{ jobname: "daily-trial-expiry-check", ok: false }],
      8,
    );
    expect(issues.map((i) => i.kind)).toEqual(["cron", "delivery"]);
  });

  it("respects a custom threshold", () => {
    expect(computeSystemHealth(healthyCrons, 3, 5)).toEqual([]);
    expect(computeSystemHealth(healthyCrons, 5, 5)).toHaveLength(1);
  });
});

