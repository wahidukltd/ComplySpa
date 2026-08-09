import { describe, it, expect } from "vitest";
import { ROLE_GROUPS } from "@/lib/staff/role-credential-defaults";
import { BUILT_IN_ROLES } from "@/lib/utils/roles";

describe("wizard role groups (Step 2 card coverage)", () => {
  it("covers every built-in card role exactly once", () => {
    // The regression this test exists for: a role added to BUILT_IN_ROLES but
    // forgotten in ROLE_GROUPS silently disappears from the wizard — the
    // "hiding roles" failure mode. MD/DO render as the merged Physician card;
    // `other` is never offered in the add flow (zero-item template → false
    // "Work Ready").
    const grouped = ROLE_GROUPS.flatMap((g) => g.roles);
    const cardRoles = BUILT_IN_ROLES.filter(
      (r) => r !== "MD" && r !== "DO" && r !== "other",
    );
    expect(grouped).toHaveLength(cardRoles.length);
    expect(new Set(grouped).size).toBe(grouped.length);
    for (const role of cardRoles) {
      expect(grouped).toContain(role);
    }
  });

  it("orders groups clinically: clinical, aesthetic, operations", () => {
    expect(ROLE_GROUPS.map((g) => g.key)).toEqual([
      "clinical",
      "aesthetic",
      "operations",
    ]);
  });
});
