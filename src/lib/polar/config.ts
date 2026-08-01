export const polarConfig = {
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET ?? "",
  soloProductPriceId: process.env.POLAR_SOLO_PRODUCT_PRICE_ID ?? "",
  practiceProductPriceId: process.env.POLAR_PRACTICE_PRODUCT_PRICE_ID ?? "",
  enabled: Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_WEBHOOK_SECRET),
};

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
