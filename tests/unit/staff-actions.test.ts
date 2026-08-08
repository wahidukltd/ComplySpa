import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Chainable fake Supabase client ────────────────────────────────────────────
// Each terminal call (maybeSingle/single/head-select/await-on-builder) consumes
// the next entry from `results` and records the operation for assertions.
type AnyRecord = { from: string; op: string; args: unknown[] };

function makeSupabase(results: Array<() => Record<string, unknown>>) {
  const calls: AnyRecord[] = [];

  const record = (from: string, op: string, args: unknown[]): Record<string, unknown> => {
    calls.push({ from, op, args });
    return results.shift()?.() ?? { error: null, data: null, count: 0 };
  };

  const builder = (from: string): Record<string, unknown> => {
    let pendingArgs: unknown[] = [];
    const chain: Record<string, unknown> = {
      // select is always chainable — head/count queries resolve when the
      // resulting chain is awaited (then) or terminated (.single/.maybeSingle).
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
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(record("rpc", "rpc", [name, args])),
    auth: { getUser: async () => ({ data: { user: { id: "auth-user-1" } }, error: null }) },
  };

  return { supabase, calls };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/staff/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff/onboarding")>();
  return {
    ...actual,
    reconcileOnboardingItemsToRole: vi.fn(),
    createOnboardingItems: vi.fn(async () => ({})),
  };
});

vi.mock("@/lib/utils/clinic", () => ({
  getClinicIdAndPlan: vi.fn(async () => ({
    clinicId: "clinic-1",
    plan: "solo",
    trialPlan: null,
    userId: "auth-user-1",
  })),
}));

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { reconcileOnboardingItemsToRole } from "@/lib/staff/onboarding";
import {
  addStaffWithCredentialsSchema,
  staffMemberSchema,
} from "@/lib/validations/staff";
import { deleteCredential } from "@/lib/actions/credentials";
import { addStaffMember, addStaffMemberWithCredentials } from "@/lib/actions/staff";

const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
  mockedCreateClient.mockResolvedValue({
    from: () => {
      throw new Error("unexpected from() — test must provide a fake client");
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  } as never);
});

