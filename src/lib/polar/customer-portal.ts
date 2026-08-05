import { polarConfig, APP_URL } from "./config";
import { createPolarAdmin } from "./client";
import * as Sentry from "@sentry/nextjs";

export interface CustomerPortalResult {
  url: string | null;
  error: string | null;
}

// Customer portal session. returnUrl gives the portal a visible "back to
// ComplySpa" path (verified on the SDK's CustomerSessionCustomerIDCreate /
// CustomerSessionCustomerExternalIDCreate models).
export async function createCustomerPortalUrl(customerId: string): Promise<CustomerPortalResult> {
  if (!polarConfig.enabled) {
    return { url: null, error: "Billing is not configured yet." };
  }

  const polar = createPolarAdmin();
  if (!polar) {
    return { url: null, error: "Billing is not configured yet." };
  }

  try {
    const result = await polar.customerSessions.create({
      customerId,
      returnUrl: `${APP_URL}/dashboard/settings/billing`,
    });

    return { url: result.customerPortalUrl, error: null };
  } catch (err) {
    Sentry.captureException(err, { extra: { customerId } });
    return { url: null, error: "Failed to create customer portal session." };
  }
}
