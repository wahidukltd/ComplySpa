import { Polar } from "@polar-sh/sdk";
import { polarConfig, APP_URL } from "./config";
import * as Sentry from "@sentry/nextjs";

export type PlanId = "solo" | "practice";

const PRODUCT_PRICE_IDS: Record<PlanId, string> = {
  solo: polarConfig.soloProductPriceId,
  practice: polarConfig.practiceProductPriceId,
};

export interface CheckoutLinkResult {
  url: string | null;
  error: string | null;
}

export async function createCheckoutLink(
  plan: PlanId,
  _customerId: string | undefined,
  metadata: Record<string, string>,
): Promise<CheckoutLinkResult> {
  if (!polarConfig.enabled) {
    return { url: null, error: "Billing is not configured yet. Please try again later." };
  }

  const productPriceId = PRODUCT_PRICE_IDS[plan];
  if (!productPriceId) {
    return { url: null, error: `No product configured for ${plan} plan.` };
  }

  try {
    const polar = new Polar({ accessToken: polarConfig.accessToken });
    // ponytail: The Polar SDK's create parameter is a discriminated union on
    // paymentProcessor. Stripe path — extract the union member explicitly so
    // type drift on SDK upgrades is caught at compile time.
    const result = await polar.checkoutLinks.create({
      productPriceId,
      paymentProcessor: "stripe" as const,
      allowDiscountCodes: true,
      metadata: {
        clinic_id: metadata.clinic_id ?? "",
        plan: metadata.plan ?? "",
      },
      successUrl: `${APP_URL}/dashboard/settings/billing?checkout=success`,
    });

    return { url: result.url, error: null };
  } catch (err) {
    Sentry.captureException(err, { extra: { plan, metadata } });
    return { url: null, error: "Failed to create checkout link. Please try again." };
  }
}
