import { describe, it, expect, beforeAll, vi } from "vitest";

// createCheckoutLink payload-shape tests (review 2026-08-05 — the exact
// fields this feature's safety hinges on: allowTrial: false, customer
// linking, metadata). The Polar SDK is mocked; env stubbed before the module
// (dynamic import) so polarConfig picks up the price IDs.

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
  vi.stubEnv("POLAR_SOLO_PRODUCT_PRICE_ID", "price_solo_monthly");
  vi.stubEnv("POLAR_PRACTICE_PRODUCT_PRICE_ID", "price_practice_monthly");
  productsList.mockResolvedValue(
    pageIterator([
      { id: "prod_solo", prices: [{ id: "price_solo_monthly" }] },
      { id: "prod_practice", prices: [{ id: "price_practice_monthly" }] },
    ]),
  );
  checkoutsCreate.mockResolvedValue({ url: "https://checkout.polar.sh/cs_test" });
  createCheckoutLink = (await import("@/lib/polar/checkout")).createCheckoutLink;
}, 30000);

describe("createCheckoutLink payload shape", () => {
  it("never starts a trial on Subscribe-now and passes the known customer", async () => {
    const res = await createCheckoutLink("solo", "cus_123", { clinic_id: "clinic-1", plan: "solo" });
    expect(res.url).toBe("https://checkout.polar.sh/cs_test");
    expect(checkoutsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        products: ["prod_solo"],
        customerId: "cus_123",
        externalCustomerId: undefined,
        metadata: { clinic_id: "clinic-1", plan: "solo" },
        allowTrial: false,
        allowDiscountCodes: true,
      }),
    );
    const call = checkoutsCreate.mock.calls[0][0];
    expect(call.successUrl).toContain("checkout=success");
    expect(call.returnUrl).toContain("checkout=cancelled");
  });

  it("links the first-ever checkout via externalCustomerId = clinic_id", async () => {
    await createCheckoutLink("practice", undefined, { clinic_id: "clinic-9", plan: "practice" });
    expect(checkoutsCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        products: ["prod_practice"],
        customerId: undefined,
        externalCustomerId: "clinic-9",
        allowTrial: false,
      }),
    );
  });

  it("resolves the product id from the configured price id", async () => {
    const call = checkoutsCreate.mock.calls[1][0];
    expect(call.products).toEqual(["prod_practice"]);
  });
});
