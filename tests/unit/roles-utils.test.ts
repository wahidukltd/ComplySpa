import { describe, it, expect } from "vitest";
import {
  ROLE_NAME_MAX,
  ROLE_NAME_PATTERN,
  roleNameSchema,
  formatRoleLabel,
  isBuiltInRole,
  BUILT_IN_ROLES,
} from "@/lib/utils/roles";

describe("roleNameSchema — the zod mirror of the 057 DB CHECK", () => {
  it("accepts built-in role values", () => {
    for (const role of BUILT_IN_ROLES) {
      expect(roleNameSchema.safeParse(role).success).toBe(true);
    }
  });

  it("accepts international letters, digits, spaces, and basic punctuation", () => {
    expect(roleNameSchema.safeParse("Laser Technician II").success).toBe(true);
    expect(roleNameSchema.safeParse("2nd Assistant").success).toBe(true);
    // Accented letters are legal (UK/Canada/international staffing models)
    expect(roleNameSchema.safeParse("Injectioniste").success).toBe(true);
    expect(roleNameSchema.safeParse("Chief Nurse (Operations)").success).toBe(true);
    expect(roleNameSchema.safeParse("Esthetician/Beauty Therapist").success).toBe(true);
    expect(roleNameSchema.safeParse("RN - Lead").success).toBe(true);
    expect(roleNameSchema.safeParse("A&B").success).toBe(true);
    expect(roleNameSchema.safeParse("D.O.").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const parsed = roleNameSchema.safeParse("  Laser Tech  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("Laser Tech");
  });

  it("rejects empty and whitespace-only names", () => {
    expect(roleNameSchema.safeParse("").success).toBe(false);
    expect(roleNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects names over the max length", () => {
    expect(roleNameSchema.safeParse("A".repeat(ROLE_NAME_MAX + 1)).success).toBe(false);
    expect(roleNameSchema.safeParse("A".repeat(ROLE_NAME_MAX)).success).toBe(true);
  });

  it("rejects characters outside the pattern (mirror of the DB CHECK)", () => {
    expect(roleNameSchema.safeParse("Bad@Role!").success).toBe(false);
    expect(roleNameSchema.safeParse("Role#1").success).toBe(false);
    expect(roleNameSchema.safeParse("!Lead").success).toBe(false);
    expect(roleNameSchema.safeParse("-Lead").success).toBe(false);
    expect(roleNameSchema.safeParse("Lead/Manager*").success).toBe(false);
  });
});

describe("ROLE_NAME_PATTERN — identical semantics to the 057 DB regex", () => {
  it("matches the same character set the DB CHECK enforces", () => {
    // DB: ^[[:alpha:][:digit:]][[:alpha:][:digit:] _\-'().&/+]*$
    // JS: ^[\p{L}0-9][\p{L}0-9 _\-'().&/+]*$  (Unicode letters + ASCII digits)
    expect(ROLE_NAME_PATTERN.test("MedSpa Practitioner")).toBe(true);
    expect(ROLE_NAME_PATTERN.test("123 Tech")).toBe(true);
    expect(ROLE_NAME_PATTERN.test("")).toBe(false);
    expect(ROLE_NAME_PATTERN.test("Bad@Role")).toBe(false);
  });
});

describe("formatRoleLabel — display labels", () => {
  it("disambiguates MD and DO (the pre-existing duplicate-label inconsistency)", () => {
    expect(formatRoleLabel("MD")).toBe("Physician (MD)");
    expect(formatRoleLabel("DO")).toBe("Physician (DO)");
  });

  it("uses the friendly labels for the other built-ins", () => {
    expect(formatRoleLabel("NP")).toBe("Nurse Practitioner");
    expect(formatRoleLabel("RN")).toBe("Registered Nurse");
    expect(formatRoleLabel("esthetician")).toBe("Esthetician");
    expect(formatRoleLabel("front_desk")).toBe("Front Desk");
    expect(formatRoleLabel("other")).toBe("Other");
  });

  it("passes custom role names through unchanged (the name IS the label)", () => {
    expect(formatRoleLabel("Laser Technician")).toBe("Laser Technician");
    expect(formatRoleLabel("Injectioniste")).toBe("Injectioniste");
  });
});

describe("isBuiltInRole", () => {
  it("recognizes the 9 seeded roles", () => {
    expect(BUILT_IN_ROLES).toHaveLength(9);
    for (const role of BUILT_IN_ROLES) {
      expect(isBuiltInRole(role)).toBe(true);
    }
  });

  it("rejects custom and unknown roles", () => {
    expect(isBuiltInRole("Laser Technician")).toBe(false);
    expect(isBuiltInRole("NURSE")).toBe(false);
    expect(isBuiltInRole("")).toBe(false);
  });
});
