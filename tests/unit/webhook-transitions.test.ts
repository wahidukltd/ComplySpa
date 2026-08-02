import { describe, it, expect } from "vitest";
import { resolveWebhookTransition } from "@/lib/notifications/webhook-transitions";

describe("resolveWebhookTransition", () => {
  it("maps delivered to a delivered transition with deliveredAt", () => {
    expect(resolveWebhookTransition("email.delivered")).toEqual({
      deliveryStatus: "delivered",
      deliveredAt: true,
    });
  });

  it("maps terminal failure events with their reasons", () => {
    expect(resolveWebhookTransition("email.bounced")).toEqual({
      deliveryStatus: "failed",
      failureReason: "bounced",
    });
    expect(resolveWebhookTransition("email.complained")).toEqual({
      deliveryStatus: "failed",
      failureReason: "complained",
    });
    expect(resolveWebhookTransition("email.failed")).toEqual({
      deliveryStatus: "failed",
      failureReason: "rejected",
    });
    expect(resolveWebhookTransition("email.suppressed")).toEqual({
      deliveryStatus: "failed",
      failureReason: "suppressed",
    });
  });

  it("treats transient and engagement events as no-ops", () => {
    for (const type of ["email.sent", "email.delivery_delayed", "email.opened", "email.clicked"]) {
      expect(resolveWebhookTransition(type)).toBeNull();
    }
  });

  it("treats unknown event types as no-ops", () => {
    expect(resolveWebhookTransition("email.received")).toBeNull();
  });
});
