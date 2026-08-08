import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/utils/clinic", () => ({
  getClinicIdAndPlan: vi.fn(async () => ({
    clinicId: "c1",
    plan: "practice",
    userId: "auth-user-1",
  })),
}));

vi.mock("@/lib/staff/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff/onboarding")>();
  return {
    ...actual,
    createOnboardingItems: vi.fn(),
  };
});

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createOnboardingItems } from "@/lib/staff/onboarding";
import {
  getRoleChangePreview,
  getTemplateSyncPreview,
  syncStaffToTemplate,
  syncStaffToRoleTemplate,
} from "@/lib/actions/role-templates";

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateOnboardingItems = vi.mocked(createOnboardingItems);

/** Minimal chainable fake — only the ops the sync/preview actions use. */
function makeSupabase(results: Array<() => Record<string, unknown>>) {
  const calls: { from: string; op: string; args: unknown[] }[] = [];
  const next = (from: string, op: string, args: unknown[]): Record<string, unknown> => {
    calls.push({ from, op, args });
    return results.shift?.()?.() ?? { error: null, data: null, count: 0 };
  };
  const builder = (from: string): Record<string, unknown> => {
    let pendingArgs: unknown[] = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      or: () => chain,
      in: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: (...args: unknown[]) => {
        pendingArgs = args;
        return chain;
      },
      update: (...args: unknown[]) => {
        pendingArgs = args;
        return chain;
      },
      delete: () => chain,
      upsert: (...args: unknown[]) => {
        pendingArgs = args;
        return chain;
      },
      maybeSingle: () => Promise.resolve(next(from, "maybeSingle", pendingArgs)),
      single: () => Promise.resolve(next(from, "single", pendingArgs)),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        Promise.resolve(next(from, "chain-await", pendingArgs)).then(resolve, reject);
      },
    };
    return chain;
  };
  const supabase = {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: "auth-user-1" } }, error: null }) },
  };
  return { supabase, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreateClient.mockResolvedValue({
    from: () => {
      throw new Error("unexpected from() — test must provide a fake client");
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  } as never);
  vi.mocked(revalidatePath).mockImplementation(() => undefined);
});

