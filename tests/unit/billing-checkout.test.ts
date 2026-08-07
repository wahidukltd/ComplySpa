import { describe, it, expect, beforeAll, vi } from "vitest";
import type { Polar } from "@polar-sh/sdk";

// Price → product resolution (checkout sessions are created from product ids
// while the environment configures price ids). Four products (plan × interval
// — B7), so the resolver is interval-aware. The resolver reads the configured
// price IDs from the environment at module load, so they are stubbed before
// the module is imported.
//
// Faked Polar admin client with a paginated products.list, mirroring the
// SDK's PageIterator contract.

let resolveProductIdFromPrice: typeof import("@/lib/polar/checkout")["resolveProductIdFromPrice"];

beforeAll(async () => {
  vi.stubEnv("POLAR_SOLO_MONTHLY_PRODUCT_PRICE_ID", "price_solo_monthly");
  vi.stubEnv("POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID", "price_solo_annual");
  vi.stubEnv("POLAR_PRACTICE_MONTHLY_PRODUCT_PRICE_ID", "price_practice_monthly");
  vi.stubEnv("POLAR_PRACTICE_ANNUAL_PRODUCT_PRICE_ID", "price_practice_annual");
  resolveProductIdFromPrice = (await import("@/lib/polar/checkout")).resolveProductIdFromPrice;
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

describe("resolveProductIdFromPrice", () => {
  it("resolves the product owning the configured price id (monthly)", async () => {
    const polar = fakePolar([
      { id: "prod_solo", prices: [{ id: "price_solo_monthly" }] },
      { id: "prod_practice", prices: [{ id: "price_practice_monthly" }] },
    ]);
    expect(await resolveProductIdFromPrice(polar, "solo", "monthly")).toBe("prod_solo");
    expect(await resolveProductIdFromPrice(polar, "practice", "monthly")).toBe("prod_practice");
  });

  it("resolves the annual product for the annual interval (B7)", async () => {
    const polar = fakePolar([
      { id: "prod_solo_monthly", prices: [{ id: "price_solo_monthly" }] },
      { id: "prod_solo_annual", prices: [{ id: "price_solo_annual" }] },
    ]);
    expect(await resolveProductIdFromPrice(polar, "solo", "annual")).toBe("prod_solo_annual");
  });

  it("returns null when the price id is not configured or missing", async () => {
    const polar = fakePolar([{ id: "prod_solo", prices: [{ id: "price_solo_monthly" }] }]);
    expect(await resolveProductIdFromPrice(polar, "practice", "monthly")).toBeNull();
  });

  it("returns null when no product owns the price", async () => {
    const polar = fakePolar([{ id: "prod_other", prices: [{ id: "price_other" }] }]);
    expect(await resolveProductIdFromPrice(polar, "solo", "monthly")).toBeNull();
  });

  it("iterates every page until a match is found", async () => {
    const page1 = { result: { items: [{ id: "prod_a", prices: [{ id: "price_a" }] }] }, next: null };
    const page2 = { result: { items: [{ id: "prod_b", prices: [{ id: "price_solo_monthly" }] }] }, next: null };
    const polar = {
      products: {
        list: vi.fn(async () => ({
          ...page1,
          [Symbol.asyncIterator]: async function* () {
            yield page1;
            yield page2;
          },
        })),
      },
    } as unknown as Polar;
    expect(await resolveProductIdFromPrice(polar, "solo", "monthly")).toBe("prod_b");
  });
});
