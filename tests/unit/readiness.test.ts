import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/staff/role-templates", () => ({
  getResolvedTemplate: vi.fn(),
  getResolvedTemplatesBulk: vi.fn(async () => ({})),
}));

import { createClient } from "@/lib/supabase/server";
import { getResolvedTemplate, getResolvedTemplatesBulk } from "@/lib/staff/role-templates";
import { getStaffReadiness, getStaffReadinessBulk } from "@/lib/staff/readiness";

describe("getStaffReadiness error contract", () => {
  it("returns null when the staff query fails (never a false 'pending')", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                single: async () => ({ data: null, error: { message: "connection refused" } }),
              }),
            }),
          }),
        }),
      }),
    });
    const result = await getStaffReadiness("staff-1");
    expect(result).toBeNull();
  });

  it("returns null when the template resolution throws", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                single: async () => ({ data: { id: "staff-1", role: "RN", clinic_id: "clinic-1" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    (getResolvedTemplate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("template boom"));
    const result = await getStaffReadiness("staff-1");
    expect(result).toBeNull();
  });

  it("returns null when the credentials query fails (never a false 'pending')", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () =>
                table === "staff_members"
                  ? { single: async () => ({ data: { id: "staff-1", role: "RN", clinic_id: "clinic-1" }, error: null }) }
                  : { data: null, error: { message: "connection refused" } },
            }),
          }),
        }),
      }),
    });
    (getResolvedTemplate as ReturnType<typeof vi.fn>).mockResolvedValue({
      templateId: "tpl-1",
      clinicId: "clinic-1",
      required: [{ credentialTypeId: "type-1", name: "RN License" }],
      optional: [],
    });
    const result = await getStaffReadiness("staff-1");
    expect(result).toBeNull();
  });
});

describe("getStaffReadinessBulk error contract", () => {
  it("returns {} when the credentials query fails (never false statuses for the roster)", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              is: () => ({
                is: () =>
                  table === "staff_members"
                    ? { data: [{ id: "staff-1", role: "RN", clinic_id: "clinic-1" }], error: null }
                    : { data: null, error: { message: "creds boom" } },
              }),
            }),
          }),
        }),
      }),
    });
    (getResolvedTemplatesBulk as ReturnType<typeof vi.fn>).mockResolvedValue({
      RN: {
        templateId: "tpl-1",
        clinicId: "clinic-1",
        required: [{ credentialTypeId: "type-1", name: "RN License" }],
        optional: [],
      },
    });
    const result = await getStaffReadinessBulk(["staff-1"], "clinic-1");
    expect(result).toEqual({});
  });
});

describe("role-less staff semantics", () => {
  it("single: a staff member with no role derives pending, never ready", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              is: () => ({
                single: async () => ({ data: { id: "staff-1", role: null, clinic_id: "clinic-1" }, error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const result = await getStaffReadiness("staff-1");
    expect(result?.status).toBe("pending");
  });

  it("bulk: a role-less staff member in a set derives pending", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              is: () => ({
                is: () => ({
                  then: async (resolve: (v: unknown) => void) =>
                    resolve({ data: [{ id: "staff-1", role: null, clinic_id: "clinic-1" }], error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const result = await getStaffReadinessBulk(["staff-1"], "clinic-1");
    expect(result["staff-1"]?.status).toBe("pending");
  });
});