describe("syncStaffToTemplate — delegation to the shared engine", () => {
  it("delegates to createOnboardingItems (insert-only + backfill) and returns the added count", async () => {
    mockedCreateOnboardingItems.mockResolvedValue({ added: 2, backfilled: 1 });

    const { supabase } = makeSupabase([
      // requireOwnerOrManager users read
      () => ({ data: { role: "owner" }, error: null }),
      // staff read
      () => ({ data: { id: "s1", role: "RN" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await syncStaffToTemplate("s1");

    expect(result).toEqual({ success: true, added: 2 });
    expect(mockedCreateOnboardingItems).toHaveBeenCalledWith("s1", "c1", "RN", { requireTemplate: true, flow: "sync-staff" });
  });

  it("errors when the staff member has no role", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: { id: "s1", role: null }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await syncStaffToTemplate("s1");
    expect(result.error).toBe("Staff member not found.");
    expect(mockedCreateOnboardingItems).not.toHaveBeenCalled();
  });

  it("surfaces the engine's missing-template error (requireTemplate)", async () => {
    mockedCreateOnboardingItems.mockResolvedValue({ error: "Role template not found." });

    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: { id: "s1", role: "RN" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await syncStaffToTemplate("s1");
    expect(result.error).toBe("Role template not found.");
  });
});

describe("syncStaffToRoleTemplate — role-wide delegation", () => {
  it("rejects a malformed role name before any data access", async () => {
    const result = await syncStaffToRoleTemplate("Bad@Role!");
    expect(result.error).toBe("Invalid role name.");
  });

  it("errors honestly when the role has no template (057 template-exists contract)", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      // getResolvedTemplate finds no role_templates row for the role
      () => ({ data: [], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await syncStaffToRoleTemplate("Laser Technician");
    expect(result.error).toBe("Role template not found.");
    expect(mockedCreateOnboardingItems).not.toHaveBeenCalled();
  });

  it("syncs every staff member of the role through the shared engine", async () => {
    mockedCreateOnboardingItems.mockResolvedValue({ added: 1, backfilled: 0 });

    const { supabase, calls } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      // getResolvedTemplate: role_templates row (global) + its items
      () => ({ data: [{ id: "tpl", clinic_id: null, role: "RN", is_active: true }], error: null }),
      () => ({ data: [], error: null }),
      () => ({ data: [{ id: "s1" }, { id: "s2" }], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await syncStaffToRoleTemplate("RN");

    // Distinct units (review finding SF5): synced = staff processed,
    // added = onboarding items created.
    expect(result).toEqual({ success: true, synced: 2, added: 2 });
    expect(mockedCreateOnboardingItems).toHaveBeenCalledTimes(2);
    expect(mockedCreateOnboardingItems).toHaveBeenCalledWith("s1", "c1", "RN", { requireTemplate: true, flow: "sync-role" });
    expect(mockedCreateOnboardingItems).toHaveBeenCalledWith("s2", "c1", "RN", { requireTemplate: true, flow: "sync-role" });
    expect(calls.filter((c) => c.from === "onboarding_items")).toHaveLength(0);
  });

  it("aborts with the engine error when one staff member fails", async () => {
    mockedCreateOnboardingItems
      .mockResolvedValueOnce({ added: 1, backfilled: 0 })
      .mockResolvedValueOnce({ error: "Failed to create onboarding items." });

    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: [{ id: "tpl", clinic_id: null, role: "RN", is_active: true }], error: null }),
      () => ({ data: [], error: null }),
      () => ({ data: [{ id: "s1" }, { id: "s2" }], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await syncStaffToRoleTemplate("RN");
    expect(result.error).toBe("Failed to create onboarding items.");
  });
});

describe("getTemplateSyncPreview — SF6 preview-vs-engine parity", () => {
  it("counts staff missing OPTIONAL items too (the engine adds required + optional)", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      // getResolvedTemplate: an ALL-OPTIONAL template (the case that used to
      // report 0 affected and disable sync forever)
      () => ({ data: [{ id: "tpl", clinic_id: null, role: "RN", is_active: true }], error: null }),
      () => ({
        data: [
          { template_id: "tpl", is_required: false, sort_order: 0, credential_type_id: "t-acls", credential_type: { name: "ACLS Certification" } },
        ],
        error: null,
      }),
      // staff in the role
      () => ({ data: [{ id: "s1", name: "Nurse One" }], error: null }),
      // onboarding_items read — none exist
      () => ({ data: [], error: null }),
      // credentials read — none held
      () => ({ data: [], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getTemplateSyncPreview("RN");

    expect(result.error).toBeUndefined();
    // The all-optional template must NOT report "no staff need syncing".
    expect(result.data?.count).toBe(1);
    expect(result.data?.staff).toEqual([{ id: "s1", name: "Nurse One" }]);
  });

  it("excludes staff who already hold every required AND optional item", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: [{ id: "tpl", clinic_id: null, role: "RN", is_active: true }], error: null }),
      () => ({
        data: [
          { template_id: "tpl", is_required: true, sort_order: 0, credential_type_id: "t-rn", credential_type: { name: "Registered Nurse License" } },
          { template_id: "tpl", is_required: false, sort_order: 1, credential_type_id: "t-acls", credential_type: { name: "ACLS Certification" } },
        ],
        error: null,
      }),
      () => ({ data: [{ id: "s1", name: "Nurse One" }], error: null }),
      // has the required item in the checklist
      () => ({ data: [{ staff_member_id: "s1", credential_type_id: "t-rn" }], error: null }),
      // holds the optional credential
      () => ({ data: [{ staff_member_id: "s1", credential_type_id: "t-acls" }], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getTemplateSyncPreview("RN");

    expect(result.error).toBeUndefined();
    expect(result.data?.count).toBe(0);
  });

  it("errors honestly when the role has no template", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: [], error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getTemplateSyncPreview("Ghost Role");
    expect(result.error).toBe("Role template not found.");
  });
});

describe("getRoleChangePreview — D12 preview action", () => {
  it("rejects a malformed role name before any data access", async () => {
    const result = await getRoleChangePreview("s1", "Bad@Role!");
    expect(result.error).toBe("Invalid role name.");
  });

  it("rejects viewers before any data access", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "viewer" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getRoleChangePreview("s1", "NP");
    expect(result.error).toBe("Insufficient permissions");
  });

  it("returns kept/added/removed against the resolved template", async () => {
    // getResolvedTemplate is NOT mocked — mock the real module's DB via the
    // fake client instead, so the preview's own query shape is exercised.
    const { supabase, calls } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: { id: "s1", role: "RN" }, error: null }),
      // role_templates read (fetchTemplateRows) — target-role template
      () => ({ data: [{ id: "tpl", clinic_id: null, role: "NP", is_active: true }], error: null }),
      // role_template_items for that template
      () => ({
        data: [
          { template_id: "tpl", is_required: true, sort_order: 0, credential_type_id: "t-rn", credential_type: { name: "Registered Nurse License" } },
          { template_id: "tpl", is_required: true, sort_order: 1, credential_type_id: "t-bls", credential_type: { name: "CPR/BLS Certification" } },
        ],
        error: null,
      }),
      // onboarding_items read
      () => ({
        data: [{ credential_type_id: "t-rn", credential_type: { name: "Registered Nurse License" } }],
        error: null,
      }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getRoleChangePreview("s1", "NP");

    expect(result.error).toBeUndefined();
    expect(result.data).toMatchObject({
      kept: 1,
      added: [{ name: "CPR/BLS Certification" }],
      removed: [],
    });
    expect(calls.filter((c) => c.from === "onboarding_items")).toHaveLength(1);
  });

  it("returns an honest error when the target role has no template", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),
      () => ({ data: { id: "s1", role: "RN" }, error: null }),
      () => ({ data: [], error: null }), // no role_templates row for the target role
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await getRoleChangePreview("s1", "other");
    expect(result.error).toBe("Role template not found.");
  });
});
