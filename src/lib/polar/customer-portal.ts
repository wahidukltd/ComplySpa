import { Polar } from "@polar-sh/sdk";
import { polarConfig } from "./config";
import * as Sentry from "@sentry/nextjs";

export interface CustomerPortalResult {
  url: string | null;
  error: string | null;
}

export async function createCustomerPortalUrl(customerId: string): Promise<CustomerPortalResult> {
  if (!polarConfig.enabled) {
    return { url: null, error: "Billing is not configured yet." };
  }

  try {
    const polar = new Polar({ accessToken: polarConfig.accessToken });
    const result = await polar.customerSessions.create({
      customerId,
    });

    return { url: result.customerPortalUrl, error: null };
  } catch (err) {
    Sentry.captureException(err, { extra: { customerId } });
    return { url: null, error: "Failed to create customer portal session." };
  }
}
