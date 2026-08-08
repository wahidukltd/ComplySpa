import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable fake Supabase client (same shape as staff-actions.test.ts): each
// terminal call (maybeSingle / single / chain-await) consumes the next entry
// from `results` and records the operation for assertions.
type AnyRecord = { from: string; op: string; args: unknown[] };

function makeSupabase(results: Array<() => Record<string, unknown>>) {
  const calls: AnyRecord[] = [];

  const record = (from: string, op: string, args: unknown[]): Record<string, unknown> => {
    calls.push({ from, op, args });
    return results.shift()?.() ?? { error: null, data: null, count: 0 };
  };

  const builder = (from: string): Record<string, unknown> => {
    const pendingArgs: unknown[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      or: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(record(from, "maybeSingle", pendingArgs)),
      single: () => Promise.resolve(record(from, "single", pendingArgs)),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        Promise.resolve(record(from, "chain-await", pendingArgs)).then(resolve, reject);
      },
    };
    return chain;
  };

  const supabase = {
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "auth-user-1" } }, error: null }) },
  };

  return { supabase, calls };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/utils/clinic", () => ({
  getClinicIdAndPlan: vi.fn(async () => ({
    clinicId: "clinic-1",
    plan: "solo",
    trialPlan: null,
    userId: "auth-user-1",
  })),
}));

vi.mock("@/lib/staff/role-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff/role-templates")>();
  return {
    ...actual,
    getResolvedTemplate: vi.fn(),
  };
});

import { createClient } from "@/lib/supabase/server";
import { getClinicIdAndPlan } from "@/lib/utils/clinic";
import { getResolvedTemplate } from "@/lib/staff/role-templates";
import { getStaffWizardData } from "@/lib/actions/staff";

const mockedCreateClient = vi.mocked(createClient);
const mockedGetResolvedTemplate = vi.mocked(getResolvedTemplate);
const mockedGetClinicIdAndPlan = vi.mocked(getClinicIdAndPlan);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetClinicIdAndPlan.mockResolvedValue({
    clinicId: "clinic-1",
    plan: "solo",
    trialPlan: null,
    userId: "auth-user-1",
  });
  mockedCreateClient.mockResolvedValue({
    from: () => {
      throw new Error("unexpected from() — test must provide a fake client");
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  } as never);
});

describe("getStaffWizardData — auth gates", () => {
  it("returns Unauthorized when no clinic data is resolvable", async () => {
    mockedGetClinicIdAndPlan.mockResolvedValueOnce(null);
    const result = await getStaffWizardData(null);
    expect(result.error).toBe("Unauthorized");
    expect(result.data).toBeNull();
  });

  it("blocks viewers", async () => {
    const { supabase } = makeSupabase([() => ({ data: { role: "viewer" }, error: null })]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getStaffWizardData(null);

    expect(result.error).toBe("Insufficient permissions");
  });
});

describe("getStaffWizardData — data assembly (role = null)", () => {
  it("maps credential types, custom roles, and empty suggestions", async () => {
    const { supabase, calls } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }), // users lookup
      () => ({
        data: [
          { id: "t1", name: "CPR/BLS Certification", category: "training", default_renewal_cycle_days: 730 },
          { id: "t2", name: "Esthetician License", category: "license", default_renewal_cycle_days: null },
        ],
        error: null,
      }), // credential_types
      () => ({
        data: [
          { role: "MD", clinic_id: null },
          { role: "other", clinic_id: null },
          { role: "RN", clinic_id: null },
          { role: "RN", clinic_id: "clinic-1" },
          { role: "Injectables Nurse", clinic_id: "clinic-1" },
        ],
        error: null,
      }), // role_templates
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getStaffWizardData(null);

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.types).toEqual([
      { id: "t1", name: "CPR/BLS Certification", category: "training", defaultRenewalCycleDays: 730 },
      { id: "t2", name: "Esthetician License", category: "license", defaultRenewalCycleDays: null },
    ]);
    // Clinic row for a global role is an override, not a custom role.
    expect(result.data!.customRoles).toEqual(["Injectables Nurse"]);
    expect(result.data!.suggestions).toEqual([]);
    expect(calls.map((c) => c.from)).toEqual(["users", "credential_types", "role_templates"]);
  });
});

describe("getStaffWizardData — role suggestions", () => {
  it("returns required-first suggestions mapped with category and renewal days", async () => {
    mockedGetResolvedTemplate.mockResolvedValue({
      templateId: "tmpl-1",
      clinicId: null,
      required: [{ credentialTypeId: "t1", name: "CPR/BLS Certification", category: "training" }],
      optional: [{ credentialTypeId: "t2", name: "ACLS Certification", category: "training" }],
    });
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({
        data: [
          { id: "t1", name: "CPR/BLS Certification", category: "training", default_renewal_cycle_days: 730 },
          { id: "t2", name: "ACLS Certification", category: "training", default_renewal_cycle_days: null },
        ],
        error: null,
      }),
      () => ({ data: [], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getStaffWizardData("RN");

    expect(result.error).toBeNull();
    expect(result.data!.suggestions).toEqual([
      { credentialTypeId: "t1", name: "CPR/BLS Certification", category: "training", isRequired: true, renewalDays: 730 },
      { credentialTypeId: "t2", name: "ACLS Certification", category: "training", isRequired: false, renewalDays: null },
    ]);
    expect(mockedGetResolvedTemplate).toHaveBeenCalledWith("clinic-1", "RN");
  });

  it("returns Role template not found when the role has no resolved template", async () => {
    mockedGetResolvedTemplate.mockResolvedValue(null);
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: [], error: null }),
      () => ({ data: [], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getStaffWizardData("GhostRole");

    expect(result.error).toBe("Role template not found.");
    expect(result.data).toBeNull();
  });

  it("rejects a malformed role name before any data access", async () => {
    const { supabase, calls } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getStaffWizardData("Bad@Role");

    expect(result.error).toBe("Invalid role name.");
    expect(mockedGetResolvedTemplate).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1); // only the users lookup ran
  });

  it("surfaces a template-resolution failure honestly", async () => {
    mockedGetResolvedTemplate.mockRejectedValue(new Error("db down"));
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: [], error: null }),
      () => ({ data: [], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getStaffWizardData("RN");

    expect(result.error).toBe("Failed to load role template.");
    expect(result.data).toBeNull();
  });
});
