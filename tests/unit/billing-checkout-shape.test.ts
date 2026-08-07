import { describe, it, expect, beforeAll, vi } from "vitest";

// createCheckoutLink payload-shape tests (review 2026-08-05 + plan 2026-08-08
// §4.7/B7 — the exact fields this feature's safety hinges on: allowTrial:
// false, customer linking, metadata, per-interval product). The Polar SDK is
// mocked; env stubbed before the module (dynamic import) so polarConfig picks
// up the price IDs.

const { checkoutsCreate, productsList } = vi.hoisted(() => ({
  checkoutsCreate: vi.fn(),
  productsList: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => {
  return {
    Polar: class {
      checkouts = { create: checkoutsCreate };
      products = { list: productsList };
    },
  };
});

let createCheckoutLink: typeof import("@/lib/polar/checkout")["createCheckoutLink"];

function pageIterator(items: Array<{ id: string; prices: Array<{ id: string }> }>) {
  const page = { result: { items }, next: null };
  return {
    ...page,
    [Symbol.asyncIterator]: async function* () {
      yield page;
    },
  };
}

beforeAll(async () => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "tok_test");
  vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("POLAR_SOLO_MONTHLY_PRODUCT_PRICE_ID", "price_solo_monthly");
  vi.stubEnv("POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID", "price_solo_annual");
  vi.stubEnv("POLAR_PRACTICE_MONTHLY_PRODUCT_PRICE_ID", "price_practice_monthly");
  vi.stubEnv("POLAR_PRACTICE_ANNUAL_PRODUCT_PRICE_ID", "price_practice_annual");
  productsList.mockResolvedValue(
    pageIterator([
      { id: "prod_solo_monthly", prices: [{ id: "price_solo_monthly" }] },
      { id: "prod_solo_annual", prices: [{ id: "price_solo_annual" }] },
      { id: "prod_practice_monthly", prices: [{ id: "price_practice_monthly" }] },
      { id: "prod_practice_annual", prices: [{ id: "price_practice_annual" }] },
    ]),
  );
  checkoutsCreate.mockResolvedValue({ url: "https://checkout.polar.sh/cs_test" });
  createCheckoutLink = (await import("@/lib/polar/checkout")).createCheckoutLink;
}, 30000);

describe("createCheckoutLink payload shape", () => {
  it("never starts a trial on Subscribe-now and passes the known customer", async () => {
    const res = await createCheckoutLink("solo", "monthly", "cus_123", { clinic_id: "clinic-1", plan: "solo" });
    expect(res.url).toBe("https://checkout.polar.sh/cs_test");
    expect(checkoutsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        products: ["prod_solo_monthly"],
        customerId: "cus_123",
        externalCustomerId: undefined,
        metadata: { clinic_id: "clinic-1", plan: "solo", interval: "monthly" },
        allowTrial: false,
        allowDiscountCodes: true,
      }),
    );
    const call = checkoutsCreate.mock.calls[0][0];
    expect(call.successUrl).toContain("checkout=success");
    expect(call.returnUrl).toContain("checkout=cancelled");
  });

  it("creates the annual checkout from the annual product id (B7)", async () => {
    await createCheckoutLink("practice", "annual", "cus_123", { clinic_id: "clinic-1", plan: "practice" });
    expect(checkoutsCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        products: ["prod_practice_annual"],
        metadata: { clinic_id: "clinic-1", plan: "practice", interval: "annual" },
        allowTrial: false,
      }),
    );
  });

  it("links the first-ever checkout via externalCustomerId = clinic_id", async () => {
    await createCheckoutLink("practice", "monthly", undefined, { clinic_id: "clinic-9", plan: "practice" });
    expect(checkoutsCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        products: ["prod_practice_monthly"],
        customerId: undefined,
        externalCustomerId: "clinic-9",
        allowTrial: false,
      }),
    );
  });

  it("refuses an unavailable product — no checkout session is created (B7)", async () => {
    // polarConfig reads env at module load, so import a fresh module with the
    // annual price id unset — the availability gate must refuse the checkout
    // before any Polar call.
    vi.resetModules();
    vi.stubEnv("POLAR_ACCESS_TOKEN", "tok_test");
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("POLAR_SOLO_MONTHLY_PRODUCT_PRICE_ID", "price_solo_monthly");
    vi.stubEnv("POLAR_SOLO_ANNUAL_PRODUCT_PRICE_ID", "");
    vi.stubEnv("POLAR_PRACTICE_MONTHLY_PRODUCT_PRICE_ID", "price_practice_monthly");
    vi.stubEnv("POLAR_PRACTICE_ANNUAL_PRODUCT_PRICE_ID", "price_practice_annual");
    const fresh = await import("@/lib/polar/checkout");
    const res = await fresh.createCheckoutLink("solo", "annual", "cus_123", { clinic_id: "clinic-1", plan: "solo" });
    expect(res.url).toBeNull();
    expect(res.error).toContain("isn't available yet");
    // The checkout session must never be created for an unavailable product.
    expect(checkoutsCreate).not.toHaveBeenLastCalledWith(expect.objectContaining({ products: ["prod_solo_annual"] }));
  });
});
