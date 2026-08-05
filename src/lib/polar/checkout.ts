import { Polar } from "@polar-sh/sdk";
import { polarConfig, APP_URL } from "./config";
import { createPolarAdmin } from "./client";
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

// Price → product resolution: checkout sessions are created from PRODUCT ids
// (verified in the SDK: `CheckoutCreate.products: Array<string>`), while the
// environment configures PRICE ids. The two products' catalog is tiny, so a
// single paginated products.list pass is the resolution — no extra env vars.
export async function resolveProductIdFromPrice(polar: Polar, plan: PlanId): Promise<string | null> {
  const priceId = PRODUCT_PRICE_IDS[plan];
  if (!priceId) return null;

  const iterator = await polar.products.list({ isRecurring: true });
  for await (const page of iterator) {
    for (const product of page.result.items ?? []) {
      if (product.prices.some((p) => p.id === priceId)) return product.id;
    }
  }
  return null;
}

// Checkout session creation. Customer linking is belt-and-suspenders:
//   - customerId (known Polar customer) pre-fills the checkout form and links
//     the resulting order/subscription to the existing customer;
//   - externalCustomerId = clinic_id (first-ever checkout) auto-creates or
//     matches the customer by our system ID, so the customer record is never
//     duplicated and the webhook's polar_customer_id fallback lookup works
//     from the very first subscription.
// allowTrial: false is deliberate — "Subscribe now" must skip the trial
// (owner requirement: subscribing immediately never silently starts one).
export async function createCheckoutLink(
  plan: PlanId,
  customerId: string | undefined,
  metadata: Record<string, string>,
  customerEmail?: string,
): Promise<CheckoutLinkResult> {
  if (!polarConfig.enabled) {
    return { url: null, error: "Billing is not configured yet. Please try again later." };
  }

  const polar = createPolarAdmin();
  if (!polar) {
    return { url: null, error: "Billing is not configured yet. Please try again later." };
  }

  try {
    const productId = await resolveProductIdFromPrice(polar, plan);
    if (!productId) {
      return { url: null, error: `No product configured for the ${plan} plan.` };
    }

    const clinicId = metadata.clinic_id ?? "";
    const result = await polar.checkouts.create({
      products: [productId],
      customerId: customerId || undefined,
      externalCustomerId: customerId ? undefined : clinicId || undefined,
      customerEmail: customerEmail || undefined,
      metadata: {
        clinic_id: clinicId,
        plan: metadata.plan ?? "",
      },
      successUrl: `${APP_URL}/dashboard/settings/billing?checkout=success`,
      returnUrl: `${APP_URL}/dashboard/settings/billing?checkout=cancelled`,
      allowTrial: false,
      allowDiscountCodes: true,
    });

    return { url: result.url, error: null };
  } catch (err) {
    Sentry.captureException(err, { extra: { plan, metadata } });
    return { url: null, error: "Failed to create checkout link. Please try again." };
  }
}
