import "server-only";

import type { PlanId } from "./checkout";
import type { SubscriptionInterval } from "@/lib/billing/copy";

// Billing provider configuration (plan 2026-08-08 §4.7/B7).
//
// Product configuration/availability is kept SEPARATE from the subscription
// model: the app understands plan + billing interval independently, and
// checkout stays disabled until the corresponding real Polar product's price
// id is configured. `polarConfig.enabled` is the master switch (access token
// + webhook secret); `productAvailable(plan, interval)` is the per-product
// gate used by both checkout entry points. Until Polar approval, none of the
// four slots is configured, so no checkout URL can ever be generated.

export interface PolarConfig {
  accessToken: string;
  webhookSecret: string;
  soloMonthlyPriceId: string;
  soloAnnualPriceId: string;
  practiceMonthlyPriceId: string;
  practiceAnnualPriceId: string;
  enabled: boolean;
}

export const polarConfig: PolarConfig = {
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET ?? "",
  soloMonthlyPriceId: process.env.POLAR_SOLO_MONTHLY_PRODUCT_PRICE_ID ?? "",
  soloAnnualPriceId: process.env.POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID ?? "",
  practiceMonthlyPriceId: process.env.POLAR_PRACTICE_MONTHLY_PRODUCT_PRICE_ID ?? "",
  practiceAnnualPriceId: process.env.POLAR_PRACTICE_ANNUAL_PRODUCT_PRICE_ID ?? "",
  enabled: Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_WEBHOOK_SECRET),
};

// Single per-product availability gate: a product is purchasable only when its
// price id is configured. Never treat an unconfigured product as live — no
// fake checkout behavior, no charge on an interval the UI didn't show.
export function priceIdFor(plan: PlanId, interval: SubscriptionInterval): string {
  switch (plan) {
    case "solo":
      return interval === "monthly" ? polarConfig.soloMonthlyPriceId : polarConfig.soloAnnualPriceId;
    case "practice":
      return interval === "monthly" ? polarConfig.practiceMonthlyPriceId : polarConfig.practiceAnnualPriceId;
  }
}

export function productAvailable(plan: PlanId, interval: SubscriptionInterval): boolean {
  return priceIdFor(plan, interval) !== "";
}

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
