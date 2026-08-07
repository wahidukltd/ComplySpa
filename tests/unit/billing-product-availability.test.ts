import { describe, it, expect, beforeAll, vi } from "vitest";
import type { Polar } from "@polar-sh/sdk";

// Product availability + per-interval resolution (plan 2026-08-08 §4.7/B7):
// the four-product architecture (Solo/Practice × Monthly/Annual) with product
// config separated from the subscription model. Checkout is disabled until the
// corresponding price id is configured; the price→product resolver is
// interval-aware.
//
// polarConfig reads the environment at MODULE LOAD, so availability is tested
// by importing the modules fresh under each env configuration (vi.resetModules
// + dynamic import) — the same pattern billing-checkout-shape.test.ts uses.

let resolveProductIdFromPrice: typeof import("@/lib/polar/checkout")["resolveProductIdFromPrice"];
let priceIdFor: typeof import("@/lib/polar/config")["priceIdFor"];
let productAvailable: typeof import("@/lib/polar/config")["productAvailable"];

async function importFresh() {
  vi.resetModules();
  vi.stubEnv("POLAR_SOLO_MONTHLY_PRODUCT_PRICE_ID", "price_solo_monthly");
  vi.stubEnv("POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID", "price_solo_annual");
  vi.stubEnv("POLAR_PRACTICE_MONTHLY_PRODUCT_PRICE_ID", "price_practice_monthly");
  vi.stubEnv("POLAR_PRACTICE_ANNUAL_PRODUCT_PRICE_ID", "price_practice_annual");
  const config = await import("@/lib/polar/config");
  priceIdFor = config.priceIdFor;
  productAvailable = config.productAvailable;
  resolveProductIdFromPrice = (await import("@/lib/polar/checkout")).resolveProductIdFromPrice;
}

beforeAll(async () => {
  await importFresh();
}, 30000);

function fakePolar(products: Array<{ id: string; prices: Array<{ id: string }> }>): Polar {
  const page = { result: { items: products }, next: null };
  return {
    products: {
      list: vi.fn(async () => ({
        ...page,
        [Symbol.asyncIterator]: async function* () {
          yield page;
        },
      })),
    },
  } as unknown as Polar;
}

describe("priceIdFor / productAvailable (config gate)", () => {
  it("resolves the price id per plan × interval", () => {
    expect(priceIdFor("solo", "monthly")).toBe("price_solo_monthly");
    expect(priceIdFor("solo", "annual")).toBe("price_solo_annual");
    expect(priceIdFor("practice", "monthly")).toBe("price_practice_monthly");
    expect(priceIdFor("practice", "annual")).toBe("price_practice_annual");
  });

  it("is available only when the price id is configured", () => {
    expect(productAvailable("solo", "monthly")).toBe(true);
    expect(productAvailable("practice", "annual")).toBe(true);
  });
});

describe("resolveProductIdFromPrice per interval", () => {
  it("resolves the product owning the interval-specific price id", async () => {
    const polar = fakePolar([
      { id: "prod_solo_monthly", prices: [{ id: "price_solo_monthly" }] },
      { id: "prod_solo_annual", prices: [{ id: "price_solo_annual" }] },
      { id: "prod_practice_monthly", prices: [{ id: "price_practice_monthly" }] },
      { id: "prod_practice_annual", prices: [{ id: "price_practice_annual" }] },
    ]);
    expect(await resolveProductIdFromPrice(polar, "solo", "monthly")).toBe("prod_solo_monthly");
    expect(await resolveProductIdFromPrice(polar, "solo", "annual")).toBe("prod_solo_annual");
    expect(await resolveProductIdFromPrice(polar, "practice", "annual")).toBe("prod_practice_annual");
  });

  it("returns null when the interval's price id is not configured", async () => {
    await importFresh();
    vi.stubEnv("POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID", "");
    const polar = fakePolar([{ id: "prod_solo_monthly", prices: [{ id: "price_solo_monthly" }] }]);
    expect(await resolveProductIdFromPrice(polar, "solo", "annual")).toBeNull();
  });
});

describe("availability gating (B7: no checkout for an unavailable product)", () => {
  it("unconfigured interval → unavailable", async () => {
    // Stub BEFORE importing the module — polarConfig captures env at load.
    vi.resetModules();
    vi.stubEnv("POLAR_SOLO_MONTHLY_PRODUCT_PRICE_ID", "price_solo_monthly");
    vi.stubEnv("POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID", "price_solo_annual");
    vi.stubEnv("POLAR_PRACTICE_MONTHLY_PRODUCT_PRICE_ID", "price_practice_monthly");
    vi.stubEnv("POLAR_PRACTICE_ANNUAL_PRODUCT_PRICE_ID", "");
    const fresh = await import("@/lib/polar/config");
    expect(fresh.productAvailable("practice", "annual")).toBe(false);
    expect(fresh.productAvailable("practice", "monthly")).toBe(true);
    expect(fresh.productAvailable("solo", "annual")).toBe(true);
  });

  it("all four products available when fully configured", () => {
    for (const plan of ["solo", "practice"] as const) {
      for (const interval of ["monthly", "annual"] as const) {
        expect(productAvailable(plan, interval)).toBe(true);
      }
    }
  });
});
