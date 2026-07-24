import { Polar } from "@polar-sh/sdk";
import { polarConfig, APP_URL } from "./config";
import * as Sentry from "@sentry/nextjs";

export type PlanId = "solo" | "practice" | "multi_location";

const PRODUCT_PRICE_IDS: Record<PlanId, string> = {
  solo: polarConfig.soloProductPriceId,
  practice: polarConfig.practiceProductPriceId,
  multi_location: polarConfig.multiLocationProductPriceId,
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
    const result = await polar.checkoutLinks.create({
      productPriceId,
      paymentProcessor: "stripe",
      allowDiscountCodes: true,
      metadata: {
        clinic_id: metadata.clinic_id,
        plan: metadata.plan,
      },
      successUrl: `${APP_URL}/dashboard/settings/billing?checkout=success`,
    } as Parameters<typeof polar.checkoutLinks.create>[0]);

    return { url: result.url, error: null };
  } catch (err) {
    Sentry.captureException(err, { extra: { plan, metadata } });
    return { url: null, error: "Failed to create checkout link. Please try again." };
  }
}
