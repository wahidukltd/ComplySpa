import { describe, it, expect } from "vitest";
import { planOnboardingReconciliation } from "@/lib/staff/onboarding";

interface Template {
  required: { credentialTypeId: string }[];
  optional: { credentialTypeId: string }[];
}

const RN_TEMPLATE: Template = {
  required: [
    { credentialTypeId: "t-rn-license" },
    { credentialTypeId: "t-bls" },
    { credentialTypeId: "t-hipaa" },
    { credentialTypeId: "t-osha" },
  ],
  optional: [{ credentialTypeId: "t-acls" }],
};

const NP_TEMPLATE: Template = {
  required: [
    { credentialTypeId: "t-np-license" },
    { credentialTypeId: "t-dea" },
    { credentialTypeId: "t-bls" },
    { credentialTypeId: "t-hipaa" },
    { credentialTypeId: "t-osha" },
  ],
  optional: [],
};

function item(id: string, typeId: string, status: string, isRequired = true) {
  return { id, credentialTypeId: typeId, status, isRequired };
}

function held(entries: [string, string][]) {
  return new Map(entries);
}

describe("planOnboardingReconciliation", () => {
  it("keeps items whose type is still in the template (completion preserved)", () => {
    const plan = planOnboardingReconciliation(
      [
        item("i-bls", "t-bls", "completed"),
        item("i-hipaa", "t-hipaa", "pending"),
      ],
      RN_TEMPLATE,
      held([]),
    );
    expect(plan.keep.sort()).toEqual(["i-bls", "i-hipaa"]);
    expect(plan.delete).toEqual([]);
    expect(plan.backfill).toEqual([]);
  });

  it("inserts template types with no existing item, pending when no credential is held", () => {
    const plan = planOnboardingReconciliation([], RN_TEMPLATE, held([]));
    expect(plan.insert).toHaveLength(5);
    expect(plan.insert.every((i) => i.status === "pending" && i.completedAt === null)).toBe(true);
    expect(plan.insert.find((i) => i.credentialTypeId === "t-rn-license")!.isRequired).toBe(true);
    expect(plan.insert.find((i) => i.credentialTypeId === "t-acls")!.isRequired).toBe(false);
  });

  it("inserts new requirements as completed when a live credential is held (completedAt = credential created_at)", () => {
    const plan = planOnboardingReconciliation([], NP_TEMPLATE, held([["t-np-license", "2026-01-10T00:00:00Z"]]));
    const npLicense = plan.insert.find((i) => i.credentialTypeId === "t-np-license")!;
    expect(npLicense.status).toBe("completed");
    expect(npLicense.completedAt).toBe("2026-01-10T00:00:00Z");
    const dea = plan.insert.find((i) => i.credentialTypeId === "t-dea")!;
    expect(dea.status).toBe("pending");
  });

  it("backfills existing pending/skipped items whose requirement is met by a held credential", () => {
    const plan = planOnboardingReconciliation(
      [item("i-bls", "t-bls", "pending"), item("i-acls", "t-acls", "skipped", false)],
      RN_TEMPLATE,
      held([
        ["t-bls", "2026-03-01T00:00:00Z"],
        ["t-acls", "2026-02-15T00:00:00Z"],
      ]),
    );
    expect(plan.backfill).toEqual([
      { itemId: "i-bls", completedAt: "2026-03-01T00:00:00Z", isRequired: true },
      { itemId: "i-acls", completedAt: "2026-02-15T00:00:00Z", isRequired: false },
    ]);
  });

  it("refreshes is_required on a completed item when the template requiredness changed (completedAt null — completion untouched)", () => {
    // ACLS was required when the item was created; the template flipped it to
    // optional. The item stays completed but its flag must refresh.
    const plan = planOnboardingReconciliation(
      [item("i-acls", "t-acls", "completed", true)],
      RN_TEMPLATE,
      held([]),
    );
    expect(plan.backfill).toEqual([{ itemId: "i-acls", completedAt: null, isRequired: false }]);
    expect(plan.keep).toEqual(["i-acls"]);
  });

  it("does not touch items whose status AND is_required already match the template", () => {
    const plan = planOnboardingReconciliation(
      [
        item("i-bls", "t-bls", "completed", true),
        item("i-acls", "t-acls", "completed", false),
      ],
      RN_TEMPLATE,
      held([]),
    );
    expect(plan.backfill).toEqual([]);
    expect(plan.keep).toHaveLength(2);
  });

  it("does not backfill a completed item and does not touch items without a held credential", () => {
    const plan = planOnboardingReconciliation(
      [item("i-bls", "t-bls", "completed"), item("i-hipaa", "t-hipaa", "pending")],
      RN_TEMPLATE,
      held([["t-bls", "2026-01-01T00:00:00Z"]]),
    );
    expect(plan.backfill).toEqual([]);
    expect(plan.keep.sort()).toEqual(["i-bls", "i-hipaa"]);
  });

  it("deletes items whose type left the template (role change to a narrower template)", () => {
    const plan = planOnboardingReconciliation(
      [
        item("i-rn", "t-rn-license", "completed"),
        item("i-bls", "t-bls", "completed"),
        item("i-acls", "t-acls", "completed"),
      ],
      NP_TEMPLATE,
      held([]),
    );
    expect(plan.delete.sort()).toEqual(["i-acls", "i-rn"]);
    expect(plan.keep).toEqual(["i-bls"]);
  });

  it("keeps multi-credential data honest: a held credential of the type prevents backfill regardless of count", () => {
    const plan = planOnboardingReconciliation(
      [item("i-osha", "t-osha", "pending")],
      RN_TEMPLATE,
      held([["t-osha", "2026-05-05T00:00:00Z"]]),
    );
    expect(plan.backfill).toEqual([{ itemId: "i-osha", completedAt: "2026-05-05T00:00:00Z", isRequired: true }]);
  });

  it("with a null template (role with no requirements) marks every item obsolete", () => {
    const plan = planOnboardingReconciliation(
      [item("i-bls", "t-bls", "completed"), item("i-hipaa", "t-hipaa", "pending")],
      null,
      held([]),
    );
    expect(plan.delete.sort()).toEqual(["i-bls", "i-hipaa"]);
    expect(plan.insert).toEqual([]);
  });

  it("is a no-op when items and template are already in sync", () => {
    const plan = planOnboardingReconciliation(
      [item("i-bls", "t-bls", "completed"), item("i-hipaa", "t-hipaa", "completed")],
      { required: [{ credentialTypeId: "t-bls" }, { credentialTypeId: "t-hipaa" }], optional: [] },
      held([]),
    );
    expect(plan.insert).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.backfill).toEqual([]);
    expect(plan.keep).toHaveLength(2);
  });
});