describe("addStaffWithCredentialsSchema — duplicate-type refine (D13c)", () => {
  it("rejects duplicate credential_type_ids", () => {
    const parsed = addStaffWithCredentialsSchema.safeParse({
      name: "Sarah",
      role: "RN",
      credentials: [
        { credential_type_id: "11111111-1111-1111-8111-111111111111" },
        { credential_type_id: "11111111-1111-1111-8111-111111111111" },
      ],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.credentials).toBeDefined();
    }
  });

  it("allows distinct types (multi-state data stays legal)", () => {
    const parsed = addStaffWithCredentialsSchema.safeParse({
      name: "Sarah",
      role: "RN",
      credentials: [
        { credential_type_id: "11111111-1111-1111-8111-111111111111" },
        { credential_type_id: "22222222-2222-2222-9222-222222222222" },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("staffMemberSchema — role-clear guard input shape", () => {
  it("allows an omitted role (the action guards clearing separately)", () => {
    const parsed = staffMemberSchema.safeParse({ name: "Sarah" });
    expect(parsed.success).toBe(true);
  });
});

describe("deleteCredential — D10 checklist revert (atomic RPC, migration 048)", () => {
  // The action reads the user's clinic+role once, then works on the credential.
  const authPrefix = [() => ({ data: { clinic_id: "c1", role: "owner" }, error: null })];

  it("reverts the checklist item when the deleted credential was the last of its type (RPC reverted=true)", async () => {
    const { supabase, calls } = makeSupabase([
      ...authPrefix,
      () => ({ data: { staff_member_id: "s1" }, error: null }),
      () => ({ data: { deleted: true, reverted: true }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);
    vi.mocked(revalidatePath).mockImplementation(() => undefined);

    const result = await deleteCredential("c1", "s1");

    expect(result).toEqual({ success: true });
    const rpcCall = calls.find((c) => c.from === "rpc");
    expect(rpcCall).toBeDefined();
    expect(rpcCall!.args[0]).toBe("delete_credential_with_checklist_revert");
    expect(rpcCall!.args[1]).toMatchObject({
      p_credential_id: "c1",
      p_staff_member_id: "s1",
      p_clinic_id: "c1",
    });
  });

  it("does NOT revert when another live credential of the type remains (RPC reverted=false)", async () => {
    const { supabase, calls } = makeSupabase([
      ...authPrefix,
      () => ({ data: { staff_member_id: "s1" }, error: null }),
      () => ({ data: { deleted: true, reverted: false }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);
    vi.mocked(revalidatePath).mockImplementation(() => undefined);

    const result = await deleteCredential("c1", "s1");

    expect(result).toEqual({ success: true });
    const rpcCall = calls.find((c) => c.from === "rpc");
    expect(rpcCall).toBeDefined();
    expect((rpcCall!.args[1] as Record<string, unknown>).p_credential_id).toBe("c1");
  });

  it("rejects when the credential does not belong to the staff member (no RPC call)", async () => {
    const { supabase, calls } = makeSupabase([
      ...authPrefix,
      () => ({ data: { staff_member_id: "other-staff" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await deleteCredential("c1", "s1");
    expect(result.error).toBe("Credential does not belong to this staff member.");
    expect(calls.filter((c) => c.from === "rpc")).toHaveLength(0);
  });

  it("rejects with Credential not found when the RPC reports the row was already gone", async () => {
    const { supabase } = makeSupabase([
      ...authPrefix,
      () => ({ data: { staff_member_id: "s1" }, error: null }),
      () => ({ data: { deleted: false }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const result = await deleteCredential("c1", "s1");
    expect(result.error).toBe("Credential not found.");
  });
});

describe("updateStaffMember — role-change regeneration (D3/D11)", () => {
  it("rejects role clearing with an error before any write", async () => {
    const { supabase, calls } = makeSupabase([
      () => ({ data: { clinic_id: "c1", role: "owner" }, error: null }),
      () => ({ data: { role: "RN" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);

    const { updateStaffMember } = await import("@/lib/actions/staff");
    const result = await updateStaffMember("s1", { name: "Sarah" });

    expect(result.error).toContain("cannot be cleared");
    expect(calls.filter((c) => c.from === "staff_members" && c.op === "maybeSingle")).toHaveLength(0);
    expect(reconcileOnboardingItemsToRole).not.toHaveBeenCalled();
  });

  it("rejects with a reload error when the staff row changed concurrently (optimistic guard)", async () => {
    const { supabase, calls } = makeSupabase([
      () => ({ data: { clinic_id: "c1", role: "owner" }, error: null }),
      () => ({ data: { role: "RN" }, error: null }),
      // Guarded UPDATE matched 0 rows — a concurrent change committed first.
      () => ({ data: null, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);
    vi.mocked(revalidatePath).mockImplementation(() => undefined);

    const { updateStaffMember } = await import("@/lib/actions/staff");
    const result = await updateStaffMember("s1", { name: "Sarah", role: "NP" });

    expect(result.error).toContain("changed by someone else");
    expect(reconcileOnboardingItemsToRole).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.from === "staff_members" && c.op === "maybeSingle")).toHaveLength(1);
  });

  it("reverts the role when item regeneration fails (D11 failure atomicity)", async () => {
    vi.mocked(reconcileOnboardingItemsToRole).mockResolvedValue({
      error: "Failed to create onboarding items.",
      added: 0,
      removed: 0,
      backfilled: 0,
    });

    const { supabase, calls } = makeSupabase([
      () => ({ data: { clinic_id: "c1", role: "owner" }, error: null }),
      () => ({ data: { role: "RN" }, error: null }),
      () => ({ data: { id: "s1" }, error: null }),
      () => ({ data: { id: "s1" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);
    vi.mocked(revalidatePath).mockImplementation(() => undefined);

    const { updateStaffMember } = await import("@/lib/actions/staff");
    const result = await updateStaffMember("s1", { name: "Sarah", role: "NP" });

    expect(result.error).toBe("Failed to create onboarding items.");
    expect(reconcileOnboardingItemsToRole).toHaveBeenCalledWith("s1", "c1", "NP", "role-change");
    // Two staff_members writes: the guarded role UPDATE then the D11 revert
    // (revert itself guarded on role = newRole).
    const staffWrites = calls.filter((c) => c.from === "staff_members" && c.op === "maybeSingle");
    expect(staffWrites).toHaveLength(2);
    expect((staffWrites[0]!.args[0] as { role: string }).role).toBe("NP");
    expect((staffWrites[1]!.args[0] as { role: string }).role).toBe("RN");
  });

  it("returns the regeneration counts on a successful role change (D12 toast source)", async () => {
    vi.mocked(reconcileOnboardingItemsToRole).mockResolvedValue({
      error: undefined,
      added: 2,
      removed: 1,
      backfilled: 1,
    });

    const { supabase } = makeSupabase([
      () => ({ data: { clinic_id: "c1", role: "owner" }, error: null }),
      () => ({ data: { role: "RN" }, error: null }),
      () => ({ data: { id: "s1" }, error: null }),
    ]);
    mockedCreateClient.mockResolvedValue(supabase as never);
    vi.mocked(revalidatePath).mockImplementation(() => undefined);

    const { updateStaffMember } = await import("@/lib/actions/staff");
    const result = await updateStaffMember("s1", { name: "Sarah", role: "NP" });

    expect(result).toMatchObject({ success: true, added: 2, removed: 1, backfilled: 1 });
    expect(reconcileOnboardingItemsToRole).toHaveBeenCalledWith("s1", "c1", "NP", "role-change");
  });
});

describe("ND0MV trigger race mapping", () => {
  it("addStaffMember maps a trigger ND0MV on insert to the friendly staff-limit message", async () => {
    const { supabase } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),            // users lookup
      () => ({ count: 4, error: null }),                           // staff count (under limit)
      () => ({ data: null, error: { code: "ND0MV", message: "Plan limit reached for staff_members. 5 of 5 allowed" } }), // insert rejected by trigger
    ]);
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(supabase);
    const result = await addStaffMember({ name: "Racey McRace", role: "RN" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Your plan has reached its staff limit. Upgrade to add more.");
  });

  it("wizard credential insert ND0MV returns the friendly credential-limit message and rolls the staff row back", async () => {
    const { supabase, calls } = makeSupabase([
      () => ({ data: { role: "owner" }, error: null }),            // users lookup
      () => ({ count: 0, error: null }),                           // staff count
      () => ({ data: [{ id: "type-1" }], error: null }),           // credential-type scope check
      () => ({ count: 40, error: null }),                          // credential count (under limit)
      () => ({ data: { id: "staff-1" }, error: null }),            // staff insert
      () => ({ data: null, error: { code: "ND0MV", message: "Plan limit reached for credentials. 50 of 50 allowed" } }), // credential insert
    ]);
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(supabase);
    const result = await addStaffMemberWithCredentials({ name: "Limit RN", role: "RN", credentials: [{ credential_type_id: "11111111-1111-1111-8111-111111111111" }] });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Your plan has reached its credential limit. Upgrade to add more.");
    const rpcCalls = calls.filter((c) => c.op === "rpc");
    expect(rpcCalls.length).toBeGreaterThan(0);                    // rollback RPC invoked
  });
});
